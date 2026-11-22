from typing import Protocol

from fli.models import FlightResult, FlightSearchFilters
from fli.search.client import Response

class Pages(Protocol):
    """What the search asks of its client: a page by its address."""
    def get(self, url: str, **kwargs: object) -> Response: ...

class SearchFlights:
    client: Pages
    def _fetch_flights(
        self,
        filters: FlightSearchFilters,
        *,
        currency: str | None,
        language: str | None,
        country: str | None,
        capture_session: bool,
    ) -> list[FlightResult] | None: ...
