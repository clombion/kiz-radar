"""The code's enums of the states, written from pipeline/states.py (states.enums_module), which owns every state:
edit them there, then run: mise run generate."""

from enum import StrEnum, unique


@unique
class Status(StrEnum):
    """the page_read states"""

    READ = 'read'
    REFUSED = 'refused'
    LAYOUT_BROKEN = 'layout_broken'


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
    AWAITS_ANSWER = 'awaits_answer'
    CURRENT = 'current'
    REDO_PROMPT = 'redo_prompt'
    REDO_DESCRIPTION = 'redo_description'
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
class Pending(StrEnum):
    """the pending states"""

    NEW = 'new'
    DESCRIPTION_CHANGED = 'description changed'


@unique
class Listing(StrEnum):
    """the listing states"""

    LISTED = 'listed'
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
class FareSearch(StrEnum):
    """the fare_search states"""

    PRICED = 'priced'
    NO_PRICE = 'no price'
    REFUSED = 'refused'


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
