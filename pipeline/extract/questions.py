"""Each festival as an extraction pass asks about it today, and the digest of that message: an answer is of the
festival as it is while the message it answered would be the same (answers.state), which ask and the load both
judge by.

A pass asks one festival a message: the prompt's framing of the question, a batch of that festival (prompt.Prompt);
the prices pass asks it with the festival's dance styles too, which come from its genres (genres.py) as the
rooms-genres answer current then makes them. So a changed description, title or date, or a rooms-genres answer that
changes the styles, makes the answer stale.
"""

from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from pipeline import prompt as prompts
from pipeline import records
from pipeline.db import Reader
from pipeline.enums import Style
from pipeline.extract import answers, genres
from pipeline.extract.answers import Answer
from pipeline.prompt import Pass
from pipeline.records import Asked, AskedPrices, Entry, On, Record, RoomsGenres


class Festival(Record):
    """A festival with a description, as the source database has it."""

    id: int
    title: str
    description_text: str
    start_date: On
    end_date: On
    country: str | None


class Tagged(Record):
    event_id: int
    tag: str


@dataclass(frozen=True)
class Now:
    """The festivals with a description, and their site tags, as the source database has them today."""

    festivals: Mapping[int, Festival]
    tags: Mapping[int, Sequence[str]]

    def styles(self, event_id: int, rooms: RoomsGenres | None) -> list[Style]:
        """The festival's dance styles, from its genres with this rooms-genres answer."""
        f = self.festivals[event_id]
        return genres.styles(genres.found(f.title, f.description_text, rooms, self.tags.get(event_id, ())))

    def asked(self, pass_: Pass[Entry, Asked], event_id: int, rooms: RoomsGenres | None = None) -> Asked:
        """The festival as the pass asks about it; the prices pass with its styles."""
        f = self.festivals[event_id]
        if pass_.asked is AskedPrices:
            return AskedPrices(
                event_id=f.id,
                title=f.title,
                description=f.description_text,
                start_date=f.start_date,
                end_date=f.end_date,
                country=f.country,
                styles=tuple(self.styles(event_id, rooms)),
            )
        return Asked(event_id=f.id, title=f.title, description=f.description_text)

    def question(self, pass_: Pass[Entry, Asked], event_id: int, rooms: RoomsGenres | None = None) -> Record:
        """The pass's question about the festival: a batch of it alone (Pass.question)."""
        asked = self.asked(pass_, event_id, rooms)
        return pass_.question.model_validate({'batch': f'event-{event_id}', 'events': (asked,)})

    def inputs(self, pass_: Pass[Entry, Asked], event_id: int, rooms: RoomsGenres | None = None) -> str:
        """The digest of the message asking the pass about the festival today."""
        return records.digest(prompts.current(pass_.name).message(self.question(pass_, event_id, rooms)))

    def current[E: Entry, Q: Asked](self, pass_: Pass[E, Q]) -> dict[int, Answer[E]]:
        """The festivals' current answers of the pass (answers.current); the prices pass's as asked with the styles
        the current rooms-genres answers give."""
        if pass_.asked is AskedPrices:
            rooms = self.current(prompts.ROOMS_GENRES)
            inputs = {i: self.inputs(pass_, i, (a := rooms.get(i)) and a.entry) for i in self.festivals}
        else:
            inputs = {i: self.inputs(pass_, i) for i in self.festivals}
        return answers.current(pass_, inputs)


def now(db: Reader) -> Now:
    query = 'select id, title, description_text, start_date, end_date, country from events'
    festivals = {f.id: f for f in db.rows(Festival, query + ' where description_text is not null order by id')}
    tags: defaultdict[int, list[str]] = defaultdict(list)
    for t in db.rows(Tagged, 'select event_id, tag from event_tags order by event_id, tag'):
        tags[t.event_id].append(t.tag)
    return Now(festivals, dict(tags))
