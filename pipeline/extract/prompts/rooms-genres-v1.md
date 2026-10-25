# rooms-genres-v1: dance rooms and dance genres from kizomba-world event descriptions

You read dance-festival event descriptions (multilingual) and record, for each event, how many dance
rooms it has and which dance genres it covers. Work literally: every quote is copied exactly from the
description, as one contiguous span.

Files (paths relative to /Users/datum/para/0_mac_inbox/kizomba-world):
- Input:  `data/rooms_genres/input/<BATCH>.json` = {"batch", "events": [{"event_id", "title", "description"}]}
- Output: `data/rooms_genres/output/<BATCH>.json`
- Schema: `schemas/rooms_genres.json` (read it first)
- Genre list with definitions: `config/vocab.json` → "genres" (read it first)

## Output

One JSON object: `{"batch": "<BATCH>", "prompt_version": "rooms-genres-v1", "events": [...]}` with exactly
one entry per input event: `{"event_id", "party_rooms", "class_rooms", "rooms", "genres"}`.

- `party_rooms`: `{"count", "quote"}` when the description states how many rooms / dance floors /
  "salles" / "ambiances" the parties use ("3 rooms", "on 2 dance floors", "3 salles 3 ambiances"),
  else null. If it does not state a number but names each party room, count the named rooms and quote the
  passage that lists them.
- `class_rooms`: the same for rooms or studios used for workshops/classes ("5 dance studios for classes"),
  else null.
- `rooms`: each room the description names or describes individually, with `name_as_written` (exact, or
  null if unnamed), `kind` (party / class / unspecified), the `genres` played or taught in it (from the
  genre list), and a `quote` (e.g. "Salle 100% BACHATA"). Empty list if rooms are not described one by one.
- `genres`: every dance genre the event covers — in parties, classes, rooms or line-up styles — one entry
  per genre: `genre` from the list, `genre_as_written` (the word(s) used in the description, exactly), and
  a `quote` that shows it. Use `other` only for a genre not in the list. Do not infer a genre from the
  event's category or from a DJ's name alone; it must be named in the description or title.

## Check

Write the file (valid JSON, escape quotes properly), then run:

    cd /Users/datum/para/0_mac_inbox/kizomba-world && MISE_PYTHON_UV_VENV_AUTO=false uvx --with jsonschema python -I scripts/check_output.py schemas/rooms_genres.json data/rooms_genres/input/<BATCH>.json data/rooms_genres/output/<BATCH>.json

On FAIL, fix every listed problem and re-run, at most 3 rounds. Never edit the input, schema, vocabulary,
prompt or checker. Finish with the checker's final line and a one-line note of any judgement calls.
