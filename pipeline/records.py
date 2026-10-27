"""Every record the pipeline keeps or asks for as JSON, one pydantic model each: the extraction passes' answers and the
merge reviews (pipeline/extract/answers/), a ticket page's log (pipeline/tickets/log/), first reads and disputes
(pipeline/tickets/reads/, disputed/) and site recipes (pipeline/tickets/sites/). The schema a model answers to is
generated from its record (pipeline/prompt.py), so the record is the one statement of its shape.

Each record is strict (a value of another type, or a field the record has not, is refused) and frozen, and is read from
its JSON text (parse), where an enum's value is its state's key. A rule a field's type can't say is the record's
validator: an answer's tier quotes its dates exactly when it has some, a row's second price comes with its words,
amount and currency, a recipe reads rows from the page or from the site's API.
"""

import csv
import datetime as dt
import re
from collections.abc import Iterable
from pathlib import Path
from typing import Annotated, Literal, NewType, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Discriminator,
    Field,
    PlainSerializer,
    SerializerFunctionWrapHandler,
    Tag,
    TypeAdapter,
    ValidationError,
    WrapSerializer,
    model_validator,
)

from pipeline import tables
from pipeline.enums import (
    ExtractedFeature,
    FareSearch,
    Genre,
    MergeDecision,
    PassKind,
    Plan,
    Role,
    RoomKind,
    Sales,
    SkipReason,
    Status,
    Style,
    Waiting,
)
from pipeline.enums import FirstRead as FirstReadState

type Json = dict[str, Json] | list[Json] | str | int | float | bool | None
JSON: TypeAdapter[Json] = TypeAdapter(Json)  # any JSON text, as its value

DIGITS = 16  # a prompt's hash is the first DIGITS hex digits of its text's SHA-256 (pipeline/prompt.py)

Text = Annotated[str, Field(min_length=1)]
Quote = Annotated[str, Field(min_length=1, max_length=300)]
Currency = Annotated[str, Field(pattern=r'^[A-Z]{3}$')]  # an ISO 4217 code
RealDay = NewType('RealDay', str)  # a day of the calendar, YYYY-MM-DD or MM-DD; only real_day makes one


def real_day(value: str) -> RealDay:
    """A YYYY-MM-DD or MM-DD that names a day of the calendar (an MM-DD some year has, 02-29 among them)."""
    *year, month, day = map(int, value.split('-'))
    _ = dt.date(year[0] if year else 2024, month, day)  # a leap year has every MM-DD; ValueError when no year does
    return RealDay(value)


# YYYY-MM-DD, or MM-DD when no year is given
Day = Annotated[RealDay, Field(pattern=r'^(\d{4}-)?\d{2}-\d{2}$'), AfterValidator(real_day)]
Date = Annotated[str, Field(pattern=r'^\d{4}-\d{2}-\d{2}$'), AfterValidator(real_day)]
Stamp = Annotated[str, Field(pattern=r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$')]  # a UTC time to the second
Url = Annotated[str, Field(pattern=r'^https?://')]
Hash = Annotated[str, Field(pattern=rf'^[0-9a-f]{{{DIGITS}}}$')]
Count = Annotated[int, Field(ge=1)]
Positive = Annotated[float, Field(gt=0)]


def errors(error: ValidationError, where: str) -> list[str]:
    """One line for each of a record's errors: where it is, where in it, and what is wrong."""
    return [f'{where}: {"/".join(map(str, e["loc"])) or "(root)"}: {e["msg"]}' for e in error.errors()]


class Record(BaseModel):
    model_config = ConfigDict(
        strict=True, extra='forbid', frozen=True, validate_by_name=True, validate_by_alias=True, serialize_by_alias=True
    )

    @classmethod
    def parse(cls, text: str | bytes) -> Self:
        return cls.model_validate_json(text)

    def dumped(self) -> str:
        """The record as its file holds it: JSON, indented by one, non-ASCII as it is."""
        return self.model_dump_json(indent=1) + '\n'


# ---- the extraction passes' answers (pipeline/extract/prompts/)


class Entry(Record):
    """A festival's entry in a question or an answer."""

    event_id: int


class Batch[E: Entry](Record):
    """A question or an answer about the festivals of one batch: one entry per festival."""

    batch: str
    events: tuple[E, ...]


class Artist(Record):
    name_as_written: Text
    role: Role
    style: str | None
    country: str | None
    source_line: Text


class FeatureFound(Record):
    feature: ExtractedFeature
    quote: Quote
    rationale: Annotated[str, Field(min_length=5)]


class Extracted(Entry):
    artists: tuple[Artist, ...]
    features: tuple[FeatureFound, ...]


class Rooms(Record):
    count: Annotated[int, Field(ge=1, le=30)]
    quote: Quote


class Room(Record):
    name_as_written: str | None
    kind: RoomKind
    genres: tuple[Genre, ...]
    quote: Quote


class GenreFound(Record):
    genre: Genre
    genre_as_written: Text
    quote: Quote


class RoomsGenres(Entry):
    party_rooms: Rooms | None
    class_rooms: Rooms | None
    rooms: tuple[Room, ...]
    genres: tuple[GenreFound, ...]


class PassTerms(Record):
    """What a pass is, whichever way its prices are read."""

    kind: PassKind
    style: Style | None = Field(
        description='The one dance style the pass is limited to, at a festival of several; null when it covers all '
        'of them.'
    )
    label_quote: Quote | None
    group_size: Count | None
    days: Count | None
    includes_hotel: bool


class Alt(Record):
    """The same price in a second currency, when the line gives one."""

    amount: Positive
    currency: Currency


class PricedTier(Record):
    amount: Positive
    currency: Currency
    fee: Positive | None
    alt: Alt | None
    from_: Day | None = Field(validation_alias='from', serialization_alias='from')
    until: Day | None
    quantity: Count | None
    door: bool
    sold_out: bool
    current: bool
    quote: Quote


class PricedPass(PassTerms):
    tiers: Annotated[tuple[PricedTier, ...], Field(min_length=1)]


class Priced(Entry):
    passes: tuple[PricedPass, ...]
    rule_quotes: tuple[Quote, ...]


class Asked(Entry):
    """A festival as a pass is asked about it."""

    title: str
    description: str


class AskedPrices(Asked):
    """A festival as the prices pass is asked about it."""

    start_date: Date
    end_date: Date
    country: str | None
    styles: tuple[Style, ...]


class Decision(Record):
    pair_id: int
    key_a: str
    key_b: str
    decision: MergeDecision
    rationale: Annotated[str, Field(min_length=10)]


class MergeReview(Record):
    """Whether each candidate pair of artists is one artist (answers/merge_review/)."""

    batch: str
    prompt_version: Literal['merge-review-v1', 'merge-review-v2']
    decisions: tuple[Decision, ...]


# ---- a ticket page's log (pipeline/tickets.py)

Version = Annotated[str, Field(pattern=r'^[a-z0-9-]+@[0-9a-f]{8}$')]  # a recipe's site and its file's hash


class Row(Record):
    """A ticket as its page shows it."""

    key: Text
    name: Text
    price: Text
    amount: Annotated[float, Field(ge=0)] = Field(
        description='What a buyer pays: the price shown, plus the fee the site shows apart. 0 for a free ticket.'
    )
    currency: Currency
    fee: Positive | None
    alt_price: Text | None
    alt_amount: Positive | None
    alt_currency: Currency | None
    sold_out: bool

    @model_validator(mode='after')
    def one_second_price(self) -> Self:
        if len({v is None for v in (self.alt_price, self.alt_amount, self.alt_currency)}) > 1:
            raise ValueError('a second price has its words, amount and currency, or none of them')
        return self


class Read(Record):
    at: Stamp
    page: Url
    recipe: Version
    url: Url  # the address read: the page's, or its widget's or API's
    http: int | None
    status: Literal[Status.READ]
    rows: Annotated[tuple[Row, ...], Field(min_length=1)]


class Failed(Record):
    at: Stamp
    page: Url
    recipe: Version
    url: Url | None = None  # None when no address was reached
    http: int | None = None
    status: Literal[Status.REFUSED, Status.LAYOUT_BROKEN]
    why: Text


type LogEntry = Annotated[Read | Failed, Discriminator('status')]
LOG_ENTRY: TypeAdapter[Read | Failed] = TypeAdapter(LogEntry)


# ---- first reads


class ReadTier(Record):
    keys: Annotated[
        tuple[Text, ...],
        Field(min_length=1, description="The page's tickets at this price, the one whose line is quoted first."),
    ]
    from_: Day | None = Field(validation_alias='from', serialization_alias='from')
    until: Day | None
    quantity: Count | None
    date_quote: Quote | None = Field(
        description='The words that say from, until or quantity, copied from the description or from one of the '
        "tier's tickets."
    )

    @model_validator(mode='after')
    def quoted(self) -> Self:
        if ((self.from_, self.until, self.quantity) == (None, None, None)) != (self.date_quote is None):
            raise ValueError('date_quote: the words that say from, until or quantity, exactly when the tier has one')
        return self


class ReadPass(PassTerms):
    tiers: Annotated[tuple[ReadTier, ...], Field(min_length=1)]


class Skip(Record):
    key: Text
    reason: SkipReason


class FirstReadAnswer(Record):
    """Which pass each ticket of the page is."""

    passes: Annotated[
        tuple[ReadPass, ...],
        Field(
            min_length=1,
            description="At least one: a page that sells none of the festival's passes (only hotel rooms, say) is "
            'not its ticket page.',
        ),
    ]
    skipped: tuple[Skip, ...] = Field(
        description='The tickets on the page that are no pass, each with why (pipeline/states.py, skip_reason).'
    )
    rule_quotes: tuple[Quote, ...]


class ReadHeader(Record):
    """The festival a first read is of, as it was when the read was made."""

    event_id: int
    title: Text
    start_date: Date = Field(description="The festival's first day, which a date without a year is placed before.")
    read_by: Text = Field(description='agent, or the models that agreed.')
    prompt: Hash = Field(
        description='The hash of the request the read answered (pipeline/prompts/asked/<hash>.md); a read to '
        'another prompt is made again (tickets.py run).'
    )
    rows_at: Stamp = Field(
        description="The 'at' of the logged read (tickets/log/<event_id>.jsonl) whose tickets this read maps; every "
        'one of them is in a tier or skipped.'
    )
    styles: tuple[Style, ...] = Field(
        description="The festival's dance styles when the read was made (prices.styles), which a pass's style is "
        'one of.'
    )
    description: str = Field(description="The festival's description this read was made with.")


class FirstRead(FirstReadAnswer, ReadHeader):
    """A festival's first read of its ticket page: which pass each ticket is (tickets/reads/<event_id>.json)."""


class Dated(BaseModel):
    """A first read or a dispute, whatever prompt it follows and whatever shape it has then: the logged read whose
    tickets it maps."""

    model_config = ConfigDict(strict=True, extra='ignore', frozen=True)

    rows_at: str


class Stamped(Dated):
    """A first read, whatever prompt it follows: the logged read it maps, and the prompt it names."""

    prompt: str


class Dispute(Record):
    """The first reads of the models, no two of which agreed (tickets/disputed/<event_id>.json)."""

    rows_at: Stamp
    reads: dict[str, FirstRead | None]  # by model; None when its read failed the checker twice


# ---- site recipes

INLINE_FLAGS = re.compile(r'\(\?[aimsux]+[):]')


def no_inline_flags(pattern: str | None) -> str | None:
    if pattern and INLINE_FLAGS.search(pattern):
        raise ValueError(f'{pattern!r}: no inline flags such as (?i), which JavaScript lacks; write [Ss]old [Oo]ut')
    return pattern


class Find(Record):
    """Where a row's value is: the first element matching css inside the row, or inside its enclosing element up (the
    row or that element itself when css is null), its attribute attr (its text when attr is null), and in that the
    first group of match (all of it when match is null). css and match may name the row's other fields as {field}
    and the row element's attributes as {@attr}."""

    css: Text | None
    attr: Text | None
    match: Text | None = Field(description='A JavaScript regular expression, run in the page.')
    page: bool = Field(
        default=False,
        description='Read every match on the page (joined by line) instead of the first inside the row; for values a '
        'page keeps apart from its rows, such as its script data.',
    )
    up: Text | None = Field(
        default=None,
        description="Read inside the row's nearest enclosing element matching this selector instead of the row: for "
        "values a row's group holds, such as the ticket type a price option belongs to.",
    )
    all: bool = Field(
        default=False,
        description="Every match of css inside the row (or up), in page order, joined by ' · ', instead of the "
        'first: a name a page splits in two, such as a ticket type and its price option. No match then.',
    )

    @model_validator(mode='after')
    def sound(self) -> Self:
        no_inline_flags(self.match)
        if self.page and self.up:
            raise ValueError('page and up: a value is read on the page or inside an enclosing element, not both')
        if self.all and (self.match is not None or self.css is None):
            raise ValueError('all: every match of a css selector, with no match pattern')
        return self


class FromJson(Record):
    json_: Text = Field(
        validation_alias='json', serialization_alias='json', description='A dotted path into the ticket.'
    )
    match: Text | None = None


class FromPage(Record):
    page: Text = Field(description="A pattern on the festival's page (its first group).")
    match: Text | None = None


class FromText(Record):
    text: Text = Field(
        description='A template naming dotted paths in braces ("{price.price} € + {distributionFee} € fee").'
    )
    match: Text | None = None


type ApiFind = FromJson | FromPage | FromText  # with match, the first group of a pattern on the value


class Fields[F: Record | ApiFind](Record):
    key: F = Field(description="The ticket's id on the site, the same on every read.")
    name: F
    price: F = Field(description='The price as the page shows it.')
    amount: F = Field(description='The price as a number (1,800.00, 1.800,00 and 1800 all read as 1800).')
    currency: F = Field(description='A currency code, or a symbol listed in symbols.')
    fee: F | None = Field(
        description='A booking fee the site adds to the price ("+ €1.00 fee"), when it shows one apart; the amount '
        'logged is the price plus this fee. Null when the price shown is what a buyer pays.'
    )
    alt_price: F | None = Field(
        description='The words that give the second price, as the page shows them; with alt_amount and '
        'alt_currency, or null with them.'
    )
    alt_amount: F | None = Field(description='The same price in a second currency, when the site shows one.')
    alt_currency: F | None
    sold_out: F | None = Field(
        description='Sold out when this field finds anything; null for a site that hides sold-out tickets.'
    )

    def named(self) -> tuple[tuple[str, F | None], ...]:
        """Each field by its name, in order."""
        return (
            ('key', self.key),
            ('name', self.name),
            ('price', self.price),
            ('amount', self.amount),
            ('currency', self.currency),
            ('fee', self.fee),
            ('alt_price', self.alt_price),
            ('alt_amount', self.alt_amount),
            ('alt_currency', self.alt_currency),
            ('sold_out', self.sold_out),
        )


class Widget(Record):
    """When the tickets show on another address than the festival's link: where the pattern is looked for (the
    link's address, or its page's HTML), and the address to read, built from the match ({0}, its groups {1}…, the
    page's {host})."""

    in_: Literal['address', 'html'] = Field(validation_alias='in', serialization_alias='in')
    pattern: Text
    address: Annotated[str, Field(pattern=r'^(https://|\{)')]


class Api(Record):
    """When the site's page carries no ticket ids but its API does: a pattern finding the event's id in the
    festival's page, the API's address with {id}, and the dotted path to the list of tickets in its JSON."""

    id: Text
    url: Annotated[str, Field(pattern=r'^https://.*\{id\}')]
    items: Text


class Site(Record):
    site: Annotated[str, Field(pattern=r'^[a-z0-9-]+$')]
    hosts: Annotated[
        tuple[str, ...], Field(min_length=1, description='Hosts of the pages festivals link to that this recipe reads.')
    ]
    reseller: Text | None = Field(
        description="The reseller's name when the site sells other organisers' festivals at its own prices (Kizzbee), "
        'shown with the prices; null when it sells for the organiser.'
    )
    widget: Widget | None
    visible: bool = Field(description='true when the site refuses headless browsers.')
    wait: Annotated[int, Field(ge=1, le=60, description='Seconds to let the page settle after loading.')]
    open: Text | None = Field(
        description='A CSS selector whose every match is clicked before reading, to open sections shown collapsed.'
    )
    symbols: dict[str, Currency] = Field(
        description='What the site\'s currency symbols stand for ({"€": "EUR"}); a currency field that finds a '
        'code needs none.'
    )


class PageRecipe(Site):
    """A site whose page holds its tickets: row matches each one."""

    row: Text
    api: None
    fields: Fields[Find]


class ApiRecipe(Site):
    """A site whose API gives its tickets."""

    row: None
    api: Api
    fields: Fields[ApiFind]


def recipe_kind(value: object) -> str:
    """Which recipe a recipe's JSON, or a recipe, is: one with an API reads its tickets there."""
    match value:
        case ApiRecipe() | {'api': dict()}:
            return 'api'
        case _:
            return 'page'


type Recipe = Annotated[
    Annotated[PageRecipe, Tag('page')] | Annotated[ApiRecipe, Tag('api')], Discriminator(recipe_kind)
]
RECIPE: TypeAdapter[PageRecipe | ApiRecipe] = TypeAdapter(Recipe)


# ---- rows of the CSV files the steps share


def blank(value: object) -> object:
    return None if value == '' else value


def unblank(value: object, handler: SerializerFunctionWrapHandler) -> object:
    return '' if value is None else handler(value)


def number_text(value: float) -> str:
    """A number as the shortest text that reads back as it: 80, 80.5, 12999.99."""
    return str(int(value)) if value.is_integer() else repr(value)


def flag_text(value: object) -> str:
    return '1' if value else '0'


type Blank[T] = Annotated[T | None, BeforeValidator(blank), WrapSerializer(unblank)]  # empty when there is none
type Number = Annotated[float, PlainSerializer(number_text, return_type=str)]  # 80, 80.5
type Flag = Annotated[bool, PlainSerializer(flag_text, return_type=str)]  # 1 or 0


def split_keys(value: object) -> object:
    return tuple(k for k in value.split(';') if k) if isinstance(value, str) else value


def keys_text(value: tuple[str, ...]) -> str:
    return ';'.join(value)


type Keys = Annotated[tuple[str, ...], BeforeValidator(split_keys), PlainSerializer(keys_text, return_type=str)]  # a;b


class CsvRow(BaseModel):
    """A row of a CSV file, its columns the record's fields. A row is text, so its values are read from their text
    (lax: '3' is an int, '1' a true flag) and written back as text; an empty column of a field that may be none is
    None."""

    model_config = ConfigDict(extra='forbid', frozen=True, validate_by_name=True, serialize_by_alias=True)

    @classmethod
    def columns(cls) -> list[str]:
        return [f.serialization_alias or name for name, f in cls.model_fields.items()]

    @classmethod
    def read(cls, path: Path) -> list[Self]:
        return [cls.model_validate(cls.cells(row)) for row in tables.rows(path)]

    @classmethod
    def cells(cls, row: dict[str, str]) -> dict[str, object]:
        """A row's values by field; a record whose fields are not its columns says how they map."""
        return dict(row)

    def text(self) -> dict[str, object]:
        out: dict[str, object] = self.model_dump(mode='json')
        return out

    @classmethod
    def write(cls, path: Path, rows: Iterable[Self]) -> None:
        with path.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, cls.columns(), lineterminator='\n')
            w.writeheader()
            w.writerows(r.text() for r in rows)

    def append(self, path: Path) -> None:
        """Add the row at the end of the file, which gets its header when it is new."""
        new = not path.exists()
        with path.open('a', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, self.columns(), lineterminator='\n')
            if new:
                w.writeheader()
            w.writerow(self.text())


class PriceRow(CsvRow):
    """A tier of a pass read on a festival's ticket page (pipeline/pass_prices.csv)."""

    event_id: int
    pass_no: int
    kind: PassKind
    style: Blank[Style]
    label: Blank[str]
    group_size: Blank[int]
    days: Blank[int]
    includes_hotel: Flag
    amount: Number
    currency: str
    fee: Blank[Number]
    alt_amount: Blank[Number]
    alt_currency: Blank[str]
    from_: Blank[Day] = Field(validation_alias='from', serialization_alias='from')
    until: Blank[Day]
    quantity: Blank[int]
    sold_out: Flag
    quote: str


class PageRow(CsvRow):
    """A festival whose prices are read on its ticket page (pipeline/ticket_pages.csv)."""

    event_id: int
    event: str
    page: str
    reseller: Blank[str]
    read_on: Date
    read_by: str
    prompt: str
    recipe: str
    unread: int  # its tickets the first read doesn't know
    notes: str  # its first read's rule quotes, one per line


class FoundRow(CsvRow):
    """How an agent found a festival with no known ticket page sells (pipeline/tickets/pages.csv)."""

    event_id: int
    event: str
    state: Sales
    page: Blank[str]
    links: Blank[str]  # what a search that found nothing was of (tickets.links_hash)
    found_by: str
    note: str


class StatusRow(CsvRow):
    """What a festival waits for (pipeline/tickets/status.csv)."""

    event_id: int
    event: str
    start: Date
    waits_for: Waiting
    first_read: FirstReadState
    sales: Blank[Sales]
    page: Blank[str]


class MergeRow(CsvRow):
    """A decision on whether two artist records are one artist (pipeline/extract/merges.csv)."""

    key_a: str
    key_b: str
    decision: MergeDecision
    source: str  # the review prompt's version, or manual
    note: str


class ArtistMergeRow(CsvRow):
    """A merge of two artists the source pipeline keeps apart, decided by hand (pipeline/artist_merges.csv)."""

    decision: MergeDecision
    keep_key: str
    merge_key: str
    keep_name: str
    merge_name: str
    note: str


class PlanRow(CsvRow):
    """Who said they are going to which festival (pipeline/plans.csv)."""

    person: str
    event_id: int
    status: Plan
    event: str


class Airport(CsvRow):
    """An airport a festival can fly to (pipeline/airports.csv); home (1) is where flights leave from."""

    code: str
    name: str
    city: str
    country_code: str
    lat: float
    lon: float
    home: Flag


class Spot(BaseModel):
    """Where Nominatim puts a place, and its name for it."""

    model_config = ConfigDict(frozen=True)

    lat: float
    lon: float
    name: str


class Place(CsvRow):
    """A place the source DB names, and where it is when Nominatim found it (pipeline/geocode.csv, its columns lat,
    lon and osm_name, all empty when it found none)."""

    city: str
    country: str
    found: Spot | None

    @classmethod
    def columns(cls) -> list[str]:
        return ['city', 'country', 'lat', 'lon', 'osm_name']

    @classmethod
    def cells(cls, row: dict[str, str]) -> dict[str, object]:
        spot = None if row['lat'] == '' else {'lat': row['lat'], 'lon': row['lon'], 'name': row['osm_name']}
        return {'city': row['city'], 'country': row['country'], 'found': spot}

    def text(self) -> dict[str, object]:
        spot = self.found
        coords = ('', '', '') if spot is None else (number_text(spot.lat), number_text(spot.lon), spot.name)
        out: dict[str, object] = {'city': self.city, 'country': self.country}
        return out | dict(zip(('lat', 'lon', 'osm_name'), coords, strict=True))


class Fare(CsvRow):
    """A Friday-to-Monday return's price (docs/data/fares.csv)."""

    airport: str
    depart: Date
    return_: Date = Field(validation_alias='return', serialization_alias='return')
    price: int  # in whole euros
    currency: str
    fetched_at: Stamp


class Job(CsvRow):
    """When a festival weekend was last searched, and how it went (pipeline/fare_jobs.csv)."""

    airport: str
    depart: Date
    last_run: Stamp
    status: FareSearch
    note: str


class Spent(CsvRow):
    """A request to Claude and what it cost (pipeline/spend.csv); thinking counts as output."""

    at: Stamp
    step: str
    model: str
    input_tokens: int
    output_tokens: int
    usd: Number


class Rate(CsvRow):
    """Units of a currency per euro, on a day (pipeline/rates.csv)."""

    currency: str
    per_eur: float
    date: Date


class Booking(CsvRow):
    """One festival's booking moved from the artist record it was filed under to the person it is
    (pipeline/artist_bookings.csv)."""

    event_id: int
    from_key: str
    to_key: str
    event: str
    from_name: str
    to_name: str
    note: str


class HomeCountry(CsvRow):
    """An artist's home country known from outside the line-ups (pipeline/artist_countries.csv)."""

    match_key: str
    country: str
    name: str
    note: str


class Promo(CsvRow):
    """A promo code for a festival (pipeline/promo_codes.csv), ours, not kizomba-world's."""

    event_id: int
    code: str
    offer: str
    event: str
    note: str


class Person(CsvRow):
    """Someone who shares their festival plans (pipeline/people.csv): the artist records they are (';'-separated
    match keys), and whether cards name them (featured) or only count them."""

    key: str
    name: str
    artist_keys: Keys
    featured: Flag
    note: str


class Group(CsvRow):
    """A named group (pipeline/extract/groups.csv): an act several people perform as, its members and the spellings
    that mean it, each a match_key."""

    group_key: str
    display_name: str
    members: Keys
    aliases: Keys
    note: str


class Suggestion(CsvRow):
    """A pair of artists that may be one (pipeline/artist_merge_suggestions.csv), for a reviewer to decide."""

    decision: str  # empty: the reviewer copies the row into artist_merges.csv with merge or separate
    keep_key: str
    merge_key: str
    keep_name: str
    merge_name: str
    keep_bookings: int
    merge_bookings: int
    keep_countries: str
    merge_countries: str
    countries: str
    calendar: str
    calendar_note: str
    similarity: float
    score: float
    reason: str
