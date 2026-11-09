"""Fetching a page over HTTPS with the standard library, for the steps that need no browser (the exchange rates, the
geocoder). urllib follows the environment's proxy settings."""

import http.client
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from http.client import HTTPResponse
from typing import NamedTuple, cast

from pydantic import TypeAdapter, ValidationError

from pipeline.calls import Declined, why
from pipeline.enums import CallCause

TIMEOUT = 30  # seconds
# who asks: the open services this project calls (Nominatim, Transitous) ask for the app's name, version and contact
AGENT = {'User-Agent': 'kiz-radar/0.1 (https://github.com/clombion/kiz-radar)'}
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
    """The body at an HTTPS address, or why there is none (opened)."""
    return opened(address.url(query), None, headers or {})


def post(address: Https, body: bytes, headers: Mapping[str, str]) -> bytes | Declined:
    """The answer of an HTTPS address to a body sent it, or why there is none (opened)."""
    return opened(address.url(), body, headers)


def opened(url: str, body: bytes | None, headers: Mapping[str, str]) -> bytes | Declined:
    """The body a URL of web.Https answers with (to a POST of body when given), or why there is none
    (pipeline/calls.py): an HTTP status of 429 or 5xx, a connection lost or timed out, or an answer cut short is
    transient; any other HTTP error status is structural."""
    request = urllib.request.Request(url, data=body, headers=dict(headers))  # noqa: S310 (https, by web.Https)
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
        return Declined(CallCause.TRANSIENT, f'{url}: {why(e)}')


def answer[T](address: Https, query: Mapping[str, str], shape: TypeAdapter[T]) -> T | Declined:
    """What an HTTPS address answers a query with, read as JSON of a shape, asked as AGENT; or why there is none: an
    answer of another shape is structural."""
    match get(address, query, AGENT):
        case Declined() as d:
            return d
        case body:
            pass
    try:
        return shape.validate_json(body)
    except ValidationError as e:
        return Declined(CallCause.STRUCTURAL, f'{address.url()}: an answer of another shape: {e.errors()[0]["msg"]}')
