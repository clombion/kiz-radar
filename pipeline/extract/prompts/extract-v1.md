# extract-v1: artists and features from kizomba-world event descriptions

You read dance-festival event descriptions (kizomba / semba / urbankiz / tarraxo scene; English, French,
Portuguese, Spanish, Italian, German…) and record, for each event, the named artists and the event's
features. Work literally: copy text exactly, never invent or translate names.

Files (paths relative to /Users/datum/para/0_mac_inbox/kizomba-world):
- Input:  `data/extract/input/<BATCH>.json` = {"batch", "events": [{"event_id", "title", "description"}]}
- Output: `data/extract/output/<BATCH>.json`
- Schema: `schemas/extract.json` (read it first)
- Vocabulary with definitions: `config/vocab.json` (read it first; roles and features must come from it)

## Output

One JSON object: `{"batch": "<BATCH>", "prompt_version": "extract-v1", "events": [...]}` with exactly one
entry per input event, in any order: `{"event_id", "artists": [...], "features": [...]}`. Use empty lists
when nothing applies.

### artists

One entry per named person, couple or act that has one of the vocabulary roles:

- `name_as_written`: the name exactly as written, as a contiguous span of the description. Keep "DJ"/"Dj"
  if it is written with the name. Leave out emoji, flags, bullets, dashes and anything in brackets around the
  name. A couple written together ("Ramona & JP", "Jojo et Jenny") is ONE entry; never split it.
- `role`: one vocabulary role. Teachers listed under "Artists" / "Line-up" headings are `teacher`.
- `style`: the dance style attached to this name, as written in its line or its section heading
  ("Urban Kiz", "Kizomba & Semba", "Bachata"), else null.
- `country`: the country attached to this name as written — a country name or code in brackets, or a flag
  emoji copied as is — else null.
- `source_line`: the full line of the description the name appears on, copied exactly.

Skip placeholders and generic phrases ("tbd", "international artists", "more to be announced") and people
with no vocabulary role (vendors, stall holders, physiotherapists). A name listed several times in one event
with the same role is recorded once.

### features

One entry per vocabulary feature that the description clearly supports — record only features that are
present; leave absent ones out.

- `feature`: a vocabulary feature. Read its definition in `config/vocab.json`; in particular `all_in_one`
  means the parties take place in the hotel where dancers are invited to stay — not "all-inclusive" and not
  "several dance styles".
- `quote`: the shortest exact excerpt (one contiguous span, under 300 characters) that supports it.
- `rationale`: one sentence on why the quote shows the feature.

## Check

Write the file (with a script or the Write tool; valid JSON, escape quotes properly), then run:

    cd /Users/datum/para/0_mac_inbox/kizomba-world && MISE_PYTHON_UV_VENV_AUTO=false uvx --with jsonschema python -I scripts/check_output.py schemas/extract.json data/extract/input/<BATCH>.json data/extract/output/<BATCH>.json

On FAIL, fix every listed problem and re-run, at most 3 rounds. Never edit the input, schema, vocabulary,
prompt or checker. Finish with the checker's final line and a one-line note of any judgement calls.
