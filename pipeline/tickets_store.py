"""The ticket pages' files (pipeline/tickets/, see pipeline/tickets.py): the sites' recipes, the log of reads, the
first reads, drafts and disputes; the checks a first read is held to; and what a first read and its rows record."""

import datetime as dt
import json
import re
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urlparse

from pydantic import ValidationError

from pipeline import data, states
from pipeline import prompt as prompts
from pipeline.enums import PassKind, Recheck, SkipReason, Status, Style
from pipeline.extract import check_output, prices
from pipeline.records import (
    LOG_ENTRY,
    RECIPE,
    SHORT,
    Alt,
    ApiRecipe,
    Batch,
    Dated,
    FirstRead,
    LogEntry,
    PageRecipe,
    Priced,
    PricedPass,
    PricedTier,
    Read,
    ReadHeader,
    ReadTier,
    Row,
    Stamped,
    TicketPage,
    digest,
    errors,
)

TICKETS = 'pipeline/tickets'
# each a folder of TICKETS: the sites' recipes, first reads, drafts, the log of reads, and reads no two models agreed on
SITES, READS, DRAFTS, LOG, DISPUTED, PARTIAL = (
    f'{TICKETS}/{d}' for d in ('sites', 'reads', 'drafts', 'log', 'disputed', 'partial')
)
REFUSALS = 3
BOOTCAMP = re.compile(r'(?i)boot\s*-?camp')
# what a ticket's name says that a first read must follow (rules_problems): its nights, its weekdays, its dance styles,
# a meal sold with it, a deposit
NIGHTS = re.compile(r'(?i)\b(\d+)\s*(?:nights?|noches|nuits?|notti|nächte|noites)\b')
WEEKDAYS: dict[str, re.Pattern[str]] = {
    day: re.compile(rf'(?i)\b(?:{words})\b')
    for day, words in {
        'monday': 'monday|lundi|lunes|montag|lunedì|lunedi',
        'tuesday': 'tuesday|mardi|martes|dienstag|martedì|martedi',
        'wednesday': 'wednesday|mercredi|miércoles|miercoles|mittwoch|mercoledì|mercoledi',
        'thursday': 'thursday|jeudi|jueves|donnerstag|giovedì|giovedi',
        'friday': 'friday|vendredi|viernes|freitag|venerdì|venerdi',
        'saturday': 'saturday|samedi|sábado|sabado|samstag|sabato',
        'sunday': 'sunday|dimanche|domingo|sonntag|domenica',
    }.items()
}
# the words that name each dance style: its genres' as a title names them (pipeline/states.py)
STYLE_WORDS: dict[str, re.Pattern[str]] = {
    style: re.compile('|'.join(titles), re.IGNORECASE)
    for style in Style
    if (titles := [g.title for g in states.of('genre') if g.under == style and g.title])
}
MEAL = re.compile(r'(?i)dinner|dîner|diner\b|\bcena\b|repas|abendessen|lunch|almuerzo|déjeuner|brunch|\bmeals?\b')
DEPOSIT = re.compile(r'(?i)deposit|advance|anticipo|acompte|anzahlung|instal|payment|caparra|prepay')


# ---- sites and reading


def host(url: str) -> str:
    return (urlparse(url).netloc or '').lower()


class Site(NamedTuple):
    recipe: PageRecipe | ApiRecipe
    version: str  # the recipe's site and its file's hash


def shown(path: Path) -> Path:
    return path.relative_to(data('')) if path.is_relative_to(data('')) else path


def sites() -> dict[str, Site]:
    """{site: its recipe and version}, each recipe read as its record; the version changes with the file."""
    out: dict[str, Site] = {}
    for path in sorted(data(SITES).glob('*.json')):
        try:
            recipe = RECIPE.validate_json(path.read_bytes())
        except ValidationError as e:
            sys.exit('; '.join(errors(e, str(shown(path)))))
        out[recipe.site] = Site(recipe, f'{recipe.site}@{digest(path.read_bytes(), SHORT)}')
    return out


def site_for(url: str, known: Mapping[str, Site]) -> Site | None:
    """The recipe and version for the site a page is on, or None."""
    return next((s for s in known.values() if host(url) in s.recipe.hosts), None)


# ---- the log and the first reads


def log(event_id: int) -> list[LogEntry]:
    path = data(LOG) / f'{event_id}.jsonl'
    if not path.exists():
        return []
    entries: list[LogEntry] = []
    for n, s in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if s.strip():
            try:
                entries.append(LOG_ENTRY.validate_json(s))
            except ValidationError as e:
                sys.exit('; '.join(errors(e, f'{shown(path)} line {n}')))
    # git merges the log line by line (.gitattributes), so a line edited in place comes back twice
    stamps = [e.at for e in entries]
    if twice := sorted({at for at in stamps if stamps.count(at) > 1}):
        sys.exit(f'{shown(path)}: two entries at {", ".join(map(str, twice))}; the log is only ever appended to')
    return sorted(entries, key=lambda e: e.at)


def append(event_id: int, entry: LogEntry) -> None:
    """Add a line to the festival's log: the entry's fields as it was made (a failure that reached no address has
    none), keys sorted."""
    data(LOG).mkdir(parents=True, exist_ok=True)
    with (data(LOG) / f'{event_id}.jsonl').open('a', encoding='utf-8') as f:
        _ = f.write(
            json.dumps(entry.model_dump(mode='json', exclude_unset=True), ensure_ascii=False, sort_keys=True) + '\n'
        )


def latest_read(entries: Sequence[LogEntry]) -> Read | None:
    return next((e for e in reversed(entries) if isinstance(e, Read)), None)


def streak(entries: Sequence[LogEntry]) -> int:
    """How many reads in a row the page refused or could not be reached, counting back from the latest: the one rule
    for when a festival waits for a session (REFUSALS). A broken recipe ends it, as it waits for its fix instead."""
    n = 0
    for e in reversed(entries):
        if e.status not in {Status.REFUSED, Status.UNREACHABLE}:
            break
        n += 1
    return n


def checked_read(text: str) -> FirstRead | list[str]:
    """A first read from its file's text, or what its record refuses in it."""
    try:
        return FirstRead.parse(text)
    except ValidationError as e:
        return errors(e, 'schema')


def first_read(event_id: int) -> FirstRead | Stamped | None:
    """The festival's first read (tickets/reads/), as its record when it follows the current prompt; else only the
    prompt it names and the read it maps, since it may follow another shape."""
    path = data(READS) / f'{event_id}.json'
    if not path.exists():
        return None
    stamped = Stamped.model_validate_json(path.read_bytes())
    if not prompts.is_current('first_read', stamped.prompt):
        return stamped
    match checked_read(path.read_text(encoding='utf-8')):
        case list() as found:
            sys.exit('; '.join(f'{shown(path)}: {p}' for p in found))
        case fr:
            return fr


def draft(event_id: int) -> str | None:
    """The text of the festival's draft (tickets/drafts/), or None."""
    path = data(DRAFTS) / f'{event_id}.json'
    return path.read_text(encoding='utf-8') if path.exists() else None


def save_draft(header: ReadHeader) -> None:
    """A first read to fill: the festival's header, its passes, skipped and rule quotes empty."""
    data(DRAFTS).mkdir(parents=True, exist_ok=True)
    empty: dict[str, object] = {'passes': [], 'skipped': [], 'rule_quotes': []}
    text = json.dumps(header.model_dump(mode='json') | empty, ensure_ascii=False, indent=1)
    _ = (data(DRAFTS) / f'{header.event_id}.json').write_text(text + '\n', encoding='utf-8')


def save_read(fr: FirstRead) -> None:
    """Save a checked first read in tickets/reads/, the current first-read prompt it names archived first."""
    prompt = prompts.current('first_read')
    if fr.prompt != prompt.hash:
        raise ValueError(f'{fr.event_id}: a first read to prompt {fr.prompt}, not the current {prompt.hash}')
    _ = prompt.archive()
    data(READS).mkdir(parents=True, exist_ok=True)
    _ = (data(READS) / f'{fr.event_id}.json').write_text(fr.dumped(), encoding='utf-8')


def settle_dispute(event_id: int, fr: FirstRead) -> None:
    """Remove the festival's dispute when this first read is of rows at least as new as the disputed reads'."""
    path = data(DISPUTED) / f'{event_id}.json'
    if path.exists() and Dated.model_validate_json(path.read_bytes()).rows_at <= fr.rows_at:
        path.unlink()


def read_at(fr: Dated | FirstRead, entries: Sequence[LogEntry]) -> Read | None:
    """The logged read a first read was made from, or None."""
    return next((e for e in entries if isinstance(e, Read) and e.at == fr.rows_at), None)


def line(row: Row) -> str:
    """The ticket as the page shows it: its name and price, the fee the site adds to it when the price doesn't show
    it (the site shows it apart), and its second price when it has one."""
    fee = f' + {row.fee:g} fee' if row.fee and row.fee not in prices.numbers_in(row.price) else ''
    return f'{row.name} {row.price}{fee}' + (f' · {row.alt_price}' if row.alt_price else '')


def in_text(quote: str, text: str) -> bool:
    return check_output.norm(quote) in check_output.norm(text)


def split_price(here: Sequence[Row]) -> str | None:
    """A problem when the tickets of one tier are not all at one price, else None."""
    if len({(r.amount, r.currency) for r in here}) > 1:
        return f'tickets {", ".join(r.key for r in here)} differ in price ({"; ".join(map(line, here))}); one tier each'
    return None


def keys_of(fr: FirstRead) -> list[str]:
    """Every key the first read names: in its tiers, then skipped."""
    return [k for ps in fr.passes for t in ps.tiers for k in t.keys] + [s.key for s in fr.skipped]


def read_problems(fr: FirstRead, entries: Sequence[LogEntry]) -> list[str]:
    """What is wrong with a first read, against the rows it was made from and its description; empty when sound."""
    if (at := read_at(fr, entries)) is None:
        return [f'rows_at {fr.rows_at.isoformat()} is no read in tickets/log/{fr.event_id}.jsonl']
    rows = {r.key: r for r in at.rows}
    keys = keys_of(fr)
    found = [f'key {k}: in the read twice' for k in sorted({k for k in keys if keys.count(k) > 1})]
    found += [f'key {k}: not on the page' for k in sorted(set(keys) - set(rows))]
    found += [f'key {k} ({line(rows[k])}): neither in a tier nor skipped' for k in rows if k not in keys]
    desc = fr.description
    for p, ps in enumerate(fr.passes):
        names = '\n'.join(line(rows[k]) for t in ps.tiers for k in t.keys if k in rows)
        if ps.label_quote and not in_text(ps.label_quote, names + '\n' + desc):
            found.append(f'passes[{p}].label_quote {ps.label_quote!r} is neither in its tickets nor in the description')
        for t, tier in enumerate(ps.tiers):
            found += tier_problems(fr, f'passes[{p}].tiers[{t}]', tier, [rows[k] for k in tier.keys if k in rows])
    found += [f'rule_quotes {q!r} is not in the description' for q in fr.rule_quotes if not in_text(q, desc)]
    found += prices.style_problems(fr.passes, fr.styles)
    return found + rules_problems(fr, rows)


def tier_problems(fr: FirstRead, where: str, tier: ReadTier, here: Sequence[Row]) -> list[str]:
    """What is wrong with a tier of a first read: its quote, its dates, its tickets' prices. A free ticket is no
    pass's price (a priced tier's amount is more than 0, records.PricedTier), so it is skipped."""
    found: list[str] = [
        f'{where}: key {r.key} ({r.name} {r.price}) is free: no pass is sold for nothing; skip it with its reason'
        for r in here
        if r.amount == 0
    ]
    if tier.date_quote and not in_text(tier.date_quote, '\n'.join(map(line, here)) + '\n' + fr.description):
        found.append(f'{where}.date_quote {tier.date_quote!r} is neither in its tickets nor in the description')
    found += [f'{where}: {d}' for d in [split_price(here)] if d]
    # the page sold these tickets when it was read, so their price can't have ended before that day
    until = tier.until
    if (
        until
        and any(not r.sold_out for r in here)
        and (ends := prices.window(tier.from_, until, fr.start_date).until) is not None
        and ends < fr.rows_at.date()
    ):
        found.append(
            f'{where}.until {until}: the page sold these tickets on {fr.rows_at.date()}; a date that has passed is not '
            'theirs'
        )
    return found


def named(words: Mapping[str, re.Pattern[str]], name: str) -> frozenset[str]:
    """Which of the words the name says."""
    return frozenset(k for k, rx in words.items() if rx.search(name))


def rules_problems(fr: FirstRead, rows: Mapping[str, Row]) -> list[str]:
    """What a first read gets wrong of what its tickets' names say, by the prompt's rules: a pass of tickets for N
    nights covers N days; one pass's tickets name the same weekdays and the same dance styles (others are other
    passes, not its tiers); a pass sold with a meal is a package; a bootcamp is a pass, skipped only as a deposit on
    one, that its name calls one."""
    found: list[str] = []
    for p, ps in enumerate(fr.passes):
        names = [rows[k].name for t in ps.tiers for k in t.keys if k in rows]
        nights = {int(m[1]) for n in names if (m := NIGHTS.search(n))}
        if names and all(NIGHTS.search(n) for n in names) and len(nights) == 1 and ps.days != (n := nights.pop()):
            found.append(f'passes[{p}].days {ps.days}: its tickets are for {n} nights, so it covers {n} days')
        for what, words in (('weekdays', WEEKDAYS), ('dance styles', STYLE_WORDS)):
            if len(said := {named(words, n) for n in names}) > 1:
                found.append(
                    f'passes[{p}]: its tickets name different {what} '
                    f'({"; ".join(sorted(", ".join(sorted(w)) or "none" for w in said))}): each is a pass of its '
                    'own, not a tier of one'
                )
        if names and all(MEAL.search(n) for n in names) and ps.kind not in {PassKind.PACKAGE, PassKind.OTHER}:
            found.append(f'passes[{p}].kind {ps.kind}: its tickets are sold with a meal, so it is a {PassKind.PACKAGE}')
    found += [
        f'key {s.key} ({line(rows[s.key])}): a bootcamp is a pass ({PassKind.OTHER}), skipped only as '
        f'a {SkipReason.DEPOSIT} on one that its name calls one, not as a {s.reason}'
        for s in fr.skipped
        if s.key in rows
        and BOOTCAMP.search(name := rows[s.key].name)
        and (s.reason != SkipReason.DEPOSIT or not DEPOSIT.search(name))
    ]
    return found


# ---- recording


def unread_keys(fr: FirstRead, entry: Read) -> list[str]:
    """The keys of the read rows' tickets that the first read neither puts in a tier nor skips (enums.Ticket.UNREAD)."""
    mapped = set(keys_of(fr))
    return [r.key for r in entry.rows if r.key not in mapped]


def priced_tier(tier: ReadTier, here: Sequence[Row]) -> PricedTier:
    """A tier of the prices answer from a first read's tier and its tickets on the page, the first one's price: a
    ticket page sells online what is on sale, so no door price and no 'current' price."""
    lead = here[0]
    alt = (
        None
        if lead.alt_amount is None or lead.alt_currency is None
        else Alt(amount=lead.alt_amount, currency=lead.alt_currency)
    )
    return PricedTier(
        amount=lead.amount,
        currency=lead.currency,
        fee=lead.fee,
        alt=alt,
        from_=tier.from_,
        until=tier.until,
        quantity=tier.quantity,
        door=False,
        sold_out=all(r.sold_out for r in here),
        current=False,
        quote=line(lead),
    )


def build(fr: FirstRead, entry: Read) -> tuple[Priced, list[str], list[str]]:
    """(prices answer, unread keys, problems) from a first read and read rows of the same page."""
    rows = {r.key: r for r in entry.rows}
    passes: list[PricedPass] = []
    found: list[str] = []
    for p, ps in enumerate(fr.passes):
        tiers: list[PricedTier] = []
        for t, tier in enumerate(ps.tiers):
            here = [rows[k] for k in tier.keys if k in rows]
            if not here:
                continue  # its tickets are no longer on the page
            if d := split_price(here):
                found.append(f'{d}: the first read needs doing again')
            try:
                tiers.append(priced_tier(tier, here))
            except ValidationError as e:
                found += errors(e, f'schema: event {fr.event_id}: passes[{p}].tiers[{t}]')
        if tiers:
            passes.append(
                PricedPass(
                    kind=ps.kind,
                    style=ps.style,
                    label_quote=ps.label_quote,
                    group_size=ps.group_size,
                    days=ps.days,
                    includes_hotel=ps.includes_hotel,
                    tiers=tuple(tiers),
                )
            )
    answer = Priced(event_id=fr.event_id, passes=tuple(passes), rule_quotes=fr.rule_quotes)
    batch = Batch[Priced](batch=f'page-{fr.event_id}', events=(answer,))
    texts = {fr.event_id: check_output.source_text(fr, *map(line, entry.rows))}
    found += check_output.found_in(batch, texts) + prices.problems(answer, fr.styles)
    return answer, unread_keys(fr, entry), found


class Written(NamedTuple):
    answer: Priced  # its passes, shaped as a prices answer
    page: TicketPage
    unread: list[str]  # the keys of its tickets the first read doesn't know

    @property
    def tiers(self) -> tuple[PricedTier, ...]:
        """Every tier of every pass: its prices."""
        return tuple(t for p in self.answer.passes for t in p.tiers)


class Recorded(NamedTuple):
    written: dict[int, Written]  # by festival
    problems: list[str]  # of the festivals whose first read no longer fits their rows
    other_prompt: int  # first reads to another prompt, waiting to be made again


def written(
    event_id: int, fr: FirstRead | Stamped, entries: Sequence[LogEntry], known: Mapping[str, Site]
) -> Written | list[str]:
    """What a festival's first read and its latest rows record (Written), or the problems that stop it, a list; known
    is sites(), for the reseller its page is on."""
    if isinstance(fr, Stamped) or not prompts.is_current('first_read', fr.prompt):
        return [
            (
                f'{event_id}: the first read follows prompt {fr.prompt}, not the current '
                f'{prompts.current("first_read").hash}; make it again'
            )
        ]
    if found := read_problems(fr, entries):
        return [f'{event_id}: {p}' for p in found]
    at, entry = read_at(fr, entries), latest_read(entries)
    if at is None or entry is None:
        return [f'{event_id}: no read rows']
    if entry.page != at.page:
        return [f'{event_id}: the ticket page changed from {at.page} to {entry.page}; make a new first read']
    answer, unread, found = build(fr, entry)
    if found:
        return [f'{event_id}: {p}' for p in found]
    site = known.get(entry.recipe.split('@')[0])
    page = TicketPage(
        event_id=event_id,
        page=entry.page,
        reseller=site.recipe.reseller if site else None,
        read_on=entry.at.date(),
        read_by=fr.read_by,
        prompt=fr.prompt,
        recipe=entry.recipe,
        unread=len(unread),
    )
    return Written(answer, page, unread)


def recorded() -> Recorded:
    """What every first read to the current prompt records with its latest rows, so that prices are what the reads and
    logs say and nothing else; a first read to another prompt is left out quietly: its festival waits for it to be made
    again (redo_prompt)."""
    out: dict[int, Written] = {}
    found: list[str] = []
    other = 0
    known = sites()
    for path in sorted(data(READS).glob('*.json'), key=lambda p: int(p.stem)):
        i = int(path.stem)
        if not isinstance(fr := first_read(i), FirstRead):
            other += 1
            continue
        match written(i, fr, log(i), known):
            case Written() as w:
                out[i] = w
            case list() as problems_:
                found += problems_
    return Recorded(out, found, other)


def record(event_id: int) -> list[str]:
    """Check the festival's draft (moved to tickets/reads/ once it passes) or its first read against its latest read
    rows, and settle its dispute; the festival's problems, empty when it records its prices."""
    entries = log(event_id)
    text = draft(event_id)
    if text is not None:
        match checked_read(text):
            case list() as found:
                return [f'{event_id}: {p}' for p in found]
            case fr:
                pass
    elif (fr := first_read(event_id)) is None:
        return [
            (
                f'{event_id}: no first read (tickets/reads/{event_id}.json); run: uv run --group tickets -m '
                f'pipeline.tickets draft {event_id}'
            )
        ]
    match written(event_id, fr, entries, sites()):
        case Written() as w:
            pass
        case list() as found:
            return found
    if text is not None and isinstance(fr, FirstRead):
        save_read(fr)
        (data(DRAFTS) / f'{event_id}.json').unlink()
        (data(DRAFTS) / f'{event_id}.prompt.md').unlink(missing_ok=True)
    if isinstance(fr, FirstRead):
        settle_dispute(event_id, fr)
    print(
        f'{event_id}: {len(w.tiers)} prices recorded, read {w.page.read_on}'
        + (f'; {len(w.unread)} tickets not read yet ({", ".join(w.unread)})' if w.unread else '')
    )
    return []


# ---- what changed, and when to read again


def changes(entries: Sequence[LogEntry]) -> list[tuple[str, str]]:
    """What differs between each read and the one before it, as (date, line) pairs."""
    out: list[tuple[str, str]] = []
    before: dict[str, Row] | None = None
    for e in entries:
        if not isinstance(e, Read):
            continue
        now = {r.key: r for r in e.rows}
        if before is not None:
            day = e.at.date().isoformat()
            out += [(day, f'new: {line(now[k])}') for k in now if k not in before]
            out += [(day, f'gone: {line(before[k])}') for k in before if k not in now]
            for k in (k for k in now if k in before):
                a, b = before[k], now[k]
                if (a.amount, a.currency) != (b.amount, b.currency):
                    out.append((day, f'price: {b.name} {a.price} → {b.price}'))
                if a.sold_out != b.sold_out:
                    out.append((day, f'{"sold out" if b.sold_out else "back on sale"}: {line(b)}'))
        before = now
    return out


def recheck(tiers: Sequence[PricedTier], start: dt.date, today: dt.date) -> tuple[Recheck, bool, str]:
    """(class, due, why) from a festival's recorded tiers (written)."""
    on_sale = [t for t in tiers if not t.sold_out]
    if on_sale and all(t.until and not t.quantity for t in on_sale):
        last = max(d for t in on_sale if (d := prices.window(t.from_, t.until, start).until) is not None)
        return Recheck.DATED, last < today, f'last price date {last}'
    return Recheck.MONTHLY, True, 'read on every monthly run'
