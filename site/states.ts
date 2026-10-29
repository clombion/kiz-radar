// Written from pipeline/states.py (states.ts_module), which owns every state and its words: edit them there,
// then run: mise run generate.

export type Disposition = "card" | "view" | "note" | "filter" | "kept" | "waits";
export type Counts = "lineup" | "booking" | "present";
// what the site has of a state: how it is shown, its words and their named forms, its icon, what it links to
export interface StateRow {
  readonly disposition: Disposition;
  readonly wording: string | null;
  readonly forms: Readonly<Record<string, string>>;
  readonly icon: string | null;
  readonly link: string | null;
  readonly counts: Counts | null;
}

export const STATES = {
 "ticket": {
  "in_tier": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "skipped": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "unread": {
   "disposition": "waits",
   "wording": "The ticket page has more tickets than shown here",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "pass_kind": {
  "full": {
   "disposition": "view",
   "wording": "Full pass",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "party": {
   "disposition": "view",
   "wording": "Party pass",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "day": {
   "disposition": "view",
   "wording": "Day pass",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "workshop": {
   "disposition": "view",
   "wording": "Workshop pass",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "package": {
   "disposition": "view",
   "wording": "Package",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "other": {
   "disposition": "view",
   "wording": "Pass",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "style": {
  "kizomba": {
   "disposition": "view",
   "wording": "Kizomba",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "zouk": {
   "disposition": "view",
   "wording": "Zouk",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "bachata": {
   "disposition": "view",
   "wording": "Bachata",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "salsa": {
   "disposition": "view",
   "wording": "Salsa",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "other": {
   "disposition": "view",
   "wording": "Other style",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "people": {
  "one": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "couple": {
   "disposition": "view",
   "wording": "for a couple",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "group": {
   "disposition": "view",
   "wording": "for {n}",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "per_room": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "fee": {
  "none": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "included": {
   "disposition": "view",
   "wording": "incl. {fee} fee",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "hotel": {
  "included": {
   "disposition": "view",
   "wording": "with hotel",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "none": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "pass_source": {
  "description": {
   "disposition": "view",
   "wording": "Prices as the festival lists them.",
   "forms": {
    "link": "The festival on kizomba-world"
   },
   "icon": null,
   "link": null,
   "counts": null
  },
  "ticket_page": {
   "disposition": "view",
   "wording": "Prices from the festival’s ticket page, as of {day}.",
   "forms": {
    "reseller": "Prices from {reseller}, a reseller selling at its own prices, as of {day}.",
    "link": "The ticket page"
   },
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "price": {
  "priced": {
   "disposition": "card",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "other_passes_only": {
   "disposition": "note",
   "wording": "No full pass price",
   "forms": {},
   "icon": null,
   "link": "passes",
   "counts": null
  },
  "page_unread": {
   "disposition": "note",
   "wording": "Prices on the ticket page",
   "forms": {},
   "icon": null,
   "link": "page",
   "counts": null
  },
  "page_empty": {
   "disposition": "note",
   "wording": "No tickets listed yet",
   "forms": {},
   "icon": null,
   "link": "page",
   "counts": null
  },
  "not_yet": {
   "disposition": "note",
   "wording": "Tickets not on sale yet",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "offline": {
   "disposition": "note",
   "wording": "Tickets by message or form, no price online",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "closed": {
   "disposition": "note",
   "wording": "Ticket sales closed",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "none_found": {
   "disposition": "note",
   "wording": "No price published",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "not_looked": {
   "disposition": "note",
   "wording": "No price published",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "tier_today": {
  "now": {
   "disposition": "view",
   "wording": "{price}",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "from": {
   "disposition": "view",
   "wording": "from {price}",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "next": {
   "disposition": "view",
   "wording": "{price}",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "sold_out": {
   "disposition": "view",
   "wording": "sold out",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "ended": {
   "disposition": "view",
   "wording": null,
   "forms": {
    "all": "No passes on sale any more."
   },
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "card_price": {
  "full_pass": {
   "disposition": "card",
   "wording": "{price} full pass",
   "forms": {
    "cost": "Cost {sum}, without accommodation"
   },
   "icon": null,
   "link": null,
   "counts": null
  },
  "package": {
   "disposition": "card",
   "wording": "{price} package with hotel",
   "forms": {
    "cost": "Cost {sum}, hotel included"
   },
   "icon": null,
   "link": null,
   "counts": null
  },
  "sold_out": {
   "disposition": "card",
   "wording": "{pass} sold out",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "ended": {
   "disposition": "note",
   "wording": "Prices no longer listed",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "next_change": {
  "door": {
   "disposition": "card",
   "wording": "price is higher at the door",
   "forms": {
    "after": "then {price} at the door"
   },
   "icon": null,
   "link": null,
   "counts": null
  },
  "dated": {
   "disposition": "card",
   "wording": "price goes up {day}",
   "forms": {
    "after": "then {price} from {day}"
   },
   "icon": null,
   "link": null,
   "counts": null
  },
  "later": {
   "disposition": "card",
   "wording": "price goes up later",
   "forms": {
    "after": "then {price} later"
   },
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "genre": {
  "kizomba": {
   "disposition": "card",
   "wording": "Kizomba",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "semba": {
   "disposition": "card",
   "wording": "Semba",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "urbankiz": {
   "disposition": "card",
   "wording": "Urban Kiz",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "tarraxo": {
   "disposition": "card",
   "wording": "Tarraxo",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "tarraxinha": {
   "disposition": "card",
   "wording": "Tarraxinha",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "douceur": {
   "disposition": "card",
   "wording": "Douceur",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "kompa": {
   "disposition": "card",
   "wording": "Kompa",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "zouk": {
   "disposition": "card",
   "wording": "Zouk",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "bachata": {
   "disposition": "card",
   "wording": "Bachata",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "salsa": {
   "disposition": "card",
   "wording": "Salsa",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "afro": {
   "disposition": "card",
   "wording": "Afro",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "reggaeton": {
   "disposition": "card",
   "wording": "Reggaeton",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "kuduro": {
   "disposition": "card",
   "wording": "Kuduro",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "other": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "feature": {
  "promo_code": {
   "disposition": "card",
   "wording": "Promo code",
   "forms": {},
   "icon": "tag",
   "link": null,
   "counts": null
  },
  "all_levels_beginners": {
   "disposition": "card",
   "wording": "Beginner-friendly",
   "forms": {},
   "icon": "sprout",
   "link": null,
   "counts": null
  },
  "taxi_dancers": {
   "disposition": "card",
   "wording": "Taxi dancers",
   "forms": {},
   "icon": "hand-heart",
   "link": null,
   "counts": null
  },
  "accommodation_included": {
   "disposition": "card",
   "wording": "Hotel package",
   "forms": {},
   "icon": "bed-double",
   "link": null,
   "counts": null
  },
  "group_deals": {
   "disposition": "card",
   "wording": "Couple & group deals",
   "forms": {},
   "icon": "users",
   "link": "passes",
   "counts": null
  },
  "meals_included": {
   "disposition": "card",
   "wording": "Meal package",
   "forms": {},
   "icon": "utensils",
   "link": null,
   "counts": null
  },
  "transfers_shuttle": {
   "disposition": "card",
   "wording": "Airport shuttle",
   "forms": {},
   "icon": "bus",
   "link": null,
   "counts": null
  },
  "pool_party": {
   "disposition": "card",
   "wording": "Pool party",
   "forms": {},
   "icon": "waves",
   "link": null,
   "counts": null
  },
  "beach_party": {
   "disposition": "card",
   "wording": "Beach party",
   "forms": {},
   "icon": "sun",
   "link": null,
   "counts": null
  },
  "boat_party": {
   "disposition": "card",
   "wording": "Boat party",
   "forms": {},
   "icon": "sailboat",
   "link": null,
   "counts": null
  },
  "cruise": {
   "disposition": "card",
   "wording": "Cruise",
   "forms": {},
   "icon": "ship",
   "link": null,
   "counts": null
  },
  "live_music": {
   "disposition": "card",
   "wording": "Live music",
   "forms": {},
   "icon": "music",
   "link": null,
   "counts": null
  },
  "bootcamp_intensive": {
   "disposition": "card",
   "wording": "Bootcamp",
   "forms": {},
   "icon": "dumbbell",
   "link": null,
   "counts": null
  },
  "competition": {
   "disposition": "card",
   "wording": "Competition",
   "forms": {},
   "icon": "trophy",
   "link": null,
   "counts": null
  },
  "camping": {
   "disposition": "card",
   "wording": "Camping",
   "forms": {},
   "icon": "tent",
   "link": null,
   "counts": null
  },
  "masterclass": {
   "disposition": "view",
   "wording": "Masterclass",
   "forms": {},
   "icon": "graduation-cap",
   "link": null,
   "counts": null
  },
  "private_classes": {
   "disposition": "view",
   "wording": "Private classes",
   "forms": {},
   "icon": "circle-user",
   "link": null,
   "counts": null
  },
  "shows": {
   "disposition": "view",
   "wording": "Shows",
   "forms": {},
   "icon": "sparkles",
   "link": null,
   "counts": null
  },
  "themed_parties": {
   "disposition": "view",
   "wording": "Themed parties",
   "forms": {},
   "icon": "party-popper",
   "link": null,
   "counts": null
  },
  "pre_party": {
   "disposition": "view",
   "wording": "Pre-party",
   "forms": {},
   "icon": "moon",
   "link": null,
   "counts": null
  },
  "after_party": {
   "disposition": "view",
   "wording": "After-party",
   "forms": {},
   "icon": "moon",
   "link": null,
   "counts": null
  },
  "day_socials": {
   "disposition": "view",
   "wording": "Day socials",
   "forms": {},
   "icon": "sunrise",
   "link": null,
   "counts": null
  },
  "partner_hotel": {
   "disposition": "view",
   "wording": "Partner hotel",
   "forms": {},
   "icon": "hotel",
   "link": null,
   "counts": null
  },
  "multiple_rooms": {
   "disposition": "view",
   "wording": "Several rooms",
   "forms": {},
   "icon": "door-open",
   "link": null,
   "counts": null
  },
  "adults_only": {
   "disposition": "view",
   "wording": "18+ only",
   "forms": {},
   "icon": "circle-user",
   "link": null,
   "counts": null
  },
  "all_in_one": {
   "disposition": "filter",
   "wording": "All-in-one hotel",
   "forms": {},
   "icon": "bed-double",
   "link": null,
   "counts": null
  },
  "workshops": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "dress_code": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "role": {
  "teacher": {
   "disposition": "view",
   "wording": "Teachers",
   "forms": {
    "singular": "Teacher",
    "pair": "Teaching couple",
    "doing": "teaching"
   },
   "icon": null,
   "link": null,
   "counts": "lineup"
  },
  "dj": {
   "disposition": "view",
   "wording": "DJs",
   "forms": {
    "singular": "DJ",
    "doing": "playing"
   },
   "icon": null,
   "link": null,
   "counts": "lineup"
  },
  "performer": {
   "disposition": "view",
   "wording": "Performers",
   "forms": {
    "singular": "Performer",
    "pair": "Performing couple",
    "doing": "performing"
   },
   "icon": null,
   "link": null,
   "counts": "booking"
  },
  "mc": {
   "disposition": "view",
   "wording": "MCs",
   "forms": {
    "singular": "MC",
    "doing": "hosting"
   },
   "icon": null,
   "link": null,
   "counts": "booking"
  },
  "organiser": {
   "disposition": "view",
   "wording": "Organised by",
   "forms": {
    "singular": "Organiser"
   },
   "icon": null,
   "link": null,
   "counts": null
  },
  "media": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": "present"
  },
  "crew": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": "present"
  }
 },
 "artist_kind": {
  "person": {
   "disposition": "view",
   "wording": "People",
   "forms": {
    "singular": "Artist"
   },
   "icon": null,
   "link": null,
   "counts": null
  },
  "couple": {
   "disposition": "view",
   "wording": "Couples",
   "forms": {
    "singular": "Couple"
   },
   "icon": null,
   "link": null,
   "counts": null
  },
  "group": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "organisation": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "home_basis": {
  "given": {
   "disposition": "view",
   "wording": "Home country added by hand.",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "stated": {
   "disposition": "view",
   "wording": "Home country as stated in line-ups.",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "contested": {
   "disposition": "view",
   "wording": "Line-ups name several countries for them, none more often.",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "listing": {
  "listed": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "gone": {
   "disposition": "card",
   "wording": "This festival is no longer listed.",
   "forms": {
    "search": "· no longer listed"
   },
   "icon": null,
   "link": null,
   "counts": null
  }
 },
 "phase": {
  "ahead": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "ended": {
   "disposition": "card",
   "wording": "This festival has taken place.",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "cancelled": {
   "disposition": "card",
   "wording": "This festival was cancelled.",
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  },
  "gone": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null,
   "counts": null
  }
 }
} as const satisfies Readonly<
  Record<string, Readonly<Record<string, StateRow>>>
>;

// each state's key by name: KEY.price.PRICED
export const KEY = {
 "ticket": {
  "IN_TIER": "in_tier",
  "SKIPPED": "skipped",
  "UNREAD": "unread"
 },
 "pass_kind": {
  "FULL": "full",
  "PARTY": "party",
  "DAY": "day",
  "WORKSHOP": "workshop",
  "PACKAGE": "package",
  "OTHER": "other"
 },
 "style": {
  "KIZOMBA": "kizomba",
  "ZOUK": "zouk",
  "BACHATA": "bachata",
  "SALSA": "salsa",
  "OTHER": "other"
 },
 "people": {
  "ONE": "one",
  "COUPLE": "couple",
  "GROUP": "group",
  "PER_ROOM": "per_room"
 },
 "fee": {
  "NONE": "none",
  "INCLUDED": "included"
 },
 "hotel": {
  "INCLUDED": "included",
  "NONE": "none"
 },
 "pass_source": {
  "DESCRIPTION": "description",
  "TICKET_PAGE": "ticket_page"
 },
 "price": {
  "PRICED": "priced",
  "OTHER_PASSES_ONLY": "other_passes_only",
  "PAGE_UNREAD": "page_unread",
  "PAGE_EMPTY": "page_empty",
  "NOT_YET": "not_yet",
  "OFFLINE": "offline",
  "CLOSED": "closed",
  "NONE_FOUND": "none_found",
  "NOT_LOOKED": "not_looked"
 },
 "tier_today": {
  "NOW": "now",
  "FROM": "from",
  "NEXT": "next",
  "SOLD_OUT": "sold_out",
  "ENDED": "ended"
 },
 "card_price": {
  "FULL_PASS": "full_pass",
  "PACKAGE": "package",
  "SOLD_OUT": "sold_out",
  "ENDED": "ended"
 },
 "next_change": {
  "DOOR": "door",
  "DATED": "dated",
  "LATER": "later"
 },
 "genre": {
  "KIZOMBA": "kizomba",
  "SEMBA": "semba",
  "URBANKIZ": "urbankiz",
  "TARRAXO": "tarraxo",
  "TARRAXINHA": "tarraxinha",
  "DOUCEUR": "douceur",
  "KOMPA": "kompa",
  "ZOUK": "zouk",
  "BACHATA": "bachata",
  "SALSA": "salsa",
  "AFRO": "afro",
  "REGGAETON": "reggaeton",
  "KUDURO": "kuduro",
  "OTHER": "other"
 },
 "feature": {
  "PROMO_CODE": "promo_code",
  "ALL_LEVELS_BEGINNERS": "all_levels_beginners",
  "TAXI_DANCERS": "taxi_dancers",
  "ACCOMMODATION_INCLUDED": "accommodation_included",
  "GROUP_DEALS": "group_deals",
  "MEALS_INCLUDED": "meals_included",
  "TRANSFERS_SHUTTLE": "transfers_shuttle",
  "POOL_PARTY": "pool_party",
  "BEACH_PARTY": "beach_party",
  "BOAT_PARTY": "boat_party",
  "CRUISE": "cruise",
  "LIVE_MUSIC": "live_music",
  "BOOTCAMP_INTENSIVE": "bootcamp_intensive",
  "COMPETITION": "competition",
  "CAMPING": "camping",
  "MASTERCLASS": "masterclass",
  "PRIVATE_CLASSES": "private_classes",
  "SHOWS": "shows",
  "THEMED_PARTIES": "themed_parties",
  "PRE_PARTY": "pre_party",
  "AFTER_PARTY": "after_party",
  "DAY_SOCIALS": "day_socials",
  "PARTNER_HOTEL": "partner_hotel",
  "MULTIPLE_ROOMS": "multiple_rooms",
  "ADULTS_ONLY": "adults_only",
  "ALL_IN_ONE": "all_in_one",
  "WORKSHOPS": "workshops",
  "DRESS_CODE": "dress_code"
 },
 "role": {
  "TEACHER": "teacher",
  "DJ": "dj",
  "PERFORMER": "performer",
  "MC": "mc",
  "ORGANISER": "organiser",
  "MEDIA": "media",
  "CREW": "crew"
 },
 "artist_kind": {
  "PERSON": "person",
  "COUPLE": "couple",
  "GROUP": "group",
  "ORGANISATION": "organisation"
 },
 "home_basis": {
  "GIVEN": "given",
  "STATED": "stated",
  "CONTESTED": "contested"
 },
 "listing": {
  "LISTED": "listed",
  "GONE": "gone"
 },
 "phase": {
  "AHEAD": "ahead",
  "ENDED": "ended",
  "CANCELLED": "cancelled",
  "GONE": "gone"
 }
} as const;

// what a state links to, by name
export const LINK = {"PAGE": "page", "PASSES": "passes"} as const;
