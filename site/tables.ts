// The SQL page: free queries against the database, run in the browser.
import type { SqlValue } from 'sql.js';
import { exec, q, sql } from './db.ts';
import { button, h } from './dom.ts';
import { opt, str } from './rows.ts';

const EXAMPLES: readonly (readonly [string, string])[] = [
  [
    'Most booked artists in Poland',
    `SELECT a.display_name, ac.bookings, st.home_country, st.bookings AS total
FROM artist_countries ac JOIN artists a ON a.id = ac.artist_id JOIN artist_stats st ON st.artist_id = a.id
WHERE ac.country_code = 'PL' ORDER BY ac.bookings DESC LIMIT 25;`,
  ],
  [
    'Cheapest festival weekends',
    `SELECT e.title, e.city, e.weekend_friday, f.price
FROM event_rows e JOIN fares f ON f.airport = e.airport AND f.depart = e.weekend_friday
WHERE e.upcoming ORDER BY f.price LIMIT 25;`,
  ],
  [
    'Festivals with taxi dancers',
    `SELECT title, city, country_code, start_date
FROM event_rows WHERE upcoming AND taxi_dancers = 1 ORDER BY start_date;`,
  ],
  [
    'Artists booked in most countries',
    `SELECT a.display_name, st.countries, st.bookings, st.home_country
FROM artist_stats st JOIN artists a ON a.id = st.artist_id ORDER BY st.countries DESC, st.bookings DESC LIMIT 25;`,
  ],
  [
    'Fares per airport (next 3 months)',
    `SELECT airport, count(*) AS weekends, min(price) AS cheapest, round(avg(price)) AS average
FROM fares WHERE depart BETWEEN date('now') AND date('now', '+3 months') GROUP BY airport ORDER BY average;`,
  ],
  ['What each table holds', 'SELECT name, description FROM table_docs ORDER BY name;'],
];

// a value of a query's result as its cell shows it
const cell = (x: SqlValue) =>
  h(
    'td',
    { class: typeof x === 'number' ? 'num' : '' },
    x === null ? 'NULL' : x instanceof Uint8Array ? `${x.length} bytes` : x,
  );

export function sqlView(root: HTMLElement): void {
  const area = h('textarea', { rows: 8, spellcheck: 'false', 'aria-label': 'SQL query' }, EXAMPLES[0]?.[1]);
  const out = h('div', { class: 'sql-out', 'aria-live': 'polite' });
  const run = () => {
    try {
      const res = exec(area.value);
      if (res.length === 0) {
        out.replaceChildren(h('p', { class: 'muted' }, 'No rows.'));
        return;
      }
      out.replaceChildren(
        ...res.map(({ columns, values }) =>
          h(
            'div',
            { class: 'table-wrap' },
            h(
              'p',
              { class: 'muted small' },
              `${values.length} row${values.length === 1 ? '' : 's'}${values.length > 1000 ? ' (first 1000 shown)' : ''}`,
            ),
            h(
              'table',
              {},
              h(
                'thead',
                {},
                h(
                  'tr',
                  {},
                  columns.map((c) => h('th', { scope: 'col' }, c)),
                ),
              ),
              h(
                'tbody',
                {},
                values.slice(0, 1000).map((v) => h('tr', {}, v.map(cell))),
              ),
            ),
          ),
        ),
      );
    } catch (e) {
      out.replaceChildren(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e)));
    } // the query's own error, for its writer
  };
  area.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });
  const tables = q(
    { name: str, type: str, description: opt(str) },
    sql`SELECT m.name, m.type, d.description FROM sqlite_master m LEFT JOIN table_docs d ON d.name = m.name
    WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name`,
  );
  root.replaceChildren(
    h(
      'section',
      { class: 'sqlview' },
      h(
        'div',
        {},
        h('h2', {}, 'SQL'),
        h(
          'p',
          { class: 'muted' },
          'The whole database runs in your browser (sql.js). Queries cannot change the published data.',
        ),
        h(
          'div',
          { class: 'toolbar' },
          h(
            'select',
            {
              'aria-label': 'Example queries',
              onchange: (ev: Event) => {
                const chosen = ev.target instanceof HTMLSelectElement ? EXAMPLES[Number(ev.target.value)] : undefined;
                if (chosen) {
                  area.value = chosen[1];
                  run();
                }
              },
            },
            EXAMPLES.map(([t], i) => h('option', { value: i }, t)),
          ),
          button({ onclick: run }, 'Run (Ctrl+Enter)'),
        ),
        area,
        out,
      ),
      h(
        'aside',
        { class: 'schema' },
        h('h3', {}, 'Tables'),
        h(
          'ul',
          {},
          tables.map((t) =>
            h(
              'li',
              {},
              button(
                {
                  class: 'link',
                  title: 'Insert a query for this table',
                  onclick: () => {
                    area.value = `SELECT * FROM ${t.name} LIMIT 50;`;
                    run();
                  },
                },
                t.name,
              ),
              t.type === 'view' ? h('small', { class: 'muted' }, ' view') : null,
              t.description ? h('p', { class: 'small muted' }, t.description) : null,
            ),
          ),
        ),
      ),
    ),
  );
  run();
}
