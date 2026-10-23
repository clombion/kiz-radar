import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / 'pipeline'))
from kizomba_world import text, emoji_text, page_fields

# event page markup as kizomba-world serves it, cut down to the parts the scraper reads
PAGE = '''<link rel="alternate" hreflang="fr" href="https://kizomba-world.com/fr/evenement/x/">
<link rel="alternate" hreflang="es" href="https://kizomba-world.com/es/evento/x/">
<ul><li>
    <span>Venue : </span>
        <span
            class="etn-location-name">Novotel Paris Est</span>
</li><li>
    <span>Adress : </span>
        <span
            class="etn-location-name">1 Av. de la R&eacute;publique, 93170 Bagnolet</span>
</li><li>
    <span>Location : </span>
        <span
            class="etn-location-name">Paris</span>
        <span
            class="etn-location-name">France</span>
</li></ul>
<div class="etn-block-deal-detail"><span><a href="https://www.kizzbee.com/product/x/" class="btn_pink" data-id="1" data-stat-type="deal" target="_blank">Get the deal ✨ </a></span></div>
<div class="etn-social-links "><ul><li><a href="https://www.facebook.com/events/1" target="_blank"></a></li>
<li><a href="https://www.instagram.com/x" target="_blank"></a></li></ul></div>'''
CANCELLED = '<style>.etn-single-event-media::after { content: "Cancelled"; position: absolute; }</style>'


def test_page_fields():
    assert page_fields(PAGE) == {
        'venue': 'Novotel Paris Est', 'address': '1 Av. de la République, 93170 Bagnolet', 'city': 'Paris',
        'country': 'France', 'deal_text': 'Get the deal ✨', 'deal_url': 'https://www.kizzbee.com/product/x/',
        'links': ['https://www.facebook.com/events/1', 'https://www.instagram.com/x'],
        'url_fr': 'https://kizomba-world.com/fr/evenement/x/', 'url_es': 'https://kizomba-world.com/es/evento/x/',
        'url_pt': None, 'cancelled': 0}


def test_cancelled_stamp():
    assert page_fields(PAGE + CANCELLED)['cancelled'] == 1
    # a country without a city leaves the city empty
    only_country = '<span>Location : </span> <span class="etn-location-name">Portugal</span>'
    assert (page_fields(only_country)['city'], page_fields(only_country)['country']) == (None, 'Portugal')


def test_description_text():
    html = ('<div class="x">Balumuka is Back!<br class="html-br" />Prague&nbsp;&#8217;26</div>'
            '<p>  Teachers:  <span>Ami</span> </p><p></p>')
    assert text(html) == 'Balumuka is Back!\nPrague ’26\nTeachers: Ami'


def test_emoji_images_become_emoji():
    img = '<img decoding="async" class="x" src="https://static.xx.fbcdn.net/images/emoji.php/v9/t1/1/16/2764.png" alt="&#x2764;&#xfe0f;" width="16" height="16" />'
    assert emoji_text(f'Love {img}!') == 'Love ❤️!'
    assert emoji_text('<img src="https://kizomba-world.com/poster.jpg" alt="poster">') == '<img src="https://kizomba-world.com/poster.jpg" alt="poster">'
