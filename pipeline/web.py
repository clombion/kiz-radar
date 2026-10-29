"""Fetching a page over HTTPS with the standard library, for the steps that need no browser (the exchange rates, the
geocoder). urllib follows the environment's proxy settings."""

import http.client
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from http.client import HTTPResponse
from typing import NamedTuple, cast

from pipeline.calls import Declined
from pipeline.enums import CallCause

TIMEOUT = 30  # seconds
TOO_MANY, SERVER_ERROR = 429, 500


class Https(NamedTuple):
    """An address over HTTPS: its host and path; the scheme is no part of it, so it is no other."""

    host: str
    path: str

    def url(self, query: Mapping[str, str] | None = None) -> str:
        return f'https://{self.host}{self.path}' + (f'?{urllib.parse.urlencode(query)}' if query else '')


def get(
    address: Https, query: Mapping[str, str] | None = None, headers: Mapping[str, str] | None = None
) -> bytes | Declined:
    """The body at an HTTPS address, or why there is none (pipeline/calls.py): an HTTP status of 429 or 5xx, a
    connection lost or timed out, or an answer cut short is transient; any other HTTP error status is structural."""
    url = address.url(query)
    request = urllib.request.Request(url, headers=dict(headers or {}))  # noqa: S310 (https, by web.Https)
    try:
        response = cast('object', urllib.request.urlopen(request, timeout=TIMEOUT))  # noqa: S310 (https, by web.Https)
        if not isinstance(response, HTTPResponse):
            return Declined(CallCause.STRUCTURAL, f'{url}: no HTTP response')
        with response:
            return response.read()
    except urllib.error.HTTPError as e:  # before OSError, which it is
        transient = e.code == TOO_MANY or e.code >= SERVER_ERROR
        return Declined(CallCause.TRANSIENT if transient else CallCause.STRUCTURAL, f'{url}: HTTP {e.code} {e.reason}')
    except (OSError, http.client.HTTPException) as e:  # unreachable, timed out, reset, or cut short
        return Declined(CallCause.TRANSIENT, f'{url}: {type(e).__name__}: {e}')
