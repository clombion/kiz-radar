class Response:
    text: str
    status_code: int

class _Retried:
    """A method fli's client retries (tenacity): retry_with gives it with other rules."""
    def __call__(self, client: Client, url: str, **kwargs: object) -> Response: ...
    def retry_with(self, *, stop: object) -> _Retried: ...

class Client:
    get: _Retried
