// Countries: which scenes are worth a trip from home. One row per country: what's coming up, what the
// flights to those festivals cost, and what the scene is like.

import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createMemo, For } from 'solid-js';
import { artistCountries } from './artists.tsx';
import { check, chosen, leftOut, segments } from './controls.tsx';
import { one, q, sql } from './db.ts';
import { cheapestFlights } from './fares.ts';
import { festivals } from './festivals.ts';
import { money, within } from './money.ts';
import type { ViewProps } from './mount.tsx';
import { artistsHref, changed, countriesHref, festivalsHref, mapHref, readState } from './routes.ts';
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

const DEFAULTS: { sort: Sort; all: number } = { sort: 'upcoming', all: 0 };
// a country's line, from country_stats and its festivals coming up
const COUNTRY = {
  country_code: str,
  events: num,
  taxi_dancers: num,
  avg_lineup: opt(num),
  imported_pct: opt(num),
  unknown_country: num,
  upcoming: opt(num),
  reachable: opt(num),
} as const;
type Country = { [K in keyof typeof COUNTRY]: ReturnType<(typeof COUNTRY)[K]> } & {
  readonly name: string;
  readonly fare: { readonly airport_city: string | null; readonly price: number } | null;
};

export function countries({ qs }: ViewProps): JSX.Element {
  const read = readState(qs, DEFAULTS, { sort: SORTS.map(([v]) => v), all: [0, 1] });
  const [st, set] = chosen<Readonly<typeof DEFAULTS>>(read.state, (now) => countriesHref(changed(now, DEFAULTS)));
  const withArtists = new Set(artistCountries());
  // the cheapest Fri→Mon return to any of the country's upcoming festivals, and the city it lands in
  const fares = cheapestFlights(festivals());
  // "coming up" runs from today to the last listed festival; most are only listed a few months ahead
  const last = one({ d: opt(str) }, sql`SELECT max(start_date) AS d FROM event_rows WHERE upcoming`)?.d ?? null;
  const rows: Country[] = q(
    COUNTRY,
    sql`SELECT cs.*, u.upcoming, u.reachable FROM country_stats cs
      LEFT JOIN (SELECT country_code, sum(upcoming) AS upcoming, sum(upcoming AND airport IS NOT NULL) AS reachable
        FROM event_rows GROUP BY country_code) u ON u.country_code = cs.country_code
      WHERE cs.country_code IS NOT NULL`,
  ).map((r) => ({ ...r, name: countryName(r.country_code), fare: fares.get(r.country_code) ?? null }));
  const up = (r: Country) => r.upcoming ?? 0;
  const orders: Record<Sort, (a: Country, b: Country) => number> = {
    upcoming: (a, b) => up(b) - up(a) || b.events - a.events,
    fare: (a, b) => (a.fare?.price ?? 1e9) - (b.fare?.price ?? 1e9) || up(b) - up(a),
    open: (a, b) => (b.imported_pct ?? -1) - (a.imported_pct ?? -1) || up(b) - up(a),
  };
  const shown = createMemo(() => {
    const { all, sort } = st();
    return rows.filter((r) => all !== 0 || (r.upcoming ?? 0) > 0).sort(orders[sort]);
  });

  return (
    <>
      {leftOut(read.dropped)}
      <section class="countries-page">
        <header class="page-intro">
          <h1>Where the scenes are</h1>
          <p>
            {`Every country with festivals in the listings: how many are coming up, what flying there from ${home().city} costs, and whether the line-ups are mostly local or international.`}
          </p>
        </header>
        <div class="map-bar">
          <span class="sort-label">Sort by</span>
          {segments(
            'Order',
            SORTS,
            () => st().sort,
            (sort) => set({ sort }),
          )}
          {check(' Include countries with nothing coming up', read.state.all !== 0, (on) => set({ all: on ? 1 : 0 }))}
        </div>
        <p class="list-summary">
          {`${shown().length} countries${st().all || last === null ? ' in the listings' : ` with festivals until ${monthYear(last)}`}`}
        </p>
        <ul class="country-list">
          <For each={shown()}>{(r) => row(r, withArtists)}</For>
        </ul>
      </section>
    </>
  );
}

// the cheapest flight to a country, or why there is none
function flightLine(r: Country): JSX.Element {
  const cheap = r.fare !== null && within(r.fare.price, 'flight', 'cheap');
  return (
    <p class={['flight', cheap && 'easy']}>
      {r.fare ? (
        <>
          {'✈ from '}
          <strong>{money(r.fare.price, 'EUR', { approx: true })}</strong>
          {` to ${r.fare.airport_city}`}
        </>
      ) : (
        <span class="muted">
          {(r.upcoming ?? 0) > 0 && (r.reachable ?? 0) === 0
            ? `✈ too far from ${home().city} for our flight prices`
            : '✈ no flight prices yet'}
        </span>
      )}
    </p>
  );
}
// what kind of scene it is, and how big its line-ups are
function sceneLine(r: Country): JSX.Element {
  const line = [
    scene(r.imported_pct),
    r.avg_lineup !== null && r.avg_lineup >= 1 ? `about ${Math.round(r.avg_lineup)} per festival` : null,
  ]
    .filter(Boolean)
    .join(', ');
  if (!line) return null;
  const title =
    r.imported_pct === null
      ? undefined
      : `${r.imported_pct}% of teacher and DJ bookings go to artists from other countries${r.unknown_country ? ` (${r.unknown_country} of unknown country)` : ''}`;
  return (
    <p class="c-fact" title={title}>
      {line}
    </p>
  );
}
function row(r: Country, artists: ReadonlySet<string>): JSX.Element {
  const upcoming = (r.upcoming ?? 0) > 0;
  return (
    <li class="country-row">
      <div class="c-head">
        <h2>
          <span class="c-flag" aria-hidden="true">
            {flag(r.country_code)}
          </span>
          {r.name}
        </h2>
        <p class="c-num">
          <strong>{r.upcoming}</strong>
          <span>{r.upcoming === 1 ? 'festival coming up' : 'festivals coming up'}</span>
        </p>
      </div>
      {flightLine(r)}
      {sceneLine(r)}
      {r.taxi_dancers ? (
        <p class="c-fact">{`${r.taxi_dancers} of its ${r.events} listed festivals with taxi dancers`}</p>
      ) : null}
      <p class="c-links">
        {upcoming ? (
          <>
            <a href={festivalsHref({ country: r.country_code, when: 'year' })}>Festivals</a>
            {' · '}
          </>
        ) : null}
        <a href={mapHref({ country: r.country_code, when: upcoming ? 'upcoming' : 'all' })}>Map</a>
        {/* the artist list narrowed to it, where the list has it (artists.artistCountries) */}
        {artists.has(r.country_code) ? (
          <>
            {' · '}
            <a href={artistsHref({ country: r.country_code })}>Artists</a>
          </>
        ) : null}
      </p>
    </li>
  );
}
