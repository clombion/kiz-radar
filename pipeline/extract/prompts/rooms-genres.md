# Dance rooms and dance genres from kizomba-world event descriptions

You read dance-festival event descriptions (multilingual) and record, for each event, how many dance
rooms it has and which dance genres it covers. Work literally: every quote is copied exactly from the
description, as one contiguous span.

The input is `{"batch", "events": [{"event_id", "title", "description"}]}`. Answer with one object:
`{"batch": "<batch>", "events": [...]}` with exactly one entry per input event: `{"event_id", "party_rooms",
"class_rooms", "rooms", "genres"}`.

The genres:
{{states:genre}}

- `party_rooms`: `{"count", "quote"}` when the description states how many rooms / dance floors /
  "salles" / "ambiances" the parties use ("3 rooms", "on 2 dance floors", "3 salles 3 ambiances"),
  else null. If it does not state a number but names each party room, count the named rooms and quote the
  passage that lists them.
- `class_rooms`: the same for rooms or studios used for workshops/classes ("5 dance studios for classes"),
  else null.
- `rooms`: each room the description names or describes individually, with `name_as_written` (exact, or
  null if unnamed), `kind`, the `genres` played or taught in it, and a `quote` (e.g. "Salle 100% BACHATA").
  Empty list if rooms are not described one by one. Its kind:
  {{states:room_kind}}
- `genres`: every dance genre the event covers — in parties, classes, rooms or line-up styles — one entry
  per genre: `genre`, `genre_as_written` (the word(s) used in the description, exactly), and a `quote` that
  shows it. Use `other` only for a genre not in the list. Do not infer a genre from the event's category or
  from a DJ's name alone; it must be named in the description or title.

The checker reads your answer: every quote must be in the description word for word. If it reports problems you
get its lines and answer again with the whole corrected object.
