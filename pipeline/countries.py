"""Country normalisation: ISO 3166 alpha-2 codes for the free-text and flag-emoji
countries found in event and artist data."""

import re
import unicodedata

NAMES = {
    'AD': 'Andorra',
    'AE': 'United Arab Emirates',
    'AL': 'Albania',
    'AM': 'Armenia',
    'AO': 'Angola',
    'AR': 'Argentina',
    'AT': 'Austria',
    'AU': 'Australia',
    'AW': 'Aruba',
    'BA': 'Bosnia and Herzegovina',
    'BE': 'Belgium',
    'BF': 'Burkina Faso',
    'BG': 'Bulgaria',
    'BI': 'Burundi',
    'BJ': 'Benin',
    'BL': 'Saint-Barthélemy',
    'BO': 'Bolivia',
    'BQ': 'Caribbean Netherlands',
    'BR': 'Brazil',
    'BY': 'Belarus',
    'CA': 'Canada',
    'CD': 'DR Congo',
    'CG': 'Congo',
    'CH': 'Switzerland',
    'CI': 'Côte d’Ivoire',
    'CL': 'Chile',
    'CM': 'Cameroon',
    'CN': 'China',
    'CO': 'Colombia',
    'CR': 'Costa Rica',
    'CU': 'Cuba',
    'CV': 'Cape Verde',
    'CW': 'Curaçao',
    'CY': 'Cyprus',
    'CZ': 'Czechia',
    'DE': 'Germany',
    'DK': 'Denmark',
    'DO': 'Dominican Republic',
    'DZ': 'Algeria',
    'EC': 'Ecuador',
    'EE': 'Estonia',
    'EG': 'Egypt',
    'ES': 'Spain',
    'FI': 'Finland',
    'FR': 'France',
    'GA': 'Gabon',
    'GB': 'United Kingdom',
    'GF': 'French Guiana',
    'GH': 'Ghana',
    'GM': 'Gambia',
    'GN': 'Guinea',
    'GP': 'Guadeloupe',
    'GR': 'Greece',
    'GT': 'Guatemala',
    'GW': 'Guinea-Bissau',
    'HK': 'Hong Kong',
    'HR': 'Croatia',
    'HT': 'Haiti',
    'HU': 'Hungary',
    'ID': 'Indonesia',
    'IE': 'Ireland',
    'IL': 'Israel',
    'IN': 'India',
    'IS': 'Iceland',
    'IT': 'Italy',
    'JM': 'Jamaica',
    'JP': 'Japan',
    'KG': 'Kyrgyzstan',
    'KM': 'Comoros',
    'KR': 'South Korea',
    'KZ': 'Kazakhstan',
    'LB': 'Lebanon',
    'LC': 'Saint Lucia',
    'LT': 'Lithuania',
    'LU': 'Luxembourg',
    'LV': 'Latvia',
    'MA': 'Morocco',
    'MD': 'Moldova',
    'ME': 'Montenegro',
    'MF': 'Saint Martin',
    'MK': 'North Macedonia',
    'MN': 'Mongolia',
    'MQ': 'Martinique',
    'MT': 'Malta',
    'MX': 'Mexico',
    'MY': 'Malaysia',
    'MZ': 'Mozambique',
    'NC': 'New Caledonia',
    'NG': 'Nigeria',
    'NL': 'Netherlands',
    'NO': 'Norway',
    'NP': 'Nepal',
    'NZ': 'New Zealand',
    'PA': 'Panama',
    'PE': 'Peru',
    'PH': 'Philippines',
    'PL': 'Poland',
    'PR': 'Puerto Rico',
    'PT': 'Portugal',
    'PY': 'Paraguay',
    'QA': 'Qatar',
    'RE': 'Réunion',
    'RO': 'Romania',
    'RS': 'Serbia',
    'RU': 'Russia',
    'SD': 'Sudan',
    'SE': 'Sweden',
    'SG': 'Singapore',
    'SI': 'Slovenia',
    'SK': 'Slovakia',
    'SN': 'Senegal',
    'SR': 'Suriname',
    'ST': 'São Tomé and Príncipe',
    'SX': 'Sint Maarten',
    'TG': 'Togo',
    'TH': 'Thailand',
    'TN': 'Tunisia',
    'TR': 'Türkiye',
    'TT': 'Trinidad and Tobago',
    'TW': 'Taiwan',
    'UA': 'Ukraine',
    'US': 'United States',
    'UY': 'Uruguay',
    'VE': 'Venezuela',
    'VN': 'Vietnam',
    'YT': 'Mayotte',
    'ZA': 'South Africa',
    'ZM': 'Zambia',
}
# Flags that are not ISO codes (EA = Ceuta & Melilla, CP = Clipperton, IC = Canaries) count as their state.
FLAG_ALIAS = {'EA': 'ES', 'IC': 'ES', 'CP': 'FR', 'EU': None}

ALIASES = {n.lower(): c for c, n in NAMES.items()}
ALIASES.update(
    {
        'uk': 'GB',
        'england': 'GB',
        'scotland': 'GB',
        'wales': 'GB',
        'great britain': 'GB',
        'united kingdom': 'GB',
        'usa': 'US',
        'us': 'US',
        'united states': 'US',
        'holland': 'NL',
        'netherland': 'NL',
        'the netherlands': 'NL',
        'czech republic': 'CZ',
        'czech rep': 'CZ',
        'czech rep.': 'CZ',
        'czechia': 'CZ',
        'cze': 'CZ',
        'españa': 'ES',
        'espana': 'ES',
        'esp': 'ES',
        'sp': 'ES',
        'spain': 'ES',
        'ger': 'DE',
        'd': 'DE',
        'swe': 'SE',
        'sw': 'SE',
        'swedeen': 'SE',
        'swiss': 'CH',
        'italia': 'IT',
        'italie': 'IT',
        'marocco': 'MA',
        'mexic': 'MX',
        'romani': 'RO',
        'luxemburg': 'LU',
        'lux': 'LU',
        'bel': 'BE',
        'can': 'CA',
        'ang': 'AO',
        'moz': 'MZ',
        'turkiye': 'TR',
        'turkey': 'TR',
        'türkiye': 'TR',
        'republica dominicana': 'DO',
        'republica domenicana': 'DO',
        'guinea bissau': 'GW',
        'guadelupe': 'GP',
        'sxm': 'MF',
        'french guyana': 'GF',
        'trinidad-and-tobago': 'TT',
        'korea': 'KR',
        'mongolian': 'MN',
        'ukr': 'UA',
        'nor': 'NO',
        'ua': 'UA',
        'fr': 'FR',
        'no': 'NO',
        'gh': 'GH',
        'ucrania': 'UA',
        'dubai': 'AE',
        'corfu': 'GR',
        'tallinn': 'EE',
        'luanda': 'AO',
        'lisbon': 'PT',
        'paris': 'FR',
        'barcelona': 'ES',
        'amsterdam': 'NL',
        'rotterdam': 'NL',
        'vancouver': 'CA',
        'montreal': 'CA',
        'ottawa': 'CA',
        'victoria': 'CA',
        'seattle': 'US',
        'miami': 'US',
        'los angeles': 'US',
        'washington dc': 'US',
        'statia': 'BQ',
        'leb': 'LB',
        'arg': 'AR',
        'sénégal': 'SN',
        'la martinique': 'MQ',
        'cap verde': 'CV',
        'ivory coast': 'CI',
        'viet nam': 'VN',
        # sports (IOC/FIFA) codes, and French, Spanish, Portuguese and Italian names that line-ups use
        'sui': 'CH',
        'swi': 'CH',
        'ned': 'NL',
        'hol': 'NL',
        'por': 'PT',
        'eng': 'GB',
        'cro': 'HR',
        'den': 'DK',
        'gre': 'GR',
        'bul': 'BG',
        'slo': 'SI',
        'rsa': 'ZA',
        'cpv': 'CV',
        'cabo verde': 'CV',
        'allemagne': 'DE',
        'alemania': 'DE',
        'alemanha': 'DE',
        'germania': 'DE',
        'espagne': 'ES',
        'espanha': 'ES',
        'spagna': 'ES',
        'itália': 'IT',
        'suisse': 'CH',
        'suiza': 'CH',
        'suíça': 'CH',
        'svizzera': 'CH',
        'angleterre': 'GB',
        'inglaterra': 'GB',
        'royaume-uni': 'GB',
        'brésil': 'BR',
        'bresil': 'BR',
        'brasil': 'BR',
        'belgique': 'BE',
        'bélgica': 'BE',
        'belgio': 'BE',
        'pays-bas': 'NL',
        'países bajos': 'NL',
        'pologne': 'PL',
        'polonia': 'PL',
        'polônia': 'PL',
        'ucrânia': 'UA',
        'guadalupe': 'GP',
        'maroc': 'MA',
        'marruecos': 'MA',
        'cameroun': 'CM',
        "côte d'ivoire": 'CI',
        'grèce': 'GR',
        'grecia': 'GR',
        'autriche': 'AT',
        'suède': 'SE',
        'suecia': 'SE',
        'république tchèque': 'CZ',
        'rep. checa': 'CZ',
        'tchéquie': 'CZ',
        'hongrie': 'HU',
        'hungría': 'HU',
        'roumanie': 'RO',
        'rumania': 'RO',
        'croatie': 'HR',
        'croacia': 'HR',
        'turquie': 'TR',
        'turquía': 'TR',
        'états-unis': 'US',
        'etats-unis': 'US',
        'estados unidos': 'US',
    }
)
ALIASES.update({c.lower(): c for c in NAMES})  # bare ISO codes: FR, DE, NL …


INDICATOR_A, INDICATOR_Z = 0x1F1E6, 0x1F1FF  # the regional indicator symbols 🇦 … 🇿, two of which make a flag
BLACK_FLAG = 0x1F3F4  # 🏴, which tag characters make a subdivision's flag (England, Scotland, Wales)
TAG_FIRST, TAG_LAST = 0xE0000, 0xE007F
EMOJI_FIRST = 0x1F000  # characters from here up are emoji, not words
CODE_LENGTH = 2  # an ISO 3166 alpha-2 code's


def indicator(o: int) -> bool:
    return INDICATOR_A <= o <= INDICATOR_Z


def tag(o: int) -> bool:
    return TAG_FIRST <= o <= TAG_LAST


def _flags(s: str) -> list[str]:
    """ISO codes from regional-indicator pairs and subdivision tag flags (England, Scotland, Wales)."""
    out: list[str] = []
    i, chars = 0, list(s)
    while i < len(chars):
        o = ord(chars[i])
        if indicator(o) and i + 1 < len(chars) and indicator(ord(chars[i + 1])):
            code = chr(o - INDICATOR_A + ord('A')) + chr(ord(chars[i + 1]) - INDICATOR_A + ord('A'))
            code = FLAG_ALIAS.get(code, code)
            if code:
                out.append(code)
            i += 2
            continue
        if o == BLACK_FLAG and i + 1 < len(chars) and tag(ord(chars[i + 1])):
            out.append('GB')
            while i + 1 < len(chars) and tag(ord(chars[i + 1])):
                i += 1
        i += 1
    return out


# what splits a field naming several countries: "PT/ES", "Senegal & France", "Angola - Portugal", "(France)"
SEPARATORS = r'\s*(?:/|&|,|;|\(|\)|–|—|\s-\s|-(?=[A-Z])|\band\b|\bet\b|7)\s*'
# the names written with a separator in them ("Bosnia and Herzegovina", "Guinea-Bissau"), longest first, each
# matched whole before the field is split
JOINED = sorted((n for n in ALIASES if re.search(r'[\s/&,–—-]|\band\b', n)), key=len, reverse=True)


def codes(text: str | None) -> list[str]:
    """All countries named in a free-text field, without duplicates: its flags', then its names written with a separator
    in them, then the others', each in the order written."""
    if not text:
        return []
    found = _flags(text)
    plain = ''.join(ch for ch in unicodedata.normalize('NFKC', text) if ord(ch) < EMOJI_FIRST and not tag(ord(ch)))
    for name in JOINED:  # the same length in lower case: the names are matched in it, blanked in the text
        while m := re.search(rf'(?<!\w){re.escape(name)}(?!\w)', plain.lower()):
            found.append(ALIASES[name])
            plain = plain[: m.start()] + ' / ' + plain[m.end() :]
    for part in re.split(SEPARATORS, plain):
        p = part.strip(' .-').lower()
        if not p:
            continue
        if p in ALIASES:
            found.append(ALIASES[p])
            continue
        # "Vancouver – Canada": try each word group
        for w in re.split(r'[\s-]+', p):
            if w in ALIASES and len(w) > CODE_LENGTH:  # a word, not a bare code
                found.append(ALIASES[w])
    return list(dict.fromkeys(c for c in found if c))


FRENCH = frozenset({'RE', 'GP', 'MQ', 'GF', 'YT', 'MF', 'BL', 'NC', 'PF', 'PM', 'WF'})  # France's territories


def nation(code: str) -> str:
    """The country a code is part of: France for its territories overseas, else the country itself."""
    return 'FR' if code in FRENCH else code


def flag(code: str | None) -> str:
    return ''.join(chr(INDICATOR_A + ord(ch) - ord('A')) for ch in code) if code and len(code) == CODE_LENGTH else ''
