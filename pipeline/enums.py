"""The code's enums of the states, written from pipeline/states.py (states.enums_module), which owns every state:
edit them there, then run: mise run generate."""

from enum import StrEnum, unique
from typing import Literal

# every data point of pipeline/states.py, by name
type Point = Literal[
    'page_read',
    'call_cause',
    'sales',
    'ticket',
    'skip_reason',
    'pass_kind',
    'style',
    'people',
    'fee',
    're_read',
    'first_read',
    'answer',
    'waits_for',
    'price',
    'tier_today',
    'card_price',
    'genre',
    'genre_rule',
    'source',
    'pass_source',
    'room_kind',
    'feature',
    'role',
    'artist_kind',
    'home_basis',
    'merge_decision',
    'merge_reason',
    'suggestion_countries',
    'suggestion_calendar',
    'via',
    'listing',
    'phase',
    'event_source',
    'plan',
    'next_change',
    'hotel',
    'claim_source',
    'claim',
    'model',
]


@unique
class Status(StrEnum):
    """the page_read states"""

    READ = 'read'
    REFUSED = 'refused'
    EMPTY = 'empty'
    UNREACHABLE = 'unreachable'
    LAYOUT_BROKEN = 'layout_broken'


@unique
class CallCause(StrEnum):
    """the call_cause states"""

    CHECKER = 'checker'
    TRUNCATED = 'truncated'
    TRANSIENT = 'transient'
    STRUCTURAL = 'structural'
    BUDGET = 'budget'


@unique
class Sales(StrEnum):
    """the sales states"""

    SHOP = 'shop'
    NOT_YET = 'not_yet'
    OFFLINE = 'offline'
    CLOSED = 'closed'
    NONE_FOUND = 'none_found'


@unique
class Ticket(StrEnum):
    """the ticket states"""

    IN_TIER = 'in_tier'
    SKIPPED = 'skipped'
    UNREAD = 'unread'


@unique
class SkipReason(StrEnum):
    """the skip_reason states"""

    ROOM = 'room'
    CLASS = 'class'
    COMPETITION = 'competition'
    MERCHANDISE = 'merchandise'
    FOOD_DRINK = 'food_drink'
    EXCURSION = 'excursion'
    FEE = 'fee'
    DEPOSIT = 'deposit'
    DISCOUNT = 'discount'
    DONATION = 'donation'
    NOT_PUBLIC = 'not_public'
    NO_AMOUNT = 'no_amount'


@unique
class PassKind(StrEnum):
    """the pass_kind states"""

    FULL = 'full'
    PARTY = 'party'
    DAY = 'day'
    WORKSHOP = 'workshop'
    PACKAGE = 'package'
    OTHER = 'other'


@unique
class Style(StrEnum):
    """the style states"""

    KIZOMBA = 'kizomba'
    ZOUK = 'zouk'
    BACHATA = 'bachata'
    SALSA = 'salsa'
    OTHER = 'other'


@unique
class People(StrEnum):
    """the people states"""

    ONE = 'one'
    COUPLE = 'couple'
    GROUP = 'group'
    PER_ROOM = 'per_room'


@unique
class Fee(StrEnum):
    """the fee states"""

    NONE = 'none'
    INCLUDED = 'included'


@unique
class Recheck(StrEnum):
    """the re_read states"""

    DATED = 'dated'
    MONTHLY = 'monthly'


@unique
class FirstRead(StrEnum):
    """the first_read states"""

    NOT_NEEDED = 'not_needed'
    NONE = 'none'
    PAST = 'past'
    AWAITS_ANSWER = 'awaits_answer'
    CURRENT = 'current'
    REDO_PROMPT = 'redo_prompt'
    REDO_DESCRIPTION = 'redo_description'
    REDO_FESTIVAL = 'redo_festival'
    REDO_PAGE = 'redo_page'
    REDO_UNREAD = 'redo_unread'
    DISPUTED = 'disputed'


@unique
class AnswerState(StrEnum):
    """the answer states"""

    NONE = 'none'
    CURRENT = 'current'
    STALE = 'stale'


@unique
class Waiting(StrEnum):
    """the waits_for states"""

    PAGE = 'page'
    RECIPE = 'recipe'
    RECIPE_FIX = 'recipe_fix'
    SESSION = 'session'
    AGENT = 'agent'
    SALES_OPEN = 'sales_open'
    NOTHING = 'nothing'


@unique
class Price(StrEnum):
    """the price states"""

    PRICED = 'priced'
    OTHER_PASSES_ONLY = 'other_passes_only'
    PAGE_UNREAD = 'page_unread'
    PAGE_EMPTY = 'page_empty'
    NOT_YET = 'not_yet'
    OFFLINE = 'offline'
    CLOSED = 'closed'
    NONE_FOUND = 'none_found'
    NOT_LOOKED = 'not_looked'


@unique
class TierToday(StrEnum):
    """the tier_today states"""

    NOW = 'now'
    FROM = 'from'
    NEXT = 'next'
    SOLD_OUT = 'sold_out'
    ENDED = 'ended'


@unique
class CardPrice(StrEnum):
    """the card_price states"""

    FULL_PASS = 'full_pass'
    PACKAGE = 'package'
    SOLD_OUT = 'sold_out'
    ENDED = 'ended'


@unique
class Genre(StrEnum):
    """the genre states"""

    KIZOMBA = 'kizomba'
    SEMBA = 'semba'
    URBANKIZ = 'urbankiz'
    TARRAXO = 'tarraxo'
    TARRAXINHA = 'tarraxinha'
    DOUCEUR = 'douceur'
    KOMPA = 'kompa'
    ZOUK = 'zouk'
    BACHATA = 'bachata'
    SALSA = 'salsa'
    AFRO = 'afro'
    REGGAETON = 'reggaeton'
    KUDURO = 'kuduro'
    OTHER = 'other'


@unique
class GenreRule(StrEnum):
    """the genre_rule states"""

    SBK = 'sbk'
    TITLE = 'title'


@unique
class Source(StrEnum):
    """the source states"""

    DESCRIPTION = 'description'
    SITE_TAG = 'site_tag'


@unique
class PassSource(StrEnum):
    """the pass_source states"""

    DESCRIPTION = 'description'
    TICKET_PAGE = 'ticket_page'


@unique
class RoomKind(StrEnum):
    """the room_kind states"""

    PARTY = 'party'
    CLASS = 'class'
    UNSPECIFIED = 'unspecified'


@unique
class Feature(StrEnum):
    """the feature states"""

    PROMO_CODE = 'promo_code'
    ALL_LEVELS_BEGINNERS = 'all_levels_beginners'
    TAXI_DANCERS = 'taxi_dancers'
    ACCOMMODATION_INCLUDED = 'accommodation_included'
    GROUP_DEALS = 'group_deals'
    MEALS_INCLUDED = 'meals_included'
    TRANSFERS_SHUTTLE = 'transfers_shuttle'
    POOL_PARTY = 'pool_party'
    BEACH_PARTY = 'beach_party'
    BOAT_PARTY = 'boat_party'
    CRUISE = 'cruise'
    LIVE_MUSIC = 'live_music'
    BOOTCAMP_INTENSIVE = 'bootcamp_intensive'
    COMPETITION = 'competition'
    CAMPING = 'camping'
    MASTERCLASS = 'masterclass'
    PRIVATE_CLASSES = 'private_classes'
    SHOWS = 'shows'
    THEMED_PARTIES = 'themed_parties'
    PRE_PARTY = 'pre_party'
    AFTER_PARTY = 'after_party'
    DAY_SOCIALS = 'day_socials'
    PARTNER_HOTEL = 'partner_hotel'
    MULTIPLE_ROOMS = 'multiple_rooms'
    ADULTS_ONLY = 'adults_only'
    ALL_IN_ONE = 'all_in_one'
    WORKSHOPS = 'workshops'
    DRESS_CODE = 'dress_code'


@unique
class Role(StrEnum):
    """the role states"""

    TEACHER = 'teacher'
    DJ = 'dj'
    PERFORMER = 'performer'
    MC = 'mc'
    ORGANISER = 'organiser'
    MEDIA = 'media'
    CREW = 'crew'


@unique
class ArtistKind(StrEnum):
    """the artist_kind states"""

    PERSON = 'person'
    COUPLE = 'couple'
    GROUP = 'group'
    ORGANISATION = 'organisation'


@unique
class HomeBasis(StrEnum):
    """the home_basis states"""

    GIVEN = 'given'
    STATED = 'stated'
    CONTESTED = 'contested'


@unique
class MergeDecision(StrEnum):
    """the merge_decision states"""

    MERGE = 'merge'
    SEPARATE = 'separate'
    UNSURE = 'unsure'


@unique
class MergeReason(StrEnum):
    """the merge_reason states"""

    SAME_NAME__DIFFERENT_KEYS = 'same name, different keys'
    FIRST_WORDS_OF_THE_OTHER = 'first words of the other'
    SAME_PARTNER__SHORTENED_NAME = 'same partner, shortened name'
    SIMILAR_SPELLING = 'similar spelling'
    SINGLE_NAME__SEVERAL_COUNTRIES = 'single name, several countries'
    COUPLES_WITH_MATCHING_NAMES = 'couples with matching names'


@unique
class SuggestionCountries(StrEnum):
    """the suggestion_countries states"""

    UNKNOWN = 'unknown'
    SAME = 'same'
    DIFFERENT = 'different'


@unique
class SuggestionCalendar(StrEnum):
    """the suggestion_calendar states"""

    SAME_LINE_UP = 'same line-up'
    CLASH = 'clash'
    SHARED_CIRCUIT = 'shared circuit'
    NO_CLASH = 'no clash'


@unique
class Via(StrEnum):
    """the via states"""

    DIRECT = 'direct'
    MEMBER = 'member'


@unique
class Listing(StrEnum):
    """the listing states"""

    LISTED = 'listed'
    GONE = 'gone'


@unique
class Phase(StrEnum):
    """the phase states"""

    AHEAD = 'ahead'
    ENDED = 'ended'
    CANCELLED = 'cancelled'
    GONE = 'gone'


@unique
class EventSource(StrEnum):
    """the event_source states"""

    KIZOMBA_WORLD = 'kizomba-world'


@unique
class Plan(StrEnum):
    """the plan states"""

    GOING = 'going'


@unique
class NextChange(StrEnum):
    """the next_change states"""

    DOOR = 'door'
    DATED = 'dated'
    LATER = 'later'


@unique
class Hotel(StrEnum):
    """the hotel states"""

    INCLUDED = 'included'
    NONE = 'none'


@unique
class ClaimSource(StrEnum):
    """the claim_source states"""

    ADMIN = 'admin'
    ORGANISER = 'organiser'
    MODEL = 'model'


@unique
class ClaimState(StrEnum):
    """the claim states"""

    APPLIED = 'applied'
    OVERRIDDEN = 'overridden'
    ORPHANED = 'orphaned'


@unique
class Model(StrEnum):
    """the model states"""

    CLAUDE_FABLE_5_1 = 'claude-fable-5-1'
    CLAUDE_OPUS_5_5 = 'claude-opus-5-5'
    CLAUDE_SONNET_5_5 = 'claude-sonnet-5-5'
    CLAUDE_HAIKU_5_5 = 'claude-haiku-5-5'


@unique
class ExtractedFeature(StrEnum):
    """the feature states its producer makes"""

    ALL_LEVELS_BEGINNERS = 'all_levels_beginners'
    TAXI_DANCERS = 'taxi_dancers'
    ACCOMMODATION_INCLUDED = 'accommodation_included'
    MEALS_INCLUDED = 'meals_included'
    TRANSFERS_SHUTTLE = 'transfers_shuttle'
    POOL_PARTY = 'pool_party'
    BEACH_PARTY = 'beach_party'
    BOAT_PARTY = 'boat_party'
    CRUISE = 'cruise'
    LIVE_MUSIC = 'live_music'
    BOOTCAMP_INTENSIVE = 'bootcamp_intensive'
    COMPETITION = 'competition'
    CAMPING = 'camping'
    MASTERCLASS = 'masterclass'
    PRIVATE_CLASSES = 'private_classes'
    SHOWS = 'shows'
    THEMED_PARTIES = 'themed_parties'
    PRE_PARTY = 'pre_party'
    AFTER_PARTY = 'after_party'
    DAY_SOCIALS = 'day_socials'
    PARTNER_HOTEL = 'partner_hotel'
    MULTIPLE_ROOMS = 'multiple_rooms'
    ADULTS_ONLY = 'adults_only'
    ALL_IN_ONE = 'all_in_one'
    WORKSHOPS = 'workshops'
    DRESS_CODE = 'dress_code'
