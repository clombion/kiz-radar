"""How an artist's name is read, keyed and compared, the one rule every step keys and pairs names by: a name as shown
(clean_display: plain letters, no flags, emoji or bracketed notes), its key (token_key: no DJ or MC in front, no
accents, case, punctuation or spaces), and how alike two keys are, from 0 to 1 (sim). Each threshold on sim is its
user's, named for what it decides: resolve_artists.SIMILAR, merge_suggestions.COUPLE_NAMES_ALIKE.

A prefix is a role's title written in front of a name, which a line-up adds or leaves out ("DJ Vasco", "Vasco"). Mr,
Dr and Doctor are not among them: written in front of a name they are the name ("Dr Kizomba" is not "Kizomba", whom
a single word would scope to every dancer of that name).

An artist's key is an ArtistKey: its kind, which its text's prefix says, and its body. Every step makes and reads keys
through it (resolve_artists, the claims, the files that name artists), never by slicing the text."""

import difflib
import re
import unicodedata
from dataclasses import dataclass
from typing import Self

from pipeline.enums import ArtistKind

PREFIX = re.compile(r'^(?:dj|deejay|d\.j\.|mc)\s+', re.IGNORECASE)


def clean_display(name: str) -> str:
    """The name as a reader would want it shown: plain letters, no flags or emoji."""
    s = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', unicodedata.normalize('NFKC', name))
    s = ''.join(ch for ch in s if unicodedata.category(ch)[0] in 'LNPZ' or ch in "&+'’")
    return ' '.join(s.split()).strip(' -–—•·*:,;')


def token_key(name: str) -> str:
    """The name as it is keyed and compared: shown (clean_display), its prefix removed, Unicode-compatibility folded
    (styled letters to plain), its accents, punctuation and spaces removed, its case folded."""
    s = PREFIX.sub('', clean_display(name))
    s = unicodedata.normalize('NFKD', s)
    return ''.join(ch for ch in s if ch.isalnum() and not unicodedata.combining(ch)).casefold()


def sim(a: str, b: str) -> float:
    """How alike two keys are: difflib's ratio, twice the letters in common over both lengths."""
    return difflib.SequenceMatcher(None, a, b).ratio()


PREFIXES = {ArtistKind.PERSON: 'p', ArtistKind.COUPLE: 'c', ArtistKind.GROUP: 'g', ArtistKind.ORGANISATION: 'o'}
KINDS = {p: k for k, p in PREFIXES.items()}
SCOPE, PLACE, JOINED = '@', '#', '+'  # a single word's scope, a shared name's place, a couple's or group's members


@dataclass(frozen=True)
class ArtistKey:
    """An artist's key: its kind, which the prefix of its text says (p: a person, c: a couple, g: a group, o: an
    organisation), and its body, the rest. A person's body is their name's key, with, for a single word, the couple or
    role family it is scoped to (@) and, for members who share a name, their place (#); a couple's or group's is its
    members' bodies joined by '+'; an organisation's is its name's key."""

    kind: ArtistKind
    body: str

    @classmethod
    def parse(cls, text: str) -> Self:
        prefix, colon, body = text.partition(':')
        if not colon or prefix not in KINDS or not body or any(ch.isspace() for ch in body):
            raise ValueError(f'{text!r} is no artist key: {"/".join(KINDS)}, a colon, and a body without spaces')
        return cls(KINDS[prefix], body)

    def __str__(self) -> str:
        return f'{PREFIXES[self.kind]}:{self.body}'

    @property
    def name(self) -> str:
        """A person's name key without its scope: what two people's names are compared by."""
        return self.body.split(SCOPE)[0]

    @property
    def scoped(self) -> bool:
        """Whether it is a single word's, scoped to a couple or a role family."""
        return SCOPE in self.body


def key_of(kind: ArtistKind, body: str) -> str:
    """The text of the key of this kind and body."""
    return str(ArtistKey.parse(f'{PREFIXES[kind]}:{body}'))


def kind_of(key: str) -> ArtistKind:
    """The kind of artist a key is, which its prefix says."""
    return ArtistKey.parse(key).kind


def checked(key: str) -> str:
    """A key as a file names it, refused when it is none (ArtistKey.parse)."""
    return str(ArtistKey.parse(key))


def group(key: str) -> str:
    """A named group's key, refused when it is not a group's."""
    if kind_of(key) != ArtistKind.GROUP:
        raise ValueError(f'{key}: a named group is keyed as a group, g:')
    return key
