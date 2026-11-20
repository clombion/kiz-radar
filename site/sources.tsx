// The sources page: where each kind of data comes from, under what licence, and who to thank, a short section each.
// It names no company a price is resold by, and no model by its maker: the admin's rule, so the page promotes no one
// (tests/site/sources.browser.test.ts holds it).
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { site } from './db.ts';
import { sqlHref } from './routes.ts';
import { dayYear, home, monthYear } from './ui.ts';

// a section of the page: its title, and a paragraph of each of what it says
function part(title: string, ...paragraphs: readonly JSX.Element[]): JSX.Element {
  const said = paragraphs.map((p) => <p>{p}</p>);
  return (
    <section>
      <h3>{title}</h3>
      {said}
    </section>
  );
}

// what the festival data covers and when it was built, from site.json
function freshness(): string {
  const {
    events_range: [from, to],
    built_at,
  } = site();
  return `It covers ${monthYear(from)} to ${monthYear(to)} and was last updated on ${dayYear(built_at)}.`;
}

export function sources(): JSX.Element {
  const { city } = home();
  return (
    <article class="sources">
      <h2>Sources and acknowledgements</h2>
      <p class="muted">Where the site’s data comes from, and the open projects it is built on. Thank you.</p>
      {part(
        'Festival listings',
        <>
          The festivals, their line-ups and their descriptions are from{' '}
          <a href="https://kizomba-world.com/">kizomba-world.com</a>, used under{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>; the festival data here is shared
          under the same licence. <span id="freshness">{freshness()}</span>
        </>,
      )}
      {part(
        'Flight prices',
        <>
          Flight prices are Friday-to-Monday returns from {city} found on Google Flights with{' '}
          <a href="https://github.com/punitarani/fli">fli</a>. A festival’s weekend is searched again every week in the
          five weeks before it, and less often the further away it is, down to every six weeks.
        </>,
        'Where Google shows a flight with no price, and for a cheaper trip on separate tickets, the price is a reseller’s, and the site says so. Prices change often, so check before booking.',
      )}
      {part(
        'Pass prices',
        'Pass prices are read from each festival’s ticket page or, where it has none that can be read, by an AI model from its description. Each is checked, and converted with the European Central Bank’s daily rates.',
      )}
      {part(
        'Exchange rates',
        <>
          Prices in another currency are converted with the{' '}
          <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html">
            euro reference rates
          </a>{' '}
          the European Central Bank publishes each working day, and marked “~”.
        </>,
      )}
      {part(
        'Maps and places',
        <>
          Country borders are from <a href="https://www.naturalearthdata.com/">Natural Earth</a>, in the public domain,
          through the <a href="https://github.com/topojson/world-atlas">world-atlas</a> package.
        </>,
        <>
          Each festival’s city is placed with <a href="https://nominatim.org/">Nominatim</a>, from OpenStreetMap data, ©{' '}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, available under the Open
          Database Licence (ODbL).
        </>,
      )}
      {part(
        'Airports',
        <>
          The airports a festival can fly to, those with scheduled flights within 250 km of its city, are from{' '}
          <a href="https://ourairports.com/data/">OurAirports</a>, in the public domain.
        </>,
      )}
      {part(
        'Code',
        <>
          The site’s code is on <a href="https://github.com/clombion/kiz-radar">GitHub</a>, and the whole database can
          be queried in your browser on the <a href={sqlHref()}>SQL page</a>.
        </>,
        <>
          The map is drawn with <a href="https://leafletjs.com/">Leaflet</a>, the database runs with{' '}
          <a href="https://github.com/sql-js/sql.js">sql.js</a>, and the text is set in{' '}
          <a href="https://rsms.me/inter/">Inter</a> and <a href="https://github.com/googlefonts/caveat">Caveat</a>,
          under the SIL Open Font License.
        </>,
      )}
    </article>
  );
}
