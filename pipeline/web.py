"""Fetching a page over HTTPS with the standard library, for the steps that need no browser (the exchange rates, the
geocoder). urllib follows the environment's proxy settings."""

import urllib.request
from collections.abc import Mapping
from http.client import HTTPResponse
from typing import cast

TIMEOUT = 30  # seconds


def get(url: str, headers: Mapping[str, str] | None = None) -> bytes:
    """The body of an HTTPS address; OSError (urllib's errors among them) when it can't be had."""
    if not url.startswith('https://'):
        raise ValueError(f'{url}: not an https address')
    request = urllib.request.Request(url, headers=dict(headers or {}))  # noqa: S310 (an https address, checked above)
    response = cast('object', urllib.request.urlopen(request, timeout=TIMEOUT))  # noqa: S310 (an https address, checked above)
    if not isinstance(response, HTTPResponse):
        raise TypeError(f'{url}: no HTTP response')
    with response:
        return response.read()
