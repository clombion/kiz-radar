// Explore → Artists: searchable cards with bookings, home country and where they are booked abroad.
import { q, one } from './db.js';
import { h, flag, countryName, range, where, dayYear, chip } from './ui.js';

const PAGE = 60;

function countriesOf(id) {
  return q(`SELECT country_code, bookings, is_home FROM artist_countries WHERE artist_id = ? AND country_code IS NOT NULL
    ORDER BY is_home DESC, bookings DESC`, [id]);
}

function roleLine(a) {
  return [a.teacher && `${a.teacher}× teaching`, a.dj && `${a.dj}× DJ`, a.performer && `${a.performer}× performing`]
    .filter(Boolean).join(' · ');
}

function homeLine(a) {
  if (!a.home_country) return h('span', { class: 'muted' }, 'Home country unknown');
  const stated = q('SELECT country_code FROM artist_origin WHERE artist_id = ? ORDER BY mentions DESC', [a.artist_id]).map(r => r.country_code);
  return h('span', {},
    flag(a.home_country), ' ', countryName(a.home_country),
    h('span', { class: 'muted small' }, a.home_basis === 'stated' ? ' · stated in line-ups' : ' · where booked most'),
    stated.length > 1 ? h('span', { class: 'muted small', title: stated.map(countryName).join(', ') }, ' · also lists ', stated.filter(c => c !== a.home_country).map(flag).join('')) : null);
}

export function artistCard(a, { onOpen } = {}) {
  const cs = countriesOf(a.artist_id);
  const abroad = cs.filter(c => !c.is_home).slice(0, 4);
  return h('article', { class: 'card artist' },
    h('div', { class: 'card-head' },
      h('div', {},
        h('h3', {}, a.popular ? h('span', { class: 'star', title: 'Popular: 10+ bookings' }, '★ ') : null,
          h('a', { href: `#artist/${a.artist_id}`, onclick: onOpen && (ev => { ev.preventDefault(); onOpen(a.artist_id); }) }, a.display_name)),
        h('p', { class: 'muted small' }, a.kind !== 'person' ? a.kind + ' · ' : '', roleLine(a))),
      h('div', { class: 'big-number' }, h('strong', {}, a.bookings), h('span', { class: 'muted small' }, a.bookings === 1 ? 'booking' : 'bookings'))),
    h('p', {}, homeLine(a)),
    a.couple_bookings ? h('p', { class: 'small muted' }, `Plus ${a.couple_bookings} as part of a couple`) : null,
    abroad.length
      ? h('p', { class: 'small' }, h('span', { class: 'muted' }, `Abroad (${a.abroad_bookings}): `),
          abroad.map((c, i) => [i ? ', ' : '', flag(c.country_code), ' ', countryName(c.country_code), ` ×${c.bookings}`]))
      : h('p', { class: 'small muted' }, 'Only booked in their home country'),
    h('p', { class: 'small muted' }, a.first_date === a.last_date ? dayYear(a.first_date) : `${dayYear(a.first_date)} – ${dayYear(a.last_date)}`));
}

export function artistDetail(id) {
  const a = one(`SELECT st.*, a.display_name, a.kind FROM artist_stats st JOIN artists a ON a.id = st.artist_id WHERE a.id = ?`, [id])
    || one(`SELECT a.id AS artist_id, a.display_name, a.kind, 0 AS bookings FROM artists a WHERE a.id = ?`, [id]);
  if (!a) return h('p', {}, 'Artist not found.');
  // Own bookings only: a couple's events belong on the couple's page.
  const events = q(`SELECT e.id, e.title, e.start_date, e.end_date, e.city, e.country_code, group_concat(DISTINCT ae.role) AS role
    FROM artist_events ae JOIN events e ON e.id = ae.event_id
    WHERE ae.artist_id = ? AND ae.via = 'direct' GROUP BY e.id ORDER BY e.start_date`, [id]);
  const aliases = q('SELECT alias FROM artist_aliases WHERE artist_id = ? ORDER BY mentions DESC LIMIT 6', [id]).map(r => r.alias)
    .filter(x => x !== a.display_name);
  const members = q(`SELECT m.id, m.display_name, st.bookings FROM couple_members cm JOIN artists m ON m.id = cm.member_id
    LEFT JOIN artist_stats st ON st.artist_id = m.id WHERE cm.couple_id = ?`, [id]);
  const couples = q(`SELECT c.id, c.display_name, st.bookings, st.popular FROM couple_members cm JOIN artists c ON c.id = cm.couple_id
    LEFT JOIN artist_stats st ON st.artist_id = c.id WHERE cm.member_id = ? ORDER BY st.bookings DESC`, [id]);
  const cs = countriesOf(id);
  const max = Math.max(1, ...cs.map(c => c.bookings));
  const n = k => `${k} booking${k === 1 ? '' : 's'}`;
  return h('article', { class: 'artist-detail' },
    a.bookings ? artistCard(a) : h('h3', {}, a.display_name),
    aliases.length ? h('p', { class: 'small muted' }, 'Also written: ', aliases.join(' · ')) : null,
    couples.length ? h('section', { class: 'couples' }, h('h4', {}, 'Booked as part of'),
      h('ul', { class: 'rows plain' }, couples.map(c => h('li', {},
        h('a', { href: `#artist/${c.id}` }, c.popular ? '★ ' : '', c.display_name),
        h('span', { class: 'muted small' }, ` · ${n(c.bookings || 0)}`))))) : null,
    members.length ? h('p', {}, 'Members: ', members.map((m, i) => [i ? ', ' : '', h('a', { href: `#artist/${m.id}` }, m.display_name),
      m.bookings ? h('span', { class: 'muted small' }, ` (${n(m.bookings)} solo)`) : null])) : null,
    cs.length ? h('section', {}, h('h4', {}, couples.length ? 'Solo bookings by country' : 'Bookings by country'),
      h('ul', { class: 'bars' }, cs.map(c => h('li', {},
        h('span', { class: 'label' }, flag(c.country_code), ' ', countryName(c.country_code), c.is_home ? h('small', { class: 'muted' }, ' home') : null),
        h('span', { class: 'bar', style: `--w:${(100 * c.bookings / max).toFixed(1)}%` }),
        h('span', { class: 'n' }, c.bookings))))) : null,
    events.length || !couples.length ? h('section', {}, h('h4', {}, `${couples.length ? 'Solo bookings' : 'Events'} (${events.length})`),
      h('ul', { class: 'rows plain' }, events.map(e => h('li', {},
        h('span', { class: 'when' }, range(e.start_date, e.end_date)), ' ',
        h('a', { href: `#map/event/${e.id}` }, e.title),
        h('span', { class: 'muted small' }, ' · ', where(e), ' · ', e.role.replace(/,/g, ', ')))))) : null);
}

export function artistsView(root, sub, qs) {
  if (sub && sub[0]) {
    root.replaceChildren(h('section', { class: 'artist-page' },
      h('p', {}, h('a', { href: '#artists' }, '← All artists')), artistDetail(Number(sub[0]))));
    return;
  }
  const p = new URLSearchParams(qs);
  const st = { text: p.get('q') || '', role: p.get('role') || '', country: p.get('country') || '',
    sort: p.get('sort') || 'bookings', popular: p.get('popular') === '1', kind: p.get('kind') || '' };
  const countries = q(`SELECT DISTINCT country_code AS c FROM artist_countries WHERE country_code IS NOT NULL`).map(r => r.c)
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const text = h('input', { type: 'search', placeholder: 'Search name', value: st.text, 'aria-label': 'Search artists' });
  const sel = (k, opts, label) => h('select', { 'aria-label': label, onchange: ev => { st[k] = ev.target.value; render(); } },
    opts.map(([v, t]) => h('option', { value: v, selected: st[k] === v }, t)));
  const pop = h('input', { type: 'checkbox', checked: st.popular, onchange: ev => { st.popular = ev.target.checked; render(); } });
  const summary = h('p', { class: 'summary' });
  const grid = h('div', { class: 'cards grid' });
  const moreBtn = h('button', { class: 'secondary' }, 'Show more');
  let shown = PAGE, rows = [];

  root.replaceChildren(h('section', { class: 'artists' },
    h('div', { class: 'toolbar' }, text,
      sel('role', [['', 'Any role'], ['teacher', 'Teachers'], ['dj', 'DJs'], ['performer', 'Performers']], 'Role'),
      sel('kind', [['', 'People & couples'], ['person', 'People'], ['couple', 'Couples']], 'Kind'),
      sel('country', [['', 'Booked anywhere'], ...countries.map(c => [c, `Booked in ${flag(c)} ${countryName(c)}`])], 'Booked in'),
      sel('sort', [['bookings', 'Most booked'], ['abroad', 'Most booked abroad'], ['countries', 'Most countries'], ['recent', 'Most recent'], ['name', 'Name']], 'Sort'),
      h('label', {}, pop, ' Popular only')),
    summary, grid, moreBtn));

  function render() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(st)) if (v && !(k === 'sort' && v === 'bookings')) params.set(k, v === true ? '1' : v);
    history.replaceState(null, '', '#artists' + (params.toString() ? '?' + params : ''));
    const order = { bookings: 'st.bookings DESC', abroad: 'st.abroad_bookings DESC, st.bookings DESC',
      countries: 'st.countries DESC, st.bookings DESC', recent: 'st.last_date DESC', name: 'a.display_name' }[st.sort];
    const cond = ['1=1'], args = [];
    if (st.text) {
      cond.push(`(a.display_name LIKE ? OR a.id IN (SELECT artist_id FROM artist_aliases WHERE alias LIKE ?)
        OR a.id IN (SELECT cm.couple_id FROM couple_members cm JOIN artists m ON m.id = cm.member_id WHERE m.display_name LIKE ?))`);
      args.push(`%${st.text}%`, `%${st.text}%`, `%${st.text}%`);
    }
    if (st.role) cond.push(`st.${st.role} > 0`);
    if (st.kind) { cond.push('a.kind = ?'); args.push(st.kind); }
    if (st.popular) cond.push('st.popular = 1');
    if (st.country) { cond.push('a.id IN (SELECT artist_id FROM artist_countries WHERE country_code = ?)'); args.push(st.country); }
    rows = q(`SELECT st.*, a.display_name, a.kind FROM artist_stats st JOIN artists a ON a.id = st.artist_id
      WHERE ${cond.join(' AND ')} ORDER BY ${order}`, args);
    shown = PAGE; paint();
  }
  function paint() {
    summary.textContent = `${rows.length} artist${rows.length === 1 ? '' : 's'}` + (st.country ? ` booked in ${countryName(st.country)}` : '');
    grid.replaceChildren(...rows.slice(0, shown).map(a => artistCard(a)));
    moreBtn.hidden = shown >= rows.length;
  }
  moreBtn.addEventListener('click', () => { shown += PAGE; paint(); });
  let t; text.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.text = text.value.trim(); render(); }, 150); });
  render();
}
