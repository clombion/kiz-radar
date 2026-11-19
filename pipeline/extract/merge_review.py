"""The merge review: whether a pair of artist keys is one artist, asked of Claude a pair at a time (ask.py), its
answers the model's merge claims (claims.model).

The pairs are resolve_artists' (artist_merge_reviews): every candidate pair, and every pair a review answered before.
A pair's answer is answers/merge_review/pair-<digest>.json (records.Reviewed), the digest of its keys. It is current
while it answers the current prompt (pipeline/prompt.py) about that pair: a claim about two artists is made on the
evidence of its day and holds until a newer claim on the pair, so new mentions of either side leave it as it is,
and the pair is asked again only under a new prompt.
"""

from collections.abc import Mapping
from pathlib import Path

from pipeline import data, files, records
from pipeline.db import Reader
from pipeline.enums import AnswerState
from pipeline.extract import answers
from pipeline.records import ANSWERS, MergeAnswer, MergeQuestion, Pair, Reviewed, now

FOLDER = 'merge_review'
TABLE = 'artist_merge_reviews'
type Keys = tuple[str, str]


def inputs(pair: Pair) -> str:
    """What a review is of: the pair."""
    return records.digest(f'{pair.key_a}\n{pair.key_b}')


def path(pair: Pair) -> Path:
    return data(ANSWERS) / FOLDER / f'pair-{inputs(pair)}.json'


def reviewed() -> dict[Keys, Reviewed]:
    """Every review answered, whatever its prompt, by its pair."""
    found = (Reviewed.parse(p.read_bytes()) for p in sorted((data(ANSWERS) / FOLDER).glob('*.json')))
    return {(r.key_a, r.key_b): r for r in found}


def state(pair: Pair, review: Reviewed | None) -> AnswerState:
    return answers.state('merge_review', review, inputs(pair))


def current() -> list[Reviewed]:
    """The reviews to the current prompt, which are the model's claims."""
    return [r for r in reviewed().values() if state(r, r) == AnswerState.CURRENT]


def questions(db: Reader) -> list[MergeQuestion]:
    """The pairs to review, as resolve_artists last wrote them."""
    return [
        MergeQuestion.parse(text)
        for text in db.column(str, f'SELECT question FROM {TABLE} ORDER BY key_a, key_b')  # noqa: S608 (our table)
    ]


def due(db: Reader, ids: Mapping[Keys, Reviewed] | None = None) -> list[MergeQuestion]:
    """The pairs whose review is none or stale."""
    have = reviewed() if ids is None else ids
    return [q for q in questions(db) if state(q, have.get((q.key_a, q.key_b))) != AnswerState.CURRENT]


def save(question: MergeQuestion, answer: MergeAnswer, asking: answers.Asking) -> Path:
    """Save a pair's review with where it comes from."""
    review = Reviewed(
        key_a=question.key_a,
        key_b=question.key_b,
        prompt=asking.prompt.hash,
        model=asking.model,
        answered_at=now(),
        answered_by=asking.answered_by,
        inputs=inputs(question),
        answer=answer,
    )
    files.write(target := path(question), review.dumped())
    return target
