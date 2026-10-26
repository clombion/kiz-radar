"""Load the saved answers of the extraction passes (pipeline/extract/answers) into the source DB.

Creates (replacing any previous load):
  feature_definitions   feature -> definition, from pipeline/extract/vocab.json
  event_features        one row per (event, feature, source): source 'description' rows come from the
                        extraction (with quote, rationale, prompt version, model); source 'site_tag' rows
                        come from the site's own tags for the features the site also tags. Only features
                        defined in pipeline/extract/vocab.json are loaded, so a feature dropped from the vocabulary
                        is dropped from the database without re-running the extraction.
  artist_mentions       every artist mention exactly as extracted, with provenance
  genre_definitions     genre -> definition, from pipeline/extract/vocab.json
  role_definitions      artist role -> definition, from pipeline/extract/vocab.json (the roles artist_mentions uses)
  event_genres          one row per (event, genre, source): 'description' rows from the rooms-genres
                        pass (with the words used and a quote), 'site_tag' rows from the site's style tags
  event_rooms           per event: stated number of party rooms and class rooms, with quotes
  event_room_list       rooms the description describes one by one, with their genres
  event_passes          the passes a festival sells, from the prices pass, and pass_tiers their prices tier
                        by tier; event_price_notes the price rules the tiers can't hold. A festival in
                        pipeline/pass_prices.csv (prices read from its ticket page) takes its passes from there.

Each festival's newest answer is loaded (see answers.py); answers for festivals no longer in the DB are left out.

Usage: python3 pipeline/extract/load_extract.py source/<events>.sqlite
"""

import csv
import json
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import run_log
from answers import latest
from prices import on_date
sys.path.insert(0, str(Path(__file__).parent.parent))
from kizomba_world import TAG_FEATURES, TAG_GENRES

VOCAB = run_log.HERE / "vocab.json"
PAGE_PRICES = run_log.HERE.parent / "pass_prices.csv"

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
CREATE TABLE event_passes (
    event_id INTEGER NOT NULL REFERENCES events(id),
    pass_no INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('full', 'party', 'day', 'workshop', 'package', 'other')),
    label TEXT,                   -- the pass's name or heading as written, when its price lines don't name it
    group_size INTEGER,           -- people one price is for; NULL = not stated (a package per room)
    days INTEGER,                 -- NULL = not stated
    includes_hotel INTEGER NOT NULL,
    source TEXT NOT NULL,         -- 'description', or the ticket page the prices were read from (pipeline/pass_prices.csv)
    checked_on TEXT,              -- for a ticket page: the day it was read
    prompt_version TEXT,          -- for 'description': the prices prompt
    model TEXT,                   -- the model that answered; for a ticket page, who read it (pass_prices.csv read_by)
    PRIMARY KEY (event_id, pass_no)
);
CREATE TABLE pass_tiers (
    event_id INTEGER NOT NULL,
    pass_no INTEGER NOT NULL,
    tier_no INTEGER NOT NULL,     -- in the order the description lists them
    amount REAL NOT NULL,
    currency TEXT NOT NULL,       -- ISO 4217
    alt_amount REAL,              -- the same price in a second currency, when the line gives one
    alt_currency TEXT,
    valid_from TEXT,              -- YYYY-MM-DD; NULL = not stated
    valid_until TEXT,
    dates_as_answered TEXT,       -- from/until as answered, when a date had no year (MM-DD) and got one here
    quantity INTEGER,             -- tickets at this price, when limited
    door INTEGER NOT NULL,
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
    genre TEXT NOT NULL REFERENCES genre_definitions(genre),
    source TEXT NOT NULL CHECK (source IN ('description', 'site_tag')),
    other_name TEXT NOT NULL DEFAULT '',  -- for genre 'other', its name in lower case; '' otherwise
    genre_as_written TEXT,
    quote TEXT,
    prompt_version TEXT,
    model TEXT,
    PRIMARY KEY (event_id, genre, source, other_name)
);
CREATE TABLE event_rooms (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    party_rooms INTEGER,          -- NULL = not stated
    party_rooms_quote TEXT,
    class_rooms INTEGER,          -- NULL = not stated
    class_rooms_quote TEXT,
    prompt_version TEXT NOT NULL,
    model TEXT NOT NULL
);
CREATE TABLE event_room_list (
    event_id INTEGER NOT NULL REFERENCES events(id),
    room_no INTEGER NOT NULL,
    name_as_written TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('party', 'class', 'unspecified')),
    genres TEXT NOT NULL,         -- JSON array of vocabulary genres
    quote TEXT NOT NULL,
    PRIMARY KEY (event_id, room_no)
);
CREATE TABLE feature_definitions (
    feature TEXT PRIMARY KEY,
    definition TEXT NOT NULL
);
CREATE TABLE event_features (
    event_id INTEGER NOT NULL REFERENCES events(id),
    feature TEXT NOT NULL REFERENCES feature_definitions(feature),
    source TEXT NOT NULL CHECK (source IN ('description', 'site_tag')),
    quote TEXT,
    rationale TEXT,
    prompt_version TEXT,
    model TEXT,
    PRIMARY KEY (event_id, feature, source)
);
CREATE TABLE artist_mentions (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    role TEXT NOT NULL,
    name_as_written TEXT NOT NULL,
    style TEXT,
    country TEXT,
    source_line TEXT NOT NULL,
    batch TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    model TEXT NOT NULL
);
CREATE INDEX artist_mentions_event ON artist_mentions(event_id);
"""


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
                    "prompt_version; 'rule:sbk' and 'rule:title' rows come from fixed rules) and 'site_tag' rows from the "
                    "site's style tags. genre_definitions defines each genre.",
    "genre_definitions": "What each genre in event_genres and event_room_list means.",
    "event_rooms": "Per event, the stated number of party rooms and of class rooms (NULL = not stated), with quotes.",
    "event_room_list": "Rooms a description lists one by one, with their kind (party / class) and genres (JSON array).",
    "event_passes": "The passes each festival sells (full, party, day, workshop, package, other), with how many people "
                    "one price is for, its days and whether it includes a hotel. pass_tiers holds the prices. source "
                    "is 'description', or the festival's ticket page when its prices were read there "
                    "(pipeline/pass_prices.csv), which replaces what its description gives.",
    "pass_tiers": "Each pass's prices tier by tier, with currency, the dates each tier applies (a date written without a "
                  "year gets the latest year not after the festival's start), tickets at that price, door price, sold "
                  "out, and the quote it came from.",
    "event_price_notes": "Price rules a festival states that the tiers can't hold (\"+ £3 admin fee\", \"the price rises "
                         "€10 every month\").",
}


def performed_by(answers: dict) -> str:
    """'20 batches by Claude Code subagent, one batch; 3 festivals by pipeline/extract/ask.py' and the like."""
    by: dict[str, set] = {}
    for a in answers.values():
        by.setdefault(a.answered_by, set()).add(a.file)
    return "; ".join(f"{len(fs)} answer files by {who}" for who, fs in sorted(by.items()))


def page_prices(event_ids: set[int]) -> dict[int, tuple[dict, str, str, str]]:
    """Prices read from festivals' ticket pages (pipeline/pass_prices.csv, one row per tier, written by
    pipeline/tickets.py), shaped like a prices answer: {event_id: (entry, the page, the day it was read, who read it)}.
    A pass is the run of rows with the same kind, label and people."""
    out = {}
    with PAGE_PRICES.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            e = int(r["event_id"])
            if e not in event_ids:
                sys.exit(f"pass_prices.csv: no festival {e} ({r['event']})")
            entry, *_ = out.setdefault(e, ({"event_id": e, "passes": [], "rule_quotes": []}, r["source_url"], r["checked_on"],
                                           r["read_by"]))
            key = (r["kind"], r["label"], r["group_size"], r["days"], r["includes_hotel"])
            if not entry["passes"] or entry["passes"][-1]["key"] != key:
                entry["passes"].append({"key": key, "kind": r["kind"], "label_quote": r["label"] or None,
                                        "group_size": int(r["group_size"]) if r["group_size"] else None,
                                        "days": int(r["days"]) if r["days"] else None,
                                        "includes_hotel": r["includes_hotel"] == "1", "tiers": []})
            entry["passes"][-1]["tiers"].append({
                "amount": float(r["amount"]), "currency": r["currency"],
                "alt_amount": float(r["alt_amount"]) if r["alt_amount"] else None, "alt_currency": r["alt_currency"] or None,
                "from": r["from"] or None, "until": r["until"] or None,
                "quantity": int(r["quantity"]) if r["quantity"] else None, "door": r["door"] == "1",
                "sold_out": r["sold_out"] == "1", "current": r["current"] == "1", "quote": r["quote"]})
    return out


def load_prices(con: sqlite3.Connection, answers: dict, pages: dict) -> None:
    """Each festival's passes: from its ticket page when pass_prices.csv has it, else from its description."""
    dates = {i: (start, edited) for i, start, edited in con.execute("SELECT id, start_date, modified_at FROM events")}
    rows = [(a.entry, "description", None, a.prompt_version, a.model) for e, a in answers.items() if e not in pages]
    rows += [(entry, page, checked_on, None, read_by) for entry, page, checked_on, read_by in pages.values()]
    for ev, source, checked_on, prompt_version, model in rows:
        start, edited = dates[ev["event_id"]]
        if ev["rule_quotes"]:
            con.execute("INSERT INTO event_price_notes VALUES (?, ?)", (ev["event_id"], "\n".join(ev["rule_quotes"])))
        for p, ps in enumerate(ev["passes"], 1):
            con.execute("INSERT INTO event_passes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (ev["event_id"], p, ps["kind"], ps["label_quote"], ps["group_size"], ps["days"],
                         int(ps["includes_hotel"]), source, checked_on, prompt_version, model))
            for t, tier in enumerate(ps["tiers"], 1):
                frm, until = on_date(tier["from"], start), on_date(tier["until"], start)
                if tier["current"] and frm is None:
                    frm = edited[:10]
                yearless = any(v and len(v) == 5 for v in (tier["from"], tier["until"]))
                con.execute(
                    "INSERT INTO pass_tiers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (ev["event_id"], p, t, tier["amount"], tier["currency"], tier["alt_amount"], tier["alt_currency"],
                     frm, until, json.dumps({"from": tier["from"], "until": tier["until"]}) if yearless else None,
                     tier["quantity"], int(tier["door"]), int(tier["sold_out"]), int(tier["current"]), tier["quote"]))


def record_steps(con: sqlite3.Connection, extract: dict, rooms_genres: dict, prices: dict) -> None:
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
          "features_in_vocabulary": q("SELECT count(*) FROM feature_definitions")}),
        ("4_rooms_genres", rooms_genres,
         "Extract, from each event description, the stated number of party and class rooms, the rooms described "
         "one by one, and the dance genres covered, each with a supporting quote checked word for word.",
         "tables event_rooms, event_room_list, event_genres (source 'description')",
         {"events_with_party_room_count": q("SELECT count(party_rooms) FROM event_rooms"),
          "events_with_class_room_count": q("SELECT count(class_rooms) FROM event_rooms"),
          "rooms_listed": q("SELECT count(*) FROM event_room_list"),
          "genre_rows": q("SELECT count(*) FROM event_genres WHERE source = 'description' AND prompt_version NOT LIKE 'rule:%'")}),
    ]
    if prices:
        passes.append(
            ("4b_prices", prices,
             "Extract, from each event description, the passes it sells and their prices tier by tier, each price "
             "checked against its quote; dates without a year get the latest year not after the festival's start.",
             "tables event_passes, pass_tiers, event_price_notes",
             {"festivals_with_prices": q("SELECT count(DISTINCT event_id) FROM event_passes"),
              "passes": q("SELECT count(*) FROM event_passes"), "tiers": q("SELECT count(*) FROM pass_tiers")}))
    for step, answers, what, outputs, numbers in passes:
        versions = sorted({a.prompt_version for a in answers.values()})
        for v in versions:
            run_log.record_prompt(con, v, run_log.HERE / "prompts" / f"{v}.md")
        times = sorted({a.answered_at for a in answers.values()})
        files = {a.file for a in answers.values()}
        run_log.record(
            con, step, what, performed_by(answers),
            performed_at=times[-1], model=", ".join(sorted({a.model for a in answers.values()})),
            prompt_version=", ".join(versions),
            inputs=f"pipeline/extract/prompts/{versions[0]}.md; pipeline/extract/vocab.json; event descriptions",
            outputs=outputs,
            details={"answer_files": len(files), "festivals": len(answers), "first_answer": times[0],
                     "last_answer": times[-1], **numbers},
        )
    run_log.record(
        con, "5_genre_rules",
        "Add genres the rooms-genres pass applied unevenly: 'SBK' anywhere in a title or description means salsa, "
        "bachata and kizomba (rule:sbk); a genre named as a whole word in the title counts (rule:title). Rows the "
        "pass already had are kept as they were.",
        "pipeline/extract/load_extract.py",
        outputs="table event_genres (prompt_version 'rule:sbk' / 'rule:title')",
        details={"rule_sbk_rows": q("SELECT count(*) FROM event_genres WHERE prompt_version = 'rule:sbk'"),
                 "rule_title_rows": q("SELECT count(*) FROM event_genres WHERE prompt_version = 'rule:title'"),
                 "site_tag_genre_rows": q("SELECT count(*) FROM event_genres WHERE source = 'site_tag'"),
                 "site_tag_feature_rows": q("SELECT count(*) FROM event_features WHERE source = 'site_tag'")},
    )


def main() -> None:
    db_path = Path(sys.argv[1])
    vocab = json.loads(VOCAB.read_text())
    con = sqlite3.connect(db_path)
    event_ids = {i for i, in con.execute("SELECT id FROM events")}
    extract, rooms_genres = latest("extract", event_ids), latest("rooms_genres", event_ids)
    prices, pages = latest("prices", event_ids), page_prices(event_ids)
    con.executescript(SCHEMA)
    con.executemany("INSERT INTO feature_definitions VALUES (?, ?)", vocab["features"].items())
    con.executemany("INSERT INTO genre_definitions VALUES (?, ?)", vocab["genres"].items())
    con.executemany("INSERT INTO role_definitions VALUES (?, ?)", vocab["roles"].items())

    for a in rooms_genres.values():
        ev, pv, model = a.entry, a.prompt_version, a.model
        pr, cr = ev["party_rooms"] or {}, ev["class_rooms"] or {}
        con.execute(
            "INSERT INTO event_rooms VALUES (?, ?, ?, ?, ?, ?, ?)",
            (ev["event_id"], pr.get("count"), pr.get("quote"), cr.get("count"), cr.get("quote"), pv, model),
        )
        con.executemany(
            "INSERT INTO event_room_list VALUES (?, ?, ?, ?, ?, ?)",
            [
                (ev["event_id"], n, r["name_as_written"], r["kind"], json.dumps(sorted(set(r["genres"]))), r["quote"])
                for n, r in enumerate(ev["rooms"], 1)
            ],
        )
        con.executemany(
            "INSERT OR IGNORE INTO event_genres VALUES (?, ?, 'description', ?, ?, ?, ?, ?)",
            [
                (ev["event_id"], g["genre"],
                 " ".join(g["genre_as_written"].split()).casefold() if g["genre"] == "other" else "",
                 g["genre_as_written"], g["quote"], pv, model)
                for g in ev["genres"]
            ],
        )
    # "SBK" names salsa, bachata and kizomba together; the rooms-genres pass does not expand it consistently
    sbk_rows = []
    for eid, title, desc in con.execute("SELECT id, title, description_text FROM events"):
        text = f"{title}\n{desc or ''}"
        if m := re.search(r"[^\n]{0,60}\bSBK\b[^\n]{0,60}", text):
            sbk_rows += [(eid, g, "SBK", m.group(0).strip(), "rule:sbk", None) for g in ("salsa", "bachata", "kizomba")]
    con.executemany(
        "INSERT OR IGNORE INTO event_genres VALUES (?, ?, 'description', '', ?, ?, ?, ?)", sbk_rows
    )
    # A genre named in the title counts; batches of the rooms-genres pass applied this unevenly
    title_rows = []
    for eid, title in con.execute("SELECT id, title FROM events"):
        plain = unicodedata.normalize("NFKC", title)
        for genre, pattern in TITLE_GENRES.items():
            if m := re.search(pattern, plain, re.I):
                title_rows.append((eid, genre, m.group(0), title, "rule:title", None))
    con.executemany(
        "INSERT OR IGNORE INTO event_genres VALUES (?, ?, 'description', '', ?, ?, ?, ?)", title_rows
    )
    con.executemany(
        "INSERT OR IGNORE INTO event_genres (event_id, genre, source) VALUES (?, ?, 'site_tag')",
        [
            (eid, genre)
            for eid, tag in con.execute("SELECT event_id, tag FROM event_tags")
            for genre in TAG_GENRES.get(tag, [])
        ],
    )

    for a in extract.values():
        ev, pv, model = a.entry, a.prompt_version, a.model
        con.executemany(
            "INSERT OR IGNORE INTO event_features VALUES (?, ?, 'description', ?, ?, ?, ?)",
            [
                (ev["event_id"], x["feature"], x["quote"], x["rationale"], pv, model)
                for x in ev["features"]
                if x["feature"] in vocab["features"]
            ],
        )
        con.executemany(
            "INSERT INTO artist_mentions (event_id, role, name_as_written, style, country, source_line,"
            " batch, prompt_version, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (ev["event_id"], a_["role"], a_["name_as_written"], a_["style"], a_["country"],
                 a_["source_line"], a.batch, pv, model)
                for a_ in ev["artists"]
            ],
        )

    con.executemany(
        "INSERT OR IGNORE INTO event_features (event_id, feature, source) VALUES (?, ?, 'site_tag')",
        [
            (eid, TAG_FEATURES[tag])
            for eid, tag in con.execute("SELECT event_id, tag FROM event_tags")
            if tag in TAG_FEATURES
        ],
    )
    load_prices(con, prices, pages)
    con.commit()
    record_steps(con, extract, rooms_genres, prices)
    for table in ("event_features", "artist_mentions", "event_genres", "event_rooms", "event_room_list", "event_passes",
                  "pass_tiers"):
        print(table, con.execute(f"SELECT count(*) FROM {table}").fetchone()[0])


if __name__ == "__main__":
    main()
