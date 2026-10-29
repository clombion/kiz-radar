"""What the build fails on that writing and Tests can't catch (pipeline/STATES.md §4): a value in the committed data
that its record refuses, such as a hand edit of a CSV naming no state, or a claim that is none; and a site claim
(pipeline/claims.py) that no longer departs from anything.

    mise run audit

Refused: every row of the CSV files the steps share (tickets/pages.csv, tickets/status.csv, the
hand-kept decisions and plans), each read as its record (pipeline/records.py); every claim of the claims repository,
read as its record and named by its digest; and the data the load takes: every answer and first read to its current
prompt (one to another prompt waits to be asked again, and is not loaded), read as its record. Stale: a site claim for
a site a recipe now reads, or one no festival the source database lists has its known ticket page on. Each finding goes
to stderr; then "N refused, M stale", exiting 1 when either is not 0.
"""

import argparse
import sys
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

from pydantic import ValidationError

from pipeline import claims, data, tables, tickets_state, tickets_store
from pipeline import prompt as prompts
from pipeline.claims import SiteClaim
from pipeline.extract import answers
from pipeline.records import (
    Answered,
    CsvRow,
    FirstRead,
    Stamped,
    errors,
    today,
)


def shown(path: Path) -> str:
    return str(path.relative_to(data(''))) if path.is_relative_to(data('')) else str(path)


def refused(event_ids: set[int]) -> list[str]:
    """Each value its record refuses, with where it is; event_ids are the festivals the source DB has, whose answers
    count."""
    out: list[str] = []
    for record in CsvRow.records():
        for n, row in enumerate(tables.rows(record.path()), 2):
            try:
                _ = record.model_validate(record.cells(row))
            except ValidationError as e:
                out += errors(e, f'{record.FILE} line {n}')
    out += [line for path in claims.claim_files() if isinstance(why := claims.parsed(path), list) for line in why]
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
