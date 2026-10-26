import pathlib
from pipeline.text import tidy_name, tidy_title, soften_caps
import pytest


@pytest.mark.parametrize('raw, tidy', [
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
])
def test_names(raw, tidy):
    assert tidy_name(raw) == tidy


@pytest.mark.parametrize('raw, tidy', [
    ('WEnd Kizomba Lille | ALL IN ONE | 23 au 25 Octobre', 'WEnd Kizomba Lille'),
    ('PRAGUE KWANZA FESTIVAL 2026 – Official 8.edition', 'Prague Kwanza Festival – 8.edition'),
    ('Baila Conmigo Congress Latino 2026 **Official event', 'Baila Conmigo Congress Latino'),
    ('Autêntica Weekend 16,17,18-01-2026', 'Autêntica Weekend'),
    ('MKC + LOGIA 2026. SURVIVORS', 'MKC + Logia. Survivors'),
    ('FREEDOM ROMANTIC FESTIVAL – 10 EME EDITION SPECIALE CHATEAU – 17/18/19/20/21 FEVRIER 2027',
     'Freedom Romantic Festival – 10 Eme Edition Speciale Chateau'),
    ('KIZZ KISS Festival 2026 – Dream Reloaded', 'KIZZ KISS Festival – Dream Reloaded'),
    ('Dubai Kizomba Fusion x ILKSF 2026', 'Dubai Kizomba Fusion x ILKSF'),
    ('2026', '2026'),                      # nothing left: keep what was listed
])
def test_titles(raw, tidy):
    assert tidy_title(raw) == tidy


def test_venue():
    assert soften_caps('IBIS STYLE NEUVILLE EN FERRAIN') == 'Ibis Style Neuville en Ferrain'


def test_home_airport_is_only_named_in_airports_csv():
    pipeline = pathlib.Path(__file__).parent.parent / 'pipeline'
    assert [p.name for p in pipeline.glob('*.py') if "'BGO'" in p.read_text() or '"BGO"' in p.read_text()] == []
