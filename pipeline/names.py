"""How an artist's name is read and compared, the one rule every step keys and pairs names by: a name as shown
(clean_display: plain letters, no flags, emoji or bracketed notes), its key (token_key: no DJ or MC in front, no
accents, case, punctuation or spaces), and how alike two keys are, from 0 to 1 (sim). Each threshold on sim is its
user's, named for what it decides: resolve_artists.SIMILAR, merge_suggestions.COUPLE_NAMES_ALIKE.

A prefix is a role's title written in front of a name, which a line-up adds or leaves out ("DJ Vasco", "Vasco"). Mr,
Dr and Doctor are not among them: written in front of a name they are the name ("Dr Kizomba" is not "Kizomba", whom
a single word would scope to every dancer of that name)."""

import difflib
import re
import unicodedata

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
