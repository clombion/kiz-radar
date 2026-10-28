"""Load the saved answers of the extraction passes (pipeline/extract/answers) into the source DB.

Creates (replacing any previous load):
  feature_definitions   feature -> definition, from pipeline/states.py
  event_features        one row per (event, feature, source): source 'description' rows come from the
                        extraction (with quote, rationale, prompt, model); source 'site_tag' rows
                        come from the site's own tags for the features the site also tags
  artist_mentions       every artist mention exactly as extracted, with provenance
  genre_definitions     genre -> definition, from pipeline/states.py
  role_definitions      artist role -> definition, from pipeline/states.py (the roles artist_mentions uses)
  event_genres          one row per (event, genre, source): 'description' rows from the rooms-genres
                        pass (with the words used and a quote) or from a rule, 'site_tag' rows from the site's style
                        tags
  event_rooms           per event: stated number of party rooms and class rooms, with quotes
  event_room_list       rooms the description describes one by one, with their genres
  event_passes          the passes a festival sells, from the prices pass, and pass_tiers their prices tier
                        by tier; event_price_notes the price rules the tiers can't hold. A festival in
                        pipeline/ticket_pages.csv takes its passes from its ticket page instead
                        (pipeline/pass_prices.csv, written by pipeline/tickets.py)
  ticket_pages          per festival read on its ticket page: the page, the day it was last read, how many of its
                        tickets are not read yet
  price_status          per festival, what its card can say of its price (pipeline/states.py, price) and the pass
                        it prices, from its passes and pipeline/tickets/status.csv

Each festival's newest answer of each pass, and each ticket page's prices, are loaded when they were asked with the
current prompt (pipeline/prompt.py); one to another prompt waits to be asked again, and answers for festivals no
longer in the DB are left out. Every column holding a state checks it against pipeline/states.py. The load is one
transaction: a value a check refuses leaves the database as it was.

Usage: mise run load
"""

import argparse
import json
import re
import sys
import unicodedata
from collections.abc import Mapping
from collections.abc import Set as AbstractSet
from typing import NamedTuple

from pydantic import BaseModel

from pipeline import db as sqlite_db
from pipeline import export, states
from pipeline import prompt as prompts
from pipeline.db import Reader, Transaction
from pipeline.enums import Genre, Sales
from pipeline.extract import answers, run_log
from pipeline.extract import prices as price_rules
from pipeline.extract.answers import Answer
from pipeline.extract.prices import window
from pipeline.prompt import Pass
from pipeline.records import (
    Alt,
    Asked,
    Entry,
    Extracted,
    PageRow,
    Priced,
    PricedPass,
    PricedTier,
    PriceRow,
    RoomsGenres,
    StatusRow,
    day_of,
)
from pipeline.text import soften_caps, tidy_title

# the tables this step makes again each time it runs
DDL = """
CREATE TABLE event_display (
    event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    title TEXT NOT NULL,          -- the title as a card shows it (pipeline/text.py tidy_title)
    venue TEXT                    -- the venue, its shouting capitals softened
) STRICT;
CREATE TABLE event_passes (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    pass_no INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ({pass_kind})),
    style TEXT CHECK (style IN ({style})),  -- the one dance style the pass is
                                  -- limited to; NULL = all the festival's styles
    label TEXT,                   -- the pass's name or heading as written, when its price lines don't name it
    group_size INTEGER,           -- people one price is for; NULL = not stated (a package per room)
    people TEXT NOT NULL CHECK (people IN ({people})),   -- group_size as a state (prices.people)
    days INTEGER,                 -- NULL = not stated
    includes_hotel INTEGER NOT NULL CHECK (includes_hotel IN (0, 1)),
    source TEXT NOT NULL CHECK (source IN ({pass_source})),   -- ticket_page: see ticket_pages
    prompt TEXT NOT NULL,         -- the hash of the prices prompt, or for a ticket page the first read's
    model TEXT,                   -- the model that answered; for a ticket page, who made its first read
    PRIMARY KEY (event_id, pass_no)
) STRICT;
CREATE TABLE pass_tiers (
    event_id INTEGER NOT NULL,
    pass_no INTEGER NOT NULL,
    tier_no INTEGER NOT NULL,     -- in the order the description lists them
    amount REAL NOT NULL,         -- what a buyer pays, fee included
    currency TEXT NOT NULL,       -- ISO 4217
    fee REAL,                     -- the booking fee amount includes, when the source states one
    alt_amount REAL,              -- the same price in a second currency, when the line gives one
    alt_currency TEXT CHECK ((alt_amount IS NULL) = (alt_currency IS NULL)),
    valid_from TEXT,              -- YYYY-MM-DD; NULL = not stated
    valid_until TEXT,
    dates_as_answered TEXT,       -- from/until as answered, when a date had no year (MM-DD) and got one here
    quantity INTEGER,             -- tickets at this price, when limited
    door INTEGER NOT NULL CHECK (door IN (0, 1)),  -- the price at the door; never from a ticket page, which sells
                                  -- online
    sold_out INTEGER NOT NULL CHECK (sold_out IN (0, 1)),
    current INTEGER NOT NULL CHECK (current IN (0, 1)),  -- called the current price; valid_from is then when the
                                  -- description was edited
    quote TEXT NOT NULL,
    PRIMARY KEY (event_id, pass_no, tier_no),
    CHECK (valid_from <= valid_until),
    FOREIGN KEY (event_id, pass_no) REFERENCES event_passes(event_id, pass_no) ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE event_price_notes (
    event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    notes TEXT NOT NULL           -- the description's words, one rule per line
) STRICT;
CREATE TABLE price_status (
    event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    price TEXT NOT NULL CHECK (price IN ({price})),
    page TEXT,                    -- the ticket page, when one is known
    card_pass INTEGER,            -- the pass a card prices (prices.card_pass), exactly when it is priced
    CHECK ((price = 'priced') = (card_pass IS NOT NULL)),
    FOREIGN KEY (event_id, card_pass) REFERENCES event_passes(event_id, pass_no) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE ticket_pages (
    event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    page TEXT NOT NULL,           -- the ticket page the festival links to
    reseller TEXT,                -- the reseller selling there at its own prices (Kizzbee), when it isn't the organiser
    read_on TEXT NOT NULL,        -- the day its prices were last read there
    recipe TEXT NOT NULL,         -- the site recipe that read it (pipeline/tickets/sites), with its version
    unread INTEGER NOT NULL CHECK (unread >= 0)  -- tickets on the page its first read doesn't know yet
) STRICT;
CREATE TABLE role_definitions (
    role TEXT PRIMARY KEY,
    definition TEXT NOT NULL
) STRICT;
CREATE TABLE genre_definitions (
    genre TEXT PRIMARY KEY,
    definition TEXT NOT NULL
) STRICT;
CREATE TABLE event_genres (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    genre TEXT NOT NULL CHECK (genre IN ({genre})),
    source TEXT NOT NULL CHECK (source IN ({source})),
    other_name TEXT NOT NULL DEFAULT '',  -- for genre 'other', its name in lower case; '' otherwise
    genre_as_written TEXT,
    quote TEXT,
    prompt TEXT,                  -- the hash of the rooms-genres prompt; NULL for a rule's or a tag's row
    rule TEXT CHECK (rule IN ({genre_rule})),   -- the rule that added it
    model TEXT,
    -- a description's genre comes from the pass (its prompt) or a rule, a tag's from neither
    CHECK (CASE source WHEN 'description' THEN (prompt IS NULL) <> (rule IS NULL)
                       ELSE prompt IS NULL AND rule IS NULL END),
    PRIMARY KEY (event_id, genre, source, other_name)
) STRICT;
CREATE TABLE event_rooms (
    event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    party_rooms INTEGER,          -- NULL = not stated
    party_rooms_quote TEXT,
    class_rooms INTEGER,          -- NULL = not stated
    class_rooms_quote TEXT,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL
) STRICT;
CREATE TABLE event_room_list (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    room_no INTEGER NOT NULL,
    name_as_written TEXT,
    kind TEXT NOT NULL CHECK (kind IN ({room_kind})),
    genres TEXT NOT NULL,         -- JSON array of genres
    quote TEXT NOT NULL,
    PRIMARY KEY (event_id, room_no)
) STRICT;
CREATE TABLE feature_definitions (
    feature TEXT PRIMARY KEY,
    definition TEXT NOT NULL
) STRICT;
CREATE TABLE event_features (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    feature TEXT NOT NULL CHECK (feature IN ({feature})),
    source TEXT NOT NULL CHECK (source IN ({source})),
    quote TEXT,
    rationale TEXT,
    prompt TEXT,
    model TEXT,
    PRIMARY KEY (event_id, feature, source)
) STRICT;
CREATE TABLE artist_mentions (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    role TEXT NOT NULL CHECK (role IN ({role})),
    name_as_written TEXT NOT NULL,
    style TEXT,
    country TEXT,
    source_line TEXT NOT NULL,
    batch TEXT NOT NULL,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL
) STRICT;
CREATE INDEX artist_mentions_event ON artist_mentions(event_id);
"""
TABLES = sqlite_db.declared(DDL.format_map({p.name: states.sql_in(p.name) for p in states.POINTS}))
GENRE_KEY, FEATURE_KEY = ('event_id', 'genre', 'source', 'other_name'), ('event_id', 'feature', 'source')


class Dated(BaseModel):
    id: int
    start_date: str
    modified_at: str


class Venued(BaseModel):
    id: int
    title: str
    venue: str | None


class Described(BaseModel):
    id: int
    title: str
    description_text: str | None


class Tagged(BaseModel):
    event_id: int
    tag: str


TABLE_DOCS = {
    'event_display': "Each event's title and venue as the site shows them: the title without its dates, years, "
    "'official' and shouting capitals, the venue's capitals softened (pipeline/text.py).",
    'artist_mentions': 'Every artist, couple, group or organiser named in an event description, exactly as written, '
    'with '
    'role, style, stated country, the line it came from, and the prompt and model that extracted it. '
    'mention_artists links each mention to its resolved artist.',
    'event_features': 'Event features (all-in-one hotel, competition, workshops, pool party, ...), one row per event, '
    'feature '
    "and source: 'description' rows carry the supporting quote and rationale; 'site_tag' rows mirror the "
    "site's own tags for the features it also tags. feature_definitions defines each feature.",
    'feature_definitions': 'What each feature in event_features means.',
    'role_definitions': 'What each artist role in artist_mentions and event_artists means.',
    'event_genres': "Dance genres each event covers, one row per event, genre and source: 'description' rows (quote, "
    "prompt, or the rule that added it) and 'site_tag' rows from the site's style tags. "
    'genre_definitions defines each genre.',
    'genre_definitions': 'What each genre in event_genres and event_room_list means.',
    'event_rooms': 'Per event, the stated number of party rooms and of class rooms (NULL = not stated), with quotes.',
    'event_room_list': 'Rooms a description lists one by one, with their kind (party / class) and genres (JSON array).',
    'event_passes': 'The passes each festival sells (kind), the one dance style a pass is limited to at a festival of '
    'several, how many people one price is for (group_size, and people as a state), its days, and whether '
    'it includes a hotel. pass_tiers holds the prices. source '
    "is 'description', or 'ticket_page' when its prices were read on its ticket page (see "
    'ticket_pages), which replaces what its description gives. The states each column can hold are '
    "pipeline/states.py's.",
    'pass_tiers': "Each pass's prices tier by tier: what a buyer pays, fee included (fee: the booking fee it "
    'includes, when stated), with currency, the dates each tier applies (a date written without a '
    "year gets the latest year not after the festival's start), tickets at that price, door price, sold "
    'out, and the quote it came from.',
    'price_status': "What each festival's card can say of its price (pipeline/states.py, price): priced, with the "
    'pass it prices (card_pass), or why not, from its passes and how it sells '
    '(pipeline/tickets/status.csv), with its ticket page when one is known.',
    'ticket_pages': 'Festivals whose prices are read on their ticket page (pipeline/tickets.py): the page, the '
    "reseller selling there at its own prices when it isn't the organiser, the day it was last read, "
    'the site recipe that read it, and how many of its tickets are not read yet.',
    'event_price_notes': 'Price rules a festival states that the tiers can\'t hold ("Prices exclude ticketing fees", '
    '"the price rises €10 every month").',
}


def performed_by[E: Entry](got: Mapping[int, Answer[E]]) -> str:
    """'20 answer files by Claude Code subagent, one batch; 3 answer files by pipeline/extract/ask.py' and the like."""
    by: dict[str, set[str]] = {}
    for a in got.values():
        by.setdefault(a.logged.answered_by, set()).add(a.logged.file)
    return '; '.join(f'{len(fs)} answer files by {who}' for who, fs in sorted(by.items()))


def page_tier(r: PriceRow) -> PricedTier:
    """A tier of pass_prices.csv as a prices answer's: a page sells online what is on sale, so no door price and no
    'current' price."""
    alt = None if r.alt_amount is None or r.alt_currency is None else Alt(amount=r.alt_amount, currency=r.alt_currency)
    return PricedTier(
        amount=r.amount,
        currency=r.currency,
        fee=r.fee,
        alt=alt,
        from_=r.from_,
        until=r.until,
        quantity=r.quantity,
        door=False,
        sold_out=r.sold_out,
        current=False,
        quote=r.quote,
    )


def page_prices(event_ids: set[int]) -> tuple[dict[int, tuple[Priced, PageRow]], int]:
    """(prices read from festivals' ticket pages, written by pipeline/tickets.py: {event_id: (entry shaped like a
    prices answer, the festival's ticket_pages.csv row)}, how many are to another first-read prompt). In
    pass_prices.csv (one row per tier, in order) a pass is the rows with one pass_no; the price notes are
    ticket_pages.csv's, one per line. A page read to another prompt is left out, as an answer is."""
    rows = PageRow.read()
    for r in rows:
        if r.event_id not in event_ids:
            sys.exit(f'ticket_pages.csv: no festival {r.event_id} ({r.event})')
    pages = {r.event_id: r for r in rows if prompts.is_current('first_read', r.prompt)}
    passes: dict[int, list[tuple[PriceRow, list[PricedTier]]]] = {}
    for r in PriceRow.read():
        if r.event_id in pages:
            got = passes.setdefault(r.event_id, [])
            if len(got) < r.pass_no:
                got.append((r, []))
            got[-1][1].append(page_tier(r))
    out = {
        i: (
            Priced(
                event_id=i,
                passes=tuple(
                    PricedPass(
                        kind=r.kind,
                        style=r.style,
                        label_quote=r.label,
                        group_size=r.group_size,
                        days=r.days,
                        includes_hotel=r.includes_hotel,
                        tiers=tuple(tiers),
                    )
                    for r, tiers in passes.get(i, [])
                ),
                rule_quotes=tuple(page.notes.splitlines()),
            ),
            page,
        )
        for i, page in pages.items()
    }
    return out, len(rows) - len(out)


def current[E: Entry, Q: Asked](pass_: Pass[E, Q], event_ids: set[int]) -> tuple[dict[int, Answer[E]], int]:
    """(the festivals' answers of the pass to its current prompt, how many answers are to another): one to another
    prompt means something else, so it waits to be asked again."""
    now = answers.current(pass_, event_ids)
    return now, len(answers.answered(pass_.name, event_ids)) - len(now)


def status() -> dict[int, tuple[Sales | None, str | None]]:
    """tickets/status.csv by festival: (how an agent found it sells, None when none did; its known ticket page)."""
    return {r.event_id: (r.sales, r.page) for r in StatusRow.read()}


def load_prices(
    con: Transaction,
    described: Mapping[int, Answer[Priced]],
    pages: Mapping[int, tuple[Priced, PageRow]],
    sold: Mapping[int, tuple[Sales | None, str | None]],
) -> None:
    """Each festival's passes: from its ticket page when ticket_pages.csv has it, else from its description; and what
    its card can say of its price, and the pass it prices, from them and how it sells (sold: status())."""
    dates = {
        e.id: (day_of(e.start_date), day_of(e.modified_at))
        for e in con.rows(Dated, 'SELECT id, start_date, modified_at FROM events')
    }
    rows = [(a.entry, 'description', a.logged.prompt, a.logged.model) for e, a in described.items() if e not in pages]
    rows += [(entry, 'ticket_page', page.prompt, page.read_by) for entry, page in pages.values()]
    con.insert(
        'ticket_pages',
        (
            {
                'event_id': e,
                'page': p.page,
                'reseller': p.reseller,
                'read_on': p.read_on,
                'recipe': p.recipe,
                'unread': p.unread,
            }
            for e, (_, p) in pages.items()
        ),
    )
    passes: dict[int, tuple[PricedPass, ...]] = {}
    notes: list[dict[str, object]] = []
    pass_rows: list[dict[str, object]] = []
    tier_rows: list[dict[str, object]] = []
    for ev, source, prompt, model in rows:
        start, edited = dates[ev.event_id]
        passes[ev.event_id] = ev.passes
        if ev.rule_quotes:
            notes.append({'event_id': ev.event_id, 'notes': '\n'.join(ev.rule_quotes)})
        for p, ps in enumerate(ev.passes, 1):
            pass_rows.append(
                {
                    'event_id': ev.event_id,
                    'pass_no': p,
                    'kind': ps.kind,
                    'style': ps.style,
                    'label': ps.label_quote,
                    'group_size': ps.group_size,
                    'people': price_rules.people(ps),
                    'days': ps.days,
                    'includes_hotel': int(ps.includes_hotel),
                    'source': source,
                    'prompt': prompt,
                    'model': model,
                }
            )
            for t, tier in enumerate(ps.tiers, 1):
                frm, until = window(tier.from_, tier.until, start)
                if tier.current and frm is None:
                    frm = edited
                yearless = any(v and len(v) == len('MM-DD') for v in (tier.from_, tier.until))
                tier_rows.append(
                    {
                        'event_id': ev.event_id,
                        'pass_no': p,
                        'tier_no': t,
                        'amount': tier.amount,
                        'currency': tier.currency,
                        'fee': tier.fee,
                        'alt_amount': tier.alt.amount if tier.alt else None,
                        'alt_currency': tier.alt.currency if tier.alt else None,
                        'valid_from': frm,
                        'valid_until': until,
                        'dates_as_answered': json.dumps({'from': tier.from_, 'until': tier.until})
                        if yearless
                        else None,
                        'quantity': tier.quantity,
                        'door': int(tier.door),
                        'sold_out': int(tier.sold_out),
                        'current': int(tier.current),
                        'quote': tier.quote,
                    }
                )
    con.insert('event_price_notes', notes)
    con.insert('event_passes', pass_rows)
    con.insert('pass_tiers', tier_rows)
    status_rows: list[dict[str, object]] = []
    for e in dates:
        sales, page = sold.get(e, (None, None))
        card = price_rules.card_pass(passes.get(e, ()))
        price = price_rules.price_state(passes.get(e, ()), sales, page)
        status_rows.append(
            {'event_id': e, 'price': price, 'page': page, 'card_pass': None if card is None else card + 1}
        )
    con.insert('price_status', status_rows)


def count(con: Reader, sql: str) -> int:
    return con.value(int, sql)


class PassStep(NamedTuple):
    """A pass's step of pipeline_steps: its name, what it does, and the tables it fills."""

    step: str
    what: str
    outputs: str


def record_pass[E: Entry](
    con: Transaction,
    doc: PassStep,
    got: Mapping[int, Answer[E]],
    numbers: dict[str, int],
    *,
    also: AbstractSet[str] = frozenset(),
) -> None:
    """Log a pass's step from the answers loaded; also, the other prompts its rows follow (a first read's)."""
    step, what, outputs = doc
    if not got:
        run_log.forget(con, step)  # none to the current prompt yet: the step's rows are gone
        return
    hashes = sorted({a.logged.prompt for a in got.values()} | also)
    for h in hashes:
        run_log.record_prompt(con, h)
    times = sorted({a.logged.answered_at for a in got.values()})
    run_log.record(
        con,
        run_log.Step(
            step,
            what,
            performed_by(got),
            performed_at=times[-1],
            model=', '.join(sorted({a.logged.model for a in got.values()})),
            prompt=', '.join(hashes),
            inputs='pipeline/prompts/asked/<prompt>.md; event descriptions',
            outputs=outputs,
            details={
                'answer_files': len({a.logged.file for a in got.values()}),
                'festivals': len(got),
                'first_answer': times[0].isoformat(),
                'last_answer': times[-1].isoformat(),
                **numbers,
            },
        ),
    )


def record_steps(
    con: Transaction,
    extract: Mapping[int, Answer[Extracted]],
    rooms_genres: Mapping[int, Answer[RoomsGenres]],
    prices: Mapping[int, Answer[Priced]],
    pages: Mapping[int, tuple[Priced, PageRow]],
) -> None:
    run_log.document(con, TABLE_DOCS, 'pipeline/extract/load_extract.py')
    record_pass(
        con,
        PassStep(
            '3_extract',
            'Extract, from each event description, the named artists (name as written, role, style, country, source '
            'line) and the event features (with a supporting quote and a rationale). Every name and quote is checked '
            'word for word against the description before loading.',
            "tables artist_mentions, event_features (source 'description')",
        ),
        extract,
        {
            'artist_mentions': count(con, 'SELECT count(*) FROM artist_mentions'),
            'feature_rows_kept': count(con, "SELECT count(*) FROM event_features WHERE source = 'description'"),
            'features_defined': count(con, 'SELECT count(*) FROM feature_definitions'),
        },
    )
    record_pass(
        con,
        PassStep(
            '4_rooms_genres',
            'Extract, from each event description, the stated number of party and class rooms, the rooms described '
            'one by one, and the dance genres covered, each with a supporting quote checked word for word.',
            "tables event_rooms, event_room_list, event_genres (source 'description')",
        ),
        rooms_genres,
        {
            'events_with_party_room_count': count(con, 'SELECT count(party_rooms) FROM event_rooms'),
            'events_with_class_room_count': count(con, 'SELECT count(class_rooms) FROM event_rooms'),
            'rooms_listed': count(con, 'SELECT count(*) FROM event_room_list'),
            'genre_rows': count(con, "SELECT count(*) FROM event_genres WHERE source = 'description' AND rule IS NULL"),
        },
    )
    record_pass(
        con,
        PassStep(
            '4b_prices',
            'Extract, from each event description, the passes it sells and their prices tier by tier, each price '
            "checked against its quote; dates without a year get the latest year not after the festival's start. "
            'Festivals read on their ticket page (pipeline/tickets.py) take their passes from there.',
            'tables event_passes, pass_tiers, event_price_notes, ticket_pages, price_status',
        ),
        prices,
        {
            'festivals_with_prices': count(con, 'SELECT count(DISTINCT event_id) FROM event_passes'),
            'festivals_from_ticket_pages': count(con, 'SELECT count(*) FROM ticket_pages'),
            'passes': count(con, 'SELECT count(*) FROM event_passes'),
            'tiers': count(con, 'SELECT count(*) FROM pass_tiers'),
        },
        also={page.prompt for _, page in pages.values()},
    )
    run_log.record(
        con,
        run_log.Step(
            '5_genre_rules',
            "Add genres the rooms-genres pass applied unevenly: 'SBK' anywhere in a title or description means salsa, "
            'bachata and kizomba (rule sbk); a genre named as a whole word in the title counts (rule title). Rows the '
            'pass already had are kept as they were.',
            'pipeline/extract/load_extract.py',
            outputs="table event_genres (rule 'sbk' / 'title')",
            details={
                'rule_sbk_rows': count(con, "SELECT count(*) FROM event_genres WHERE rule = 'sbk'"),
                'rule_title_rows': count(con, "SELECT count(*) FROM event_genres WHERE rule = 'title'"),
                'site_tag_genre_rows': count(con, "SELECT count(*) FROM event_genres WHERE source = 'site_tag'"),
                'site_tag_feature_rows': count(con, "SELECT count(*) FROM event_features WHERE source = 'site_tag'"),
            },
        ),
    )


def load_rooms_genres(con: Transaction, got: Mapping[int, Answer[RoomsGenres]]) -> None:
    con.insert(
        'event_rooms',
        (
            {
                'event_id': a.entry.event_id,
                'party_rooms': (pr := a.entry.party_rooms) and pr.count,
                'party_rooms_quote': pr and pr.quote,
                'class_rooms': (cr := a.entry.class_rooms) and cr.count,
                'class_rooms_quote': cr and cr.quote,
                'prompt': a.logged.prompt,
                'model': a.logged.model,
            }
            for a in got.values()
        ),
    )
    for a in got.values():
        ev, prompt, model = a.entry, a.logged.prompt, a.logged.model
        con.insert(
            'event_room_list',
            (
                {
                    'event_id': ev.event_id,
                    'room_no': n,
                    'name_as_written': r.name_as_written,
                    'kind': r.kind,
                    'genres': json.dumps(sorted(set(r.genres))),
                    'quote': r.quote,
                }
                for n, r in enumerate(ev.rooms, 1)
            ),
        )
        con.insert(
            'event_genres',
            (
                {
                    'event_id': ev.event_id,
                    'genre': g.genre,
                    'source': 'description',
                    'other_name': ' '.join(g.genre_as_written.split()).casefold() if g.genre == Genre.OTHER else '',
                    'genre_as_written': g.genre_as_written,
                    'quote': g.quote,
                    'prompt': prompt,
                    'model': model,
                }
                for g in ev.genres
            ),
            unless=GENRE_KEY,
        )


def load_genre_rules(con: Transaction) -> None:
    """The genres the rooms-genres pass applies unevenly (SBK, a genre in the title), and the site's style tags'."""
    # a rule's word ("SBK", its tag) names several genres together; the rooms-genres pass does not expand it
    # consistently
    described = con.rows(Described, 'SELECT id, title, description_text FROM events')

    def added(eid: int, genre: str, as_written: str, quote: str, rule: str) -> dict[str, object]:
        return {
            'event_id': eid,
            'genre': genre,
            'source': 'description',
            'genre_as_written': as_written,
            'quote': quote,
            'rule': rule,
        }

    rule_rows: list[dict[str, object]] = []
    for e in described:
        text = f'{e.title}\n{e.description_text or ""}'
        for rule in states.of('genre_rule'):
            for word in rule.tags:
                if m := re.search(rf'[^\n]{{0,60}}\b{re.escape(word)}\b[^\n]{{0,60}}', text):
                    rule_rows += [added(e.id, g, word, m.group(0).strip(), rule.key) for g in rule.genres]
    con.insert('event_genres', rule_rows, unless=GENRE_KEY)
    # A genre named in the title counts; batches of the rooms-genres pass applied this unevenly
    title_rows: list[dict[str, object]] = []
    for e in described:
        plain = unicodedata.normalize('NFKC', e.title)
        title_rows += [  # brand spellings ("AfroKiz", "Kizz") are no title of a genre
            added(e.id, genre.key, m.group(0), e.title, 'title')
            for genre in states.of('genre')
            if genre.title and (m := re.search(genre.title, plain, re.IGNORECASE))
        ]
    con.insert('event_genres', title_rows, unless=GENRE_KEY)
    con.insert(
        'event_genres',
        (
            {'event_id': t.event_id, 'genre': genre, 'source': 'site_tag'}
            for t in con.rows(Tagged, 'SELECT event_id, tag FROM event_tags')
            for genre in states.TAG_GENRES.get(t.tag, [])
        ),
        unless=GENRE_KEY,
    )


def load_extracted(con: Transaction, got: Mapping[int, Answer[Extracted]]) -> None:
    for a in got.values():
        ev, prompt, model = a.entry, a.logged.prompt, a.logged.model
        con.insert(
            'event_features',
            (
                {
                    'event_id': ev.event_id,
                    'feature': x.feature,
                    'source': 'description',
                    'quote': x.quote,
                    'rationale': x.rationale,
                    'prompt': prompt,
                    'model': model,
                }
                for x in ev.features
            ),
            unless=FEATURE_KEY,
        )
        con.insert(
            'artist_mentions',
            (
                {
                    'event_id': ev.event_id,
                    'role': m.role,
                    'name_as_written': m.name_as_written,
                    'style': m.style,
                    'country': m.country,
                    'source_line': m.source_line,
                    'batch': a.batch,
                    'prompt': prompt,
                    'model': model,
                }
                for m in ev.artists
            ),
        )


def main() -> None:
    ap = argparse.ArgumentParser(description='Load the saved answers of the extraction passes into the source DB.')
    _ = ap.parse_args()
    with export.opened('rw') as db, db.transaction() as con:
        event_ids = set(con.column(int, 'SELECT id FROM events'))
        extract, stale_extract = current(prompts.EXTRACT, event_ids)
        rooms_genres, stale_rooms = current(prompts.ROOMS_GENRES, event_ids)
        prices, stale_prices = current(prompts.PRICES, event_ids)
        for pass_, stale in (
            (prompts.EXTRACT, stale_extract),
            (prompts.ROOMS_GENRES, stale_rooms),
            (prompts.PRICES, stale_prices),
        ):
            if stale:
                print(
                    f"{stale} festivals' {pass_.name} answers were asked with another prompt; "
                    'left out until asked again'
                )
        pages, stale = page_prices(event_ids)
        if stale:
            print(
                f"{stale} festivals' ticket pages were read with another first-read prompt; left out until read again"
            )
        con.remake(TABLES)
        con.insert(
            'event_display',
            (
                {'event_id': e.id, 'title': tidy_title(e.title), 'venue': soften_caps(e.venue) if e.venue else None}
                for e in con.rows(Venued, 'SELECT id, title, venue FROM events')
            ),
        )
        for point in ('feature', 'genre', 'role'):
            con.insert(f'{point}_definitions', ({point: s.key, 'definition': s.criterion} for s in states.of(point)))
        load_rooms_genres(con, rooms_genres)
        load_genre_rules(con)
        load_extracted(con, extract)
        con.insert(
            'event_features',
            (
                {'event_id': t.event_id, 'feature': states.TAG_FEATURES[t.tag], 'source': 'site_tag'}
                for t in con.rows(Tagged, 'SELECT event_id, tag FROM event_tags')
                if t.tag in states.TAG_FEATURES
            ),
            unless=FEATURE_KEY,
        )
        load_prices(con, prices, pages, status())
        record_steps(con, extract, rooms_genres, prices, pages)
        for table in (
            'event_features',
            'artist_mentions',
            'event_genres',
            'event_rooms',
            'event_room_list',
            'event_passes',
            'pass_tiers',
            'ticket_pages',
            'price_status',
        ):
            print(table, count(db, f'SELECT count(*) FROM {sqlite_db.name(table)}'))  # noqa: S608 (a table name of ours, quoted)


if __name__ == '__main__':
    main()
