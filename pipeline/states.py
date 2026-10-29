"""Every state a data point can be in, one typed row each, and what each state means to the consumers that read it
(pipeline/STATES.md). The code's enums, the schemas' enums, the prompts' definitions, the SQL checks and the site's
words are all built from these rows, so adding a state is one row here.

A Point is a data point: what one instance is, what produces its states, and the point its states fall under, if
any (a genre's dance style). A State is one of them:
  criterion     what makes an instance this state, in the producers' words (and in the prompts that produce it)
  disposition   what a consumer does with it: shows it on the card, in a view, as the card's note on why it has no
                price, filters festivals by it without showing it, keeps it unshown, or waits for its owner
  wording       what a reader sees, or None where nothing is shown; {name} marks a value the site fills in
  forms         the words other surfaces show for it, by name (a role's singular, the card's cost line)
  owner         who acts on it, or None
  made_by       the producer of this state, when it is not the point's
  icon, link    how the site renders it: its icon (site/icons.ts), or a link to the ticket page or the passes view
  under         the state of the point's `under` point it falls under
  title         a genre: how a festival's title names it, a pattern matched as whole words, any case
  tags          a genre, a feature or a genre rule: kizomba-world's site tags that state it
  genres        a genre rule: the genres it adds

Importing this module checks every row: a missing or wrong-typed field, an unknown point, two states with one key,
a note or a filter without words, a waiting state without an owner, an `under` naming no state, or a title, a tag or a
genre on a state of another point fails here.

The code's enums of the states (ENUMS) are pipeline/enums.py, written from the rows (enums_module) so that a type
checker sees each state's name; `mise run generate:check` and Tests fail once it no longer says what the rows do.
"""

import json
import re
import textwrap
import types
from collections.abc import Iterable, Mapping
from dataclasses import field
from enum import StrEnum
from typing import TypeIs

from pydantic import ConfigDict
from pydantic.dataclasses import dataclass

from pipeline.enums import Point as PointName


class Disposition(StrEnum):
    CARD = 'card'  # the card shows it
    VIEW = 'view'  # an opened card or the passes view shows it
    NOTE = 'note'  # the card says why it shows no price
    FILTER = 'filter'  # the site filters festivals by it, and shows it nowhere else
    KEPT = 'kept'  # stored, not shown
    WAITS = 'waits'  # pending; its owner acts


class Link(StrEnum):
    PAGE = 'page'  # the festival's ticket page
    PASSES = 'passes'  # the passes view


class Counts(StrEnum):
    """What counts a role, each level within the next: a line-up's size counts its lineup roles, an artist's bookings
    its booking ones too, the calendar of where an artist is (merge_suggestions) its present ones too."""

    LINEUP = 'lineup'
    BOOKING = 'booking'
    PRESENT = 'present'


ROW = ConfigDict(strict=True, extra='forbid')  # a field of another type, or one no row has, is refused


@dataclass(frozen=True, config=ROW)
class Point:
    name: str
    enum: str  # its states' enum in pipeline/enums.py
    of: str  # what one instance is
    produced_by: str
    under: str | None = None  # the point its states fall under


@dataclass(frozen=True, config=ROW)
class State:
    point: str
    key: str
    criterion: str
    disposition: Disposition
    wording: str | None = None
    owner: str | None = None
    made_by: str | None = None
    icon: str | None = None
    link: Link | None = None
    under: str | None = None
    forms: Mapping[str, str] = field(default_factory=dict[str, str])
    title: str | None = None
    tags: tuple[str, ...] = ()
    genres: tuple[str, ...] = ()
    counts: Counts | None = None  # a role's: what counts it; None, nothing (an organiser is not at their event as one)

    def __post_init__(self) -> None:
        object.__setattr__(self, 'forms', types.MappingProxyType(dict(self.forms)))


P, S = Point, State
CARD, VIEW, NOTE, FILTER, KEPT, WAITS = Disposition
PAGE, PASSES = Link
LINEUP, BOOKING, PRESENT = Counts

POINTS = (
    P('page_read', 'Status', 'each logged attempt to read a ticket page', 'tickets_reading.attempt'),
    P(
        'call_cause',
        'CallCause',
        "each call that gave no answer, by what kept it from one (pipeline/calls.py); a ticket page's own failures "
        'are page_read states',
        'calls',
    ),
    P(
        'sales',
        'Sales',
        'a festival with no full link to its ticket page, as an agent found it (tickets/pages.csv)',
        'tickets.py page --state',
    ),
    P('ticket', 'Ticket', 'each ticket of a read ticket page', 'the first read; tickets_store.unread_keys'),
    P('skip_reason', 'SkipReason', 'each ticket a first read skips', 'the first read'),
    P('pass_kind', 'PassKind', 'each pass a festival sells', 'the prices pass; the first read'),
    P(
        'style',
        'Style',
        'a dance style: of a festival, by its genres, or the one a pass is limited to (null: all the '
        "festival's styles)",
        'prices.styles; the prices pass; the first read',
    ),
    P('people', 'People', 'each pass, by how many people one price is for', 'prices.people, from group_size and kind'),
    P('fee', 'Fee', 'each price tier, by its booking fee', 'the prices pass; the first read'),
    P('re_read', 'Recheck', 'a festival with a first read, by when its page is read again', 'tickets_store.recheck'),
    P('first_read', 'FirstRead', 'a festival, by whether it needs a (new) first read', 'tickets_state.why_first_read'),
    P('answer', 'AnswerState', "a festival's answer of one extraction pass", 'ask.answer_state'),
    P(
        'waits_for',
        'Waiting',
        'each festival, by what its prices from its ticket page wait for',
        'tickets_state.waiting, in tickets/status.csv',
    ),
    P('price', 'Price', 'each festival, by what its card can say of its price', 'prices.price_state, in price_status'),
    P('tier_today', 'TierToday', "a pass's price on the day it is viewed", 'pricing.ts tierNow'),
    P(
        'card_price',
        'CardPrice',
        'a priced festival, by what its card says on the day it is viewed',
        'pricing.ts cardPrice',
    ),
    P(
        'genre',
        'Genre',
        'each dance genre a festival covers',
        'the rooms-genres pass; the genre rules; the site tags',
        under='style',
    ),
    P('genre_rule', 'GenreRule', 'a genre the rules add', 'load_extract'),
    P('source', 'Source', 'where a genre or feature row comes from', 'load_extract'),
    P('pass_source', 'PassSource', "where a festival's passes come from", 'load_extract'),
    P('room_kind', 'RoomKind', 'each room a description lists', 'the rooms-genres pass'),
    P('feature', 'Feature', 'each feature of a festival', 'the extract pass'),
    P('role', 'Role', 'each artist named in a description', 'the extract pass'),
    P('artist_kind', 'ArtistKind', 'each artist', 'resolve_artists'),
    P('home_basis', 'HomeBasis', "an artist's home country, by how it is known", 'build_site_db'),
    P('merge_decision', 'MergeDecision', 'each artist merge reviewed', 'the merge review; a merge claim'),
    P('merge_reason', 'MergeReason', 'each pair of artists that may be one, for the merge review', 'resolve_artists'),
    P('pending', 'Pending', 'a festival waiting for its extraction passes', 'scrape'),
    P(
        'suggestion_countries',
        'SuggestionCountries',
        'each merge suggestion, by the countries line-ups state for its two artists',
        'merge_suggestions',
    ),
    P(
        'suggestion_calendar',
        'SuggestionCalendar',
        'each merge suggestion, by where and when its two artists are booked',
        'merge_suggestions',
    ),
    P('via', 'Via', 'each appearance of an artist at an event (artist_events)', 'resolve_artists; build_site_db'),
    P('listing', 'Listing', 'each festival, by whether the site it comes from still lists it', 'scrape'),
    P('event_source', 'EventSource', "the site a festival's listing comes from (source_ids)", 'scrape'),
    P('plan', 'Plan', 'each plan someone shares (pipeline/plans.csv)', 'pipeline/plans.csv'),
    P('next_change', 'NextChange', "a pass's next price change on the day it is viewed", 'pricing.ts nextChange'),
    P('hotel', 'Hotel', 'each pass, by whether its price includes a hotel', 'the prices pass; the first read'),
    P('claim_source', 'ClaimSource', 'the channel a claim comes by, the earlier the higher its priority', 'claims'),
    P('claim', 'ClaimState', 'each claim, by whether it decides its subject', 'resolve_artists'),
    P('model', 'Model', 'each Claude model the pipeline asks, which spend.PRICES prices', 'ask; tickets; merge review'),
)

ROWS = (
    # ---- ticket pages
    S(
        'page_read',
        'read',
        'the page loaded and the recipe found every ticket row, each with its key, name, price, amount and currency',
        KEPT,
    ),
    S(
        'page_read',
        'refused',
        'no rows and an HTTP error, or the page would not load',
        WAITS,
        owner='the next run; after three in a row, an agent in a session',
    ),
    S(
        'page_read',
        'empty',
        "the site answered a list of its tickets, and it is empty: none is listed now (a page's rows can't say so, as "
        'a recipe that finds none may be broken)',
        KEPT,
    ),
    S(
        'page_read',
        'unreachable',
        'the address could not be reached: the connection was reset or timed out, or the host is unknown',
        WAITS,
        owner='the next run; after three in a row, an agent in a session',
    ),
    S('call_cause', 'checker', "the answer failed the checker twice, the second time with the checker's lines", KEPT),
    S('call_cause', 'truncated', 'the answer stopped before its end (stop_reason other than end_turn)', KEPT),
    S(
        'call_cause',
        'transient',
        'the service was busy or unreachable for now: a timeout, a lost connection, HTTP 429 or 5xx',
        KEPT,
    ),
    S(
        'call_cause',
        'structural',
        'the call cannot succeed as made: any other HTTP error (a bad key, a malformed request), a reply of '
        'another shape, or no browser to read with; the run stops calling',
        KEPT,
    ),
    S(
        'call_cause',
        'budget',
        "the month's budget for Claude is spent (pipeline/spend.py); the run stops calling",
        KEPT,
    ),
    S(
        'page_read',
        'layout_broken',
        "the recipe's selectors fail, no rows, two rows with one key, or a row without "
        'its key, name, price, amount or currency',
        WAITS,
        owner='agent: fix the recipe',
    ),
    S('sales', 'shop', 'a page sells them online: page is that page', KEPT),
    S('sales', 'not_yet', 'sales are announced but not open ("coming soon", "TBA")', KEPT, owner='organiser'),
    S('sales', 'offline', 'by message, e-mail, a form then payment, a bank transfer or an agency', KEPT),
    S('sales', 'closed', 'its sales or registrations are closed', KEPT),
    S(
        'sales',
        'none_found',
        "a search of the festival's links and the web found no ticket page",
        KEPT,
        owner='agent: once its links change',
    ),
    S('ticket', 'in_tier', 'the first read puts it in a tier of a pass', VIEW),
    S('ticket', 'skipped', 'the first read skips it, with its reason', KEPT),
    S(
        'ticket',
        'unread',
        'the page shows it and the first read neither puts it in a tier nor skips it',
        WAITS,
        'The ticket page has more tickets than shown here',
        "the next run's first read",
    ),
    # ---- what a first read leaves out, and the prices pass too: no reason fits a pass
    S('skip_reason', 'room', 'a hotel room, a bed or a camping place sold apart from a pass', KEPT),
    S('skip_reason', 'class', 'a single class, workshop or private lesson, even one called a masterclass', KEPT),
    S('skip_reason', 'competition', 'a competition entry', KEPT),
    S('skip_reason', 'merchandise', 'merchandise: a T-shirt, a fan, a bag', KEPT),
    S('skip_reason', 'food_drink', 'a meal, a dinner or drinks sold on their own', KEPT),
    S('skip_reason', 'excursion', 'an excursion, a tour, a shuttle or a transfer sold on its own', KEPT),
    S('skip_reason', 'fee', 'a fee sold as an item of its own: a name change, a surcharge, a booking fee', KEPT),
    S('skip_reason', 'deposit', 'a deposit, an advance payment or an instalment on a pass (a bootcamp included)', KEPT),
    S(
        'skip_reason',
        'discount',
        'a discount that is no price of its own: for groups, students, members or a promo code',
        KEPT,
    ),
    S('skip_reason', 'donation', 'a donation, or a ticket that only supports the festival', KEPT),
    S(
        'skip_reason',
        'not_public',
        'a ticket not sold to the public: for guests, artists, staff, helpers or volunteers',
        KEPT,
    ),
    S('skip_reason', 'no_amount', 'a price with no amount ("€…", "TBA")', KEPT),
    # ---- passes
    S(
        'pass_kind',
        'full',
        "all the festival's workshops and all its parties, for the whole festival. An early-bird, "
        'blind or VIP-free "full pass" is still `full`; so is a "full pass" with a few small extras '
        '(a welcome drink).',
        VIEW,
        'Full pass',
    ),
    S(
        'pass_kind',
        'party',
        'the parties or socials only, for the whole festival, no workshops. A "Dance Pass" sold '
        "beside the festival's full pass is `party` unless the description says it includes "
        'workshops.',
        VIEW,
        'Party pass',
    ),
    S(
        'pass_kind',
        'day',
        'one day or one night only (workshops, parties, or both); a ticket to one party, a pre-party say, is one.',
        VIEW,
        'Day pass',
    ),
    S('pass_kind', 'workshop', 'workshops only, no parties.', VIEW, 'Workshop pass'),
    S(
        'pass_kind',
        'package',
        'a pass sold together with a hotel room, meals, transfers or excursions, as one price.',
        VIEW,
        'Package',
    ),
    S(
        'pass_kind',
        'other',
        'anything else that is sold as a pass: VIP passes that add perks or classes to the full '
        'pass, bootcamps and masterclass series (several classes sold as one), passes that cover two '
        "festivals, passes priced by the buyer's country.",
        VIEW,
        'Pass',
    ),
    S('style', 'kizomba', 'kizomba, or one of the styles of its family, or a mix of them', VIEW, 'Kizomba'),
    S('style', 'zouk', 'zouk, Brazilian zouk included', VIEW, 'Zouk'),
    S('style', 'bachata', 'bachata', VIEW, 'Bachata'),
    S('style', 'salsa', 'salsa', VIEW, 'Salsa'),
    S('style', 'other', 'any other dance style', VIEW, 'Other style'),
    S('people', 'one', 'group_size 1, or none stated for a pass other than a package', VIEW),
    S('people', 'couple', 'group_size 2', VIEW, 'for a couple'),
    S('people', 'group', 'group_size 3 or more', VIEW, 'for {n}'),
    S('people', 'per_room', 'none stated for a package: priced per room', VIEW),
    S('fee', 'none', 'no booking fee stated', VIEW),
    S('fee', 'included', 'the amount includes a booking fee the source states', VIEW, 'incl. {fee} fee'),
    # ---- reading again, first reads, answers
    S(
        're_read',
        'dated',
        'every tier on sale has an end date and none is limited to a number of tickets: read again '
        'once its last date has passed',
        KEPT,
    ),
    S('re_read', 'monthly', 'any other: read again on every monthly run', KEPT),
    S(
        'first_read',
        'not_needed',
        "no first read, and the description's prices answer gives the pass a card prices a price dated today or later",
        KEPT,
    ),
    S(
        'first_read',
        'none',
        "no first read, and the description's prices answer gives the pass a card prices no dated price",
        WAITS,
        owner='the next run, once its page has a recipe',
    ),
    S(
        'first_read',
        'awaits_answer',
        "no first read, and the description's prices answer is not to the current prompt yet",
        WAITS,
        owner="the next run's prices pass",
    ),
    S(
        'first_read',
        'current',
        'a first read to the current prompt, of the current description and ticket page, knowing every ticket',
        KEPT,
    ),
    S(
        'first_read',
        'redo_prompt',
        'the first read follows another prompt than the current one',
        WAITS,
        owner='the next run',
    ),
    S('first_read', 'redo_description', 'the description changed since the first read', WAITS, owner='the next run'),
    S('first_read', 'redo_page', 'the ticket page changed since the first read', WAITS, owner='the next run'),
    S('first_read', 'redo_unread', 'the page shows tickets the first read does not know', WAITS, owner='the next run'),
    S(
        'first_read',
        'disputed',
        'a first read is needed, and no two of the models agreed on it (tickets/disputed/)',
        WAITS,
        owner='agent: settle it',
    ),
    S('answer', 'none', 'the festival has no answer of the pass', WAITS, owner='the next run'),
    S('answer', 'current', 'its answer was asked with the current prompt, of the current description', KEPT),
    S(
        'answer',
        'stale',
        'its answer was asked with another prompt (it is not loaded), or before its description last changed '
        '(pending_extraction; it stays loaded until asked again)',
        WAITS,
        owner='the next run',
    ),
    S(
        'waits_for',
        'page',
        'no known ticket page: kizomba-world cut its link short, gave none, or gave links to no ticket shop',
        WAITS,
        owner='agent: find the page',
    ),
    S('waits_for', 'recipe', 'its ticket page is on a site with no recipe', WAITS, owner='agent: write the recipe'),
    S(
        'waits_for',
        'recipe_fix',
        'its latest read broke the recipe: the page no longer fits it',
        WAITS,
        owner='agent: fix the recipe',
    ),
    S('waits_for', 'session', 'its reads keep failing', WAITS, owner='agent: read it in a session'),
    S('waits_for', 'agent', 'no two models agreed on its first read', WAITS, owner='agent: settle it'),
    S('waits_for', 'sales_open', 'its sales are announced but not open', WAITS, owner='organiser'),
    S(
        'waits_for',
        'nothing',
        'nothing: its prices are read, or it needs no first read, sells offline, has closed its '
        'sales, is over, or a site claim says so (pipeline/claims.py)',
        KEPT,
    ),
    # ---- what a card says of a festival's price
    S(
        'price',
        'priced',
        'its passes include the one a card prices: a full pass for one person, or a package with a hotel for one',
        CARD,
    ),
    S(
        'price',
        'other_passes_only',
        'it has passes, none of them the one a card prices',
        NOTE,
        'No full pass price',
        link=PASSES,
    ),
    S(
        'price',
        'page_unread',
        'no passes; its ticket page is known and its prices are not read yet',
        NOTE,
        'Prices on the ticket page',
        link=PAGE,
    ),
    S(
        'price',
        'page_empty',
        'no passes; its ticket page, read, lists no tickets now',
        NOTE,
        'No tickets listed yet',
        link=PAGE,
        owner='the next run',
    ),
    S(
        'price',
        'not_yet',
        'no passes; its sales are announced but not open',
        NOTE,
        'Tickets not on sale yet',
        'organiser',
    ),
    S(
        'price',
        'offline',
        'no passes; it sells by message, e-mail, a form or a bank transfer',
        NOTE,
        'Tickets by message or form, no price online',
    ),
    S('price', 'closed', 'no passes; its sales are closed', NOTE, 'Ticket sales closed'),
    S(
        'price',
        'none_found',
        'no passes; a search found no ticket page',
        NOTE,
        'No price published',
        'agent: once its links change',
    ),
    S(
        'price',
        'not_looked',
        'no passes, and no ticket page known yet',
        NOTE,
        'No price published',
        'agent: find the page',
    ),
    S('tier_today', 'now', 'a tier applies today and is not sold out: the cheapest of them', VIEW, '{price}'),
    S('tier_today', 'from', 'several undated tiers apply today', VIEW, 'from {price}'),
    S('tier_today', 'next', 'none applies yet: the first one to come', VIEW, '{price}'),
    S('tier_today', 'sold_out', 'every tier is sold out', VIEW, 'sold out'),
    S(
        'tier_today',
        'ended',
        'every dated tier has ended, and there is no door price',
        VIEW,
        forms={'all': 'No passes on sale any more.'},
    ),
    S(
        'card_price',
        'full_pass',
        'the card prices a full pass, at its tier today',
        CARD,
        '{price} full pass',
        forms={'cost': 'Cost {sum}, without accommodation'},
    ),
    S(
        'card_price',
        'package',
        'the card prices a package with a hotel, at its tier today',
        CARD,
        '{price} package with hotel',
        forms={'cost': 'Cost {sum}, hotel included'},
    ),
    S('card_price', 'sold_out', "the priced pass's tiers are all sold out", CARD, '{pass} sold out'),
    S(
        'card_price',
        'ended',
        "the festival is over, or the priced pass's dated tiers have all ended",
        NOTE,
        'Prices no longer listed',
        'organiser',
    ),
    # ---- genres, features, roles: the extraction passes' definitions
    S(
        'genre',
        'kizomba',
        'Kizomba (traditional / sensual kizomba)',
        CARD,
        'Kizomba',
        under='kizomba',
        title=r'\bkizomba\b',
        tags=('Kizomba',),
    ),
    S('genre', 'semba', 'Semba', CARD, 'Semba', under='kizomba', title=r'\bsemba\b', tags=('Semba',)),
    S(
        'genre',
        'urbankiz',
        'Urban Kiz / Urbankiz / Kizomba fusion',
        CARD,
        'Urban Kiz',
        under='kizomba',
        title=r'\burban\s*kiz\b',
        tags=('Urbankiz',),
    ),
    S('genre', 'tarraxo', 'Tarraxo', CARD, 'Tarraxo', under='kizomba', title=r'\btarraxo\b', tags=('Tarraxo',)),
    S('genre', 'tarraxinha', 'Tarraxinha', CARD, 'Tarraxinha', under='kizomba', title=r'\btarraxinha\b'),
    S('genre', 'douceur', 'Douceur', CARD, 'Douceur', under='kizomba', title=r'\bdouceur\b'),
    S(
        'genre',
        'kompa',
        'Kompa / Konpa / Kompas',
        CARD,
        'Kompa',
        under='other',
        title=r'\bkompas?\b|\bkonpa\b',
        tags=('Kompa',),
    ),
    S(
        'genre',
        'zouk',
        'Zouk (including Brazilian zouk and ghetto zouk)',
        CARD,
        'Zouk',
        under='zouk',
        title=r'\bzouk\b',
        tags=('Zouk',),
    ),
    S(
        'genre',
        'bachata',
        'Bachata (any style)',
        CARD,
        'Bachata',
        under='bachata',
        title=r'\bbachata\b',
        tags=('Bachata',),
    ),
    S('genre', 'salsa', 'Salsa (any style)', CARD, 'Salsa', under='salsa', title=r'\bsalsa\b', tags=('Salsa',)),
    S('genre', 'afro', 'Afro dances: afrobeats, afro house, afro dance', CARD, 'Afro', under='other'),
    S('genre', 'reggaeton', 'Reggaeton', CARD, 'Reggaeton', under='other', title=r'\breggaet[oó]n\b'),
    S('genre', 'kuduro', 'Kuduro', CARD, 'Kuduro', under='other', title=r'\bkuduro\b'),
    S('genre', 'other', 'Any other dance genre; give its name in genre_as_written', KEPT, under='other'),
    S(
        'genre_rule',
        'sbk',
        '"SBK" anywhere in the title or description: the genres it names',
        KEPT,
        tags=('SBK',),
        genres=('salsa', 'bachata', 'kizomba'),
    ),
    S('genre_rule', 'title', 'a genre named as a whole word in the title', KEPT),
    S('source', 'description', "the festival's description, by an extraction pass or a rule", KEPT),
    S('source', 'site_tag', "kizomba-world's own tag", KEPT),
    S(
        'pass_source',
        'description',
        "the prices pass, from the festival's description",
        VIEW,
        'Prices as the festival lists them.',
        forms={'link': 'The festival on kizomba-world'},
    ),
    S(
        'pass_source',
        'ticket_page',
        'its ticket page, read by pipeline/tickets.py',
        VIEW,
        'Prices from the festival’s ticket page, as of {day}.',
        forms={
            'reseller': 'Prices from {reseller}, a reseller selling at its own prices, as of {day}.',
            'link': 'The ticket page',
        },
    ),
    S('room_kind', 'party', 'a party room or dance floor', KEPT),
    S('room_kind', 'class', 'a class room', KEPT),
    S('room_kind', 'unspecified', 'a room the description does not say the use of', KEPT),
    # features in the order a card shows them: the first three on it, the rest once it is open
    S(
        'feature',
        'promo_code',
        'a promo code of ours (pipeline/promo_codes.csv)',
        CARD,
        'Promo code',
        made_by='build_site_db',
        icon='tag',
    ),
    S(
        'feature',
        'all_levels_beginners',
        'Suitable for all levels or explicitly welcomes beginners',
        CARD,
        'Beginner-friendly',
        icon='sprout',
    ),
    S('feature', 'taxi_dancers', 'Taxi dancers are present', CARD, 'Taxi dancers', icon='hand-heart'),
    S(
        'feature',
        'accommodation_included',
        'A pass or package includes the accommodation',
        CARD,
        'Hotel package',
        icon='bed-double',
    ),
    S(
        'feature',
        'group_deals',
        'a full, party or package pass for two people or more',
        CARD,
        'Couple & group deals',
        made_by='build_site_db',
        icon='users',
        link=PASSES,
    ),
    S('feature', 'meals_included', 'Meals are included in a pass or package', CARD, 'Meal package', icon='utensils'),
    S(
        'feature',
        'transfers_shuttle',
        'Shuttles or transfers (airport, station, between venues)',
        CARD,
        'Airport shuttle',
        icon='bus',
    ),
    S('feature', 'pool_party', 'A pool party', CARD, 'Pool party', icon='waves', tags=('Pool Party',)),
    S('feature', 'beach_party', 'A beach party', CARD, 'Beach party', icon='sun', tags=('Beach Party',)),
    S('feature', 'boat_party', 'A boat party', CARD, 'Boat party', icon='sailboat', tags=('Boat Party',)),
    S('feature', 'cruise', 'The event takes place on a cruise ship', CARD, 'Cruise', icon='ship', tags=('Cruise',)),
    S('feature', 'live_music', 'Live music: a band, singer or concert', CARD, 'Live music', icon='music'),
    S(
        'feature',
        'bootcamp_intensive',
        'A bootcamp, intensive or long training course',
        CARD,
        'Bootcamp',
        icon='dumbbell',
    ),
    S(
        'feature',
        'competition',
        'Any competition: battle, contest, Jack & Jill, championship, competition',
        CARD,
        'Competition',
        icon='trophy',
        tags=('Competition',),
    ),
    S('feature', 'camping', 'Camping, bungalows or campsite accommodation', CARD, 'Camping', icon='tent'),
    S('feature', 'masterclass', 'Masterclasses', VIEW, 'Masterclass', icon='graduation-cap'),
    S('feature', 'private_classes', 'Private lessons are offered', VIEW, 'Private classes', icon='circle-user'),
    S('feature', 'shows', 'Shows or performances by artists', VIEW, 'Shows', icon='sparkles'),
    S(
        'feature',
        'themed_parties',
        'Themed nights or parties with a dress theme (e.g. white party, Halloween night)',
        VIEW,
        'Themed parties',
        icon='party-popper',
    ),
    S('feature', 'pre_party', 'A pre-party before the main event', VIEW, 'Pre-party', icon='moon'),
    S('feature', 'after_party', 'An after-party', VIEW, 'After-party', icon='moon'),
    S('feature', 'day_socials', 'Daytime socials or afternoon parties', VIEW, 'Day socials', icon='sunrise'),
    S(
        'feature',
        'partner_hotel',
        'A partner or recommended hotel, or a negotiated hotel rate, without the accommodation being part of the pass',
        VIEW,
        'Partner hotel',
        icon='hotel',
    ),
    S('feature', 'multiple_rooms', 'More than one dance room or dance floor', VIEW, 'Several rooms', icon='door-open'),
    S('feature', 'adults_only', 'Restricted to adults (18+)', VIEW, '18+ only', icon='circle-user'),
    # near-universal, or no reason to choose a festival
    S(
        'feature',
        'all_in_one',
        'The parties take place in the hotel where dancers are invited to stay (event and '
        'accommodation in the same venue)',
        FILTER,
        'All-in-one hotel',
        icon='bed-double',
        tags=('All in One',),
    ),
    S('feature', 'workshops', 'Dance classes or workshops are part of the event', KEPT),
    S('feature', 'dress_code', 'A dress code is stated', KEPT),
    S(
        'role',
        'teacher',
        "Teachers, instructors, and the 'artists' line-up of a festival (in this scene, the teaching "
        'couples and solo teachers)',
        VIEW,
        'Teachers',
        forms={'singular': 'Teacher', 'pair': 'Teaching couple'},
        counts=LINEUP,
    ),
    S('role', 'dj', 'DJs', VIEW, 'DJs', forms={'singular': 'DJ'}, counts=LINEUP),
    S(
        'role',
        'performer',
        'Singers, bands, musicians, show dancers and guest dancers who perform rather than teach',
        VIEW,
        'Performers',
        forms={'singular': 'Performer', 'pair': 'Performing couple'},
        counts=BOOKING,
    ),
    S('role', 'mc', 'MCs, hosts, presenters of the event', VIEW, 'MCs', forms={'singular': 'MC'}, counts=BOOKING),
    S(
        'role',
        'organiser',
        'The school, association, company or person organising the event',
        VIEW,
        'Organised by',
        forms={'singular': 'Organiser'},
    ),
    S('role', 'media', 'Photographers, videographers, media teams', KEPT, counts=PRESENT),
    S('role', 'crew', 'Named teams that serve the dancers: taxi-dancer teams, host teams', KEPT, counts=PRESENT),
    S('artist_kind', 'person', 'one person', VIEW, 'People', forms={'singular': 'Artist'}),
    S('artist_kind', 'couple', 'two people booked together', VIEW, 'Couples', forms={'singular': 'Couple'}),
    S('artist_kind', 'group', 'a band, a dance company or a team', KEPT),
    S('artist_kind', 'organisation', 'a school, an association or a company', KEPT),
    S('home_basis', 'given', 'given by a home claim (pipeline/claims.py)', VIEW, 'Home country added by hand.'),
    S(
        'home_basis',
        'stated',
        'the one country stated most often next to their name in line-ups (each festival once)',
        VIEW,
        'Home country as stated in line-ups.',
    ),
    S(
        'home_basis',
        'contested',
        'line-ups state several countries next to their name, none more often than the others: no home is shown',
        VIEW,
        'Line-ups name several countries for them, none more often.',
    ),
    S('merge_decision', 'merge', 'two records are one artist', KEPT),
    S('merge_decision', 'separate', 'two records are different artists', KEPT),
    S('merge_decision', 'unsure', 'the review could not tell', WAITS, owner='agent: decide'),
    S(
        'merge_reason',
        'same name, different keys',
        'two person keys with one name (a DJ and a dancer, solo and in a couple, or in two couples), sharing a'
        ' stated country or a partner',
        KEPT,
    ),
    S(
        'merge_reason',
        'first words of the other',
        'the shorter name is the first words of the longer, the pair sharing a stated country or a partner',
        KEPT,
    ),
    S(
        'merge_reason',
        'same partner, shortened name',
        'the two dance with one partner, and one name begins with the other',
        KEPT,
    ),
    S(
        'merge_reason',
        'similar spelling',
        'names spelled alike (resolve_artists.SIMILAR), sharing a stated country or a partner; or, both of several'
        ' words, sharing an event country',
        KEPT,
    ),
    S(
        'merge_reason',
        'single name, several countries',
        'one single-word key, two of whose mentions state countries they do not share: it may be several people',
        KEPT,
    ),
    S(
        'merge_reason',
        'couples with matching names',
        "two couples whose members' names are spelled alike, member by member",
        KEPT,
        made_by='merge_suggestions',
    ),
    S('pending', 'new', 'the festival is new', WAITS, owner='the next run'),
    S('pending', 'description changed', 'its description changed', WAITS, owner='the next run'),
    S('suggestion_countries', 'unknown', 'line-ups state no country for one of the two', KEPT),
    S('suggestion_countries', 'same', 'line-ups state a country for both that they share', KEPT),
    S('suggestion_countries', 'different', 'line-ups state countries for both, and they share none', KEPT),
    S('suggestion_calendar', 'same line-up', 'both are named in one line-up, in one role', KEPT),
    S('suggestion_calendar', 'clash', 'both are booked at short events in different cities at the same time', KEPT),
    S('suggestion_calendar', 'shared circuit', 'both are booked in one city, or by one organiser', KEPT),
    S('suggestion_calendar', 'no clash', 'none of these', KEPT),
    S('via', 'direct', 'the artist is named in the line-up', KEPT),
    S('via', 'member', 'a couple or group the artist is in is named in the line-up', KEPT),
    S('listing', 'listed', 'the site lists the festival', KEPT),
    S(
        'listing',
        'gone',
        'the site no longer lists the festival: it is kept (unlisted_on), so plans and links to it still hold, and '
        'left out of the festivals listed',
        CARD,
        'This festival is no longer listed.',
        forms={'search': '· no longer listed'},
    ),
    S('event_source', 'kizomba-world', 'kizomba-world.com, whose ids its source_id are', KEPT),
    S('plan', 'going', 'they said they are going', VIEW),
    S(
        'next_change',
        'door',
        'the next tier is the price at the door',
        CARD,
        'price is higher at the door',
        forms={'after': 'then {price} at the door'},
    ),
    S(
        'next_change',
        'dated',
        'the next tier starts on a known day',
        CARD,
        'price goes up {day}',
        forms={'after': 'then {price} from {day}'},
    ),
    S(
        'next_change',
        'later',
        'the next tier starts on a day not known',
        CARD,
        'price goes up later',
        forms={'after': 'then {price} later'},
    ),
    S('hotel', 'included', 'the price includes accommodation', VIEW, 'with hotel'),
    S('hotel', 'none', 'the price includes no accommodation', VIEW),
    S(
        'claim_source',
        'admin',
        'a file of the claims repository (clombion/kiz-radar-claims), written by its owner',
        KEPT,
    ),
    S('claim_source', 'organiser', "a festival's organiser, through the organisers' channel", KEPT),
    S('claim_source', 'model', "the pipeline's own answers (the merge review)", KEPT),
    S('claim', 'applied', 'the highest claim on its subject: it decides it', KEPT),
    S('claim', 'overridden', 'another claim on its subject comes first: a higher source, or a later one', KEPT),
    S(
        'claim',
        'orphaned',
        'it names a key no mention produces any more (a re-extraction respelled it): ignored until re-pointed',
        WAITS,
        owner='admin: point it at the key the artist has now',
    ),
    S('model', 'claude-fable-5-1', "the first read's tie-break, when the two models' reads differ", KEPT),
    S('model', 'claude-opus-5-5', 'a model of the first read', KEPT),
    S('model', 'claude-sonnet-5-5', 'a model of the first read', KEPT),
    S('model', 'claude-haiku-5-5', 'the extraction passes and the merge review', KEPT),
)


def check(points: tuple[Point, ...], rows: tuple[State, ...]) -> None:
    """Refuse a table with two points of one name, a state of no point, two states with one key, a point with no
    state, a note or a filter without words, a waiting state without an owner, or an `under` that names no state of
    its point's `under` point."""
    by_name = {p.name: p for p in points}
    if len(by_name) < len(points):
        raise ValueError(
            f'two points named {sorted({p.name for p in points if [q.name for q in points].count(p.name) > 1})}'
        )
    seen: set[tuple[str, str]] = set()
    for s in rows:
        if s.point not in by_name:
            raise ValueError(f'{s.point}.{s.key}: no point {s.point!r}')
        if (s.point, s.key) in seen:
            raise ValueError(f'{s.point}: two states with the key {s.key!r}')
        seen.add((s.point, s.key))
        if s.disposition in (NOTE, FILTER) and s.wording is None:
            raise ValueError(f'{s.point}.{s.key}: a {s.disposition} state needs words')
        if s.disposition == WAITS and s.owner is None:
            raise ValueError(f'{s.point}.{s.key}: a waiting state needs an owner')
    for s in rows:
        under = by_name[s.point].under
        if (s.under is None) != (under is None) or (under and (under, s.under) not in seen):
            raise ValueError(f'{s.point}.{s.key}: under {s.under!r} is no state of {under}')
    if empty := set(by_name) - {s.point for s in rows}:
        raise ValueError(f'points with no state: {sorted(empty)}')


# the fields only some points' states have
FIELDS_OF = {
    'title': {'genre'},
    'tags': {'genre', 'feature', 'genre_rule'},
    'genres': {'genre_rule'},
    'counts': {'role'},
}


def check_fields(rows: tuple[State, ...]) -> None:
    """Refuse a title, a tag or a genre on a state of another point, and a rule's genre that is no genre."""
    genres = {s.key for s in rows if s.point == 'genre'}
    for s in rows:
        for name, points_of in FIELDS_OF.items():
            if getattr(s, name) and s.point not in points_of:
                raise ValueError(f'{s.point}.{s.key}: a {name} belongs to a state of {sorted(points_of)}')
        if unknown := sorted(set(s.genres) - genres):
            raise ValueError(f'{s.point}.{s.key}: genres {unknown} are no genres')


check(POINTS, ROWS)
check_fields(ROWS)
POINT = {p.name: p for p in POINTS}
BY_POINT = {p.name: tuple(s for s in ROWS if s.point == p.name) for p in POINTS}
KEYS = {p: tuple(s.key for s in rows) for p, rows in BY_POINT.items()}
BY_KEY = {(s.point, s.key): s for s in ROWS}


def is_point(name: str) -> TypeIs[PointName]:
    """Whether a name read at run time (a template's marker) names a point."""
    return name in POINT


def of(point: PointName) -> tuple[State, ...]:
    """The point's states, in table order."""
    return BY_POINT[point]


def keys(point: PointName) -> tuple[str, ...]:
    return KEYS[point]


def made(point: PointName) -> list[str]:
    """The keys of the point's states that its own producer makes (not those another step adds, made_by)."""
    return [s.key for s in of(point) if s.made_by is None]


def state(point: PointName, key: str) -> State:
    if found := BY_KEY.get((point, key)):
        return found
    raise not_a_state(point, key)


def not_a_state(point: PointName, value: str, where: str | None = None) -> LookupError:
    """The error for a value that is no state of its point, naming the point, its producer and what to do."""
    return LookupError(
        f'{point} {value!r}' + (f' in {where}' if where else '') + f' (produced by '
        f'{POINT[point].produced_by}) is no state in pipeline/states.py: add a row for it there'
    )


def member(key: str) -> str:
    """A state's name in code: its key in capitals, any other character an underscore."""
    return re.sub(r'\W', '_', key).upper()


def total[K: str, V](point: PointName, mapping: dict[K, V], where: str) -> dict[K, V]:
    """mapping, once it has a value for every state of the point and for nothing else."""
    if missing := [k for k in keys(point) if k not in mapping]:
        raise LookupError(f'{where}: no value for the {point} states {missing} (pipeline/states.py)')
    if extra := [k for k in mapping if k not in keys(point)]:
        raise LookupError(f'{where}: {extra} are no {point} states (pipeline/states.py)')
    return mapping


def counted(at: Counts) -> tuple[str, ...]:
    """The roles that count at a level: its own, and those of every level within it."""
    levels = list(Counts)[: list(Counts).index(at) + 1]
    return tuple(s.key for s in of('role') if s.counts in levels)


def sql_in(point: PointName, keys_: Iterable[str] | None = None) -> str:
    """The point's keys (or these of them: none is an empty list) as an SQL list, for a CHECK (... IN (...))."""
    chosen = keys(point) if keys_ is None else keys_
    return quoted(state(point, k).key for k in chosen)


def quoted(keys_: Iterable[str]) -> str:
    return ', '.join("'" + k.replace("'", "''") + "'" for k in keys_)


SQL_IN = {p: quoted(k) for p, k in KEYS.items()}  # each point's keys as an SQL list, by name, for a DDL's {point}


def definitions(point: PointName, indent: str = '') -> str:
    """The states the point's producer makes, in key order (a view's order is not the prompt's), as a Markdown list
    for its prompt: each key and its criterion, and, for a state other states fall under (a style's genres), which
    ones."""
    out: list[str] = []
    for s in sorted((state(point, k) for k in made(point)), key=lambda s: s.key):
        under = sorted(o.key for o in ROWS if POINT[o.point].under == point and o.under == s.key)
        text = f'`{s.key}`: {s.criterion}' + (f' (genres: {", ".join(under)})' if under else '')
        out.append(textwrap.fill(text, 116, initial_indent=indent + '- ', subsequent_indent=indent + '  '))
    return '\n'.join(out)


def fill(template: str, where: str) -> str:
    """A prompt template with each line {{states:<point>}} replaced by the point's definitions; an unknown point or a
    marker left anywhere else fails."""

    def filled(m: re.Match[str]) -> str:
        if not is_point(name := m[2]):
            raise ValueError(f'{where}: {{{{states:{name}}}}} names no point of pipeline/states.py')
        return definitions(name, m[1])

    text = re.sub(r'^( *)\{\{states:(\w+)\}\}$', filled, template, flags=re.MULTILINE)
    if left := re.findall(r'\{\{.*?\}\}', text):
        raise ValueError(f'{where}: unfilled {left}')
    return text


SITE_POINTS: tuple[PointName, ...] = (
    'ticket',
    'pass_kind',
    'style',
    'people',
    'fee',
    'hotel',
    'pass_source',
    'price',
    'tier_today',
    'card_price',
    'next_change',
    'genre',
    'feature',
    'role',
    'artist_kind',
    'home_basis',
    'listing',
)  # the site's


def ts_module() -> str:
    """site/states.ts: what the site needs of each point it shows, and each state's key by name."""
    rows = {
        p: {
            s.key: {
                'disposition': str(s.disposition),
                'wording': s.wording,
                'forms': dict(s.forms),
                'icon': s.icon,
                'link': s.link and str(s.link),
            }
            for s in of(p)
        }
        for p in SITE_POINTS
    }
    names = {p: {member(k): k for k in keys(p)} for p in SITE_POINTS}
    return (
        '// Written from pipeline/states.py (states.ts_module), which owns every state and its words: edit them '
        'there,\n// then run: mise run generate.\n\n'
        f'export type Disposition = {" | ".join(json.dumps(str(d)) for d in Disposition)};\n'
        '// what the site has of a state: how it is shown, its words and their named forms, its icon, what it links '
        'to\n'
        'export interface StateRow {\n'
        '  readonly disposition: Disposition;\n'
        '  readonly wording: string | null;\n'
        '  readonly forms: Readonly<Record<string, string>>;\n'
        '  readonly icon: string | null;\n'
        '  readonly link: string | null;\n'
        '}\n\n'
        f'export const STATES = {json.dumps(rows, ensure_ascii=False, indent=1)} as const satisfies Readonly<\n'
        '  Record<string, Readonly<Record<string, StateRow>>>\n'
        '>;\n\n'
        "// each state's key by name: KEY.price.PRICED\n"
        f'export const KEY = {json.dumps(names, indent=1)} as const;\n\n'
        '// what a state links to, by name\n'
        f'export const LINK = {json.dumps({member(k): str(k) for k in Link})} as const;\n'
    )


# the code's enums (pipeline/enums.py): each enum's point, and whether it holds only the states the point's own
# producer makes (a schema's enum) rather than all of them; every point has one (Point.enum)
ENUMS = {p.enum: (p.name, False) for p in POINTS} | {'ExtractedFeature': ('feature', True)}


def points_table() -> str:
    """The data points as a Markdown table, for pipeline/STATES.md: what one instance is, its states, its producer."""
    rows = [f'| **{p.name}**, {p.of} | {", ".join(f"`{k}`" for k in KEYS[p.name])} | {p.produced_by} |' for p in POINTS]
    return '\n'.join(['| Data point | States | Produced by |', '| -- | -- | -- |', *rows])  # as mdformat writes it


def enum_keys(name: str) -> list[str]:
    point, own = ENUMS[name]  # by name: the enums are written from the rows, whatever enums.py says yet
    return [s.key for s in BY_POINT[point] if s.made_by is None] if own else list(KEYS[point])


def enums_module() -> str:
    """pipeline/enums.py: each enum of ENUMS as a StrEnum class, its members named by member()."""
    out = [
        (
            '"""The code\'s enums of the states, written from pipeline/states.py (states.enums_module), which owns '
            'every state:'
        ),
        'edit them there, then run: mise run generate."""',
        '',
        'from enum import StrEnum, unique',
        'from typing import Literal',
        '',
        '# every data point of pipeline/states.py, by name',
        'type Point = Literal[',
        *(f'    {p.name!r},' for p in POINTS),
        ']',
    ]
    for name, (point, own) in ENUMS.items():
        what = f'the {point} states its producer makes' if own else f'the {point} states'
        out += ['', '', '@unique', f'class {name}(StrEnum):', f'    """{what}"""', '']
        out += [f'    {member(k)} = {k!r}' for k in enum_keys(name)]
    return '\n'.join(out) + '\n'


STYLE_OF = {s.key: s.under for s in of('genre')}  # the dance style each genre falls under
# what kizomba-world's site tags state: the genres a tag names (a genre's own, or a rule's), and the feature
TAG_GENRES = {t: [s.key] for s in of('genre') for t in s.tags} | {
    t: list(s.genres) for s in of('genre_rule') for t in s.tags
}
TAG_FEATURES = {t: s.key for s in of('feature') for t in s.tags}
