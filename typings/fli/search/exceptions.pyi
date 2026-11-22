class SearchClientError(Exception): ...

class SearchRejectedError(SearchClientError):
    """Google answered with an error (a gRPC code) and no data."""

    code: int | None
