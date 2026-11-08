from fli.models import FlightResult, FlightSearchFilters
from fli.search.client import Client

class SearchFlights:
    client: Client
    def _fetch_flights(
        self,
        filters: FlightSearchFilters,
        *,
        currency: str | None,
        language: str | None,
        country: str | None,
        capture_session: bool,
    ) -> list[FlightResult] | None: ...
