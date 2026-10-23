"""Consistent casing for artist names as listings write them: "AMI & JULIEN" → "Ami & Julien",
"Dj Chico" → "DJ Chico". Mixed-case names are left as their artists style them (AnasTAZZio)."""
import re

# shouted words become Title case; words without a vowel (SBK, JT, MKY) read as initials and stay
VOWEL = re.compile(r'[aeiouàáâãäåèéêëìíîïòóôõöùúûüæœ]', re.I)
SMALL = {'y', 'e', 'et', 'and', 'de', 'da', 'do', 'dos', 'das', 'del', 'di', 'du', 'la', 'le', 'van', 'von'}
KEEP = {'DJ', 'MC', 'II', 'III', 'IV'}


def tidy_name(name):
    s = re.sub(r'\b(?:dj|Dj|dJ)\b\.?', 'DJ', name)
    s = re.sub(r'\bDJ\.', 'DJ', s)
    first = True

    def word(m):
        nonlocal first
        w, start = m.group(0), m.start()
        is_first, first = first, False
        if w != w.upper() or w == w.lower() or w in KEEP:
            return w
        if start and s[start - 1] in "'’" and len(w) == 1:      # DIM’S
            return w.lower()
        if not is_first and w.lower() in SMALL:
            return w.lower()
        if w == 'JR':
            return 'Jr'
        if not VOWEL.search(w) and not (len(w) >= 4 and "Y" in w):     # GHYS is a name, MKY initials
            return w
        return w[0] + w[1:].lower()
    return re.sub(r'[^\W\d_]+', word, s)


if __name__ == '__main__':
    for n in ['AMI & JULIEN', 'Dj Chico', 'DJ DRICO', 'PY & SARAH', 'MANU MARREÑO Y AMBAR', 'Else et ANDY', 'DIM’S & ARANTXA',
              'Dj AnasTAZZio', 'Dj 2.1 SBK', 'ALEX JT & ADRIANA', 'JEAN-MARC & LÉA', 'DJ MKY', 'A. CELMO & ELIZABETH TAYLOR', 'ESTEBAN JR & BONDE']:
        print(f'{n:32} → {tidy_name(n)}')
