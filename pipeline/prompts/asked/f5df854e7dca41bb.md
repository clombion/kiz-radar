# The merge review: decide whether two artist records are the same artist

The events database lists dance artists (teachers, DJs, performers) extracted from festival descriptions. A script
grouped identical spellings; it could not decide the pair you are given. Decide whether side A and side B are the same
artist.

The input is one pair: `key_a` and `key_b` (the two records' keys), `name_a` and `name_b` (how each is written most
often), `reason` (why the script flagged them, or null for a pair a review decided before), `evidence` (each side's
stated countries, the countries of its events and its partners) and `a` and `b`, each side's mentions: the event, its
country, the role, the name as written, the style and country stated with it, and the line it appears on.

## Deciding

- `merge`: the evidence shows one artist: e.g. the same stage name with a DJ prefix on one side ("DJ J-Kee" /
  "J-Kee") and the same country; a spelling variant or typo of a distinctive name ("Poema Beatz" / "Dj Poema beat"); a
  first name and the full name with the same partner or the same country and style ("Nico Berrettoni" / "Nicola
  Berrettoni").
- `separate`: the evidence shows two artists: different countries, different full names that only share a first name
  ("Sara" / "Sara Martins" with nothing else in common), or genuinely different names one letter apart (Daniel /
  Daniela, Maria / Marina).
- `unsure`: the evidence does not settle it. Prefer `unsure` over a guess: a wrong merge joins two people's event
  histories.

Common first names (Sara, Laura, Daniel, Maria, Alex…) are weak evidence on their own; distinctive stage names are
strong evidence.

A shared partner is strong evidence. Within a couple, a short and a long form of a name (Isa / Isabelle, Nico /
Nicoletta), a spelling variant (Sara / Sarah, Morgan / Morgane, Elena / Selena) or a language variant (David / Davide)
with the SAME partner is normally the same person: decide `merge` unless the evidence shows two people (e.g. both
couples listed at the same event). The "one letter apart means different names" rule for `separate` applies only when
nothing else (partner, country, event) links the two sides.

A pair of one key with itself is one name stated with countries that never meet: decide whether it is one artist
(`merge`) or several people sharing a name (`separate`).

## Answer

One object, `{"decision", "rationale"}`: the decision, and one sentence naming the evidence used.


======== schema as checked ========

{
 "$defs": {
  "MergeDecision": {
   "enum": [
    "merge",
    "separate",
    "unsure"
   ],
   "type": "string"
  }
 },
 "additionalProperties": false,
 "description": "Whether a pair of artist keys is one artist.",
 "properties": {
  "decision": {
   "$ref": "#/$defs/MergeDecision"
  },
  "rationale": {
   "minLength": 10,
   "type": "string"
  }
 },
 "required": [
  "decision",
  "rationale"
 ],
 "type": "object"
}

======== schema as sent ========

{
 "additionalProperties": false,
 "description": "Whether a pair of artist keys is one artist.",
 "properties": {
  "decision": {
   "enum": [
    "merge",
    "separate",
    "unsure"
   ],
   "type": "string"
  },
  "rationale": {
   "type": "string"
  }
 },
 "required": [
  "decision",
  "rationale"
 ],
 "type": "object"
}

======== question as asked ========

{
 "$defs": {
  "MergeReason": {
   "enum": [
    "same name, different keys",
    "first words of the other",
    "same partner, shortened name",
    "similar spelling",
    "single name, several countries",
    "couples with matching names"
   ],
   "type": "string"
  },
  "ReviewMention": {
   "additionalProperties": false,
   "description": "A mention of one side of a pair, as the merge review is asked about it.",
   "properties": {
    "country": {
     "anyOf": [
      {
       "type": "string"
      },
      {
       "type": "null"
      }
     ]
    },
    "event_country": {
     "anyOf": [
      {
       "type": "string"
      },
      {
       "type": "null"
      }
     ]
    },
    "event_id": {
     "type": "integer"
    },
    "name_as_written": {
     "type": "string"
    },
    "role": {
     "$ref": "#/$defs/Role"
    },
    "source_line": {
     "type": "string"
    },
    "style": {
     "anyOf": [
      {
       "type": "string"
      },
      {
       "type": "null"
      }
     ]
    }
   },
   "required": [
    "event_id",
    "event_country",
    "role",
    "name_as_written",
    "style",
    "country",
    "source_line"
   ],
   "type": "object"
  },
  "Role": {
   "enum": [
    "teacher",
    "dj",
    "performer",
    "mc",
    "organiser",
    "media",
    "crew"
   ],
   "type": "string"
  }
 },
 "additionalProperties": false,
 "description": "A pair of artist keys that may be one artist, and what weighs on it (artist_merge_reviews).",
 "properties": {
  "a": {
   "items": {
    "$ref": "#/$defs/ReviewMention"
   },
   "type": "array"
  },
  "b": {
   "items": {
    "$ref": "#/$defs/ReviewMention"
   },
   "type": "array"
  },
  "evidence": {
   "type": "string"
  },
  "key_a": {
   "type": "string"
  },
  "key_b": {
   "type": "string"
  },
  "name_a": {
   "type": "string"
  },
  "name_b": {
   "type": "string"
  },
  "reason": {
   "anyOf": [
    {
     "$ref": "#/$defs/MergeReason"
    },
    {
     "type": "null"
    }
   ],
   "description": "Why the matching rules flagged the pair; null for a pair that is no candidate now, reviewed again because a review decided it."
  }
 },
 "required": [
  "key_a",
  "key_b",
  "name_a",
  "name_b",
  "reason",
  "evidence",
  "a",
  "b"
 ],
 "type": "object"
}

======== message ========

Pair:
{question}
