// Explore → Countries (sortable statistics) and Explore → SQL (free queries against the database).
import { q, exec } from './db.js';
import { h, flag, countryName, euro, today, addDays } from './ui.js';

export function countriesView(root, home) {
  const from = today(), to = addDays(from, 183);
  // median Fri→Mon fare per airport over the next 6 months
  const median = Object.fromEntries(q(`SELECT airport, group_concat(price) AS ps FROM fares WHERE depart BETWEEN ? AND ? GROUP BY airport`, [from, to])
    .map(r => { const v = r.ps.split(',').map(Number).sort((a, b) => a - b); return [r.airport, { med: v[Math.floor(v.length / 2)], lo: v[0] }]; }));
  // each country's cheapest airport among those serving its festivals
  const served = {};
  for (const r of q('SELECT DISTINCT country_code, airport FROM events WHERE airport IS NOT NULL AND country_code IS NOT NULL'))
    (served[r.country_code] ||= []).push(r.airport);
  const best = cc => (served[cc] || []).filter(a => median[a]).sort((a, b) => median[a].med - median[b].med)[0] || null;
  const rows = q(`SELECT cs.*, (SELECT count(*) FROM events e WHERE e.country_code = cs.country_code AND e.weekend_friday >= ? AND e.cancelled IS NOT 1) AS upcoming
    FROM country_stats cs WHERE cs.country_code IS NOT NULL`, [from])
    .map(r => { const a = best(r.country_code);
      return { ...r, name: countryName(r.country_code), airport: a, fare: a ? median[a].med : null, low: a ? median[a].lo : null }; });
  const cols = [
    ['name', 'Country', r => [flag(r.country_code), ' ', h('a', { href: `#map?country=${r.country_code}&when=all` }, r.name)]],
    ['events', 'Events'], ['upcoming', 'Upcoming'], ['kiz_only', 'Kiz-only'], ['taxi_dancers', 'Taxi dancers'],
    ['avg_lineup', 'Avg line-up'], ['popular_bookings', 'Popular-artist bookings'], ['imported_pct', 'Imported artists', r => r.imported_pct == null ? '—' : r.imported_pct + '%'],
    ['airport', 'Cheapest airport', r => r.airport || '—'], ['fare', 'Median fare (6 mo)', r => euro(r.fare)], ['low', 'Lowest', r => euro(r.low)],
  ];
  let sortKey = 'events', dir = -1;
  const tbody = h('tbody');
  const heads = cols.map(([k, label]) => h('th', { scope: 'col' },
    h('button', { class: 'sort', onclick: () => { dir = sortKey === k ? -dir : (k === 'name' || k === 'fare' || k === 'low' ? 1 : -1); sortKey = k; paint(); } }, label)));
  function paint() {
    rows.sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
    heads.forEach((th, i) => th.setAttribute('aria-sort', cols[i][0] === sortKey ? (dir > 0 ? 'ascending' : 'descending') : 'none'));
    tbody.replaceChildren(...rows.map(r => h('tr', {}, cols.map(([k, , f], i) => h(i ? 'td' : 'th', i ? { class: typeof r[k] === 'number' || ['fare', 'low', 'imported_pct'].includes(k) ? 'num' : '' } : { scope: 'row' }, f ? f(r) : (r[k] ?? '—'))))));
  }
  root.replaceChildren(h('section', { class: 'countries' },
    h('h2', {}, 'Countries'),
    h('p', { class: 'muted' }, `Imported artists: share of teacher and DJ bookings going to artists whose home country is elsewhere — a rough sign of how open a scene is to outsiders. Fares: Fri→Mon returns from ${home} over the next 6 months, to the cheapest airport serving the country’s festivals.`),
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, heads)), tbody))));
  paint();
}

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
