import datetime as dt
from enum import Enum

class Airport(Enum): ...
class TripType(Enum): ...

class Airline(Enum):
    @property
    def value(self) -> str: ...

class MaxStops(Enum):
    ANY = 0
    NON_STOP = 1

class SortBy(Enum):
    CHEAPEST = 2

class FlightSegment: ...

class PassengerInfo:
    def __init__(self, *, adults: int) -> None: ...

class FlightSearchFilters:
    def __init__(
        self,
        *,
        trip_type: TripType,
        passenger_info: PassengerInfo,
        flight_segments: list[FlightSegment],
        stops: MaxStops,
        sort_by: SortBy,
    ) -> None: ...

class FlightLeg:
    airline: Airline
    departure_datetime: dt.datetime

class FlightResult:
    legs: list[FlightLeg]
    price: float | None
    currency: str | None
    stops: int
