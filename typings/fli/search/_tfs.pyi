from fli.models import FlightSearchFilters

def build_tfs(filters: FlightSearchFilters) -> str:
    """The search's tfs, the part of the search page's address that says what it searches."""
    ...

def page_url(tfs: str, currency: str | None = None, language: str | None = None, country: str | None = None) -> str:
    """The search page's address for a tfs, in a currency, language and country (None: fli's defaults)."""
    ...
