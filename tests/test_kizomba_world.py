from pipeline.kizomba_world import ApiEvent, Paged, api_fields, emoji_text, page_fields, text
from tests.samples import API, CANCELLED, PAGE


def test_page_fields() -> None:
    assert page_fields(PAGE) == (
        Paged(
            venue='Novotel Paris Est',
            address='1 Av. de la République, 93170 Bagnolet',
            city='Paris',
            country='France',
            deal_text='Get the deal ✨',
            deal_url='https://www.kizzbee.com/product/x/',
            url_fr='https://kizomba-world.com/fr/evenement/x/',
            url_es='https://kizomba-world.com/es/evento/x/',
            url_pt=None,
            cancelled=0,
        ),
        ['https://www.facebook.com/events/1', 'https://www.instagram.com/x'],
    )


def test_cancelled_stamp() -> None:
    assert page_fields(PAGE + CANCELLED)[0].cancelled == 1
    # a country without a city leaves the city empty
    only_country = page_fields('<span>Location : </span> <span class="etn-location-name">Portugal</span>')[0]
    assert (only_country.city, only_country.country) == (None, 'Portugal')


def test_an_api_record_reads_as_the_events_row_and_its_tags() -> None:
    listed, categories, tags = api_fields(ApiEvent.model_validate(API))
    assert (listed.id, listed.title, listed.featured, listed.website, listed.image_url) == (
        17001,
        'Kizz & Fun',
        1,
        None,
        None,
    )
    assert (listed.description_text, categories, tags) == ('Hello', ['Festival'], ['All in One', 'Zouk'])
    with_image = ApiEvent.model_validate(API | {'image': {'url': 'https://kizomba-world.com/p.jpg', 'width': 9}})
    assert api_fields(with_image)[0].image_url == 'https://kizomba-world.com/p.jpg'


def test_description_text() -> None:
    html = (
        '<div class="x">Balumuka is Back!<br class="html-br" />Prague&nbsp;&#8217;26</div>'
        '<p>  Teachers:  <span>Ami</span> </p><p></p>'
    )
    assert text(html) == 'Balumuka is Back!\nPrague ’26\nTeachers: Ami'


def test_emoji_images_become_emoji() -> None:
    img = (
        '<img decoding="async" class="x" src="https://static.xx.fbcdn.net/images/emoji.php/v9/t1/1/16/2764.png" '
        'alt="&#x2764;&#xfe0f;" width="16" height="16" />'
    )
    assert emoji_text(f'Love {img}!') == 'Love ❤️!'
    assert (
        emoji_text('<img src="https://kizomba-world.com/poster.jpg" alt="poster">')
        == '<img src="https://kizomba-world.com/poster.jpg" alt="poster">'
    )
