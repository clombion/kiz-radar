"""Fetching a page over HTTPS with the standard library, for the steps that need no browser (the exchange rates, the
geocoder). urllib follows the environment's proxy settings."""

import urllib.parse
import urllib.request
from collections.abc import Mapping
from http.client import HTTPResponse
from typing import NamedTuple, cast

TIMEOUT = 30  # seconds


class Https(NamedTuple):
    """An address over HTTPS: its host and path; the scheme is no part of it, so it is no other."""

    host: str
    path: str

    def url(self, query: Mapping[str, str] | None = None) -> str:
        return f'https://{self.host}{self.path}' + (f'?{urllib.parse.urlencode(query)}' if query else '')


def get(address: Https, query: Mapping[str, str] | None = None, headers: Mapping[str, str] | None = None) -> bytes:
    """The body at an HTTPS address; OSError (urllib's errors among them) when it can't be had."""
    url = address.url(query)
    request = urllib.request.Request(url, headers=dict(headers or {}))  # noqa: S310 (https, by web.Https)
    response = cast('object', urllib.request.urlopen(request, timeout=TIMEOUT))  # noqa: S310 (https, by web.Https)
    if not isinstance(response, HTTPResponse):
        raise TypeError(f'{url}: no HTTP response')
    with response:
        return response.read()
