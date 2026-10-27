"""Load the saved answers of the extraction passes (pipeline/extract/answers) into the source DB.

Creates (replacing any previous load):
  feature_definitions   feature -> definition, from pipeline/states.py
  event_features        one row per (event, feature, source): source 'description' rows come from the
                        extraction (with quote, rationale, prompt, model); source 'site_tag' rows
                        come from the site's own tags for the features the site also tags
  artist_mentions       every artist mention exactly as extracted, with provenance
  genre_definitions     genre -> definition, from pipeline/states.py
  role_definitions      artist role -> definition, from pipeline/states.py (the roles artist_mentions uses)
  event_genres          one row per (event, genre, source): 'description' rows from the rooms-genres
                        pass (with the words used and a quote) or from a rule, 'site_tag' rows from the site's style
                        tags
  event_rooms           per event: stated number of party rooms and class rooms, with quotes
  event_room_list       rooms the description describes one by one, with their genres
  event_passes          the passes a festival sells, from the prices pass, and pass_tiers their prices tier
                        by tier; event_price_notes the price rules the tiers can't hold. A festival in
                        pipeline/ticket_pages.csv takes its passes from its ticket page instead
                        (pipeline/pass_prices.csv, written by pipeline/tickets.py)
  ticket_pages          per festival read on its ticket page: the page, the day it was last read, how many of its
                        tickets are not read yet
  price_status          per festival, what its card can say of its price (pipeline/states.py, price) and the pass
                        it prices, from its passes and pipeline/tickets/status.csv

Each festival's newest answer of each pass, and each ticket page's prices, are loaded when they were asked with the
current prompt (pipeline/prompt.py); one to another prompt waits to be asked again, and answers for festivals no
longer in the DB are left out. Every column holding a state checks it against pipeline/states.py. The load is one
transaction: a value a check refuses leaves the database as it was.

Usage: python3 -m pipeline.extract.load_extract source/<events>.sqlite
"""

import argparse
import csv
import json
import re
import sqlite3
import sys
import unicodedata

from pipeline import db as sqlite_db, prompt as prompts, states
from pipeline.extract import answers, prices as price_rules, run_log
from pipeline.extract.prices import on_date
from pipeline.states import Sales
from pipeline.kizomba_world import TAG_FEATURES, TAG_GENRES

PAGE_PRICES = run_log.HERE.parent / "pass_prices.csv"
TICKET_PAGES = run_log.HERE.parent / "ticket_pages.csv"
STATUS = run_log.HERE.parent / "tickets" / "status.csv"     # how each festival sells, and its known ticket page

# Whole-word genre names recognised in event titles (brand spellings like "AfroKiz" or "Kizz" do not match)
TITLE_GENRES = {
    "kizomba": r"\bkizomba\b",
    "semba": r"\bsemba\b",
    "urbankiz": r"\burban\s*kiz\b",
    "tarraxo": r"\btarraxo\b",
    "tarraxinha": r"\btarraxinha\b",
    "kompa": r"\bk[o]n?mpa\b|\bkonpa\b",
    "zouk": r"\bzouk\b",
    "bachata": r"\bbachata\b",
    "salsa": r"\bsalsa\b",
}

SCHEMA = """
BEGIN;
DROP VIEW IF EXISTS artist_events;
DROP TABLE IF EXISTS event_artists;
DROP TABLE IF EXISTS feature_definitions;
DROP TABLE IF EXISTS event_features;
DROP TABLE IF EXISTS artist_mentions;
DROP TABLE IF EXISTS genre_definitions;
DROP TABLE IF EXISTS role_definitions;
DROP TABLE IF EXISTS event_genres;
DROP TABLE IF EXISTS event_rooms;
DROP TABLE IF EXISTS event_room_list;
DROP TABLE IF EXISTS event_passes;
DROP TABLE IF EXISTS pass_tiers;
DROP TABLE IF EXISTS event_price_notes;
DROP TABLE IF EXISTS ticket_pages;
DROP TABLE IF EXISTS ticket_sales;
DROP TABLE IF EXISTS price_status;
CREATE TABLE event_passes (
    event_id INTEGER NOT NULL REFERENCES events(id),
    pass_no INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ({pass_kind})),
    style TEXT CHECK (style IN ({style})),  -- the one dance style the pass is
                                  -- limited to; NULL = all the festival's styles
    label TEXT,                   -- the pass's name or heading as written, when its price lines don't name it
    group_size INTEGER,           -- people one price is for; NULL = not stated (a package per room)
    people TEXT NOT NULL CHECK (people IN ({people})),   -- group_size as a state (prices.people)
    days INTEGER,                 -- NULL = not stated
    includes_hotel INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ({pass_source})),   -- ticket_page: see ticket_pages
    prompt TEXT NOT NULL,         -- the hash of the prices prompt, or for a ticket page the first read's
    model TEXT,                   -- the model that answered; for a ticket page, who made its first read
    PRIMARY KEY (event_id, pass_no)
);
CREATE TABLE pass_tiers (
    event_id INTEGER NOT NULL,
    pass_no INTEGER NOT NULL,
    tier_no INTEGER NOT NULL,     -- in the order the description lists them
    amount REAL NOT NULL,         -- what a buyer pays, fee included
    currency TEXT NOT NULL,       -- ISO 4217
    fee REAL,                     -- the booking fee amount includes, when the source states one
    alt_amount REAL,              -- the same price in a second currency, when the line gives one
    alt_currency TEXT CHECK ((alt_amount IS NULL) = (alt_currency IS NULL)),
    valid_from TEXT,              -- YYYY-MM-DD; NULL = not stated
    valid_until TEXT,
    dates_as_answered TEXT,       -- from/until as answered, when a date had no year (MM-DD) and got one here
    quantity INTEGER,             -- tickets at this price, when limited
    door INTEGER NOT NULL,        -- the price at the door; never from a ticket page, which sells online
    sold_out INTEGER NOT NULL,
    current INTEGER NOT NULL,     -- called the current price; valid_from is then when the description was edited
    quote TEXT NOT NULL,
    PRIMARY KEY (event_id, pass_no, tier_no),
    FOREIGN KEY (event_id, pass_no) REFERENCES event_passes(event_id, pass_no)
);
CREATE TABLE event_price_notes (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    notes TEXT NOT NULL           -- the description's words, one rule per line
);
CREATE TABLE price_status (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    price TEXT NOT NULL CHECK (price IN ({price})),
    page TEXT,                    -- the ticket page, when one is known
    card_pass INTEGER,            -- the pass a card prices (prices.card_pass), exactly when it is priced
    CHECK ((price = 'priced') = (card_pass IS NOT NULL)),
    FOREIGN KEY (event_id, card_pass) REFERENCES event_passes(event_id, pass_no)
);
CREATE TABLE ticket_pages (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    page TEXT NOT NULL,           -- the ticket page the festival links to
    reseller TEXT,                -- the reseller selling there at its own prices (Kizzbee), when it isn't the organiser
    read_on TEXT NOT NULL,        -- the day its prices were last read there
    recipe TEXT NOT NULL,         -- the site recipe that read it (pipeline/tickets/sites), with its version
    unread INTEGER NOT NULL       -- tickets on the page its first read doesn't know yet
);
CREATE TABLE role_definitions (
    role TEXT PRIMARY KEY,
    definition TEXT NOT NULL
);
CREATE TABLE genre_definitions (
    genre TEXT PRIMARY KEY,
    definition TEXT NOT NULL
);
CREATE TABLE event_genres (
    event_id INTEGER NOT NULL REFERENCES events(id),
    genre TEXT NOT NULL CHECK (genre IN ({genre})),
    source TEXT NOT NULL CHECK (source IN ({source})),
    other_name TEXT NOT NULL DEFAULT '',  -- for genre 'other', its name in lower case; '' otherwise
    genre_as_written TEXT,
    quote TEXT,
    prompt TEXT,                  -- the hash of the rooms-genres prompt; NULL for a rule's or a tag's row
    rule TEXT CHECK (rule IN ({genre_rule})),   -- the rule that added it
    model TEXT,
    -- a description's genre comes from the pass (its prompt) or a rule, a tag's from neither
    CHECK (CASE source WHEN 'description' THEN (prompt IS NULL) <> (rule IS NULL)
                       ELSE prompt IS NULL AND rule IS NULL END),
    PRIMARY KEY (event_id, genre, source, other_name)
);
CREATE TABLE event_rooms (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    party_rooms INTEGER,          -- NULL = not stated
    party_rooms_quote TEXT,
    class_rooms INTEGER,          -- NULL = not stated
    class_rooms_quote TEXT,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL
);
CREATE TABLE event_room_list (
    event_id INTEGER NOT NULL REFERENCES events(id),
    room_no INTEGER NOT NULL,
    name_as_written TEXT,
    kind TEXT NOT NULL CHECK (kind IN ({room_kind})),
    genres TEXT NOT NULL,         -- JSON array of genres
    quote TEXT NOT NULL,
    PRIMARY KEY (event_id, room_no)
);
CREATE TABLE feature_definitions (
    feature TEXT PRIMARY KEY,
    definition TEXT NOT NULL
);
CREATE TABLE event_features (
    event_id INTEGER NOT NULL REFERENCES events(id),
    feature TEXT NOT NULL CHECK (feature IN ({feature})),
    source TEXT NOT NULL CHECK (source IN ({source})),
    quote TEXT,
    rationale TEXT,
    prompt TEXT,
    model TEXT,
    PRIMARY KEY (event_id, feature, source)
);
CREATE TABLE artist_mentions (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    role TEXT NOT NULL CHECK (role IN ({role})),
    name_as_written TEXT NOT NULL,
    style TEXT,
    country TEXT,
    source_line TEXT NOT NULL,
    batch TEXT NOT NULL,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL
);
CREATE INDEX artist_mentions_event ON artist_mentions(event_id);
"""
SCHEMA = SCHEMA.format_map({p.name: states.sql_in(p.name) for p in states.POINTS})


TABLE_DOCS = {
    "artist_mentions": "Every artist, couple, group or organiser named in an event description, exactly as written, with "
                       "role, style, stated country, the line it came from, and the prompt and model that extracted it. "
                       "event_artists links each mention to its resolved artist.",
    "event_features": "Event features (all-in-one hotel, competition, workshops, pool party, ...), one row per event, feature "
                      "and source: 'description' rows carry the supporting quote and rationale; 'site_tag' rows mirror the "
                      "site's own tags for the features it also tags. feature_definitions defines each feature.",
    "feature_definitions": "What each feature in event_features means.",
    "role_definitions": "What each artist role in artist_mentions and event_artists means.",
    "event_genres": "Dance genres each event covers, one row per event, genre and source: 'description' rows (quote, "
                    "prompt, or the rule that added it) and 'site_tag' rows from the site's style tags. "
                    "genre_definitions defines each genre.",
    "genre_definitions": "What each genre in event_genres and event_room_list means.",
    "event_rooms": "Per event, the stated number of party rooms and of class rooms (NULL = not stated), with quotes.",
    "event_room_list": "Rooms a description lists one by one, with their kind (party / class) and genres (JSON array).",
    "event_passes": "The passes each festival sells (kind), the one dance style a pass is limited to at a festival of "
                    "several, how many people one price is for (group_size, and people as a state), its days, and whether "
                    "it includes a hotel. pass_tiers holds the prices. source "
                    "is 'description', or 'ticket_page' when its prices were read on its ticket page (see "
                    "ticket_pages), which replaces what its description gives. The states each column can hold are "
                    "pipeline/states.py's.",
    "pass_tiers": "Each pass's prices tier by tier: what a buyer pays, fee included (fee: the booking fee it "
                  "includes, when stated), with currency, the dates each tier applies (a date written without a "
                  "year gets the latest year not after the festival's start), tickets at that price, door price, sold "
                  "out, and the quote it came from.",
    "price_status": "What each festival's card can say of its price (pipeline/states.py, price): priced, with the "
                    "pass it prices (card_pass), or why not, from its passes and how it sells "
                    "(pipeline/tickets/status.csv), with its ticket page when one is known.",
    "ticket_pages": "Festivals whose prices are read on their ticket page (pipeline/tickets.py): the page, the "
                    "reseller selling there at its own prices when it isn't the organiser, the day it was last read, "
                    "the site recipe that read it, and how many of its tickets are not read yet.",
    "event_price_notes": "Price rules a festival states that the tiers can't hold (\"Prices exclude ticketing fees\", "
                         "\"the price rises €10 every month\").",
}


def performed_by(answers: dict) -> str:
    """'20 batches by Claude Code subagent, one batch; 3 festivals by pipeline/extract/ask.py' and the like."""
    by: dict[str, set] = {}
    for a in answers.values():
        by.setdefault(a.answered_by, set()).add(a.file)
    return "; ".join(f"{len(fs)} answer files by {who}" for who, fs in sorted(by.items()))


def page_prices(event_ids: set[int]) -> tuple[dict[int, tuple[dict, dict]], int]:
    """(prices read from festivals' ticket pages, written by pipeline/tickets.py: {event_id: (entry shaped like a
    prices answer, the festival's ticket_pages.csv row)}, how many are to another first-read prompt). In
    pass_prices.csv (one row per tier, in order) a pass is the rows with one pass_no; the price notes are
    ticket_pages.csv's, one per line. A page read to another prompt is left out, as an answer is."""
    with TICKET_PAGES.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        if int(r["event_id"]) not in event_ids:
            sys.exit(f"ticket_pages.csv: no festival {r['event_id']} ({r['event']})")
    out = {int(r["event_id"]): ({"event_id": int(r["event_id"]), "passes": [], "rule_quotes": r["notes"].splitlines()}, r)
           for r in rows if prompts.is_current("first_read", r["prompt"])}
    with PAGE_PRICES.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if int(r["event_id"]) not in out:
                continue
            entry, _ = out[int(r["event_id"])]
            if len(entry["passes"]) < int(r["pass_no"]):
                entry["passes"].append({"kind": r["kind"], "style": r["style"] or None,
                                        "label_quote": r["label"] or None,
                                        "group_size": int(r["group_size"]) if r["group_size"] else None,
                                        "days": int(r["days"]) if r["days"] else None,
                                        "includes_hotel": r["includes_hotel"] == "1", "tiers": []})
            entry["passes"][-1]["tiers"].append({
                "amount": float(r["amount"]), "currency": r["currency"], "fee": float(r["fee"]) if r["fee"] else None,
                "alt": {"amount": float(r["alt_amount"]), "currency": r["alt_currency"]} if r["alt_amount"] else None,
                "from": r["from"] or None, "until": r["until"] or None,
                "quantity": int(r["quantity"]) if r["quantity"] else None,
                "door": False, "sold_out": r["sold_out"] == "1", "current": False,   # a page sells online, what is on sale
                "quote": r["quote"]})
    return out, len(rows) - len(out)


def current(pass_name: str, event_ids: set[int]) -> tuple[dict, int]:
    """(the festivals' answers of the pass to its current prompt, how many answers are to another): one to another
    prompt means something else, so it waits to be asked again."""
    have = answers.latest(pass_name, event_ids)
    now = {e: a for e, a in have.items() if prompts.is_current(pass_name, a.prompt)}
    return now, len(have) - len(now)


def status() -> dict[int, tuple[Sales | None, str | None]]:
    """tickets/status.csv by festival: (how an agent found it sells, None when none did; its known ticket page)."""
    with STATUS.open(encoding="utf-8") as f:
        return {int(r["event_id"]): (Sales(r["sales"]) if r["sales"] else None, r["page"] or None)
                for r in csv.DictReader(f)}


def load_prices(con: sqlite3.Connection, described: dict, pages: dict, sold: dict) -> None:
    """Each festival's passes: from its ticket page when ticket_pages.csv has it, else from its description; and what
    its card can say of its price, and the pass it prices, from them and how it sells (sold: status())."""
    dates = {i: (start, edited) for i, start, edited in con.execute("SELECT id, start_date, modified_at FROM events")}
    rows = [(a.entry, "description", a.prompt, a.model) for e, a in described.items() if e not in pages]
    rows += [(entry, "ticket_page", page["prompt"], page["read_by"]) for entry, page in pages.values()]
    con.executemany("INSERT INTO ticket_pages VALUES (?, ?, ?, ?, ?, ?)",
                    [(e, p["page"], p["reseller"] or None, p["read_on"], p["recipe"], int(p["unread"]))
                     for e, (_, p) in pages.items()])
    passes = {}
    for ev, source, prompt, model in rows:
        start, edited = dates[ev["event_id"]]
        passes[ev["event_id"]] = ev["passes"]
        if ev["rule_quotes"]:
            con.execute("INSERT INTO event_price_notes VALUES (?, ?)", (ev["event_id"], "\n".join(ev["rule_quotes"])))
        for p, ps in enumerate(ev["passes"], 1):
            con.execute("INSERT INTO event_passes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (ev["event_id"], p, ps["kind"], ps["style"], ps["label_quote"], ps["group_size"],
                         price_rules.people(ps), ps["days"], int(ps["includes_hotel"]), source, prompt, model))
            for t, tier in enumerate(ps["tiers"], 1):
                frm, until = on_date(tier["from"], start), on_date(tier["until"], start)
                if tier["current"] and frm is None:
                    frm = edited[:10]
                yearless = any(v and len(v) == 5 for v in (tier["from"], tier["until"]))
                con.execute(
                    "INSERT INTO pass_tiers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (ev["event_id"], p, t, tier["amount"], tier["currency"], tier["fee"],
                     *((tier["alt"]["amount"], tier["alt"]["currency"]) if tier["alt"] else (None, None)),
                     frm, until, json.dumps({"from": tier["from"], "until": tier["until"]}) if yearless else None,
                     tier["quantity"], int(tier["door"]), int(tier["sold_out"]), int(tier["current"]), tier["quote"]))
    rows = []
    for e in dates:
        sales, page = sold.get(e, (None, None))
        card = price_rules.card_pass(passes.get(e, []))
        rows.append((e, price_rules.price_state(passes.get(e, []), sales, page), page,
                     None if card is None else card + 1))
    con.executemany("INSERT INTO price_status VALUES (?, ?, ?, ?)", rows)


def record_steps(con: sqlite3.Connection, extract: dict, rooms_genres: dict, prices: dict, pages: dict) -> None:
    run_log.document(con, TABLE_DOCS, "pipeline/extract/load_extract.py")
    q = lambda sql: con.execute(sql).fetchone()[0]
    passes = [
        ("3_extract", extract,
         "Extract, from each event description, the named artists (name as written, role, style, country, source "
         "line) and the event features (with a supporting quote and a rationale). Every name and quote is checked "
         "word for word against the description before loading.",
         "tables artist_mentions, event_features (source 'description')",
         {"artist_mentions": q("SELECT count(*) FROM artist_mentions"),
          "feature_rows_kept": q("SELECT count(*) FROM event_features WHERE source = 'description'"),
          "features_defined": q("SELECT count(*) FROM feature_definitions")}),
        ("4_rooms_genres", rooms_genres,
         "Extract, from each event description, the stated number of party and class rooms, the rooms described "
         "one by one, and the dance genres covered, each with a supporting quote checked word for word.",
         "tables event_rooms, event_room_list, event_genres (source 'description')",
         {"events_with_party_room_count": q("SELECT count(party_rooms) FROM event_rooms"),
          "events_with_class_room_count": q("SELECT count(class_rooms) FROM event_rooms"),
          "rooms_listed": q("SELECT count(*) FROM event_room_list"),
          "genre_rows": q("SELECT count(*) FROM event_genres WHERE source = 'description' AND rule IS NULL")}),
        ("4b_prices", prices,
         "Extract, from each event description, the passes it sells and their prices tier by tier, each price "
         "checked against its quote; dates without a year get the latest year not after the festival's start. "
         "Festivals read on their ticket page (pipeline/tickets.py) take their passes from there.",
         "tables event_passes, pass_tiers, event_price_notes, ticket_pages, price_status",
         {"festivals_with_prices": q("SELECT count(DISTINCT event_id) FROM event_passes"),
          "festivals_from_ticket_pages": q("SELECT count(*) FROM ticket_pages"),
          "passes": q("SELECT count(*) FROM event_passes"), "tiers": q("SELECT count(*) FROM pass_tiers")}),
    ]
    read_with = {page["prompt"] for _, page in pages.values()}
    for step, got, what, outputs, numbers in passes:
        if not got:
            run_log.forget(con, step)       # none to the current prompt yet: the step's rows are gone
            continue
        hashes = sorted({a.prompt for a in got.values()} | (read_with if step == "4b_prices" else set()))
        for h in hashes:
            run_log.record_prompt(con, h)
        times = sorted({a.answered_at for a in got.values()})
        files = {a.file for a in got.values()}
        run_log.record(
            con, step, what, performed_by(got),
            performed_at=times[-1], model=", ".join(sorted({a.model for a in got.values()})),
            prompt=", ".join(hashes),
            inputs="pipeline/prompts/asked/<prompt>.md; event descriptions",
            outputs=outputs,
            details={"answer_files": len(files), "festivals": len(got), "first_answer": times[0],
                     "last_answer": times[-1], **numbers},
        )
    run_log.record(
        con, "5_genre_rules",
        "Add genres the rooms-genres pass applied unevenly: 'SBK' anywhere in a title or description means salsa, "
        "bachata and kizomba (rule sbk); a genre named as a whole word in the title counts (rule title). Rows the "
        "pass already had are kept as they were.",
        "pipeline/extract/load_extract.py",
        outputs="table event_genres (rule 'sbk' / 'title')",
        details={"rule_sbk_rows": q("SELECT count(*) FROM event_genres WHERE rule = 'sbk'"),
                 "rule_title_rows": q("SELECT count(*) FROM event_genres WHERE rule = 'title'"),
                 "site_tag_genre_rows": q("SELECT count(*) FROM event_genres WHERE source = 'site_tag'"),
                 "site_tag_feature_rows": q("SELECT count(*) FROM event_features WHERE source = 'site_tag'")},
    )


def main() -> None:
    ap = argparse.ArgumentParser(description='Load the saved answers of the extraction passes into the source DB.')
    sqlite_db.source_arg(ap)
    db_path = ap.parse_args().src
    con = sqlite_db.connect(db_path, 'rw')
    event_ids = {i for i, in con.execute("SELECT id FROM events")}
    loaded = {}
    for pass_name in prompts.PASSES:
        loaded[pass_name], stale = current(pass_name, event_ids)
        if stale:
            print(f"{stale} festivals' {pass_name} answers were asked with another prompt; left out until asked again")
    extract, rooms_genres, prices = loaded["extract"], loaded["rooms_genres"], loaded["prices"]
    pages, stale = page_prices(event_ids)
    if stale:
        print(f"{stale} festivals' ticket pages were read with another first-read prompt; left out until read again")
    con.executescript(SCHEMA)
    for point in ("feature", "genre", "role"):
        con.executemany(f"INSERT INTO {point}_definitions VALUES (?, ?)", [(s.key, s.criterion) for s in states.of(point)])

    for a in rooms_genres.values():
        ev, prompt, model = a.entry, a.prompt, a.model
        pr, cr = ev["party_rooms"] or {}, ev["class_rooms"] or {}
        con.execute(
            "INSERT INTO event_rooms VALUES (?, ?, ?, ?, ?, ?, ?)",
            (ev["event_id"], pr.get("count"), pr.get("quote"), cr.get("count"), cr.get("quote"), prompt, model),
        )
        con.executemany(
            "INSERT INTO event_room_list VALUES (?, ?, ?, ?, ?, ?)",
            [
                (ev["event_id"], n, r["name_as_written"], r["kind"], json.dumps(sorted(set(r["genres"]))), r["quote"])
                for n, r in enumerate(ev["rooms"], 1)
            ],
        )
        con.executemany(
            "INSERT INTO event_genres (event_id, genre, source, other_name, genre_as_written, quote, prompt, model)"
            " VALUES (?, ?, 'description', ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
            [
                (ev["event_id"], g["genre"],
                 " ".join(g["genre_as_written"].split()).casefold() if g["genre"] == "other" else "",
                 g["genre_as_written"], g["quote"], prompt, model)
                for g in ev["genres"]
            ],
        )
    # "SBK" names salsa, bachata and kizomba together; the rooms-genres pass does not expand it consistently
    sbk_rows = []
    for eid, title, desc in con.execute("SELECT id, title, description_text FROM events"):
        text = f"{title}\n{desc or ''}"
        if m := re.search(r"[^\n]{0,60}\bSBK\b[^\n]{0,60}", text):
            sbk_rows += [(eid, g, "SBK", m.group(0).strip(), "sbk") for g in ("salsa", "bachata", "kizomba")]
    con.executemany(
        "INSERT INTO event_genres (event_id, genre, source, genre_as_written, quote, rule)"
        " VALUES (?, ?, 'description', ?, ?, ?) ON CONFLICT DO NOTHING", sbk_rows
    )
    # A genre named in the title counts; batches of the rooms-genres pass applied this unevenly
    title_rows = []
    for eid, title in con.execute("SELECT id, title FROM events"):
        plain = unicodedata.normalize("NFKC", title)
        for genre, pattern in TITLE_GENRES.items():
            if m := re.search(pattern, plain, re.I):
                title_rows.append((eid, genre, m.group(0), title, "title"))
    con.executemany(
        "INSERT INTO event_genres (event_id, genre, source, genre_as_written, quote, rule)"
        " VALUES (?, ?, 'description', ?, ?, ?) ON CONFLICT DO NOTHING", title_rows
    )
    con.executemany(
        "INSERT INTO event_genres (event_id, genre, source) VALUES (?, ?, 'site_tag') ON CONFLICT DO NOTHING",
        [
            (eid, genre)
            for eid, tag in con.execute("SELECT event_id, tag FROM event_tags")
            for genre in TAG_GENRES.get(tag, [])
        ],
    )

    for a in extract.values():
        ev, prompt, model = a.entry, a.prompt, a.model
        con.executemany(
            "INSERT INTO event_features VALUES (?, ?, 'description', ?, ?, ?, ?) ON CONFLICT DO NOTHING",
            [(ev["event_id"], x["feature"], x["quote"], x["rationale"], prompt, model) for x in ev["features"]],
        )
        con.executemany(
            "INSERT INTO artist_mentions (event_id, role, name_as_written, style, country, source_line,"
            " batch, prompt, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (ev["event_id"], a_["role"], a_["name_as_written"], a_["style"], a_["country"],
                 a_["source_line"], a.batch, prompt, model)
                for a_ in ev["artists"]
            ],
        )

    con.executemany(
        "INSERT INTO event_features (event_id, feature, source) VALUES (?, ?, 'site_tag') ON CONFLICT DO NOTHING",
        [
            (eid, TAG_FEATURES[tag])
            for eid, tag in con.execute("SELECT event_id, tag FROM event_tags")
            if tag in TAG_FEATURES
        ],
    )
    load_prices(con, prices, pages, status())
    record_steps(con, extract, rooms_genres, prices, pages)
    con.commit()
    for table in ("event_features", "artist_mentions", "event_genres", "event_rooms", "event_room_list", "event_passes",
                  "pass_tiers", "ticket_pages", "price_status"):
        print(table, con.execute(f"SELECT count(*) FROM {table}").fetchone()[0])


if __name__ == "__main__":
    main()
