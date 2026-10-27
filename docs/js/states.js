// Written by pipeline/build_site_db.py from pipeline/states.py, which owns every state and its words: edit them there.
export const STATES = {
 "ticket": {
  "in_tier": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  },
  "skipped": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  },
  "unread": {
   "disposition": "waits",
   "wording": "The ticket page has more tickets than shown here",
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "pass_kind": {
  "full": {
   "disposition": "view",
   "wording": "Full pass",
   "forms": {},
   "icon": null,
   "link": null
  },
  "party": {
   "disposition": "view",
   "wording": "Party pass",
   "forms": {},
   "icon": null,
   "link": null
  },
  "day": {
   "disposition": "view",
   "wording": "Day pass",
   "forms": {},
   "icon": null,
   "link": null
  },
  "workshop": {
   "disposition": "view",
   "wording": "Workshop pass",
   "forms": {},
   "icon": null,
   "link": null
  },
  "package": {
   "disposition": "view",
   "wording": "Package",
   "forms": {},
   "icon": null,
   "link": null
  },
  "other": {
   "disposition": "view",
   "wording": "Pass",
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "style": {
  "kizomba": {
   "disposition": "view",
   "wording": "Kizomba",
   "forms": {},
   "icon": null,
   "link": null
  },
  "zouk": {
   "disposition": "view",
   "wording": "Zouk",
   "forms": {},
   "icon": null,
   "link": null
  },
  "bachata": {
   "disposition": "view",
   "wording": "Bachata",
   "forms": {},
   "icon": null,
   "link": null
  },
  "salsa": {
   "disposition": "view",
   "wording": "Salsa",
   "forms": {},
   "icon": null,
   "link": null
  },
  "other": {
   "disposition": "view",
   "wording": "Other style",
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "people": {
  "one": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  },
  "couple": {
   "disposition": "view",
   "wording": "for a couple",
   "forms": {},
   "icon": null,
   "link": null
  },
  "group": {
   "disposition": "view",
   "wording": "for {n}",
   "forms": {},
   "icon": null,
   "link": null
  },
  "per_room": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "fee": {
  "none": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  },
  "included": {
   "disposition": "view",
   "wording": "incl. {fee} fee",
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "hotel": {
  "included": {
   "disposition": "view",
   "wording": "with hotel",
   "forms": {},
   "icon": null,
   "link": null
  },
  "none": {
   "disposition": "view",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
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
   "link": null
  },
  "ticket_page": {
   "disposition": "view",
   "wording": "Prices from the festival’s ticket page, as of {day}.",
   "forms": {
    "reseller": "Prices from {reseller}, a reseller selling at its own prices, as of {day}.",
    "link": "The ticket page"
   },
   "icon": null,
   "link": null
  }
 },
 "price": {
  "priced": {
   "disposition": "card",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  },
  "other_passes_only": {
   "disposition": "note",
   "wording": "No full pass price",
   "forms": {},
   "icon": null,
   "link": "passes"
  },
  "page_unread": {
   "disposition": "note",
   "wording": "Prices on the ticket page",
   "forms": {},
   "icon": null,
   "link": "page"
  },
  "not_yet": {
   "disposition": "note",
   "wording": "Tickets not on sale yet",
   "forms": {},
   "icon": null,
   "link": null
  },
  "offline": {
   "disposition": "note",
   "wording": "Tickets by message or form, no price online",
   "forms": {},
   "icon": null,
   "link": null
  },
  "closed": {
   "disposition": "note",
   "wording": "Ticket sales closed",
   "forms": {},
   "icon": null,
   "link": null
  },
  "none_found": {
   "disposition": "note",
   "wording": "No price published",
   "forms": {},
   "icon": null,
   "link": null
  },
  "not_looked": {
   "disposition": "note",
   "wording": "No price published",
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "tier_today": {
  "now": {
   "disposition": "view",
   "wording": "{price}",
   "forms": {},
   "icon": null,
   "link": null
  },
  "from": {
   "disposition": "view",
   "wording": "from {price}",
   "forms": {},
   "icon": null,
   "link": null
  },
  "next": {
   "disposition": "view",
   "wording": "{price}",
   "forms": {},
   "icon": null,
   "link": null
  },
  "sold_out": {
   "disposition": "view",
   "wording": "sold out",
   "forms": {},
   "icon": null,
   "link": null
  },
  "ended": {
   "disposition": "view",
   "wording": null,
   "forms": {
    "all": "No passes on sale any more."
   },
   "icon": null,
   "link": null
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
   "link": null
  },
  "package": {
   "disposition": "card",
   "wording": "{price} package with hotel",
   "forms": {
    "cost": "Cost {sum}, hotel included"
   },
   "icon": null,
   "link": null
  },
  "sold_out": {
   "disposition": "card",
   "wording": "{pass} sold out",
   "forms": {},
   "icon": null,
   "link": null
  },
  "ended": {
   "disposition": "note",
   "wording": "Prices no longer listed",
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "next_change": {
  "door": {
   "disposition": "card",
   "wording": "price is higher at the door",
   "forms": {
    "then": "then {price} at the door"
   },
   "icon": null,
   "link": null
  },
  "dated": {
   "disposition": "card",
   "wording": "price goes up {day}",
   "forms": {
    "then": "then {price} from {day}"
   },
   "icon": null,
   "link": null
  },
  "later": {
   "disposition": "card",
   "wording": "price goes up later",
   "forms": {
    "then": "then {price} later"
   },
   "icon": null,
   "link": null
  }
 },
 "genre": {
  "kizomba": {
   "disposition": "card",
   "wording": "Kizomba",
   "forms": {},
   "icon": null,
   "link": null
  },
  "semba": {
   "disposition": "card",
   "wording": "Semba",
   "forms": {},
   "icon": null,
   "link": null
  },
  "urbankiz": {
   "disposition": "card",
   "wording": "Urban Kiz",
   "forms": {},
   "icon": null,
   "link": null
  },
  "tarraxo": {
   "disposition": "card",
   "wording": "Tarraxo",
   "forms": {},
   "icon": null,
   "link": null
  },
  "tarraxinha": {
   "disposition": "card",
   "wording": "Tarraxinha",
   "forms": {},
   "icon": null,
   "link": null
  },
  "douceur": {
   "disposition": "card",
   "wording": "Douceur",
   "forms": {},
   "icon": null,
   "link": null
  },
  "kompa": {
   "disposition": "card",
   "wording": "Kompa",
   "forms": {},
   "icon": null,
   "link": null
  },
  "zouk": {
   "disposition": "card",
   "wording": "Zouk",
   "forms": {},
   "icon": null,
   "link": null
  },
  "bachata": {
   "disposition": "card",
   "wording": "Bachata",
   "forms": {},
   "icon": null,
   "link": null
  },
  "salsa": {
   "disposition": "card",
   "wording": "Salsa",
   "forms": {},
   "icon": null,
   "link": null
  },
  "afro": {
   "disposition": "card",
   "wording": "Afro",
   "forms": {},
   "icon": null,
   "link": null
  },
  "reggaeton": {
   "disposition": "card",
   "wording": "Reggaeton",
   "forms": {},
   "icon": null,
   "link": null
  },
  "kuduro": {
   "disposition": "card",
   "wording": "Kuduro",
   "forms": {},
   "icon": null,
   "link": null
  },
  "other": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "feature": {
  "promo_code": {
   "disposition": "card",
   "wording": "Promo code",
   "forms": {},
   "icon": "tag",
   "link": null
  },
  "all_levels_beginners": {
   "disposition": "card",
   "wording": "Beginner-friendly",
   "forms": {},
   "icon": "sprout",
   "link": null
  },
  "taxi_dancers": {
   "disposition": "card",
   "wording": "Taxi dancers",
   "forms": {},
   "icon": "hand-heart",
   "link": null
  },
  "accommodation_included": {
   "disposition": "card",
   "wording": "Hotel package",
   "forms": {},
   "icon": "bed-double",
   "link": null
  },
  "group_deals": {
   "disposition": "card",
   "wording": "Couple & group deals",
   "forms": {},
   "icon": "users",
   "link": "passes"
  },
  "meals_included": {
   "disposition": "card",
   "wording": "Meal package",
   "forms": {},
   "icon": "utensils",
   "link": null
  },
  "transfers_shuttle": {
   "disposition": "card",
   "wording": "Airport shuttle",
   "forms": {},
   "icon": "bus",
   "link": null
  },
  "pool_party": {
   "disposition": "card",
   "wording": "Pool party",
   "forms": {},
   "icon": "waves",
   "link": null
  },
  "beach_party": {
   "disposition": "card",
   "wording": "Beach party",
   "forms": {},
   "icon": "sun",
   "link": null
  },
  "boat_party": {
   "disposition": "card",
   "wording": "Boat party",
   "forms": {},
   "icon": "sailboat",
   "link": null
  },
  "cruise": {
   "disposition": "card",
   "wording": "Cruise",
   "forms": {},
   "icon": "ship",
   "link": null
  },
  "live_music": {
   "disposition": "card",
   "wording": "Live music",
   "forms": {},
   "icon": "music",
   "link": null
  },
  "bootcamp_intensive": {
   "disposition": "card",
   "wording": "Bootcamp",
   "forms": {},
   "icon": "dumbbell",
   "link": null
  },
  "competition": {
   "disposition": "card",
   "wording": "Competition",
   "forms": {},
   "icon": "trophy",
   "link": null
  },
  "camping": {
   "disposition": "card",
   "wording": "Camping",
   "forms": {},
   "icon": "tent",
   "link": null
  },
  "masterclass": {
   "disposition": "view",
   "wording": "Masterclass",
   "forms": {},
   "icon": "graduation-cap",
   "link": null
  },
  "private_classes": {
   "disposition": "view",
   "wording": "Private classes",
   "forms": {},
   "icon": "circle-user",
   "link": null
  },
  "shows": {
   "disposition": "view",
   "wording": "Shows",
   "forms": {},
   "icon": "sparkles",
   "link": null
  },
  "themed_parties": {
   "disposition": "view",
   "wording": "Themed parties",
   "forms": {},
   "icon": "party-popper",
   "link": null
  },
  "pre_party": {
   "disposition": "view",
   "wording": "Pre-party",
   "forms": {},
   "icon": "moon",
   "link": null
  },
  "after_party": {
   "disposition": "view",
   "wording": "After-party",
   "forms": {},
   "icon": "moon",
   "link": null
  },
  "day_socials": {
   "disposition": "view",
   "wording": "Day socials",
   "forms": {},
   "icon": "sunrise",
   "link": null
  },
  "partner_hotel": {
   "disposition": "view",
   "wording": "Partner hotel",
   "forms": {},
   "icon": "hotel",
   "link": null
  },
  "multiple_rooms": {
   "disposition": "view",
   "wording": "Several rooms",
   "forms": {},
   "icon": "door-open",
   "link": null
  },
  "adults_only": {
   "disposition": "view",
   "wording": "18+ only",
   "forms": {},
   "icon": "circle-user",
   "link": null
  },
  "all_in_one": {
   "disposition": "filter",
   "wording": "All-in-one hotel",
   "forms": {},
   "icon": "bed-double",
   "link": null
  },
  "workshops": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  },
  "dress_code": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "role": {
  "teacher": {
   "disposition": "view",
   "wording": "Teachers",
   "forms": {
    "singular": "Teacher",
    "pair": "Teaching couple"
   },
   "icon": null,
   "link": null
  },
  "dj": {
   "disposition": "view",
   "wording": "DJs",
   "forms": {
    "singular": "DJ"
   },
   "icon": null,
   "link": null
  },
  "performer": {
   "disposition": "view",
   "wording": "Performers",
   "forms": {
    "singular": "Performer",
    "pair": "Performing couple"
   },
   "icon": null,
   "link": null
  },
  "mc": {
   "disposition": "view",
   "wording": "MCs",
   "forms": {
    "singular": "MC"
   },
   "icon": null,
   "link": null
  },
  "organiser": {
   "disposition": "view",
   "wording": "Organised by",
   "forms": {
    "singular": "Organiser"
   },
   "icon": null,
   "link": null
  },
  "media": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  },
  "crew": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
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
   "link": null
  },
  "couple": {
   "disposition": "view",
   "wording": "Couples",
   "forms": {
    "singular": "Couple"
   },
   "icon": null,
   "link": null
  },
  "group": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  },
  "organisation": {
   "disposition": "kept",
   "wording": null,
   "forms": {},
   "icon": null,
   "link": null
  }
 },
 "home_basis": {
  "given": {
   "disposition": "view",
   "wording": "Home country added by hand.",
   "forms": {},
   "icon": null,
   "link": null
  },
  "stated": {
   "disposition": "view",
   "wording": "Home country as stated in line-ups.",
   "forms": {},
   "icon": null,
   "link": null
  }
 }
};

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
  "STATED": "stated"
 }
};

// what a state links to, by name
export const LINK = {"PAGE": "page", "PASSES": "passes"};
