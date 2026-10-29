# Kiz Radar

Kiz Radar finds Kizomba, Urban Kiz and Tarraxo festivals worth flying to from Bergen: every festival listed on
[kizomba-world.com](https://kizomba-world.com/), what the trip costs (the full pass and the Friday-to-Monday flight),
and who teaches and DJs where. It is at [clombion.github.io/kiz-radar](https://clombion.github.io/kiz-radar/).

## Why

A festival's listing rarely says what going costs: the pass price hides in its description or on a ticket page, and the
flight is a search of its own. Kiz Radar reads both for every festival, each month, so the question "which Kizomba
festivals can I fly to this spring for under 3 000 kr?" is one sentence on one page.

## How

A pipeline of Python steps (`pipeline/`) scrapes kizomba-world into a SQLite export, asks Claude to read each
description (line-ups, highlights, genres, passes and prices), reads ticket pages by a recipe per ticket site, searches
the flights, and builds a database the static site (`site/`, in `public/`) queries in the browser. GitHub Actions run it
on a schedule. Facts no step can derive (two artists are one, where an artist is from) are claims, the admin's in their
own repository.

## Terms

- **export:** the committed SQLite database of the festivals, `source/`, which every step reads and writes.
- **pass:** a kind of question Claude answers about each festival's description (extract, rooms-genres, prices).
- **answer:** one festival's answer of a pass, a file with where it comes from; current while it answers today's prompt.
- **first read:** which pass each ticket on a festival's ticket page is, judged once and applied on every later read.
- **recipe:** where a ticket site's rows are, so a page is read by code.
- **claim:** a decision no step derives: a merge, a home country, a booking, a site override.
- **state:** one of the closed set of values a data point can be, a row of `pipeline/states.py`.

## Quick start

```bash
git clone --recurse-submodules https://github.com/clombion/kiz-radar && cd kiz-radar
mise trust && mise install
mise run serve        # builds the site and its data; open http://localhost:8000
```

`mise run serve` prints `public/data/kiz.sqlite` and its size, then serves; the page opens on the festival sentence with
the cards below.

## Documentation

The [documentation](docs/README.md): guides for each operator's task, the concepts behind the pipeline, and the
commands, files and states for reference. Setting up and the checks: [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence of the data

Kizomba-world publishes its listings under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The festival
data here adapts them and is shared under the same licence: the export in `source/`, the database and summary the site
serves, and the artist merge files in `pipeline/`. The fares are our own searches.
