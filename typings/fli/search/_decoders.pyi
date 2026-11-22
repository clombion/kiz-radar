from fli.models import FlightResult

def parse_flight_row(row: object) -> FlightResult:
    """A row of an answer's ways out; AttributeError, KeyError, ValueError or TypeError when it is not filled in."""
    ...
