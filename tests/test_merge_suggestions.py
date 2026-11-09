"""The calendar the merge suggestions weigh (pipeline/merge_suggestions.py): two short festivals at once are a clash
only in two cities, however the listings spell them, and festivals in one city are a shared circuit."""

import collections
import datetime as dt

from pipeline.enums import SuggestionCalendar
from pipeline.merge_suggestions import Event, Evidence

DAY = dt.date(2026, 11, 6)


def at(city: str | None, name: str | None, day: dt.date = DAY) -> Event:
    return Event(day, day + dt.timedelta(days=2), short=True, city=city, city_name=name, place=f'{name}, Germany')


def calendar(a: Event, b: Event) -> tuple[SuggestionCalendar, str]:
    """The calendar signal of two artists, each at one of the festivals."""
    found = Evidence(
        art={1: 'A', 2: 'B'}, booked=collections.Counter(), stated=collections.defaultdict(set), ev={10: a, 20: b}
    )
    found.events_of[1].add(10)
    found.events_of[2].add(20)
    signal, _, said = found.calendar_signal(1, 2)
    return signal, said


def test_one_city_spelt_two_ways_is_no_clash_but_a_shared_circuit() -> None:
    """Munich and München are one city (munich-de): the same weekend there is no clash, and the city is named."""
    signal, said = calendar(at('munich-de', 'Munich'), at('munich-de', 'München'))
    assert signal == SuggestionCalendar.SHARED_CIRCUIT
    assert said in {'same city: Munich', 'same city: München, Munich', 'same city: Munich, München'}


def test_two_cities_the_same_weekend_are_a_clash_and_two_weekends_none() -> None:
    assert calendar(at('munich-de', 'Munich'), at('berlin-de', 'Berlin'))[0] == SuggestionCalendar.CLASH
    later = DAY + dt.timedelta(days=7)
    assert calendar(at('munich-de', 'Munich'), at('berlin-de', 'Berlin', later))[0] == SuggestionCalendar.NO_CLASH


def test_a_festival_in_no_city_known_clashes_with_none_and_shares_none() -> None:
    """Nominatim found no city for one: nothing is known of where it is, so neither a clash nor a circuit."""
    assert calendar(at(None, 'Artes-sur-Tech'), at('munich-de', 'Munich'))[0] == SuggestionCalendar.NO_CLASH
    assert calendar(at(None, 'Artes-sur-Tech'), at(None, 'Artes-sur-Tech'))[0] == SuggestionCalendar.NO_CLASH
