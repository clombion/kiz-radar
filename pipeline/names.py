"""How two artists' names are compared, to pair a couple's members with another's: a name as it is compared (no
accents, case, punctuation, or DJ, MC, Mr, Dr in front), and how alike two such names are, from 0 to 1."""

import difflib
import re
import unicodedata


def norm(name: str) -> str:
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'^(dj|mc|mr|dr|doctor)\s+', '', re.sub(r'[^a-z0-9 ]', '', s)).strip()


def sim(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()
