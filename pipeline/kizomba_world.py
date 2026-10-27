"""How kizomba-world's API records and event pages read as rows of the source DB. No network here:
pipeline/scrape.py does the fetching."""

import html
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict

from pipeline.records import Json, Record

LANGS: tuple[Literal['fr', 'es', 'pt'], ...] = ('fr', 'es', 'pt')  # the page's translations (Paged.url_<lang>)
# site tags that state a genre or a feature (the rest are site sections, such as Deal or Holidays)
TAG_GENRES = {
    'Bachata': ['bachata'],
    'Kizomba': ['kizomba'],
    'Kompa': ['kompa'],
    'SBK': ['salsa', 'bachata', 'kizomba'],
    'Salsa': ['salsa'],
    'Semba': ['semba'],
    'Tarraxo': ['tarraxo'],
    'Urbankiz': ['urbankiz'],
    'Zouk': ['zouk'],
}
TAG_FEATURES = {
    'All in One': 'all_in_one',
    'Beach Party': 'beach_party',
    'Boat Party': 'boat_party',
    'Competition': 'competition',
    'Cruise': 'cruise',
    'Pool Party': 'pool_party',
}


class Api(BaseModel):
    """The site's records as its API sends them: what is read of them, and nothing else checked, since the site may
    add fields at will. Read leniently (lax), as a number may come as text."""

    model_config = ConfigDict(extra='ignore', frozen=True)


class Named(Api):
    name: str


class Image(Api):
    url: str | None = None


class ApiEvent(Api):
    id: int
    title: str
    url: str
    slug: str
    start_date: str
    end_date: str
    utc_start_date: str
    utc_end_date: str
    timezone: str
    all_day: bool
    featured: bool
    sticky: bool
    website: str | None
    image: Image | bool | str | list[Json] | None = None  # false, or an empty value, when it has none
    description: str
    date: str
    modified: str
    categories: tuple[Named, ...]
    tags: tuple[Named, ...]


class ApiPage(Api):
    """A page of the API's event list, and the address of the next one."""

    events: tuple[ApiEvent, ...]
    next_rest_url: str | None = None


class Listed(Record):
    """What an event's API record gives the events table."""

    id: int
    title: str
    url: str
    slug: str
    start_date: str
    end_date: str
    start_date_utc: str
    end_date_utc: str
    timezone: str
    all_day: int
    featured: int
    sticky: int
    website: str | None
    image_url: str | None
    description_html: str
    description_text: str
    published_at: str
    modified_at: str


class Paged(Record):
    """What an event's page gives the events table."""

    venue: str | None
    address: str | None
    city: str | None
    country: str | None
    deal_text: str | None
    deal_url: str | None
    url_fr: str | None
    url_es: str | None
    url_pt: str | None
    cancelled: int | None  # 1 when its page stamps it cancelled; None when not known (a past festival's page read
    # before the scrape looked for the stamp, and not read since)


def text(fragment: str) -> str:
    """Description HTML as plain text: one line per paragraph or line break, spaces collapsed."""
    t = re.sub(r'(?i)<br\b[^>]*>', '\n', fragment)
    t = re.sub(r'(?i)</?(p|div|h[1-6]|li|ul|ol|tr|table|blockquote)\b[^>]*>', '\n', t)
    t = html.unescape(re.sub(r'<[^>]+>', '', t)).replace('\xa0', ' ')
    return '\n'.join(line for line in (' '.join(part.split()) for part in t.split('\n')) if line)


def page_fields(page: str) -> tuple[Paged, list[str]]:
    """What the event page adds to the API's record, and the organiser's links it gives."""

    def labelled(label: str) -> list[str]:  # <span>Venue : </span> <span class="etn-location-name">…</span> …
        m = re.search(rf'<span>{label} : </span>((?:\s*<span\s+class="etn-location-name">[^<]*</span>)+)', page)
        spans = re.finditer(r'<span\s+class="etn-location-name">([^<]*)</span>', m[1]) if m else ()
        return [html.unescape(v[1]).strip() for v in spans]

    def translation(lang: str) -> str | None:
        return m[1] if (m := re.search(rf'hreflang="{lang}" href="([^"]+)"', page)) else None

    venue, address, place = labelled('Venue'), labelled('Adress'), labelled('Location')
    deal = re.search(r'<a href="([^"]+)"[^>]*data-stat-type="deal"[^>]*>([^<]*)<', page)
    social = re.search(r'<div class="etn-social-links[^"]*">(.*?)</ul>', page, re.DOTALL)
    links = sorted({html.unescape(u[1]) for u in re.finditer(r'<a href="([^"]+)"', social[1])}) if social else []
    fields = Paged(
        venue=venue[0] if venue else None,
        address=address[0] if address else None,
        city=place[0] if len(place) > 1 else None,
        country=place[-1] if place else None,
        deal_text=html.unescape(deal[2]).strip() if deal else None,
        deal_url=html.unescape(deal[1]) if deal else None,
        url_fr=translation('fr'),
        url_es=translation('es'),
        url_pt=translation('pt'),
        # the site stamps "Cancelled" over the poster of a cancelled event
        cancelled=int(bool(re.search(r'\.etn-single-event-media::after\s*\{\s*content:\s*"Cancelled"', page))),
    )
    return fields, links


# The API serves emoji as images with the emoji as their alt text; the description keeps the emoji itself.
EMOJI_IMG = re.compile(r'<img [^>]*src="https://static\.xx\.fbcdn\.net/images/emoji[^"]*"[^>]*>')


def emoji_text(fragment: str) -> str:
    def emoji(m: re.Match[str]) -> str:
        alt = re.search(r'alt="([^"]*)"', m[0])
        return html.unescape(alt[1]) if alt else m[0]

    return EMOJI_IMG.sub(emoji, fragment)


def api_fields(e: ApiEvent) -> tuple[Listed, list[str], list[str]]:
    """What an event's API record gives the events table, and its categories and tags."""
    description = emoji_text(e.description)
    listed = Listed(
        id=e.id,
        title=html.unescape(e.title),
        url=e.url,
        slug=e.slug,
        start_date=e.start_date,
        end_date=e.end_date,
        start_date_utc=e.utc_start_date,
        end_date_utc=e.utc_end_date,
        timezone=e.timezone,
        all_day=int(e.all_day),
        featured=int(e.featured),
        sticky=int(e.sticky),
        website=e.website or None,
        image_url=e.image.url if isinstance(e.image, Image) else None,
        description_html=description,
        description_text=text(description),
        published_at=e.date,
        modified_at=e.modified,
    )
    categories = sorted({html.unescape(c.name) for c in e.categories})
    return listed, categories, sorted({html.unescape(t.name) for t in e.tags})
