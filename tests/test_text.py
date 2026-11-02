import pytest

from pipeline import db
from pipeline.text import soften_caps, tidy_name, tidy_title
from tests.exports import EXPORT


@pytest.mark.parametrize(
    ('raw', 'tidy'),
    [
        ('AMI & JULIEN', 'Ami & Julien'),
        ('Dj Chico', 'DJ Chico'),
        ('DJ DRICO', 'DJ Drico'),
        ('PY & SARAH', 'PY & Sarah'),
        ('MANU MARREÑO Y AMBAR', 'Manu Marreño y Ambar'),
        ('Else et ANDY', 'Else et Andy'),
        ('DIM’S & ARANTXA', 'Dim’s & Arantxa'),
        ('Dj AnasTAZZio', 'DJ AnasTAZZio'),
        ('Dj 2.1 SBK', 'DJ 2.1 SBK'),
        ('ALEX JT & ADRIANA', 'Alex JT & Adriana'),
        ('JEAN-MARC & LÉA', 'Jean-Marc & Léa'),
        ('DJ MKY', 'DJ MKY'),
        ('Jeff & GHYS', 'Jeff & Ghys'),
        ('ESTEBAN JR & BONDE', 'Esteban Jr & Bonde'),
    ],
)
def test_names(raw: str, tidy: str) -> None:
    assert tidy_name(raw) == tidy


@pytest.mark.parametrize(
    ('raw', 'tidy'),
    [
        ('WEnd Kizomba Lille | ALL IN ONE | 23 au 25 Octobre', 'WEnd Kizomba Lille'),
        ('PRAGUE KWANZA FESTIVAL 2026 – Official 8.edition', 'Prague Kwanza Festival – 8.edition'),
        ('Baila Conmigo Congress Latino 2026 **Official event', 'Baila Conmigo Congress Latino'),
        ('Autêntica Weekend 16,17,18-01-2026', 'Autêntica Weekend'),
        ('MKC + LOGIA 2026. SURVIVORS', 'MKC + Logia. Survivors'),
        (
            'FREEDOM ROMANTIC FESTIVAL – 10 EME EDITION SPECIALE CHATEAU – 17/18/19/20/21 FEVRIER 2027',
            'Freedom Romantic Festival – 10 Eme Edition Speciale Chateau',
        ),
        ('KIZZ KISS Festival 2026 – Dream Reloaded', 'KIZZ KISS Festival – Dream Reloaded'),
        ('Dubai Kizomba Fusion x ILKSF 2026', 'Dubai Kizomba Fusion x ILKSF'),
        ('SoWeKiz 7.0', 'SoWeKiz 7.0'),  # an edition's number is no date
        ('Glasgow Kizomba Festival 5.0', 'Glasgow Kizomba Festival 5.0'),
        ('Iceland Social Dance – 17/19.April 2026', 'Iceland Social Dance'),
        ('2026', '2026'),  # nothing left: keep what was listed
    ],
)
def test_titles(raw: str, tidy: str) -> None:
    assert tidy_title(raw) == tidy


def test_venue() -> None:
    assert soften_caps('IBIS STYLE NEUVILLE EN FERRAIN') == 'Ibis Style Neuville en Ferrain'


def test_a_tidied_name_or_title_is_tidy() -> None:
    """Tidying what is tidy changes nothing, so a name or title tidied twice is shown as tidied once: over every name
    the export's line-ups write and every festival title it lists."""
    with db.opened(EXPORT, 'ro') as con:
        names = con.column(str, 'select distinct name_as_written from artist_mentions order by 1')
        titles = con.column(str, 'select distinct title from events order by 1')
    assert names
    assert titles
    assert [n for n in names if tidy_name(tidy_name(n)) != tidy_name(n)] == []
    assert [t for t in titles if tidy_title(tidy_title(t)) != tidy_title(t)] == []
