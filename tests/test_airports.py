"""The airports a festival can fly to: every one within MAX_AIRPORT_KM of its city, the nearest first, and the airports
added from OurAirports for them."""

from pipeline import airports
from pipeline.records import Airport, City

GLASGOW = City(key='glasgow-gb', name='Glasgow', country_code='GB', lat=55.861, lon=-4.25)


def airport(code: str, lat: float, lon: float) -> Airport:
    return Airport(code=code, name=code, city=code, country_code='GB', lat=lat, lon=lon, home=False)


# Glasgow's airports and three others: Prestwick and Edinburgh near, Aberdeen within reach, Manchester too far
ABZ, EDI, GLA, PIK, MAN = (
    airport('ABZ', 57.202, -2.198),
    airport('EDI', 55.95, -3.373),
    airport('GLA', 55.872, -4.433),
    airport('PIK', 55.509, -4.587),
    airport('MAN', 53.354, -2.275),
)


def test_a_festival_flies_to_every_airport_near_enough_its_city_the_nearest_first() -> None:
    p = airports.placed(GLASGOW, [MAN, ABZ, EDI, PIK, GLA])
    assert p is not None
    assert [c.airport for c in p.candidates] == ['GLA', 'PIK', 'EDI', 'ABZ']
    assert [c.km for c in p.candidates] == sorted(c.km for c in p.candidates)
    assert all(c.km <= airports.MAX_AIRPORT_KM for c in p.candidates)
    assert (p.airport, p.km) == (p.candidates[0].airport, p.candidates[0].km)  # the nearest, as before
    far = airports.placed(GLASGOW, [MAN])
    assert far is not None
    assert (far.airport, far.km, far.candidates) == (None, None, ())
    assert airports.placed(None, [GLA]) is None  # a festival in no city known


def test_the_airports_added_are_those_with_scheduled_service_near_a_festival() -> None:
    def row(code: str, kind: str, service: str, lat: float, lon: float, *, country: str = 'GB') -> dict[str, str]:
        return {
            'iata_code': code,
            'name': f'{code} Airport',
            'municipality': code.title(),
            'iso_country': country,
            'type': kind,
            'scheduled_service': service,
            'latitude_deg': str(lat),
            'longitude_deg': str(lon),
        }

    offered = airports.served(
        [
            row('ABZ', 'medium_airport', 'yes', 57.2019, -2.1978),
            row('EDI', 'large_airport', 'yes', 55.95, -3.3725),
            row('PIK', 'medium_airport', 'no', 55.5094, -4.5867),  # no scheduled service
            row('', 'small_airport', 'yes', 55.9, -4.3),  # no IATA code
            row('MAN', 'large_airport', 'yes', 53.3537, -2.275),  # too far from Glasgow
            row('ANU', 'large_airport', 'yes', 17.137, -61.793, country='AG'),  # far, country unknown
            row('JER', 'medium_airport', 'yes', 56.0, -4.0, country='JE'),  # near (made up), country unknown
        ]
    )
    assert [a.code for a in offered] == ['ABZ', 'EDI', 'MAN', 'ANU', 'JER']
    assert (offered[0].lat, offered[0].lon, offered[0].city) == (57.202, -2.198, 'Abz')
    # EDI is in airports.csv already
    added = airports.wanted([GLASGOW], [EDI], offered)
    assert [a.code for a in added] == ['ABZ']
