"""What the build fails on that writing and Tests can't catch (docs/concepts/states.md, §4): a value in the committed
data that its record refuses, such as a hand edit of a CSV naming no state, or a claim that is none; and a site claim
(pipeline/claims.py) that no longer departs from anything.

    mise run audit

Refused: every row of the CSV files the steps share (tickets/pages.csv, tickets/status.csv, the hand-kept decisions and
plans), each read as its record (pipeline/records.py); every fare search of the fare history (pipeline/fare_store.py);
every claim of the claims repository, read as its record and named by its digest; and the data the load takes: every
answer and first read to its current prompt (one to another prompt waits to be asked again, and is not loaded), read as
its record. Stale: a site claim for a site a recipe now reads, or one no festival the source database lists has its
known ticket page on. Each finding goes to stderr; then "N refused, M stale", exiting 1 when either is not 0.
"""

import argparse
import sys
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

from pydantic import ValidationError

from pipeline import cities, claims, data, fare_store, tables, tickets_state, tickets_store
from pipeline import prompt as prompts
from pipeline.claims import CityClaim, SiteClaim
from pipeline.extract import answers
from pipeline.records import (
    Airport,
    Answered,
    City,
    CsvRow,
    FirstRead,
    Stamped,
    errors,
    today,
)


def shown(path: Path) -> str:
    return str(path.relative_to(data(''))) if path.is_relative_to(data('')) else str(path)


def rows_refused(record: type[CsvRow]) -> list[str]:
    """Each value of the record's file the record refuses, by line; or the file, when a row has more or fewer cells
    than its header has columns, so that no row can be read by them."""
    try:
        found = tables.rows(record.path())
    except tables.ShapeError as e:
        return [f'{record.FILE}: {e}']
    out: list[str] = []
    for n, row in enumerate(found, 2):
        try:
            _ = record.model_validate(record.cells(row))
        except ValidationError as e:
            out += errors(e, f'{record.FILE} line {n}')
    return out


def refused(event_ids: set[int]) -> list[str]:
    """Each value its record refuses, with where it is; event_ids are the festivals the source DB has, whose answers
    count."""
    out = [line for record in CsvRow.records() for line in rows_refused(record)]
    out += fare_store.refused()
    for folder in (claims.CLAIMS, claims.PROPOSALS):
        parsed = [(path, claims.parsed(path, folder)) for path in claims.claim_files(folder)]
        out += [line for _, why in parsed if isinstance(why, list) for line in why]
        out += unknown([(f'{folder}/{path.name}', c) for path, c in parsed if isinstance(c, CityClaim)])
    for pass_ in prompts.PASSES:
        answered = answers.answered(pass_.name, event_ids).values()
        for path in sorted({path for path, meta in answered if prompts.is_current(pass_.name, meta.prompt)}):
            try:
                _ = Answered[pass_.entry].parse(path.read_bytes())
            except ValidationError as e:
                out += errors(e, shown(path))
    for path in sorted(data(tickets_store.READS).glob('*.json')):
        if prompts.is_current('first_read', Stamped.model_validate_json(path.read_bytes()).prompt):
            try:
                _ = FirstRead.parse(path.read_bytes())
            except ValidationError as e:
                out += errors(e, shown(path))
    return out


def unknown(named: Sequence[tuple[str, CityClaim]]) -> list[str]:
    """Each city claim naming a city cities.csv has not, or an airport airports.csv has not."""
    have, flown = {c.key for c in cities.known()}, {a.code for a in Airport.read()}
    out: list[str] = []
    for where, c in named:
        if c.key not in have:
            out.append(f'{where}: no city {c.key} in {City.FILE}')
        out += [f'{where}: no airport {g} in {Airport.FILE}' for g in c.decision.gateways if g not in flown]
    return out


def stale(fs: Sequence[tickets_state.Festival], known: dict[str, tickets_store.Site]) -> list[tuple[SiteClaim, str]]:
    """(site claim, why) for each site claim that departs from nothing any more: a recipe reads its site now, or no
    festival has its known ticket page there; fs is every festival (tickets_state.festivals(every=True)), known
    tickets_store.sites()."""
    on: defaultdict[str, list[int]] = defaultdict(list)
    for f in fs:
        if f.page:
            on[tickets_state.host(f.page.url)].append(f.id)
    out: list[tuple[SiteClaim, str]] = []
    for o in claims.sites().values():
        if site := tickets_store.site_for(f'https://{o.host}/', known):
            out.append(
                (o, f'the recipe {site.version} reads it (festivals {", ".join(map(str, on[o.host])) or "none"})')
            )
        elif not on[o.host]:
            out.append((o, 'no festival has its known ticket page there'))
    return out


def main() -> None:
    _ = argparse.ArgumentParser(
        description='Name each value in the data its record refuses (a value that is no state of '
        'pipeline/states.py, say), and each site claim (pipeline/claims.py) that departs from nothing any more.'
    ).parse_args()
    with tickets_state.src_db() as db:
        bad = refused(set(db.column(int, 'SELECT id FROM events')))
        old = stale(tickets_state.festivals(db, today(), every=True), tickets_store.sites())
    for line in bad:
        print(f'refused: {line}', file=sys.stderr)
    for o, why in old:
        print(f'stale: the site claim of {o.host}: {why}', file=sys.stderr)
    print(f'{len(bad)} refused, {len(old)} stale')
    if bad or old:
        sys.exit(1)


if __name__ == '__main__':
    main()
