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
  icon, link    how the site renders it: its icon (docs/js/icons.js), or a link to the ticket page or the passes view
  under         the state of the point's `under` point it falls under

Importing this module checks every row: a missing or wrong-typed field, an unknown point, two states with one key,
a note or a filter without words, a waiting state without an owner, or an `under` naming no state fails here.

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

from pydantic import ConfigDict
from pydantic.dataclasses import dataclass


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

    def __post_init__(self) -> None:
        object.__setattr__(self, 'forms', types.MappingProxyType(dict(self.forms)))


P, S = Point, State
CARD, VIEW, NOTE, FILTER, KEPT, WAITS = Disposition
PAGE, PASSES = Link

POINTS = (
    P('page_read', 'Status', 'each logged attempt to read a ticket page', 'tickets.attempt'),
    P(
        'sales',
        'Sales',
        'a festival with no full link to its ticket page, as an agent found it (tickets/pages.csv)',
        'tickets.py page --state',
    ),
    P('ticket', 'Ticket', 'each ticket of a read ticket page', 'the first read; tickets.unread_keys'),
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
    P('re_read', 'Recheck', 'a festival with a first read, by when its page is read again', 'tickets.recheck'),
    P('first_read', 'FirstRead', 'a festival, by whether it needs a (new) first read', 'tickets.why_first_read'),
    P('answer', 'AnswerState', "a festival's answer of one extraction pass", 'ask.answer_state'),
    P(
        'waits_for',
        'Waiting',
        'each festival, by what its prices from its ticket page wait for',
        'tickets.waiting, in tickets/status.csv',
    ),
    P('price', 'Price', 'each festival, by what its card can say of its price', 'prices.price_state, in price_status'),
    P('tier_today', 'TierToday', "a pass's price on the day it is viewed", 'pricing.js tierNow'),
    P(
        'card_price',
        'CardPrice',
        'a priced festival, by what its card says on the day it is viewed',
        'pricing.js priceNow',
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
    P('merge_decision', 'MergeDecision', 'each artist merge reviewed', 'the merge review; pipeline/artist_merges.csv'),
    P('pending', 'Pending', 'a festival waiting for its extraction passes', 'scrape'),
    P('plan', 'Plan', 'each plan someone shares (pipeline/plans.csv)', 'pipeline/plans.csv'),
    P(
        'fare_search',
        'FareSearch',
        "a festival weekend's latest flight search (pipeline/fare_jobs.csv)",
        'fares.search',
    ),
    P('next_change', 'NextChange', "a pass's next price change on the day it is viewed", 'pricing.js nextChange'),
    P('hotel', 'Hotel', 'each pass, by whether its price includes a hotel', 'the prices pass; the first read'),
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
        'its answer was asked with another prompt (it is not loaded), or its description changed '
        'since (pending_extraction; it stays loaded until asked again)',
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
        'sales, is over, or an exception says so (pipeline/exceptions.py)',
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
    S('genre', 'kizomba', 'Kizomba (traditional / sensual kizomba)', CARD, 'Kizomba', under='kizomba'),
    S('genre', 'semba', 'Semba', CARD, 'Semba', under='kizomba'),
    S('genre', 'urbankiz', 'Urban Kiz / Urbankiz / Kizomba fusion', CARD, 'Urban Kiz', under='kizomba'),
    S('genre', 'tarraxo', 'Tarraxo', CARD, 'Tarraxo', under='kizomba'),
    S('genre', 'tarraxinha', 'Tarraxinha', CARD, 'Tarraxinha', under='kizomba'),
    S('genre', 'douceur', 'Douceur', CARD, 'Douceur', under='kizomba'),
    S('genre', 'kompa', 'Kompa / Konpa / Kompas', CARD, 'Kompa', under='other'),
    S('genre', 'zouk', 'Zouk (including Brazilian zouk and ghetto zouk)', CARD, 'Zouk', under='zouk'),
    S('genre', 'bachata', 'Bachata (any style)', CARD, 'Bachata', under='bachata'),
    S('genre', 'salsa', 'Salsa (any style)', CARD, 'Salsa', under='salsa'),
    S('genre', 'afro', 'Afro dances: afrobeats, afro house, afro dance', CARD, 'Afro', under='other'),
    S('genre', 'reggaeton', 'Reggaeton', CARD, 'Reggaeton', under='other'),
    S('genre', 'kuduro', 'Kuduro', CARD, 'Kuduro', under='other'),
    S('genre', 'other', 'Any other dance genre; give its name in genre_as_written', KEPT, under='other'),
    S('genre_rule', 'sbk', '"SBK" anywhere in the title or description: salsa, bachata and kizomba', KEPT),
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
    S('feature', 'pool_party', 'A pool party', CARD, 'Pool party', icon='waves'),
    S('feature', 'beach_party', 'A beach party', CARD, 'Beach party', icon='sun'),
    S('feature', 'boat_party', 'A boat party', CARD, 'Boat party', icon='sailboat'),
    S('feature', 'cruise', 'The event takes place on a cruise ship', CARD, 'Cruise', icon='ship'),
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
    ),
    S('role', 'dj', 'DJs', VIEW, 'DJs', forms={'singular': 'DJ'}),
    S(
        'role',
        'performer',
        'Singers, bands, musicians, show dancers and guest dancers who perform rather than teach',
        VIEW,
        'Performers',
        forms={'singular': 'Performer', 'pair': 'Performing couple'},
    ),
    S('role', 'mc', 'MCs, hosts, presenters of the event', VIEW, 'MCs', forms={'singular': 'MC'}),
    S(
        'role',
        'organiser',
        'The school, association, company or person organising the event',
        VIEW,
        'Organised by',
        forms={'singular': 'Organiser'},
    ),
    S('role', 'media', 'Photographers, videographers, media teams', KEPT),
    S('role', 'crew', 'Named teams that serve the dancers: taxi-dancer teams, host teams', KEPT),
    S('artist_kind', 'person', 'one person', VIEW, 'People', forms={'singular': 'Artist'}),
    S('artist_kind', 'couple', 'two people booked together', VIEW, 'Couples', forms={'singular': 'Couple'}),
    S('artist_kind', 'group', 'a band, a dance company or a team', KEPT),
    S('artist_kind', 'organisation', 'a school, an association or a company', KEPT),
    S('home_basis', 'given', 'given in pipeline/artist_countries.csv', VIEW, 'Home country added by hand.'),
    S(
        'home_basis',
        'stated',
        'stated next to their name in a line-up they are booked in',
        VIEW,
        'Home country as stated in line-ups.',
    ),
    S('merge_decision', 'merge', 'two records are one artist', KEPT),
    S('merge_decision', 'separate', 'two records are different artists', KEPT),
    S('merge_decision', 'unsure', 'the review could not tell', WAITS, owner='agent: decide'),
    S('pending', 'new', 'the festival is new', WAITS, owner='the next run'),
    S('pending', 'description changed', 'its description changed', WAITS, owner='the next run'),
    S('plan', 'going', 'they said they are going', VIEW),
    S('fare_search', 'priced', 'Google gave a return for the weekend; its price is in docs/data/fares.csv', KEPT),
    S('fare_search', 'no price', 'Google gave no return, or fli failed or timed out; note says which', KEPT),
    S('fare_search', 'refused', 'Google refused the search twice (HTTP 429); the run stops there', KEPT),
    S(
        'next_change',
        'door',
        'the next tier is the price at the door',
        CARD,
        'price is higher at the door',
        forms={'then': 'then {price} at the door'},
    ),
    S(
        'next_change',
        'dated',
        'the next tier starts on a known day',
        CARD,
        'price goes up {day}',
        forms={'then': 'then {price} from {day}'},
    ),
    S(
        'next_change',
        'later',
        'the next tier starts on a day not known',
        CARD,
        'price goes up later',
        forms={'then': 'then {price} later'},
    ),
    S('hotel', 'included', 'the price includes accommodation', VIEW, 'with hotel'),
    S('hotel', 'none', 'the price includes no accommodation', VIEW),
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


check(POINTS, ROWS)
POINT = {p.name: p for p in POINTS}
BY_POINT = {p.name: tuple(s for s in ROWS if s.point == p.name) for p in POINTS}
KEYS = {p: tuple(s.key for s in rows) for p, rows in BY_POINT.items()}
BY_KEY = {(s.point, s.key): s for s in ROWS}


def of(point: str) -> tuple[State, ...]:
    """The point's states, in table order."""
    if point not in BY_POINT:
        raise KeyError(f'no point {point!r} in pipeline/states.py')
    return BY_POINT[point]


def keys(point: str) -> tuple[str, ...]:
    of(point)
    return KEYS[point]


def made(point: str) -> list[str]:
    """The keys of the point's states that its own producer makes (not those another step adds, made_by)."""
    return [s.key for s in of(point) if s.made_by is None]


def state(point: str, key: str) -> State:
    of(point)
    if found := BY_KEY.get((point, key)):
        return found
    raise not_a_state(point, key)


def not_a_state(point: str, value: str, where: str | None = None) -> LookupError:
    """The error for a value that is no state of its point, naming the point, its producer and what to do."""
    return LookupError(
        f'{point} {value!r}' + (f' in {where}' if where else '') + f' (produced by '
        f'{POINT[point].produced_by}) is no state in pipeline/states.py: add a row for it there'
    )


def member(key: str) -> str:
    """A state's name in code: its key in capitals, any other character an underscore."""
    return re.sub(r'\W', '_', key).upper()


def total[K: str, V](point: str, mapping: dict[K, V], where: str) -> dict[K, V]:
    """mapping, once it has a value for every state of the point and for nothing else."""
    if missing := [k for k in keys(point) if k not in mapping]:
        raise LookupError(f'{where}: no value for the {point} states {missing} (pipeline/states.py)')
    if extra := [k for k in mapping if k not in keys(point)]:
        raise LookupError(f'{where}: {extra} are no {point} states (pipeline/states.py)')
    return mapping


def sql_in(point: str, keys_: Iterable[str] | None = None) -> str:
    """The point's keys (or these of them) as an SQL list, for a CHECK (... IN (...))."""
    return ', '.join("'" + state(point, k).key.replace("'", "''") + "'" for k in (keys_ or keys(point)))


def definitions(point: str, indent: str = '') -> str:
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
    text = re.sub(r'^( *)\{\{states:(\w+)\}\}$', lambda m: definitions(m[2], m[1]), template, flags=re.MULTILINE)
    if left := re.findall(r'\{\{.*?\}\}', text):
        raise ValueError(f'{where}: unfilled {left}')
    return text


SITE_POINTS = (
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
)  # the site's


def js_module() -> str:
    """docs/js/states.js: what the site needs of each point it shows, and each state's key by name."""
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
        '// Written by pipeline/build_site_db.py from pipeline/states.py, which owns every state and its words: '
        'edit them there.\n'
        f'export const STATES = {json.dumps(rows, ensure_ascii=False, indent=1)};\n\n'
        "// each state's key by name: KEY.price.PRICED\n"
        f'export const KEY = {json.dumps(names, indent=1)};\n\n'
        '// what a state links to, by name\n'
        f'export const LINK = {json.dumps({member(k): str(k) for k in Link})};\n'
    )


# the code's enums (pipeline/enums.py): each enum's point, and whether it holds only the states the point's own
# producer makes (a schema's enum) rather than all of them; every point has one (Point.enum)
ENUMS = {p.enum: (p.name, False) for p in POINTS} | {'ExtractedFeature': ('feature', True)}


def points_table() -> str:
    """The data points as a Markdown table, for pipeline/STATES.md: what one instance is, its states, its producer."""
    rows = [f'| **{p.name}**, {p.of} | {", ".join(f"`{k}`" for k in keys(p.name))} | {p.produced_by} |' for p in POINTS]
    return '\n'.join(['| Data point | States | Produced by |', '|---|---|---|', *rows])


def enum_keys(name: str) -> list[str]:
    point, own = ENUMS[name]
    return made(point) if own else list(keys(point))


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
    ]
    for name, (point, own) in ENUMS.items():
        what = f'the {point} states its producer makes' if own else f'the {point} states'
        out += ['', '', '@unique', f'class {name}(StrEnum):', f'    """{what}"""', '']
        out += [f'    {member(k)} = {k!r}' for k in enum_keys(name)]
    return '\n'.join(out) + '\n'


STYLE_OF = {s.key: s.under for s in of('genre')}  # the dance style each genre falls under
