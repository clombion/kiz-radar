from collections.abc import Iterator

def iter_wrb_chunks(body: str | bytes) -> Iterator[object]:
    """The inner JSON of each chunk of an answer of Google's FlightsFrontendService; SearchRejectedError when it
    answered with an error before any chunk."""
    ...
