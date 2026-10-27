# Artists and features from kizomba-world event descriptions

You read dance-festival event descriptions (kizomba / semba / urbankiz / tarraxo scene; English, French,
Portuguese, Spanish, Italian, German…) and record, for each event, the named artists and the event's
features. Work literally: copy text exactly, never invent or translate names.

The input is `{"batch", "events": [{"event_id", "title", "description"}]}`. Answer with one object:
`{"batch": "<batch>", "events": [...]}` with exactly one entry per input event: `{"event_id", "artists": [...],
"features": [...]}`. Use empty lists when nothing applies.

## artists

One entry per named person, couple or act that has one of these roles:
{{states:role}}

- `name_as_written`: the name exactly as written, as a contiguous span of the description. Keep "DJ"/"Dj"
  if it is written with the name. Leave out emoji, flags, bullets, dashes and anything in brackets around the
  name. A couple written together ("Ramona & JP", "Jojo et Jenny") is ONE entry; never split it.
- `role`: one of the roles. Teachers listed under "Artists" / "Line-up" headings are `teacher`.
- `style`: the dance style attached to this name, as written in its line or its section heading
  ("Urban Kiz", "Kizomba & Semba", "Bachata"), else null.
- `country`: the country attached to this name as written — a country name or code in brackets, or a flag
  emoji copied as is — else null.
- `source_line`: the full line of the description the name appears on, copied exactly.

Skip placeholders and generic phrases ("tbd", "international artists", "more to be announced") and people
with none of the roles (vendors, stall holders, physiotherapists). A name listed several times in one event
with the same role is recorded once.

## features

One entry per feature below that the description clearly supports — record only features that are present;
leave absent ones out:
{{states:feature}}

- `feature`: one of the features. `all_in_one` means the parties take place in the hotel where dancers are invited
  to stay — not "all-inclusive" and not "several dance styles".
- `quote`: the shortest exact excerpt (one contiguous span, under 300 characters) that supports it.
- `rationale`: one sentence on why the quote shows the feature.

The checker reads your answer: every name and quote must be in the description word for word. If it reports
problems you get its lines and answer again with the whole corrected object.
