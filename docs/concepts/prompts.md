# Prompts and answers

Why an answer is used, or asked again.

## A prompt is known by its hash

Line-ups, highlights, rooms, genres and pass prices are read from each description by Claude (claude-haiku-5-5), one
festival and one pass per question; ticket pages get first reads (Opus and Sonnet, Fable when they disagree), and pairs
of artists a merge review. A prompt is known by the hash of everything fixed in its request: its text (the template in
`pipeline/extract/prompts/` or `pipeline/tickets/prompts/`, with the definitions of its states filled in from
`pipeline/states.py`), its record's schema as the checker holds the answer to it and as sent, and the record of its
question and the framing it is sent in (`pipeline/prompt.py`). Saving an answer first saves the prompt's text in
`pipeline/prompts/asked/<hash>.md`, whose digest is checked again when it is read.

## An answer is current, stale or none

Each answer file holds its answer with where it comes from: the prompt's hash, the model, when, who asked, and the
digest of the message it answered.

| The answer | Its state | In the database |
| -- | -- | -- |
| answers the current prompt, about the message the festival would be asked with today | current | yes |
| answers another prompt | stale | no, until asked again |
| answers another message (the description, title, dates or country changed; for prices, the styles its genres give) | stale | no, until asked again |
| none | none | no |

So editing a template, a state's criterion or a record asks every answer to that prompt again: start **Refresh events**
at once after the push ([Refreshing the events](../guides/refreshing-events.md)). The prices pass is asked with the
styles its festival's current rooms-genres answer gives, so extraction and rooms-genres are asked first, then prices.

A merge review's answer is current while it answers the current prompt about its pair: a claim about two artists is made
on the evidence of its day, so new mentions of either side leave it as it is.

## An answer is checked before it counts

A checker confirms that the answer is its record (`pipeline/records.py`), that every name, quote and price marked
verbatim appears in the description, and that a pass has a style only at a festival whose genres name two dance styles
or more. A failing answer goes back to Claude once, with the checker's lines; a second failure leaves it due for the
next run, as does any call that gives no answer (`pipeline/calls.py`: cut short, busy, unreachable), and the run fails
naming each. A call that can never succeed as made (a bad key) stops the run's requests.

The first extraction's answers, from Claude Code subagents in batches of several festivals, are kept beside the later
ones, as what the first export was built from; a festival's own answer file replaces its entry in a batch.
