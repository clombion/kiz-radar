"""The steps that fetch from outside, against fakes of what they fetch: the European Central Bank's rates, Nominatim's
places and kizomba-world's listings. No test reaches the network (pytest-socket)."""

import datetime as dt
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from pipeline import data, export, geocode, rates, scrape, web
from pipeline import db as sqlite_db
from pipeline.db import Reader
from pipeline.records import JSON, Place, Rate, Spot, today
from tests import jsons
from tests.exports import content, festival, run, shaped, trimmed
from tests.fakes import no_wait
from tests.samples import API, PAGE

ECB_DAY = dt.date(2026, 10, 27)
ECB_FILE = """<gesmes:Envelope><Cube><Cube time='2026-10-27'>
<Cube currency='USD' rate='1.0812'/><Cube currency='NOK' rate='11.705'/></Cube></Cube></gesmes:Envelope>"""


def test_an_address_is_https_with_its_query() -> None:
    assert web.Https('example.org', '/a').url({'q': 'x y', 'n': '1'}) == 'https://example.org/a?q=x+y&n=1'
    assert web.Https('example.org', '/a').url() == 'https://example.org/a'


def test_the_rates_are_the_banks_and_the_fixed_ones(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:

    def get(address: web.Https, *_: object) -> bytes:
        assert address == rates.ECB
        return ECB_FILE.encode()

    monkeypatch.setattr(web, 'get', get)
    run(rates.main, monkeypatch)
    assert Rate.read() == [
        Rate(currency='BGN', per_eur=1.95583, date=ECB_DAY),
        Rate(currency='EUR', per_eur=1.0, date=ECB_DAY),
        Rate(currency='NOK', per_eur=11.705, date=ECB_DAY),
        Rate(currency='USD', per_eur=1.0812, date=ECB_DAY),
    ]


@pytest.mark.parametrize('answer', [OSError('unreachable'), b'<html>moved</html>'], ids=['unreachable', 'no day'])
def test_the_rates_stay_as_they_were_when_the_bank_gives_none(
    answer: OSError | bytes, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out = Rate.path()
    _ = out.write_text('currency,per_eur,date\nNOK,11,2026-10-01\n')

    def get(*_: object) -> bytes:
        if isinstance(answer, OSError):
            raise answer
        return answer

    monkeypatch.setattr(web, 'get', get)
    with pytest.raises(SystemExit, match='left as it was'):
        run(rates.main, monkeypatch)
    assert out.read_text() == 'currency,per_eur,date\nNOK,11,2026-10-01\n'


@dataclass
class Nominatim:
    """Nominatim as the fake answers it: the places it knows by their query's words, and what it was asked."""

    places: Mapping[str, Mapping[str, object]]
    asked: list[Mapping[str, str]] = field(default_factory=list[Mapping[str, str]])
    down: bool = False

    def get(self, address: web.Https, query: Mapping[str, str], headers: Mapping[str, str]) -> bytes:
        assert address == geocode.SEARCH
        assert 'User-Agent' in headers
        self.asked.append(query)
        if self.down:
            raise OSError('timed out')
        key = query.get('q') or ', '.join(v for k, v in query.items() if k in {'city', 'country'})
        return json.dumps([self.places[key]] if key in self.places else []).encode()


def source_with(places: list[tuple[str | None, str | None]]) -> Path:
    """An export in the test's data folder holding festivals in these places."""
    path = data(export.SOURCE) / 'source.sqlite'
    path.parent.mkdir(parents=True)
    with sqlite_db.opened(path, 'rwc') as con, shaped(con).transaction() as tx:
        for i, (city, country) in enumerate(places):
            festival(tx, i, city=city, country=country)
    return path


def test_new_places_are_asked_for_once_and_kept_with_the_known(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    known = Place(city='Oslo', country='Norway', found=Spot(lat=59.9, lon=10.7, name='Oslo, Norway'))
    Place.write([known])
    monkeypatch.setattr('time.sleep', no_wait)
    lisbon = {'lat': '38.7', 'lon': '-9.1', 'display_name': 'Lisboa, Portugal'}
    nominatim = Nominatim({'Lisbon, Portugal': lisbon, 'Bairro Alto, Portugal': lisbon})
    monkeypatch.setattr(web, 'get', nominatim.get)
    _ = source_with(
        [
            ('Oslo', 'Norway'),
            ('Lisbon', 'Portugal'),
            ('Bairro Alto', 'Portugal'),
            ('Atlantis', 'Nowhere'),
            (None, None),
        ],
    )
    run(geocode.main, monkeypatch)
    found = {(p.city, p.country): p.found for p in Place.read()}
    assert found == {
        ('Oslo', 'Norway'): known.found,
        ('Lisbon', 'Portugal'): Spot(lat=38.7, lon=-9.1, name='Lisboa, Portugal'),
        # by city and country first, then as free text
        ('Bairro Alto', 'Portugal'): Spot(lat=38.7, lon=-9.1, name='Lisboa, Portugal'),
        ('Atlantis', 'Nowhere'): None,
    }
    assert not [q for q in nominatim.asked if q.get('city') == 'Oslo']  # known already
    asked = len(nominatim.asked)
    run(geocode.main, monkeypatch)
    assert len(nominatim.asked) == asked  # a place not found is known too


def test_a_place_nominatim_fails_on_is_left_for_the_next_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    Place.write([])
    monkeypatch.setattr('time.sleep', no_wait)
    monkeypatch.setattr(web, 'get', Nominatim({}, down=True).get)
    source_with([('Lisbon', 'Portugal')])
    run(geocode.main, monkeypatch)
    assert Place.read() == []


@dataclass(frozen=True)
class Served:
    content: bytes

    @property
    def text(self) -> str:
        return self.content.decode()


POSTER = 'https://kizomba-world.com/poster.jpg'
NEW = API | {'image': {'url': POSTER}}  # a festival the export doesn't have yet


@dataclass
class Site:
    """kizomba-world as the fake serves it: its event list and each event's page; what it was asked."""

    listed: Sequence[Mapping[str, object]]
    asked: list[str] = field(default_factory=list[str])

    def get(self, url: str) -> Served:
        self.asked.append(url)
        if url.startswith(f'{scrape.SITE}/wp-json/'):
            return Served(json.dumps({'events': self.listed, 'next_rest_url': None}).encode())
        return Served(PAGE.encode())


def site(monkeypatch: pytest.MonkeyPatch, listed: Sequence[Mapping[str, object]]) -> Site:
    served = Site(listed)
    monkeypatch.setattr(scrape, 'Fetcher', lambda: served)
    return served


def event_tables(db: Reader) -> list[str]:
    """The tables whose rows belong to one event, cleared when the site drops it."""
    return db.column(
        str,
        "select m.name from sqlite_master m, pragma_table_info(m.name) c where m.type = 'table' and m.name != 'events'"
        " and c.name = 'event_id' order by m.name",
    )


def ids(src: Path) -> set[int]:
    with sqlite_db.opened(src, 'ro') as db:
        return set(db.column(int, 'select id from events'))


def test_a_refresh_adds_the_new_festivals_and_deletes_the_gone_with_their_rows(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    src = trimmed(1)
    [gone] = ids(src)
    served = site(monkeypatch, [NEW])
    run(scrape.main, monkeypatch)
    assert ids(src) == {17001}
    assert POSTER not in served.asked  # where its poster is, which nothing downloads
    with sqlite_db.opened(src, 'ro') as db:
        for t in event_tables(db):
            assert gone not in db.column(int, f'select event_id from {sqlite_db.name(t)}'), t  # noqa: S608 (the database's own names, quoted)
        assert db.column(str, 'select reason from pending_extraction where event_id = 17001') == ['new']
        assert db.column(str, 'select image_url from events where id = 17001') == [POSTER]
        links = set(db.column(str, 'select url from event_links where event_id = 17001'))
        assert links == {'https://www.facebook.com/events/1', 'https://www.instagram.com/x'}
        tags = set(db.column(str, 'select tag from event_tags where event_id = 17001'))
        assert tags == {'All in One', 'Zouk'}
        logged = db.value(str, "select details from pipeline_steps where step = '1_scrape'")
    details = JSON.validate_json(logged)
    assert [jsons.at(details, k) for k in ('new', 'deleted')] == [1, 1]


def test_a_dry_run_reads_the_site_and_writes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    src = trimmed(1)
    before = content(src)
    site(monkeypatch, [NEW])
    run(scrape.main, monkeypatch, '--dry-run')
    assert content(src) == before


def test_a_list_far_shorter_than_before_stops_before_deleting(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    src = trimmed(3)
    before = content(src)
    site(monkeypatch, [NEW])
    with pytest.raises(SystemExit, match='far fewer events'):
        run(scrape.main, monkeypatch)
    assert content(src) == before


def test_a_pending_festival_changed_again_waits_from_its_latest_change(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    src = trimmed(1)
    site(monkeypatch, [NEW])
    run(scrape.main, monkeypatch)
    with sqlite_db.opened(src, 'rw') as db, db.transaction() as tx:
        tx.execute("update pending_extraction set since = '2026-01-01' where event_id = 17001")
    site(monkeypatch, [NEW | {'description': '<p>Hello again</p>', 'modified': '2026-10-20 10:00:00'}])
    run(scrape.main, monkeypatch)
    with sqlite_db.opened(src, 'ro') as db:
        reasons = db.column(str, 'select reason from pending_extraction where event_id = 17001')
        since = db.column(str, 'select since from pending_extraction where event_id = 17001')
    assert (reasons, since) == (['new'], [today().isoformat()])  # still new to the passes
