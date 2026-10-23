"""Consistent text for the site, applied when the database is built.

tidy_name: artist names as listings write them, in one casing ("AMI & JULIEN" → "Ami & Julien", "Dj Chico" → "DJ Chico").
tidy_title: festival titles for cards ("WEnd Kizomba Lille | ALL IN ONE | 23 au 25 Octobre" → "WEnd Kizomba Lille"):
  dates, years, "official" and separators removed, shouting capitals softened.
soften_caps: shouting capitals softened, word by word (venues, and inside tidy_title).
"""
import re
import unicodedata

WORD = re.compile(r"[^\W\d_](?:[^\W\d_]|['’])*")

# --- names ---------------------------------------------------------------------------------------
# shouted words become Title case; words without a vowel (SBK, JT, MKY) read as initials and stay
NAME_VOWEL = re.compile(r'[aeiouàáâãäåèéêëìíîïòóôõöùúûüæœ]', re.I)
NAME_SMALL = {'y', 'e', 'et', 'and', 'de', 'da', 'do', 'dos', 'das', 'del', 'di', 'du', 'la', 'le', 'van', 'von'}
NAME_KEEP = {'DJ', 'MC', 'II', 'III', 'IV'}


def tidy_name(name):
    s = re.sub(r'\b(?:dj|Dj|dJ)\b\.?', 'DJ', name)
    s = re.sub(r'\bDJ\.', 'DJ', s)
    first = True

    def word(m):
        nonlocal first
        w, start = m.group(0), m.start()
        is_first, first = first, False
        if w != w.upper() or w == w.lower() or w in NAME_KEEP:
            return w
        if start and s[start - 1] in "'’" and len(w) == 1:      # DIM’S
            return w.lower()
        if not is_first and w.lower() in NAME_SMALL:
            return w.lower()
        if w == 'JR':
            return 'Jr'
        if not NAME_VOWEL.search(w) and not (len(w) >= 4 and 'Y' in w):     # GHYS is a name, MKY initials
            return w
        return w[0] + w[1:].lower()
    return re.sub(r'[^\W\d_]+', word, s)


# --- titles and venues -----------------------------------------------------------------------------
MONTHS = ('jan(?:uary|vier)?|feb(?:ruary)?|f[ée]v(?:rier)?|febrero|mar(?:ch|s|zo)?|apr(?:il)?|avr(?:il)?|abril|may|mai|mayo|'
          'jun(?:e|io)?|juin|jul(?:y|io)?|juil(?:let)?|aug(?:ust)?|ao[uû]t|agosto|sep(?:t(?:ember|embre)?)?|septiembre|oct(?:ober|obre|ubre)?|'
          'nov(?:ember|embre|iembre)?|dec(?:ember)?|d[ée]c(?:embre)?|diciembre')
DAY = r'\d{1,2}(?:st|nd|rd|th|er)?'
JOIN = r'\s*(?:-|–|—|au|to|&|and|y|al|et)\s*'
DATE = re.compile(rf'\b{DAY}(?:{JOIN}{DAY})*\.?\s*(?:{MONTHS})\b\.?(?:{JOIN}{DAY}\s*(?:{MONTHS})\b\.?)?(?:,?\s*20\d\d)?', re.I | re.A)
KEEP_UPPER = {'DJ', 'SBK', 'UK', 'USA', 'MC', 'BCN', 'KUOF', 'XL', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII'}
SMALL = {'a', 'by', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'the', 'is', 'de', 'da', 'do', 'du', 'la', 'le', 'les',
         'des', 'et', 'y', 'el', 'en', 'am', 'im', 'na', 'no', 'em', 'di', 'del'}
VOWELS = re.compile(r'[aeiouyàâäéèêëîïôöûüáíóúãõ]', re.I)


def soften_caps(text):
    """Soften shouting capitals word by word. Short words without two vowels (DJ, SBK, MKC, ILKSF, KIZZ) look like
    acronyms or stylised names, so they stay as written."""
    first = True

    def word(m):
        nonlocal first
        w = m.group(0)
        is_first, first = first, False
        if w != w.upper() or w == w.lower() or w in KEEP_UPPER:
            return w
        lower = w.lower()
        if not is_first and lower in SMALL:
            return lower
        if len(VOWELS.findall(w)) < 2:
            return w
        return lower[0].upper() + lower[1:]
    return WORD.sub(word, text)


def tidy_title(title):
    s = unicodedata.normalize('NFKC', title)                                  # 𝐁𝐄𝐂𝐀𝐔𝐒𝐄 → BECAUSE
    s = re.sub(r'\b20\d\d(?:\s*[-–/]\s*20\d\d)?\b', ' ', DATE.sub(' ', s), flags=re.A)
    s = re.sub(r'\b\d{1,2}(?:\s*[,./-]\s*\d{1,2}){1,3}\b', ' ', s, flags=re.A)       # 16,17,18-01
    s = re.sub(r'\bofficial(?:\s+event)?\b\s*', '', re.sub(r'\(\s*official\s*\)', ' ', re.sub(r'[_*]+', ' ', s), flags=re.I), flags=re.I | re.A)
    s = re.sub(r'\s*(?:\|+|/{2,}|·|•)\s*', ' – ', s)                             # pipes and double slashes become one dash
    s = re.sub(r'(^|\s–\s)\s*(?:all[\s-]*in[\s-]*one|official(?: event)?)\s*(?=\s–\s|$)', r'\1', s, flags=re.I)
    s = re.sub(r'\b(?:official event|– official)\b', ' ', s, flags=re.I | re.A)
    s = re.sub(r'\s+', ' ', re.sub(r'\(\s*\)|\[\s*\]', ' ', s))
    s = re.sub(r'^[\s–—:,.\-/]+|[\s–—:,.\-#/]+$', '', re.sub(r'(?:\s*[–—-]\s*){2,}', ' – ', s))
    s = re.sub(r'\s+', ' ', re.sub(r'\s+([.,!?])', r'\1', s)).strip()
    s = soften_caps(s)
    return s if len(s) >= 3 else title
