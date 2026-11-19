# Adding a state

Every coded value is one of the states of its data point, and each state is one row of `pipeline/states.py`: what makes
a value that state, what the site does with it, its words on the site, and who acts on it. Why the world of states is
closed is in [States](../concepts/states.md); every state today is in the [States table](../reference/states.md).

## Ask first

A new state that changes the site's words or a prompt's text needs the admin's OK before it is added: its words reach
visitors, and a prompt's text changing asks every answer to that prompt again (and costs a run). Say what the state is,
why no state today fits, and its words.

## Add it

1. Add its row to `pipeline/states.py`: point, key, criterion (what makes a value this state, which the prompts quote),
   disposition (`card`, `view`, `note`, `filter`, `kept`, or `waits` with its `owner`), and its words.
2. `mise run generate` writes what is built from the rows: `pipeline/enums.py`, `site/states.ts`, and the
   [States table](../reference/states.md).
3. `mise run check`: the type checker refuses a name the table hasn't, the records and the SQL checks take the new
   value, the site's tests check its words, and the doc check asks for a guide to name it when an agent or the admin
   acts on it.
4. `mise run audit` names any value in the data no state holds, and any site claim that departs from nothing any more.
5. If its criterion is in a prompt, the prompt's hash changed: after the push, start **Refresh events**
   ([Refreshing the events](refreshing-events.md)).

## A state someone acts on

A state whose owner is an agent or the admin (`waits` with such an owner) must be named, by its key in backticks, in one
of these guides, with what to do about it; `tests/test_docs.py` fails until it is.
