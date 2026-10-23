// The SQL page: free queries against the database, run in the browser.
import { q, exec } from './db.js';
import { h } from './ui.js';

const EXAMPLES = [
  ['Most booked artists in Poland', `SELECT a.display_name, ac.bookings, st.home_country, st.bookings AS total
FROM artist_countries ac JOIN artists a ON a.id = ac.artist_id JOIN artist_stats st ON st.artist_id = a.id
WHERE ac.country_code = 'PL' ORDER BY ac.bookings DESC LIMIT 25;`],
  ['Cheapest festival weekends', `SELECT e.title, e.city, e.weekend_friday, f.price
FROM events e JOIN fares f ON f.airport = e.airport AND f.depart = e.weekend_friday
WHERE e.weekend_friday >= date('now') ORDER BY f.price LIMIT 25;`],
  ['Festivals with taxi dancers', `SELECT e.title, e.city, e.country_code, e.start_date
FROM events e JOIN event_stats s ON s.event_id = e.id WHERE s.taxi_dancers = 1 ORDER BY e.start_date;`],
  ['Artists booked in most countries', `SELECT a.display_name, st.countries, st.bookings, st.home_country
FROM artist_stats st JOIN artists a ON a.id = st.artist_id ORDER BY st.countries DESC, st.bookings DESC LIMIT 25;`],
  ['Fares per airport (next 3 months)', `SELECT airport, count(*) AS weekends, min(price) AS cheapest, round(avg(price)) AS average
FROM fares WHERE depart BETWEEN date('now') AND date('now', '+3 months') GROUP BY airport ORDER BY average;`],
  ['What each table holds', `SELECT name, description FROM table_docs ORDER BY name;`],
];

export function sqlView(root) {
  const area = h('textarea', { rows: 8, spellcheck: 'false', 'aria-label': 'SQL query' }, EXAMPLES[0][1]);
  const out = h('div', { class: 'sql-out', 'aria-live': 'polite' });
  const run = () => {
    try {
      const res = exec(area.value);
      if (!res.length) { out.replaceChildren(h('p', { class: 'muted' }, 'No rows.')); return; }
      out.replaceChildren(...res.map(({ columns, values }) => h('div', { class: 'table-wrap' },
        h('p', { class: 'muted small' }, `${values.length} row${values.length === 1 ? '' : 's'}${values.length > 1000 ? ' (first 1000 shown)' : ''}`),
        h('table', {}, h('thead', {}, h('tr', {}, columns.map(c => h('th', { scope: 'col' }, c)))),
          h('tbody', {}, values.slice(0, 1000).map(v => h('tr', {}, v.map(x => h('td', { class: typeof x === 'number' ? 'num' : '' }, x == null ? 'NULL' : x)))))))));
    } catch (e) { out.replaceChildren(h('p', { class: 'error' }, String(e.message || e))); }
  };
  area.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
  const tables = q(`SELECT m.name, m.type, d.description FROM sqlite_master m LEFT JOIN table_docs d ON d.name = m.name
    WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name`);
  root.replaceChildren(h('section', { class: 'sqlview' },
    h('div', {},
      h('h2', {}, 'SQL'),
      h('p', { class: 'muted' }, 'The whole database runs in your browser (sql.js). Queries cannot change the published data.'),
      h('div', { class: 'toolbar' },
        h('select', { 'aria-label': 'Example queries', onchange: ev => { area.value = EXAMPLES[ev.target.value][1]; run(); } },
          EXAMPLES.map(([t], i) => h('option', { value: i }, t))),
        h('button', { onclick: run }, 'Run (Ctrl+Enter)')),
      area, out),
    h('aside', { class: 'schema' }, h('h3', {}, 'Tables'),
      h('ul', {}, tables.map(t => h('li', {},
        h('button', { class: 'link', title: 'Insert a query for this table', onclick: () => { area.value = `SELECT * FROM ${t.name} LIMIT 50;`; run(); } }, t.name),
        t.type === 'view' ? h('small', { class: 'muted' }, ' view') : null,
        t.description ? h('p', { class: 'small muted' }, t.description) : null))))));
  run();
}
