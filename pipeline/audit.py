"""What the build fails on that writing and Tests can't catch (pipeline/STATES.md §4): a value in the committed data
that its record refuses, such as a hand edit of a CSV naming no state; and an override in pipeline/exceptions.py that
no longer departs from anything.

    uv run --group tickets -m pipeline.audit

Refused: every row of the CSV files the steps share (tickets/pages.csv, tickets/status.csv, pass_prices.csv,
ticket_pages.csv, the answers' log, the hand-kept decisions and plans), each read as its record
(pipeline/records.py); and the data the load takes: every answer and first read to its current prompt (one to
another prompt waits to be asked again, and is not loaded), read as its record. Stale: an override for a site a
recipe now reads, or one no festival the source database lists has its known ticket page on. Each finding goes to
stderr; then "N refused, M stale", exiting 1 when either is not 0.
"""

import argparse
import sys
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

from pydantic import ValidationError

from pipeline import ROOT, exceptions, tables, tickets
from pipeline import prompt as prompts
from pipeline.exceptions import Override
from pipeline.extract import answers
from pipeline.records import (
    Airport,
    ArtistMergeRow,
    Booking,
    CsvRow,
    Fare,
    FirstRead,
    FoundRow,
    Group,
    HomeCountry,
    Job,
    MergeRow,
    PageRow,
    Person,
    Place,
    PlanRow,
    PriceRow,
    Promo,
    Rate,
    Spent,
    Stamped,
    StatusRow,
    Suggestion,
    errors,
    today,
)

# each CSV file the steps share, by the record of its rows
FILES: dict[str, type[CsvRow]] = {
    'docs/data/fares.csv': Fare,
    'pipeline/airports.csv': Airport,
    'pipeline/artist_bookings.csv': Booking,
    'pipeline/artist_countries.csv': HomeCountry,
    'pipeline/artist_merge_suggestions.csv': Suggestion,
    'pipeline/artist_merges.csv': ArtistMergeRow,
    'pipeline/extract/answers/log.csv': answers.Logged,
    'pipeline/extract/groups.csv': Group,
    'pipeline/extract/merges.csv': MergeRow,
    'pipeline/fare_jobs.csv': Job,
    'pipeline/geocode.csv': Place,
    'pipeline/pass_prices.csv': PriceRow,
    'pipeline/people.csv': Person,
    'pipeline/plans.csv': PlanRow,
    'pipeline/promo_codes.csv': Promo,
    'pipeline/rates.csv': Rate,
    'pipeline/spend.csv': Spent,
    'pipeline/ticket_pages.csv': PageRow,
    'pipeline/tickets/pages.csv': FoundRow,
    'pipeline/tickets/status.csv': StatusRow,
}


def shown(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def refused(event_ids: set[int]) -> list[str]:
    """Each value its record refuses, with where it is; event_ids are the festivals the source DB has, whose answers
    count."""
    out: list[str] = []
    for file, record in FILES.items():
        for n, row in enumerate(tables.rows(ROOT / file), 2):
            try:
                _ = record.model_validate(record.cells(row))
            except ValidationError as e:
                out += errors(e, f'{file} line {n}')
    for pass_ in prompts.PASSES:
        answered = answers.answered(pass_.name, event_ids).values()
        for path in sorted({path for path, meta in answered if prompts.is_current(pass_.name, meta.prompt)}):
            try:
                _ = prompts.answer(pass_).parse(path.read_bytes())
            except ValidationError as e:
                out += errors(e, shown(path))
    for path in sorted(tickets.READS.glob('*.json')):
        if prompts.is_current('first_read', Stamped.model_validate_json(path.read_bytes()).prompt):
            try:
                _ = FirstRead.parse(path.read_bytes())
            except ValidationError as e:
                out += errors(e, shown(path))
    return out


def stale(fs: Sequence[tickets.Festival], known: dict[str, tickets.Site]) -> list[tuple[Override, str]]:
    """(override, why) for each override that departs from nothing any more: a recipe reads its site now, or no
    festival has its known ticket page there; fs is every festival (tickets.festivals(every=True)), known
    tickets.sites()."""
    on: defaultdict[str, list[int]] = defaultdict(list)
    for f in fs:
        if f.page:
            on[tickets.host(f.page)].append(f.id)
    out: list[tuple[Override, str]] = []
    for o in exceptions.OVERRIDES:
        if site := tickets.site_for(f'https://{o.host}/', known):
            out.append(
                (o, f'the recipe {site.version} reads it (festivals {", ".join(map(str, on[o.host])) or "none"})')
            )
        elif not on[o.host]:
            out.append((o, 'no festival has its known ticket page there'))
    return out


def main() -> None:
    _ = argparse.ArgumentParser(
        description='Name each value in the data its record refuses (a value that is no state of '
        'pipeline/states.py, say), and each override of pipeline/exceptions.py that departs from nothing any more.'
    ).parse_args()
    with tickets.src_db() as db:
        ids: list[tuple[int]] = db.execute('SELECT id FROM events').fetchall()
        bad = refused({i for (i,) in ids})
        old = stale(tickets.festivals(db, today(), every=True), tickets.sites())
    for line in bad:
        print(f'refused: {line}', file=sys.stderr)
    for o, why in old:
        print(f'stale: pipeline/exceptions.py, {o.host}: {why}', file=sys.stderr)
    print(f'{len(bad)} refused, {len(old)} stale')
    if bad or old:
        sys.exit(1)


if __name__ == '__main__':
    main()
