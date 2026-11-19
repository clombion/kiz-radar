"""The dance genres a festival covers, and the styles they fall under: what the load writes to event_genres, and the
styles the prices pass and the first read are asked with, from the same three things.

A genre comes from the rooms-genres pass's answer of the description, from a rule the pass applies unevenly (a rule's
word such as "SBK" names several genres together, and a genre named in the title counts), or from one of
kizomba-world's site tags; each genre once a source, the first way it comes kept. The prices pass is asked with the
styles of its festival's genres as the rooms-genres answer then current makes them (ask asks that pass first), and
the load reads its answer as current only while those styles are still the same.
"""

import re
import unicodedata
from collections.abc import Iterable, Sequence
from typing import NamedTuple

from pipeline import states
from pipeline.enums import Genre, GenreRule, Source, Style
from pipeline.records import RoomsGenres


class Found(NamedTuple):
    """A genre of a festival, and how it was found: answered (the rooms-genres pass's), by a rule, or by a tag."""

    genre: Genre
    source: Source
    other_name: str  # for genre 'other', its name in lower case; '' otherwise
    as_written: str | None
    quote: str | None
    rule: GenreRule | None
    answered: bool


def found(title: str, description: str, answer: RoomsGenres | None, tags: Iterable[str]) -> list[Found]:
    """The festival's genres, each once by its key (genre, source, other_name), the answer's first."""
    out: list[Found] = []
    for g in answer.genres if answer else ():
        other = ' '.join(g.genre_as_written.split()).casefold() if g.genre == Genre.OTHER else ''
        out.append(Found(g.genre, Source.DESCRIPTION, other, g.genre_as_written, g.quote, None, answered=True))
    text = f'{title}\n{description}'
    for rule in states.of('genre_rule'):
        for word in rule.tags:
            if m := re.search(rf'[^\n]{{0,60}}\b{re.escape(word)}\b[^\n]{{0,60}}', text):
                out += [
                    Found(
                        Genre(g), Source.DESCRIPTION, '', word, m.group(0).strip(), GenreRule(rule.key), answered=False
                    )
                    for g in rule.genres
                ]
    plain = unicodedata.normalize('NFKC', title)
    out += [  # brand spellings ("AfroKiz", "Kizz") are no title of a genre
        Found(Genre(g.key), Source.DESCRIPTION, '', m.group(0), title, GenreRule.TITLE, answered=False)
        for g in states.of('genre')
        if g.title and (m := re.search(g.title, plain, re.IGNORECASE))
    ]
    out += [
        Found(Genre(g), Source.SITE_TAG, '', None, None, None, answered=False)
        for t in tags
        for g in states.TAG_GENRES.get(t, [])
    ]
    seen: set[tuple[Genre, Source, str]] = set()
    kept: list[Found] = []
    for f in out:
        if (key := (f.genre, f.source, f.other_name)) not in seen:
            seen.add(key)
            kept.append(f)
    return kept


def styles(genres: Sequence[Found]) -> list[Style]:
    """The dance styles the genres fall under."""
    return sorted({Style(states.STYLE_OF[g.genre]) for g in genres})
