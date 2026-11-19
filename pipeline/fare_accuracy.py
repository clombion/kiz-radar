"""How well home's fare predicts another city's: the report of the pairs of the fare history (pipeline/fares.py
PAIR_SHARE), written to pipeline/fare_accuracy.md, which Refresh fares commits.

A pair is a weekend searched from home and from another city on one day, for the same flights, each with a fare on one
ticket (the cheapest). The model is home's fare plus an offset, one for each city and family (whether home's fare flies
direct out, fare_family): the median of the city's price less home's. It is scored as it would be used, on weeks it has
not seen: each week's pairs are predicted by the offset of the pairs of the weeks before (ISO weeks, by the day of the
search), so a week with none before it is not scored. The error is the predicted price's distance from the city's, in
euros. A city and family may be shown on the site, once it lets visitors pick their city, when at least SHOWN_N pairs
are scored and SHOWN_SHARE of them are within SHOWN_EUR; this report says which are.

    mise run fares -- accuracy
"""

import datetime as dt
import statistics
import textwrap
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from pipeline import airports, data, files
from pipeline.enums import FareFamily, FareOutcome, FareTicket, FareVendor
from pipeline.fare_store import FOLDER
from pipeline.fare_weekends import cheapest
from pipeline.records import Search
from pipeline.reference import table

REPORT = 'pipeline/fare_accuracy.md'
SHOWN_EUR = 40  # an estimate is near enough within this many euros
SHOWN_SHARE = 0.8  # of the pairs scored
SHOWN_N = 20  # pairs scored, at least


@dataclass(frozen=True)
class Pair:
    """A weekend's fares from home and from another city, searched on one day."""

    origin: str
    day: dt.date
    family: FareFamily
    home: float
    there: float

    @property
    def week(self) -> tuple[int, int]:
        year, week, _ = self.day.isocalendar()
        return year, week


def pairs(history: Iterable[Search]) -> list[Pair]:
    """The pairs of the history: each search from another city with a fare, and the search from home of its weekend,
    flights and day, with a fare too (the latest that day)."""
    home = airports.home()
    priced = [s for s in history if s.vendor == FareVendor.GOOGLE and s.outcome == FareOutcome.OFFERS]
    from_home = {
        (s.airport, s.depart, s.mode, s.at.date()): s for s in sorted(priced, key=lambda s: s.at) if s.origin == home
    }
    out: list[Pair] = []
    for s in priced:
        h = from_home.get((s.airport, s.depart, s.mode, s.at.date())) if s.origin != home else None
        mine, theirs = cheapest(h, FareTicket.ONE_TICKET), cheapest(s, FareTicket.ONE_TICKET)
        if mine is None or theirs is None:
            continue
        family = FareFamily.DIRECT if mine.offer.stops_out == 0 else FareFamily.CONNECTING
        out.append(Pair(s.origin, s.at.date(), family, mine.offer.price, theirs.offer.price))
    return sorted(out, key=lambda p: (p.day, p.origin))


@dataclass(frozen=True)
class Scored:
    """A city and family's model: its offset from every pair, and its errors on the pairs of each week, predicted from
    the weeks before."""

    origin: str
    family: FareFamily
    n: int
    offset: float
    errors: tuple[float, ...]

    @property
    def within(self) -> float | None:
        return sum(e <= SHOWN_EUR for e in self.errors) / len(self.errors) if self.errors else None

    @property
    def shown(self) -> bool:
        return len(self.errors) >= SHOWN_N and (self.within or 0) >= SHOWN_SHARE


def scored(found: Sequence[Pair]) -> list[Scored]:
    """Each city and family's model, scored on later weeks."""
    by: defaultdict[tuple[str, FareFamily], list[Pair]] = defaultdict(list)
    for p in found:
        by[(p.origin, p.family)].append(p)
    out: list[Scored] = []
    for (origin, family), ps in sorted(by.items()):
        errors: list[float] = []
        for p in ps:
            before = [q.there - q.home for q in ps if q.week < p.week]
            if before:
                errors.append(abs(p.home + statistics.median(before) - p.there))
        offset = statistics.median(p.there - p.home for p in ps)
        out.append(Scored(origin, family, len(ps), offset, tuple(errors)))
    return out


def report(found: Sequence[Pair]) -> str:
    """The report, in Markdown as mdformat writes it: a row for each city and family."""
    head = (
        f'# Fare accuracy\n\n<!-- written by pipeline/fare_accuracy.py from {FOLDER}/: mise run fares -- accuracy -->'
    )
    how = (
        f"How well home's fare ({airports.home()}) plus an offset predicts another city's, for the same weekend and "
        "flights searched the same day (pipeline/fare_accuracy.py). Each week's pairs are predicted from the weeks "
        f'before it. Shown on the site once at least {SHOWN_N} pairs are scored and {SHOWN_SHARE:.0%} are within '
        f'€{SHOWN_EUR}.'
    )
    if not found:
        return f'{head}\n\n{wrapped(how)}\n\nNo pairs yet.\n'
    rows = [
        [
            s.origin,
            str(s.family),
            str(s.n),
            f'{s.offset:+.0f}',
            str(len(s.errors)),
            f'{statistics.median(s.errors):.0f}' if s.errors else '—',
            f'{s.within:.0%}' if s.within is not None else '—',
            'yes' if s.shown else 'no',
        ]
        for s in scored(found)
    ]
    head_row = ['City', 'Family', 'Pairs', 'Offset (€)', 'Scored', 'Median error (€)', f'Within €{SHOWN_EUR}', 'Shown']
    days = f'Pairs searched from {found[0].day} to {found[-1].day}.'
    return f'{head}\n\n{wrapped(f"{how} {days}")}\n\n{table(head_row, rows)}\n'


def wrapped(text: str) -> str:
    """A paragraph as mdformat wraps it (.mdformat.toml)."""
    return textwrap.fill(text, 120, break_long_words=False, break_on_hyphens=False)


def write(history: Iterable[Search]) -> None:
    files.write(data(REPORT), report(pairs(history)))
