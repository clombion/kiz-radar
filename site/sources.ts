// The sources page: where each kind of data comes from, under what licence, and who to thank, a short section each.
// It names no company a price is resold by, and no model by its maker: the admin's rule, so the page promotes no one
// (tests/site/views.browser.test.ts holds it).
import { site } from './db.ts';
import { h, type Kid } from './dom.ts';
import { sqlHref } from './routes.ts';
import { dayYear, home, monthYear } from './ui.ts';

const link = (href: string, text: string) => h('a', { href }, text);
const part = (title: string, ...paragraphs: Kid[][]) =>
  h(
    'section',
    {},
    h('h3', {}, title),
    paragraphs.map((p) => h('p', {}, p)),
  );

// what the festival data covers and when it was built, from site.json
function freshness(): string {
  const {
    events_range: [from, to],
    built_at,
  } = site();
  return `It covers ${monthYear(from)} to ${monthYear(to)} and was last updated on ${dayYear(built_at)}.`;
}

export function sourcesView(root: HTMLElement): void {
  const city = home().city;
  root.replaceChildren(
    h(
      'article',
      { class: 'sources' },
      h('h2', {}, 'Sources and acknowledgements'),
      h('p', { class: 'muted' }, 'Where the site’s data comes from, and the open projects it is built on. Thank you.'),
      part('Festival listings', [
        'The festivals, their line-ups and their descriptions are from ',
        link('https://kizomba-world.com/', 'kizomba-world.com'),
        ', used under ',
        link('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0'),
        '; the festival data here is shared under the same licence. ',
        h('span', { id: 'freshness' }, freshness()),
      ]),
      part(
        'Flight prices',
        [
          `Flight prices are Friday-to-Monday returns from ${city} found on Google Flights with `,
          link('https://github.com/punitarani/fli', 'fli'),
          '. A festival’s weekend is searched again every week in the five weeks before it, and less often the further away it is, down to every six weeks.',
        ],
        [
          'Where Google shows a flight with no price, and for a cheaper trip on separate tickets, the price is a reseller’s, and the site says so. Prices change often, so check before booking.',
        ],
      ),
      part('Pass prices', [
        'Pass prices are read from each festival’s ticket page or, where it has none that can be read, by an AI model from its description. Each is checked, and converted with the European Central Bank’s daily rates.',
      ]),
      part('Exchange rates', [
        'Prices in another currency are converted with the ',
        link(
          'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
          'euro reference rates',
        ),
        ' the European Central Bank publishes each working day, and marked “~”.',
      ]),
      part(
        'Maps and places',
        [
          'Country borders are from ',
          link('https://www.naturalearthdata.com/', 'Natural Earth'),
          ', in the public domain, through the ',
          link('https://github.com/topojson/world-atlas', 'world-atlas'),
          ' package.',
        ],
        [
          'Each festival’s city is placed with ',
          link('https://nominatim.org/', 'Nominatim'),
          ', from OpenStreetMap data, © ',
          link('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors'),
          ', available under the Open Database Licence (ODbL).',
        ],
      ),
      part('Airports', [
        'The airports a festival can fly to, those with scheduled flights within 250 km of its city, are from ',
        link('https://ourairports.com/data/', 'OurAirports'),
        ', in the public domain.',
      ]),
      part('Travel times from the airports', [
        'Coming soon: the time it takes from each airport to the festival’s city, by public transport, will come from ',
        link('https://transitous.org/', 'Transitous'),
        ', an open journey planner built on public transport data from many operators (',
        link('https://transitous.org/sources/', 'its sources'),
        ').',
      ]),
      part(
        'Code',
        [
          'The site’s code is on ',
          link('https://github.com/clombion/kiz-radar', 'GitHub'),
          ', and the whole database can be queried in your browser on the ',
          link(sqlHref(), 'SQL page'),
          '.',
        ],
        [
          'The map is drawn with ',
          link('https://leafletjs.com/', 'Leaflet'),
          ', the database runs with ',
          link('https://github.com/sql-js/sql.js', 'sql.js'),
          ', and the text is set in ',
          link('https://rsms.me/inter/', 'Inter'),
          ' and ',
          link('https://github.com/googlefonts/caveat', 'Caveat'),
          ', under the SIL Open Font License.',
        ],
      ),
    ),
  );
}
