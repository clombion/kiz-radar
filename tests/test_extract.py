"""The extraction step: price checks and dates, stable artist ids, and asking Claude with one retry."""

import argparse
import dataclasses
import datetime as dt
import itertools
import json
import sqlite3
from collections.abc import Callable, Generator
from contextlib import contextmanager
from difflib import SequenceMatcher
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import anthropic
import httpx2
import pytest
from anthropic.types import Message
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from pipeline import (
    calls,
    data,
    db,
    enums,
    export,
    files,
    generate,
    prompt,
    records,
    spend,
    states,
    tickets_store,
)
from pipeline.calls import Declined
from pipeline.db import Db, Transaction
from pipeline.enums import (
    AnswerState,
    ArtistKind,
    CallCause,
    Genre,
    MergeDecision,
    MergeReason,
    Model,
    PassKind,
    Role,
    Style,
)
from pipeline.extract import answers, ask, check_output, load_extract, prices, questions, resolve_artists, run_log
from pipeline.extract.resolve_artists import stable_ids
from pipeline.prompt import Prompt, api_schema
from pipeline.records import (
    ANSWERS,
    JSON,
    Answered,
    AskedPrices,
    Batch,
    GenreFound,
    Group,
    Pair,
    Priced,
    PricedPass,
    PricedTier,
    Provenance,
    Rate,
    Record,
    RoomsGenres,
    Sale,
    Spent,
    Stamped,
    day_of,
    real_day,
)
from tests import jsons
from tests.exports import EXPORT, committed, festival, shaped
from tests.fakes import Client, Cut, Memory, message, status_error


@pytest.fixture(autouse=True)
def rates() -> None:
    """The committed rates, which price the models' answers against the month's budget."""
    committed(Rate.FILE)


@pytest.mark.parametrize(
    ('quote', 'amount'),
    [
        ('⭐ Early Bird Pass – 130€ (50 or till May 1st)', 130),
        ('one package which costs EUR 1.800 and includes', 1800),
        ('Single room: €1,800 (deposit €200)', 1800),
        ('🇳🇴 Norway – 5 900 NOK', 5900),
        ('$8.50 EVENTBRITE PROCESSING FEE', 8.5),
        ('Breakfast €9,50', 9.5),
        ('Until March 31 155€ (310BGN)', 155),  # a date's day next to the amount
    ],
)
def test_amount_found_in_quote(quote: str, amount: float) -> None:
    assert amount in prices.numbers_in(quote)


def tier(
    quote: str,
    amount: float = 80,
    *,
    fee: float | None = None,
    currency: str = 'EUR',
    from_: str | None = None,
    until: str | None = '01-31',
) -> PricedTier:
    return PricedTier(
        amount=amount,
        currency=currency,
        fee=fee,
        alt=None,
        sale=Sale(
            from_=None if from_ is None else real_day(from_),
            until=None if until is None else real_day(until),
            quantity=None,
            current=False,
        ),
        sold_out=False,
        quote=quote,
    )


def priced(*tiers: PricedTier, kind: PassKind = PassKind.FULL, style: Style | None = None, event_id: int = 5) -> Priced:
    ps = PricedPass(
        kind=kind, style=style, label_quote=None, group_size=1, days=None, includes_hotel=False, tiers=tiers
    )
    return Priced(event_id=event_id, passes=(ps,), rule_quotes=())


@pytest.mark.parametrize(
    ('quote', 'amount', 'fee', 'ok'),
    [
        ('🔸Early Bird: £85 + £3 admin fee', 88, 3, True),  # what a buyer pays: the price and its fee
        ('🔸Early Bird: £85 + £3 admin fee', 88, None, False),  # a total needs its fee
        ('🔸Early Bird: £85 + £3 admin fee', 85, None, True),
        ('🔸Early Bird: £85', 88, 3, False),  # a fee the quote doesn't give
    ],
)
def test_a_total_quotes_its_price_and_its_fee(quote: str, amount: float, fee: float | None, ok: bool) -> None:
    ev = priced(tier(quote, amount, fee=fee, currency='GBP', until=None))
    assert (prices.problems(ev, []) == []) == ok


@pytest.mark.parametrize(
    ('quote', 'amount', 'currency', 'ok'),
    [
        ('March 31 155€', 31, 'EUR', False),  # a date prices nothing
        ('March 31 155€', 155, 'EUR', True),
        ('Children under 10 €50', 10, 'EUR', False),  # a count neither: the mark before an amount takes it
        ('Children under 10 €50', 50, 'EUR', True),
        ('950 SEK (€85)', 85, 'SEK', False),  # a price in another currency is none in this one
        ('950 SEK (€85)', 950, 'SEK', True),
        ('470dkk/62€', 470, 'DKK', True),
        ('€150 / 57.000 Ft until 30 September', 57000, 'HUF', True),
        ('€150 / 57.000 Ft until 30 September', 57000, 'EUR', False),  # a slash sets another currency beside it
        ('FULLPASS : 150 to 190€ with accommodation', 150, 'EUR', True),  # one mark prices a range or a list
        ('Full Pass €75, 80, 85 (SOLD OUT)', 85, 'EUR', True),
        ('𝐅𝐔𝐋𝐋 𝐏𝐀𝐒𝐒: 𝟯𝟱𝟬 𝗥𝗢𝗡 / 𝟳𝟬 𝗘𝗨𝗥𝗢', 350, 'RON', True),  # styled letters and digits
        ('VIP 100€', 100, 'EUR', True),  # VIP is no currency
        ('FULLPASS – 89 EARLY BIRD', 89, 'EUR', True),  # a quote that marks no price may hold it bare
        ('1 DAY-300', 1, 'EUR', True),
    ],
)
def test_an_amount_is_a_price_its_quote_gives_in_its_currency(
    quote: str, amount: float, currency: str, ok: bool
) -> None:
    ev = priced(tier(quote, amount, currency=currency, until=None))
    assert (prices.problems(ev, []) == []) == ok


def test_amount_missing_from_quote_is_a_problem() -> None:
    ev = priced(tier('Full Pass – 180€ (Till Festival)', 150, until=None))
    assert prices.problems(ev, [])[0].startswith('amounts: event 5: passes[0].tiers[0].amount 150')


@pytest.mark.parametrize(
    ('answer', 'start', 'expected'),
    [
        ('01-31', '2026-03-20', '2026-01-31'),  # before the festival in its own year
        ('04-30', '2026-03-20', '2025-04-30'),  # a list that started the spring before
        ('12-31', '2026-01-02', '2025-12-31'),
        ('03-20', '2026-03-20 18:00:00', '2026-03-20'),
        ('02-29', '2026-03-20', '2026-02-28'),  # a year with no 29 February
        ('2027-02-01', '2026-03-20', '2027-02-01'),  # a written year is kept
        (None, '2026-03-20', None),
    ],
)
def test_dates_without_a_year_fall_before_the_festival(answer: str | None, start: str, expected: str | None) -> None:
    until = prices.window(None, None if answer is None else real_day(answer), day_of(start)).until
    assert (None if until is None else until.isoformat()) == expected


@pytest.mark.parametrize(
    ('from_', 'until', 'start', 'expected'),
    [
        ('01-01', '01-31', '2026-01-08', ('2026-01-01', '2026-01-31')),  # a tier that ends after the festival begins
        ('11-01', '11-22', '2026-11-06', ('2026-11-01', '2026-11-22')),
        ('12-01', '01-15', '2026-03-20', ('2025-12-01', '2026-01-15')),  # across the new year
        ('12-01', '2026-01-15', '2026-03-20', ('2025-12-01', '2026-01-15')),  # the end's year
        ('2025-10-01', '03-01', '2026-03-20', ('2025-10-01', '2026-03-01')),  # the start's
    ],
)
def test_a_tiers_end_without_a_year_falls_after_its_start(
    from_: str, until: str, start: str, expected: tuple[str, str]
) -> None:
    w = prices.window(real_day(from_), real_day(until), day_of(start))
    assert (w.from_, w.until) == tuple(map(dt.date.fromisoformat, expected))


def test_a_tier_given_dates_without_years_never_ends_before_it_starts() -> None:
    days = [f'{m:02}-{d:02}' for m in range(1, 13) for d in (1, 15, 28)] + ['02-29']
    for start in (dt.date(2026, 1, 8), dt.date(2026, 6, 30), dt.date(2028, 2, 29)):
        for a, b in itertools.product(days, days):
            w = prices.window(real_day(a), real_day(b), start)
            assert w.from_ is not None
            assert w.until is not None
            assert w.from_ <= w.until <= w.from_ + dt.timedelta(366)


@pytest.mark.parametrize('value', ['02-30', '2027-13-01', '2026-02-29'])
def test_an_answer_with_no_real_day_is_refused(value: str) -> None:
    text = priced(tier('1€', 1)).model_dump_json(by_alias=True)
    assert text.count('"from":null') == 1
    with pytest.raises(ValidationError, match='from'):
        _ = Priced.parse(text.replace('"from":null', f'"from":"{value}"'))


def test_any_year_s_day_is_a_real_day() -> None:
    assert real_day('02-29') == '02-29'


def spelled(name: str, n: int) -> str:
    """The name, or the name a letter off by n: one dropped, doubled or swapped with the next."""
    i = n % (len(name) - 1)
    return [
        name,
        name[:i] + name[i + 1 :],
        name[:i] + name[i] + name[i:],
        name[:i] + name[i + 1] + name[i] + name[i + 2 :],
    ][n % 4]


def test_the_pairs_judged_are_every_pair_a_candidate_can_be() -> None:
    """Only the pairs sharing a stated country or a partner, and those spelled alike, are judged: every other pair
    lacks what each reason needs. Names a letter apart, alone and in couples, with countries stated, events'
    countries or neither, give each reason's pairs; and a same-name pair judged or not is kept apart all the same."""
    firsts = ['Daniel', 'Daniela', 'Mariana', 'Marian', 'Joao', 'Kwame', 'Isabelle', 'Isabel', 'Ricardo', 'Ana']
    lasts = ['Silva', 'Santos', 'Moreau', 'Mendes', 'Okafor', 'Ferreira', '']
    places = ['France', 'Portugal', 'Angola', None]
    mentions: list[resolve_artists.Mention] = []
    for i in range(400):
        last = lasts[i % 7]
        name = spelled(firsts[i % 10], i // 10) + (f' {spelled(last, i // 7)}' if last else '')
        if i % 3 == 0:
            name += f' & {spelled(firsts[i * 7 % 10], i // 3)}'
        mentions.append(
            resolve_artists.Mention(
                id=i,
                event_id=i,
                role=[Role.TEACHER, Role.DJ][i % 2],
                name_as_written=name,
                style=None,
                country=places[i // 5 % 4],
                event_country=places[i // 11 % 4],
                source_line='',
            )
        )
    alike = [('Yaw Mensah', 'Ghana'), ('Yaw Mensha', 'Ghana'), ('Kojo Boateng', 'Ghana'), ('Kojo Boateg', 'Togo')]
    for i, (name, place) in enumerate(alike, 402):  # spelled alike, at events in one country or two
        mentions.append(
            resolve_artists.Mention(
                id=i,
                event_id=i,
                role=Role.DJ,
                name_as_written=name,
                style=None,
                country=None,
                event_country=place,
                source_line='',
            )
        )
    for i, place in enumerate(['France', 'Angola'], 400):  # one single name, stated with two countries
        mentions.append(
            resolve_artists.Mention(
                id=i,
                event_id=i,
                role=Role.DJ,
                name_as_written='Kizzy',
                style=None,
                country=place,
                event_country=None,
                source_line='',
            )
        )
    keys = resolve_artists.keyed(mentions, [])
    pairing = resolve_artists.Pairing.of(keys)
    every = list(itertools.combinations(sorted(pairing.people), 2))
    accepted = {pair for pair in every if pairing.reason(*pair)}
    assert accepted <= pairing.judged()
    found, kept_apart = resolve_artists.candidates(keys, {})
    assert {(c.key_a, c.key_b) for c in found if c.key_a != c.key_b} == accepted
    assert {c.reason for c in found} == {s.key for s in states.of('merge_reason') if s.made_by is None}
    weak = {(c.key_a, c.key_b) for c in found if c.key_a.startswith(('p:yaw', 'p:kojo'))}
    assert weak == {('p:yawmensah', 'p:yawmensha')}  # alike at events in one country, not two
    same_name = [(a, b) for a, b in every if pairing.people[a].bare == pairing.people[b].bare]
    assert kept_apart == len(set(same_name) - accepted)


def test_each_reason_gives_the_pairs_it_names() -> None:
    """Pairs written out by hand, each for what its reason needs: a stated country in common and a spelling a letter
    apart; a single name that begins the other; a partner in common and a name shortened; events in one country only
    for names of several words spelled alike. Pairs without what a reason needs are no candidates: names a letter apart
    stated with different countries, or alike at events in different countries."""
    written = [
        ('Daniel Silva', 'Portugal', None),
        ('Daniel Silvaa', 'Portugal', None),
        ('Ana', 'Angola', None),
        ('Ana Santos', 'Angola', None),
        ('Ricardo & Isabel', None, None),
        ('Ricard & Isabel', None, None),
        ('Yaw Mensah', None, 'Ghana'),
        ('Yaw Mensha', None, 'Ghana'),
        ('Kojo Boateng', None, 'Ghana'),
        ('Kojo Boateg', None, 'Togo'),
        ('Mariana Moreau', 'France', None),
        ('Marian Moreau', 'Spain', None),
    ]
    mentions = [
        resolve_artists.Mention(
            id=i,
            event_id=i,
            role=Role.TEACHER,
            name_as_written=n,
            style=None,
            country=c,
            event_country=e,
            source_line='',
        )
        for i, (n, c, e) in enumerate(written)
    ]
    found, _ = resolve_artists.candidates(resolve_artists.keyed(mentions, []), {})
    assert {(c.key_a, c.key_b, c.reason) for c in found} == {
        ('p:danielsilva', 'p:danielsilvaa', MergeReason.SIMILAR_SPELLING),
        ('p:ana@dance', 'p:anasantos', MergeReason.FIRST_WORDS_OF_THE_OTHER),
        ('p:ricard@isabel+ricard', 'p:ricardo@isabel+ricardo', MergeReason.SAME_PARTNER__SHORTENED_NAME),
        ('p:yawmensah', 'p:yawmensha', MergeReason.SIMILAR_SPELLING),
    }


# the prompts asked now: a change to one re-asks everything it answered (CLAUDE.md), so it is made on purpose, here too
ASKED_NOW = {
    'extract': '35e8616c28d2d460',
    'rooms_genres': '9b8b37910b200507',
    'prices': '128a9cb603333383',
    'first_read': 'b1d060bbebb24369',
    'merge_review': 'f5df854e7dca41bb',
}


def test_no_prompt_changes_unseen() -> None:
    assert {n: prompt.current(n).hash for n in ASKED_NOW} == ASKED_NOW


def test_the_spelling_filter_finds_every_pair_alike_enough() -> None:
    """The prefix filter compares only names with a letter in common among their first ones, and that is every pair
    quick_ratio puts at SIMILAR or more: names a letter apart, of every length up to 30."""
    stem = 'abcdefghijklmnopqrstuvwxyzåéîø'
    names = {f'{n}:{k}': spelled(stem[:n], k) for n in range(3, 31) for k in range(8)}
    alike = {
        (a, b)
        for a, b in itertools.combinations(sorted(names), 2)
        if SequenceMatcher(None, names[a], names[b]).quick_ratio() >= resolve_artists.SIMILAR
    }
    assert resolve_artists.spelled_alike(names) == alike


def named(*names: str, role: Role = Role.DJ) -> list[resolve_artists.Mention]:
    """One mention of each name, at an event of its own, stating no country."""
    return [
        resolve_artists.Mention(
            id=i, event_id=i, role=role, name_as_written=n, style=None, country=None, event_country=None, source_line=''
        )
        for i, n in enumerate(names)
    ]


def duo(key: str, aliases: str) -> Group:
    return Group.model_validate({'group_key': key, 'display_name': key, 'members': '', 'aliases': aliases, 'note': ''})


def test_a_named_group_absorbs_its_aliases_whatever_their_keys() -> None:
    """A group stays the artist of its aliases, a couple's key ("c:...", which sorts before "g:") among them."""
    groups = [duo('g:ab', 'c:ana+bea;p:absound')]
    keys = resolve_artists.keyed(named('Ana & Bea', 'AB Sound'), groups)
    final = resolve_artists.final_keys(keys, resolve_artists.merged(keys, {}), groups)
    assert final['c:ana+bea'] == final['p:absound'] == 'g:ab'


def test_members_who_share_a_name_are_a_couple_of_two() -> None:
    keys = resolve_artists.keyed(named('Chiara & Chiara', role=Role.TEACHER), [])
    assert keys.members['c:chiara+chiara'] == ['p:chiara@chiara+chiara#1', 'p:chiara@chiara+chiara#2']
    assert keys.kinds['c:chiara+chiara'] == ArtistKind.COUPLE
    final = resolve_artists.final_keys(keys, resolve_artists.merged(keys, {}), [])
    assert final['p:chiara@chiara+chiara#1'] != final['p:chiara@chiara+chiara#2']  # no spelling of one another


def test_merges_apply_alike_in_any_order() -> None:
    """Merges are unordered pairs: the artists they make, and each artist's key, are one function of the set."""
    keys = resolve_artists.keyed(named('Ana & Bea', 'Anna & Bea', 'Ana & Beatriz', 'Kizzy', 'Kizy', 'Kizzi'), [])
    merges = [
        (frozenset({'c:ana+bea', 'c:anna+bea'}), MergeDecision.MERGE),
        (frozenset({'c:ana+beatriz', 'c:anna+bea'}), MergeDecision.MERGE),
        (frozenset({'p:kizy@dj', 'p:kizzy@dj'}), MergeDecision.MERGE),
        (frozenset({'p:kizzi@dj', 'p:kizzy@dj'}), MergeDecision.SEPARATE),
    ]
    finals = {
        tuple(sorted(resolve_artists.final_keys(keys, resolve_artists.merged(keys, dict(order)), []).items()))
        for order in itertools.permutations(merges)
    }
    assert len(finals) == 1
    final = dict(finals.pop())
    assert final['c:ana+bea'] == final['c:anna+bea'] == final['c:ana+beatriz']
    assert final['p:kizy@dj'] == final['p:kizzy@dj'] != final['p:kizzi@dj']


def test_a_name_reviewed_with_itself_stays_one_artist_whatever_the_review_says() -> None:
    """The review of a key with itself (a name that may be several people) settles the pair and merges nothing."""
    keys = resolve_artists.keyed(named('Kizzy', 'Kizzy', 'Ana'), [])
    plain = resolve_artists.final_keys(keys, resolve_artists.merged(keys, {}), [])
    for decision in (MergeDecision.MERGE, MergeDecision.SEPARATE):
        reviewed = resolve_artists.merged(keys, {frozenset({'p:kizzy@dj'}): decision})
        assert resolve_artists.final_keys(keys, reviewed, []) == plain


def test_a_split_artist_gets_its_own_id_back(memory: Memory) -> None:
    # p:b was merged into p:a (id 7), keeping its own id 3 among those issued; apart again, it has it back
    con = db_with(memory(), {'p:a': 7, 'p:b': 7}, {'p:a': 7, 'p:b': 3})
    assert stable_ids(con, {'p:a': 'p:a', 'p:b': 'p:b'}) == {'p:a': 7, 'p:b': 3}


def test_an_id_an_artist_has_again_is_retired_into_nothing(memory: Memory) -> None:
    """7 went into 3 once; now 3 is gone into 7, which is an artist again: neither redirects to the other."""
    con = db_with(memory(), {'p:a': 7}, {'p:a': 7, 'p:b': 3})
    with con.transaction() as tx:
        tx.execute('UPDATE artist_ids SET retired_into = 3 WHERE artist_id = 7')
        resolve_artists.retire(tx, {'p:a': 7}, {3: 7})
    went = {w.artist_id: w.retired_into for w in con.rows(Went, 'SELECT artist_id, retired_into FROM artist_ids')}
    assert went == {3: 7, 7: None}


class Went(BaseModel):
    artist_id: int
    retired_into: int | None


def test_an_alias_two_groups_claim_is_refused() -> None:
    groups = [duo('g:ab', 'p:absound'), duo('g:ba', 'p:absound')]
    keys = resolve_artists.keyed(named('AB Sound'), groups)
    with pytest.raises(SystemExit, match='g:ba: its aliases are already the group g:ab'):
        _ = resolve_artists.final_keys(keys, resolve_artists.merged(keys, {}), groups)


@pytest.mark.parametrize(
    ('row', 'refused'),
    [
        (lambda: duo('ab', 'p:absound'), 'pattern'),
        (
            lambda: Pair.model_validate({'key_a': 'p:b', 'key_b': 'p:a'}),
            'key order',
        ),
    ],
)
def test_a_row_of_the_artists_csvs_is_written_one_way(row: Callable[[], object], refused: str) -> None:
    """A group's key is apart from every mention's key, and a merge's pair is in key order."""
    with pytest.raises(ValidationError, match=refused):
        _ = row()


def db_with(con: Db, keys: dict[str, int], issued: dict[str, int]) -> Db:
    """The export's tables stable_ids reads: each spelling's artist, and every id given."""
    owner = {i: k for k, i in sorted(keys.items(), reverse=True)}
    with shaped(con).transaction() as tx:
        tx.insert(
            'artists',
            # one artist per id, keyed by the least of its keys
            ({'id': i, 'display_name': k, 'kind': 'person', 'match_key': k} for i, k in owner.items()),
        )
        tx.insert('artist_keys', ({'match_key': k, 'artist_id': i, 'produced': 1} for k, i in keys.items()))
        tx.insert('artist_ids', ({'artist_id': i, 'match_key': k} for k, i in issued.items()))
    return con


def test_unchanged_artists_keep_their_ids(memory: Memory) -> None:
    con = db_with(memory(), {'p:a': 7, 'p:b': 3}, {'p:a': 7, 'p:b': 3})
    assert stable_ids(con, {'p:a': 'p:a', 'p:b': 'p:b'}) == {'p:a': 7, 'p:b': 3}


def test_new_artist_gets_an_id_never_used(memory: Memory) -> None:
    # id 9 belonged to an artist whose festival was deleted; it is not given again
    con = db_with(memory(), {'p:a': 7}, issued={'p:a': 7, 'p:gone': 9})
    assert stable_ids(con, {'p:a': 'p:a', 'p:new': 'p:new'}) == {'p:a': 7, 'p:new': 10}


def test_merged_artist_keeps_the_lowest_free_id(memory: Memory) -> None:
    # two spellings merge into a couple key no artist had; the lower of their ids carries on
    con = db_with(memory(), {'c:x': 12, 'c:y': 5}, {'c:x': 12, 'c:y': 5})
    assert stable_ids(con, {'c:x': 'c:z', 'c:y': 'c:z'}) == {'c:z': 5}


def test_returning_artist_gets_its_old_id_back(memory: Memory) -> None:
    con = db_with(memory(), {}, issued={'p:a': 4})
    assert stable_ids(con, {'p:a': 'p:a'}) == {'p:a': 4}


FEST = questions.Festival(
    id=5,
    title='Test Fest',
    description_text='Full pass 80€ until 31.01\nDJ Neiken',
    start_date=dt.date(2026, 3, 20),
    end_date=dt.date(2026, 3, 22),
    country='Norway',
)
NOW = questions.Now({5: FEST, 6: FEST.model_copy(update={'id': 6})}, {})
JOB = ask.job(NOW, prompt.PRICES, 5)


def prices_answer(quote: str, style: Style | None = None) -> str:
    return Batch[Priced](batch='event-5', events=(priced(tier(quote), style=style),)).model_dump_json()


def test_answer_retried_once_with_the_checkers_lines() -> None:
    client = Client(prices_answer('Full pass 90€'), prices_answer('Full pass 80€ until 31.01'))
    out = ask.ask(client, JOB)
    assert not isinstance(out, Declined)
    assert isinstance(entry := out.events[0], Priced)
    assert entry.passes[0].tiers[0].amount == 80
    retry = str(client.messages.asked[1][-1]['content'])
    assert 'verbatim' in retry
    assert 'Full pass 90€' in retry


def test_two_failures_leave_the_festival_unanswered() -> None:
    client = Client(prices_answer('Full pass 90€'), prices_answer('Full pass 85€'))
    out = ask.ask(client, JOB)
    assert isinstance(out, Declined)
    assert out.cause == CallCause.CHECKER


def test_an_answer_off_its_record_is_asked_again() -> None:
    client = Client('{"batch": "event-5"', prices_answer('Full pass 80€ until 31.01'))
    assert not isinstance(ask.ask(client, JOB), Declined)
    assert 'schema' in str(client.messages.asked[1][-1]['content'])


@pytest.mark.parametrize('name', ['extract', 'rooms_genres', 'prices', 'first_read'])
def test_schema_sent_without_constraints_structured_outputs_reject(name: prompt.Name) -> None:
    text = json.dumps(prompt.current(name).sent_schema)
    for word in ('minLength', 'maxLength', 'minimum', 'oneOf', 'pattern', '$schema', '$ref', '$defs', '"title"'):
        assert word not in text


def test_the_schema_sent_holds_every_state_its_producer_makes() -> None:
    text = json.dumps(prompt.current('extract').sent_schema)
    assert all(f'"{k}"' in text for k in states.made('feature'))
    assert all(f'"{k}"' not in text for k in set(states.keys('feature')) - set(states.made('feature')))


class Kind(StrEnum):
    FULL = 'full'


class Grown(StrEnum):  # Kind with a state added
    FULL = 'full'
    FESTIVAL = 'festival'


class Kinded(Record):
    kind: Kind


class GrownKinded(Record):
    kind: Grown


class Batched(Record):
    batch: str


class Shorter(Record):  # Batched with a constraint the checker alone holds
    batch: Annotated[str, Field(max_length=99)]


def made(system: str, record: type[Record], question: type[Record] = Batched, framing: str = prompt.QUESTION) -> Prompt:
    return Prompt(system, record, question, framing)


def test_a_prompt_is_known_by_the_hash_of_its_text_both_schemas_and_its_message() -> None:
    base = prompt.current('prices')
    assert Prompt(base.system, base.record, base.question, base.framing).hash == base.hash  # hashing twice: one hash
    assert Prompt(base.system + ' ', base.record, base.question, base.framing).hash != base.hash  # a template edited
    grown = made('s', GrownKinded)
    assert made('s', Kinded).hash != grown.hash  # a state added to an enum
    assert json.dumps(made('s', Kinded).schema).replace('Kinded', 'X').replace('Kind', 'X') != json.dumps(
        grown.schema
    ).replace('GrownKinded', 'X').replace('Grown', 'X')
    checked = made('s', Shorter)
    assert api_schema(checked.schema) == api_schema(made('s', Batched).schema)  # sent alike
    assert checked.hash != made('s', Batched).hash  # a constraint the checker alone holds
    assert made('s', Batched, Shorter).hash != made('s', Batched).hash  # the question asked otherwise
    assert made('s', Batched, framing=f'Input:\n{prompt.QUESTION}').hash != made('s', Batched).hash  # framed otherwise


def test_a_prompt_asks_its_own_question_once_in_its_framing() -> None:
    p = made('s', Batched, Batched, f'Input:\n{prompt.QUESTION}')
    assert p.message(Batched(batch='b')) == 'Input:\n{\n "batch": "b"\n}'
    with pytest.raises(TypeError, match='asks a Batched'):
        _ = p.message(Shorter(batch='b'))
    with pytest.raises(ValueError, match='once'):
        _ = made('s', Batched, framing='no place for it')


def test_an_archived_prompt_is_read_only_under_its_own_hash() -> None:
    p = prompt.current('prices')
    archived = p.archive()
    assert prompt.asked(archived.hash) == p.text
    _ = archived.path.write_text(p.text + 'edited', encoding='utf-8')
    with pytest.raises(ValueError, match='another hash'):
        _ = prompt.asked(archived.hash)


def test_a_criterion_edited_changes_the_prompts_it_is_in() -> None:
    names: list[prompt.Name] = ['extract', 'rooms_genres', 'prices', 'first_read']
    before = {p: prompt.current(p).hash for p in names}
    full = states.state('pass_kind', 'full')
    edited = dataclasses.replace(full, criterion=full.criterion + ' (edited)')
    prompt.current.cache_clear()
    with pytest.MonkeyPatch.context() as m:
        m.setitem(states.BY_KEY, ('pass_kind', 'full'), edited)
        m.setitem(states.BY_POINT, 'pass_kind', tuple(edited if s is full else s for s in states.BY_POINT['pass_kind']))
        after = {p: prompt.current(p).hash for p in names}
    prompt.current.cache_clear()
    assert {p for p in names if before[p] != after[p]} == {'prices', 'first_read'}


@pytest.mark.usefixtures('answered_here')
def test_an_answer_is_saved_with_where_it_comes_from_and_is_current_while_its_message_is() -> None:
    p = prompt.current('prices')
    archived = data(prompt.ASKED) / f'{p.hash}.md'
    archived.unlink(missing_ok=True)
    out = Batch[Priced].parse(prices_answer('Full pass 80€ until 31.01'))
    saved = answers.save('prices', out, answers.Asking(p.archive(), Model.CLAUDE_HAIKU_5_5, 'test', JOB.inputs))
    assert archived.read_text(encoding='utf-8') == p.text
    filed = Answered[Priced].parse(saved.read_bytes())
    assert (filed.prompt, filed.model, filed.inputs, filed.answer) == (p.hash, Model.CLAUDE_HAIKU_5_5, JOB.inputs, out)
    assert answers.current(prompt.PRICES, {5: JOB.inputs})[5].entry == out.events[0]
    changed = NOW.festivals[5].model_copy(update={'description_text': 'Full pass 90€'})
    asked_now = questions.Now({5: changed}, {}).inputs(prompt.PRICES, 5)
    assert answers.current(prompt.PRICES, {5: asked_now}) == {}  # the festival changed since: stale


def test_a_file_is_written_whole_or_not_at_all(tmp_path: Path) -> None:
    path = tmp_path / 'written' / 'f.csv'
    files.write(path, 'before\n')

    class StoppedError(Exception):
        pass

    def stopped(_: int) -> None:  # the run stops once the text is written, before the file takes its name
        raise StoppedError

    with pytest.MonkeyPatch.context() as m:
        m.setattr(files.os, 'fsync', stopped)
        with pytest.raises(StoppedError):
            files.write(path, 'after\n')
    assert path.read_text() == 'before\n'
    assert [p.name for p in path.parent.iterdir()] == ['f.csv']  # no part of the new one left beside it


def test_only_an_answer_to_the_current_prompt_is_read_as_its_record(answered_here: Path) -> None:
    (answered_here / 'prices').mkdir()
    old = {'batch': 'b', 'events': [{'event_id': 5, 'old': 1}]}
    provenance = {'prompt': '0' * 16, 'model': 'claude-haiku-5-5', 'answered_by': 'x', 'inputs': None}
    filed = provenance | {'answered_at': '2026-10-02T09:00:00+00:00', 'answer': old}
    _ = (answered_here / 'prices' / 'prices-001.json').write_text(json.dumps(filed))
    assert list(answers.answered('prices', {5})) == [5]  # its festivals are known, whatever its shape
    assert answers.current(prompt.PRICES, {5: JOB.inputs}) == {}


def test_an_archive_cut_short_is_written_again() -> None:
    p = prompt.current('prices')
    archived = p.archive().path
    _ = archived.write_text(p.text[:100], encoding='utf-8')
    _ = p.archive()
    assert archived.read_text(encoding='utf-8') == p.text
    assert not list(data(prompt.ASKED).glob('*.part'))


def test_the_system_text_sent_is_the_prompts() -> None:
    client = Client(prices_answer('Full pass 80€ until 31.01'))
    _ = ask.ask(client, JOB)
    assert client.messages.requests[0]['system'] == prompt.current('prices').system


def export_prompts() -> set[str]:
    """The prompts the export's rows name, in every column called prompt (a step's lists them, separated by commas)."""
    with db.opened(EXPORT, 'ro') as con:
        named: set[str] = set()
        prompted = (
            "select m.name from sqlite_master m, pragma_table_info(m.name) c where m.type = 'table'"
            " and c.name = 'prompt'"
        )
        for t in con.column(str, prompted):
            values = con.column(str, f'select distinct prompt from {db.name(t)} where prompt is not null')  # noqa: S608 (the export's own table names, quoted)
            named |= {h for v in values for h in v.split(', ')}
    return named


class Named(BaseModel):
    """The prompt a file answered, whatever else it holds."""

    model_config = ConfigDict(extra='ignore')

    prompt: str


def test_every_prompt_the_answers_reads_and_export_name_is_archived_under_its_hash() -> None:
    committed(ANSWERS, tickets_store.READS, prompt.ASKED)
    named = {Named.model_validate_json(p.read_bytes()).prompt for p in data(ANSWERS).glob('*/*.json')}
    named |= {Stamped.model_validate_json(p.read_bytes()).prompt for p in data(tickets_store.READS).glob('*.json')}
    named |= export_prompts()
    archived = {p.stem: p.read_text(encoding='utf-8') for p in data(prompt.ASKED).glob('*.md') if p.name != 'README.md'}
    assert named <= set(archived)
    # every prompt ever asked stays, each under the hash of its text
    assert [h for h, text in archived.items() if records.digest(text) != h] == []


def test_a_template_with_a_marker_left_fails() -> None:
    with pytest.raises(ValueError, match='unfilled'):
        _ = states.fill('{{states:pass_kind}}\nand {{states:pass_kind}} inline', 'x.md')
    with pytest.raises(ValueError, match='names no point'):
        _ = states.fill('{{states:no_such_point}}', 'x.md')


def test_requests_stop_once_the_months_budget_is_spent() -> None:
    _ = spend.record('prices', Model.CLAUDE_OPUS_5_5, 1_000_000, 5_000_000)  # $104, about €93
    client = Client(prices_answer('Full pass 80€ until 31.01'))
    assert not isinstance(ask.ask(client, JOB), Declined)
    _ = spend.record('prices', Model.CLAUDE_OPUS_5_5, 0, 1_000_000)  # $20 more: over €100
    out = ask.ask(client, JOB)
    assert isinstance(out, Declined)
    assert out.cause == CallCause.BUDGET
    assert out.stops
    assert len(client.messages.asked) == 1


def test_the_months_spending_reads_the_ledger_once_and_then_counts_each_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A request's thread appends to the ledger while another's asks the month's total: the total is read from the
    ledger once, so no reader meets a row half written."""
    _ = spend.record('prices', Model.CLAUDE_SONNET_5_5, 1_000_000, 0)  # $2, before the total is first asked
    assert spend.month_usd() == 2

    def unread() -> list[Spent]:
        pytest.fail('the ledger was read again')

    monkeypatch.setattr(Spent, 'read', unread)
    _ = spend.record('prices', Model.CLAUDE_SONNET_5_5, 0, 100_000)  # $1
    assert spend.month_usd() == 3


@pytest.mark.parametrize(
    ('reply', 'cause'),
    [
        (message('{}', stop_reason='max_tokens'), CallCause.TRUNCATED),
        (Cut(status_error(529)), CallCause.TRANSIENT),
        (Cut(status_error(429)), CallCause.TRANSIENT),
        (Cut(status_error(401)), CallCause.STRUCTURAL),  # a bad key: no request will do better
        (Cut(status_error(409)), CallCause.STRUCTURAL),
        (Cut(httpx2.ReadError('reset mid-stream')), CallCause.TRANSIENT),  # what the SDK lets through
        (Cut(anthropic.APITimeoutError(httpx2.Request('POST', 'https://api.anthropic.com'))), CallCause.TRANSIENT),
    ],
)
def test_a_call_that_gives_no_answer_says_why(reply: Message | Cut, cause: CallCause) -> None:
    out = ask.ask(Client(reply), JOB)
    assert isinstance(out, Declined)
    assert out.cause == cause


def test_a_structural_failure_stops_the_questions_and_the_run_fails_naming_them(answered_here: Path) -> None:
    """A bad key answers every question alike: after the first, none is asked, and the run's exit names all of
    them, with the stop first."""
    client = Client(Cut(status_error(401)), prices_answer('Full pass 80€ until 31.01'))
    todo = [ask.PassQuestion(JOB), ask.PassQuestion(ask.job(NOW, prompt.PRICES, 6))]
    declined = ask.answer_all(client, todo, workers=1)
    assert len(client.messages.asked) == 1
    assert {k: d.cause for k, d in declined.items()} == {
        '5 prices': CallCause.STRUCTURAL,
        '6 prices': CallCause.STRUCTURAL,
    }
    why = calls.failed('questions', declined.items())
    assert why is not None
    assert why.startswith('API error 401')
    assert '2 questions gave no answer (structural 2): 5 prices: API error 401' in why
    assert calls.failed('questions', []) is None


def test_a_reply_cut_short_mid_stream_is_in_the_ledger() -> None:
    """The tokens of a stream broken off once its message started are billed, so they are spent; one broken off
    before is not."""
    _ = ask.ask(Client(Cut(httpx2.ReadError('reset'))), JOB)
    _ = ask.ask(Client(Cut(httpx2.ReadError('reset'), started=False)), JOB)
    assert len(Spent.read()) == 1


def test_a_request_costs_its_models_prices() -> None:
    assert spend.usd(Model.CLAUDE_HAIKU_5_5, 100_000, 100_000) == 0.06
    assert spend.usd(Model.CLAUDE_HAIKU_5_5, 200_000, 0) == 0.10  # a long prompt costs Haiku more
    assert spend.usd(Model.CLAUDE_SONNET_5_5, 1_000, 1_000) == 0.012


def source(con: Db, *events: tuple[int, str | None]) -> Db:
    with shaped(con).transaction() as tx:
        for i, d in events:
            festival(tx, i, title='F', description_text=d, end_date='2099-01-02')
    return con


def no_answers(pass_name: str, ids: set[int]) -> dict[int, tuple[Path, Provenance]]:
    return {}


def test_a_festival_with_no_answer_of_a_pass_is_asked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ask.answers, 'answered', no_answers)
    assert [(j.asked.event_id, j.pass_.name) for j in ask.due(NOW, [prompt.PRICES], {5, 6})] == [
        (5, 'prices'),
        (6, 'prices'),
    ]
    assert [j.asked.event_id for j in ask.due(NOW, [prompt.PRICES], {6})] == [6]


def provenance(prompt_: str, inputs: str | None) -> Provenance:
    return Provenance(
        prompt=prompt_,
        model=Model.CLAUDE_HAIKU_5_5,
        answered_at=dt.datetime(2026, 10, 2, 9, tzinfo=dt.UTC),
        answered_by='x',
        inputs=inputs,
    )


ANSWERED_NOW = provenance(prompt.current('prices').hash, JOB.inputs)


def test_an_answer_to_an_older_prompt_or_message_is_asked_again(monkeypatch: pytest.MonkeyPatch) -> None:
    have = {5: (Path('a'), provenance('0' * 16, JOB.inputs)), 6: (Path('b'), ANSWERED_NOW)}

    def answered(pass_name: str, ids: set[int]) -> dict[int, tuple[Path, Provenance]]:
        return have

    monkeypatch.setattr(ask.answers, 'answered', answered)
    assert [j.asked.event_id for j in ask.due(NOW, [prompt.PRICES], {5, 6})] == [5, 6]  # 6 asked of 5's message
    have[6] = (Path('b'), provenance(prompt.current('prices').hash, ask.job(NOW, prompt.PRICES, 6).inputs))
    assert [j.asked.event_id for j in ask.due(NOW, [prompt.PRICES], {5, 6})] == [5]


ANSWER_CASES: list[tuple[Provenance | None, AnswerState]] = [
    (None, AnswerState.NONE),
    (provenance('0' * 16, JOB.inputs), AnswerState.STALE),  # another prompt
    (provenance(prompt.current('prices').hash, '0' * 16), AnswerState.STALE),  # another message
    (provenance(prompt.current('prices').hash, None), AnswerState.STALE),  # a batch, which kept no message
    (ANSWERED_NOW, AnswerState.CURRENT),
]


@pytest.mark.parametrize(('answer', 'state'), ANSWER_CASES)
def test_every_state_of_an_answer(answer: Provenance | None, state: AnswerState) -> None:
    assert answers.state('prices', answer, JOB.inputs) == state


def test_the_answer_states_tested_are_all_of_them() -> None:
    assert {s for _, s in ANSWER_CASES} == set(AnswerState)


def test_the_prices_question_follows_the_styles_the_rooms_genres_answer_gives() -> None:
    """The prices pass is asked with the festival's styles, which its genres give: a rooms-genres answer that names
    another dance makes the prices answer stale, and ask asks the prices pass after it (WAVES)."""
    bachata = RoomsGenres(
        event_id=5,
        party_rooms=None,
        class_rooms=None,
        rooms=(),
        genres=(GenreFound(genre=Genre.BACHATA, genre_as_written='Bachata', quote='Bachata'),),
    )
    assert NOW.styles(5, None) == []
    assert NOW.styles(5, bachata) == [Style.BACHATA]
    assert NOW.inputs(prompt.PRICES, 5, bachata) != NOW.inputs(prompt.PRICES, 5)
    assert NOW.inputs(prompt.EXTRACT, 5, bachata) == NOW.inputs(prompt.EXTRACT, 5)  # no other pass asks styles
    assert ask.WAVES == ((prompt.EXTRACT, prompt.ROOMS_GENRES), (prompt.PRICES,))


@pytest.mark.parametrize(
    ('text', 'ids'),
    [('16909,18806', {16909, 18806}), ('16909, 18806,', {16909, 18806}), ('x', None), (',', None), ('', None)],
)
def test_festival_ids_are_read_from_commas(text: str, ids: set[int] | None) -> None:
    if ids is None:
        with pytest.raises(argparse.ArgumentTypeError):
            _ = db.festival_ids(text)
    else:
        assert db.festival_ids(text) == ids


@pytest.mark.parametrize(('text', 'n'), [('3', 3), ('0', None), ('-1', None), ('x', None)])
def test_a_limit_is_one_at_least(text: str, n: int | None) -> None:
    """--limit 0 would be no limit, as an empty --only would be no filter: both are refused."""
    if n is None:
        with pytest.raises(argparse.ArgumentTypeError):
            _ = db.at_least_one(text)
    else:
        assert db.at_least_one(text) == n


def styled(*styles: Style) -> ask.Job:
    """JOB, as asked of a festival of these styles."""
    asked = AskedPrices(
        event_id=5,
        title=FEST.title,
        description=FEST.description_text,
        start_date=FEST.start_date,
        end_date=FEST.end_date,
        country=FEST.country,
        styles=styles,
    )
    question = prompt.PRICES.question.model_validate({'batch': 'event-5', 'events': (asked,)})
    return ask.Job(prompt.PRICES, asked, question, records.digest(prompt.current('prices').message(question)))


def test_a_description_answer_gives_a_style_only_at_a_festival_of_several() -> None:
    answer = prices_answer('Full pass 80€ until 31.01', Style.KIZOMBA)
    client = Client(answer, answer)
    assert isinstance(ask.ask(client, styled(Style.KIZOMBA)), Declined)
    assert 'one style only' in str(client.messages.asked[1])
    assert not isinstance(ask.ask(Client(answer), styled(Style.BACHATA, Style.KIZOMBA)), Declined)


def test_the_question_asked_is_the_festival_as_its_pass_asks() -> None:
    message = prompt.current('prices').message(styled(Style.KIZOMBA).question)
    assert message.startswith('Batch input:\n')
    assert jsons.at(JSON.validate_json(message.split('\n', 1)[1]), 'events', 0, 'styles') == ['kizomba']
    extract = prompt.current('extract').message(NOW.question(prompt.EXTRACT, 5))
    found = jsons.at(JSON.validate_json(extract.split('\n', 1)[1]), 'events', 0)
    assert isinstance(found, dict)
    assert 'styles' not in found


class StoppedError(Exception):
    """A step stopping halfway."""


def record_then_stop(con: Db) -> None:
    with con.transaction() as tx:
        run_log.record(tx, run_log.Step('step', 'what', 'test', details={'n': 1}))
        assert load_extract.count(tx, 'SELECT count(*) FROM pipeline_steps') == 1
        raise StoppedError


def test_the_run_log_writes_inside_the_callers_transaction(memory: Memory) -> None:
    con = memory()
    with con.transaction() as tx:
        tx.remake(run_log.KEPT)
    with pytest.raises(StoppedError):
        record_then_stop(con)
    assert load_extract.count(con, 'SELECT count(*) FROM pipeline_steps') == 0


def load_refused(con: Db) -> None:
    with con.transaction() as tx:
        tx.remake(load_extract.TABLES)
        tx.execute("INSERT INTO event_genres (event_id, genre, source) VALUES (1, 'tango', 'site_tag')")


def test_a_load_a_check_refuses_leaves_the_database_as_it_was(memory: Memory) -> None:
    con = memory()
    with con.transaction() as tx:
        tx.execute('CREATE TABLE events (id INTEGER PRIMARY KEY)')  # the source's, which the step's tables refer to
        tx.execute('CREATE TABLE event_passes (kept INTEGER)')
    with pytest.raises(sqlite3.IntegrityError):
        load_refused(con)
    assert con.column(str, "SELECT name FROM pragma_table_info('event_passes')") == ['kept']


class PriceStatus(BaseModel):
    event_id: int
    price: str
    page: str | None
    card_pass: int | None


@contextmanager
def loaded(con: Db) -> Generator[Transaction]:
    """An empty source database with load_extract's tables, inside the load's transaction."""
    with shaped(con).transaction() as tx:
        festival(tx, 5, start_date='2026-03-20 18:00:00', modified_at='2026-01-01 10:00:00')
        festival(tx, 6, start_date='2026-04-01', modified_at='2026-01-01')
        tx.remake(load_extract.TABLES)
        yield tx


@pytest.mark.parametrize(
    'sql',
    [
        "INSERT INTO price_status VALUES (5, 'priced', NULL, NULL)",  # priced, with no pass to price
        "INSERT INTO price_status VALUES (5, 'not_looked', NULL, 1)",  # a pass priced, said unpriced
        "INSERT INTO price_status VALUES (5, 'soon', NULL, NULL)",
        # half a pair
        "INSERT INTO pass_tiers VALUES (5, 1, 1, 80, 'EUR', NULL, 2000, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 'q')",
        (
            'INSERT INTO event_genres (event_id, genre, source, prompt, rule) '
            "VALUES (5, 'zouk', 'description', 'h', 'title')"
        ),
        "INSERT INTO event_genres (event_id, genre, source) VALUES (5, 'zouk', 'description')",  # from nothing
        "INSERT INTO event_genres (event_id, genre, source, rule) VALUES (5, 'zouk', 'site_tag', 'title')",
    ],
)
def test_a_row_outside_the_table_or_its_rules_is_refused_when_written(memory: Memory, sql: str) -> None:
    with loaded(memory()) as tx, pytest.raises(sqlite3.IntegrityError):
        tx.execute(sql)


def test_a_festival_is_priced_exactly_when_it_has_the_pass_a_card_prices(memory: Memory) -> None:
    full = priced(tier('Full pass 80€ until 31.01'))
    party = priced(tier('Full pass 80€ until 31.01'), kind=PassKind.PARTY, event_id=6)
    described = {e.event_id: answers.Answer(e, provenance('0' * 16, None), Path('x')) for e in (full, party)}
    with loaded(memory()) as con:
        load_extract.load_prices(con, described, {}, {6: (enums.Sales.SHOP, 'https://shop.example/6')})
        statuses = con.rows(PriceStatus, 'SELECT event_id, price, page, card_pass FROM price_status ORDER BY event_id')
    assert [(r.event_id, r.price, r.page, r.card_pass) for r in statuses] == [
        (5, 'priced', None, 1),
        (6, 'other_passes_only', 'https://shop.example/6', None),
    ]


@pytest.fixture
def answered_here() -> Path:
    """The answers folder of the test's data folder."""
    data(ANSWERS).mkdir(parents=True, exist_ok=True)
    return data(ANSWERS)


def source_file() -> Path:
    """An export in the test's data folder holding FEST."""
    path = data(export.SOURCE) / 'source.sqlite'
    path.parent.mkdir(parents=True)
    with db.opened(path, 'rwc') as con, shaped(con).transaction() as tx:
        festival(
            tx,
            FEST.id,
            title=FEST.title,
            description_text=FEST.description_text,
            start_date=FEST.start_date,
            end_date=FEST.end_date,
            country=FEST.country,
        )
    return path


def run_ask(monkeypatch: pytest.MonkeyPatch, client: Client, *args: object) -> None:
    monkeypatch.setattr(ask.anthropic, 'Anthropic', lambda: client)
    monkeypatch.setattr('sys.argv', ['ask', *map(str, args)])
    ask.main()


def test_a_festival_is_asked_a_pass_once_while_the_question_stays_the_same(
    tmp_path: Path, answered_here: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    src = source_file()
    client = Client(prices_answer('Full pass 80€ until 31.01'))
    run_ask(monkeypatch, client, '--dry-run')
    assert capsys.readouterr().out.startswith('1 festivals to ask about: ')
    assert client.messages.asked == []
    run_ask(monkeypatch, client, '--pass', 'prices')
    with db.opened(src, 'ro') as con:
        found = questions.now(con).current(prompt.PRICES)
    assert found[5].entry.passes[0].tiers[0].amount == 80
    run_ask(monkeypatch, client, '--pass', 'prices')
    assert 'festivals to ask about: ' in capsys.readouterr().out
    assert len(client.messages.asked) == 1  # answered to the current prompt: not asked again


def run_check(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, question: str, answer: str) -> None:
    _ = (tmp_path / 'question.json').write_text(question)
    _ = (tmp_path / 'answer.json').write_text(answer)
    monkeypatch.setattr('sys.argv', ['check', 'prices', str(tmp_path / 'question.json'), str(tmp_path / 'answer.json')])
    check_output.main()


QUESTION = JOB.question.model_dump_json()  # the prices pass's question, with its own fields


def test_an_answer_file_is_checked_against_the_festivals_it_was_asked_about(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    run_check(monkeypatch, tmp_path, QUESTION, prices_answer('Full pass 80€ until 31.01'))
    assert capsys.readouterr().out == 'answer.json: OK (1 events, 0 problems)\n'
    with pytest.raises(SystemExit, match=r'answer.json: FAIL \(1 problems\)'):
        run_check(monkeypatch, tmp_path, QUESTION, prices_answer('Full pass 90€'))
    assert 'verbatim' in capsys.readouterr().out
    with pytest.raises(SystemExit, match='not a question of the prices pass'):
        run_check(monkeypatch, tmp_path, '{"batch": "x"}', prices_answer('Full pass 80€ until 31.01'))


def test_generate_writes_what_differs_and_check_names_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    built = tmp_path / 'built.md'
    monkeypatch.setattr(generate, 'ROOT', tmp_path)
    monkeypatch.setattr(generate, 'FILES', {built: lambda: 'from the table\n'})
    monkeypatch.setattr('sys.argv', ['generate', '--check'])
    with pytest.raises(SystemExit, match=r'built\.md differs from what it is built from'):
        generate.main()
    monkeypatch.setattr('sys.argv', ['generate'])
    generate.main()
    assert built.read_text() == 'from the table\n'
    assert capsys.readouterr().out == 'wrote built.md\n'
    monkeypatch.setattr('sys.argv', ['generate', '--check'])
    generate.main()  # nothing differs
