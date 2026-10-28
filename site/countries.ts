// Countries: which scenes are worth a trip from home. One row per country: what's coming up, what the
// flights to those festivals cost, and what the scene is like.
import { one, q, sql } from './db.ts';
import { h, segments } from './dom.ts';
import { changed, readState } from './festivals.ts';
import { convert, money, step } from './money.ts';
import { artistsHref, countriesHref, festivalsHref, mapHref, showInAddressBar } from './routes.ts';
import { num, opt, str } from './rows.ts';
import { countryName, flag, home, monthYear } from './ui.ts';

// sorted by: festivals coming up, the cheapest flight, the share of visiting artists
type Sort = 'upcoming' | 'fare' | 'open';
const SORTS: readonly (readonly [Sort, string])[] = [
  ['upcoming', 'Festivals coming up'],
  ['fare', 'Flight price'],
  ['open', 'Visiting artists'],
];

// share of teacher and DJ bookings that go to artists from elsewhere, in words
const scene = (pct: number | null) =>
  pct == null
    ? null
    : pct >= 50
      ? 'Mostly visiting artists'
      : pct >= 25
        ? 'Local and visiting artists'
        : 'Mostly local artists';

const DEFAULTS: { sort: string; all: number } = { sort: 'upcoming', all: 0 };
// a country's line, from country_stats and its festivals coming up
const COUNTRY = {
  country_code: str,
  events: num,
  taxi_dancers: num,
  avg_lineup: opt(num),
  imported_pct: opt(num),
  upcoming: opt(num),
  reachable: opt(num),
} as const;
type Country = { [K in keyof typeof COUNTRY]: ReturnType<(typeof COUNTRY)[K]> } & {
  name: string;
  fare: { airport_city: string | null; price: number } | null;
};

export function countriesView(root: HTMLElement, qs: string): void {
  const st = readState(qs, DEFAULTS, { sort: SORTS.map(([v]) => v), all: [0, 1] });
  // the cheapest Fri→Mon return to any of the country's upcoming festivals, and the city it lands in
  const fares = new Map(
    q(
      { country_code: opt(str), airport_city: opt(str), price: num },
      sql`SELECT e.country_code, e.airport_city, min(f.price) AS price FROM event_rows e
      JOIN fares f ON f.airport = e.airport AND f.depart = e.weekend_friday
      WHERE e.upcoming AND e.airport != ? GROUP BY e.country_code`,
      [home().code],
    ).map((r) => [r.country_code, r]),
  );
  // "coming up" runs from today to the last listed festival; most are only listed a few months ahead
  const last = one({ d: opt(str) }, sql`SELECT max(start_date) AS d FROM event_rows WHERE upcoming`)?.d ?? null;
  const rows: Country[] = q(
    COUNTRY,
    sql`SELECT cs.*, u.upcoming, u.reachable FROM country_stats cs
      LEFT JOIN (SELECT country_code, sum(upcoming) AS upcoming, sum(upcoming AND airport IS NOT NULL) AS reachable
        FROM event_rows GROUP BY country_code) u ON u.country_code = cs.country_code
      WHERE cs.country_code IS NOT NULL`,
  ).map((r) => ({ ...r, name: countryName(r.country_code), fare: fares.get(r.country_code) ?? null }));

  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Order' });
  const allBox = h('input', {
    type: 'checkbox',
    checked: Boolean(st.all),
    onchange: () => {
      st.all = allBox.checked ? 1 : 0;
      render();
    },
  });
  const list = h('ul', { class: 'country-list' });
  const summary = h('p', { class: 'list-summary' });
  root.replaceChildren(
    h(
      'section',
      { class: 'countries-page' },
      h(
        'header',
        { class: 'page-intro' },
        h('h1', {}, 'Where the scenes are'),
        h(
          'p',
          {},
          `Every country with festivals in the listings: how many are coming up, what flying there from ${home().city} costs, and whether the line-ups are mostly local or international.`,
        ),
      ),
      h(
        'div',
        { class: 'map-bar' },
        h('span', { class: 'sort-label' }, 'Sort by'),
        seg,
        h('label', { class: 'check' }, allBox, ' Include countries with nothing coming up'),
      ),
      summary,
      list,
    ),
  );

  function render() {
    showInAddressBar(countriesHref(changed(st, DEFAULTS)));
    seg.replaceChildren(
      ...segments(SORTS, st.sort, (v) => {
        st.sort = v;
        render();
      }),
    );
    const up = (r: Country) => r.upcoming ?? 0;
    const orders: Record<Sort, (a: Country, b: Country) => number> = {
      upcoming: (a, b) => up(b) - up(a) || b.events - a.events,
      fare: (a, b) => (a.fare?.price ?? 1e9) - (b.fare?.price ?? 1e9) || up(b) - up(a),
      open: (a, b) => (b.imported_pct ?? -1) - (a.imported_pct ?? -1) || up(b) - up(a),
    };
    const by = orders[SORTS.find(([v]) => v === st.sort)?.[0] ?? 'upcoming'];
    const shown = rows.filter((r) => st.all || r.upcoming).sort(by);
    summary.textContent = `${shown.length} countries${st.all || last === null ? ' in the listings' : ` with festivals until ${monthYear(last)}`}`;
    list.replaceChildren(...shown.map(row));
  }
  render();
}

// the cheapest flight to a country, or why there is none
function flightLine(r: Country): HTMLElement {
  const cheap = r.fare !== null && (convert(r.fare.price) ?? Number.POSITIVE_INFINITY) <= step('flight', 'cheap');
  return h(
    'p',
    { class: `flight${cheap ? ' easy' : ''}` },
    r.fare
      ? ['✈ from ', h('strong', {}, money(r.fare.price, 'EUR', { approx: true })), ` to ${r.fare.airport_city}`]
      : h(
          'span',
          { class: 'muted' },
          r.upcoming && !r.reachable ? `✈ too far from ${home().city} for our flight prices` : '✈ no flight prices yet',
        ),
  );
}
// what kind of scene it is, and how big its line-ups are
function sceneLine(r: Country): HTMLElement | null {
  const line = [
    scene(r.imported_pct),
    r.avg_lineup !== null && r.avg_lineup >= 1 ? `about ${Math.round(r.avg_lineup)} per festival` : null,
  ]
    .filter(Boolean)
    .join(', ');
  if (!line) return null;
  const title =
    r.imported_pct === null ? null : `${r.imported_pct}% of teacher and DJ bookings go to artists from other countries`;
  return h('p', { class: 'c-fact', title }, line);
}
function row(r: Country): HTMLElement {
  return h(
    'li',
    { class: 'country-row' },
    h(
      'div',
      { class: 'c-head' },
      h('h2', {}, h('span', { class: 'c-flag', 'aria-hidden': 'true' }, flag(r.country_code)), r.name),
      h(
        'p',
        { class: 'c-num' },
        h('strong', {}, r.upcoming),
        h('span', {}, r.upcoming === 1 ? 'festival coming up' : 'festivals coming up'),
      ),
    ),
    flightLine(r),
    sceneLine(r),
    r.taxi_dancers
      ? h('p', { class: 'c-fact' }, `${r.taxi_dancers} of its ${r.events} listed festivals with taxi dancers`)
      : null,
    h(
      'p',
      { class: 'c-links' },
      r.upcoming
        ? [h('a', { href: festivalsHref({ country: r.country_code, months: 12 }) }, 'Festivals'), ' · ']
        : null,
      h('a', { href: mapHref({ country: r.country_code, when: r.upcoming ? 'upcoming' : 'all' }) }, 'Map'),
      ' · ',
      h('a', { href: artistsHref({ country: r.country_code }) }, 'Artists'),
    ),
  );
}
