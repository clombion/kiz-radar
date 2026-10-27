"""What kizomba-world serves, cut down to what the scraper reads: an event page, and an event's API record."""

# an event page: its translations, venue, address, place, deal link and the organiser's links
PAGE = """<link rel="alternate" hreflang="fr" href="https://kizomba-world.com/fr/evenement/x/">
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
<div class="etn-block-deal-detail"><span><a href="https://www.kizzbee.com/product/x/" class="btn_pink" data-id="1"
 data-stat-type="deal" target="_blank">Get the deal ✨ </a></span></div>
<div class="etn-social-links "><ul><li><a href="https://www.facebook.com/events/1" target="_blank"></a></li>
<li><a href="https://www.instagram.com/x" target="_blank"></a></li></ul></div>"""
CANCELLED = '<style>.etn-single-event-media::after { content: "Cancelled"; position: absolute; }</style>'

API = {
    'id': '17001',
    'title': 'Kizz &amp; Fun',
    'url': 'https://kizomba-world.com/event/kizz/',
    'slug': 'kizz',
    'start_date': '2027-01-01 18:00:00',
    'end_date': '2027-01-03 23:00:00',
    'utc_start_date': '2027-01-01 17:00:00',
    'utc_end_date': '2027-01-03 22:00:00',
    'timezone': 'Europe/Paris',
    'all_day': False,
    'featured': True,
    'sticky': False,
    'website': '',
    'image': False,
    'description': '<p>Hello</p>',
    'date': '2026-09-01 10:00:00',
    'modified': '2026-10-01 10:00:00',
    'categories': [{'name': 'Festival', 'slug': 'festival'}],
    'tags': [{'name': 'Zouk'}, {'name': 'All in One'}],
    'venue': {'venue': 'unread'},
}
