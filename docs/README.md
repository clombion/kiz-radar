# Kiz Radar's documentation

Kiz Radar is a static site of Kizomba festivals worth flying to from Bergen, built each month from kizomba-world's
listings by a pipeline of Python steps and GitHub Actions. These pages are for whoever runs it: the admin, and an agent
in a session.

## What do you want to do?

| I want to | Read |
| -- | -- |
| know what the site shows and why | [The site](guides/the-site.md) |
| refresh the festivals, or ask the models again after a prompt changed | [Refreshing the events](guides/refreshing-events.md) |
| get a festival's prices from its ticket page | [Prices from ticket pages](guides/ticket-pages.md) |
| write or fix a recipe for a ticket site | [Writing a recipe](guides/writing-a-recipe.md) |
| merge two artists, or say where one is from | [Reviewing artists](guides/reviewing-artists.md) |
| add who's going, or a promo code | [Plans and promo codes](guides/plans-and-promos.md) |
| add a state a data point can be in | [Adding a state](guides/adding-a-state.md) |
| understand how the data flows | [Data flow](concepts/data-flow.md) |
| understand why an answer is asked again | [Prompts and answers](concepts/prompts.md) |
| understand who decides a fact no step derives | [Claims](concepts/claims.md) |
| understand the closed world of states | [States](concepts/states.md) |
| look up a command | [Commands](reference/commands.md) |
| look up a file and its record | [Files](reference/files.md) |
| look up a state | [States table](reference/states.md) |

Setting up, the checks and the conventions are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Layout

- `guides/`: how to do each operator's task, step by step.
- `concepts/`: why the pipeline is shaped as it is.
- `reference/`: the commands, the files and the states, each written by `mise run generate` from the code (`tasks.toml`,
  the records of `pipeline/records.py`, `pipeline/states.py`); `mise run generate:check` fails when one no longer says
  what the code does.
