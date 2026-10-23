// Artists: a scannable list (who, from where, how often booked, where next) and a page per artist that
// leads with their upcoming festivals.
import { q, one } from '../js/db.js';
import { h, flag, countryName, today, EVENT_COLS } from '../js/ui.js';
import { eventCard, enrich } from './eventcard.js';
import { tidyTitle } from './titles.js';

const PAGE = 60;
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const SHORT_Y = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const day = iso => SHORT.format(new Date(iso.slice(0, 10) + 'T12:00'));
const dayYear = iso => SHORT_Y.format(new Date(iso.slice(0, 10) + 'T12:00'));
const festivals = n => `${n} festival${n === 1 ? '' : 's'}`;

// "Teaching couple", "Teacher & DJ", "DJ"
function roleLabel(a) {
  if (a.kind === 'couple') return a.teacher ? 'Teaching couple' : a.performer ? 'Performing couple' : 'Couple';
  const roles = [a.teacher && 'Teacher', a.dj && 'DJ', a.performer && 'Performer'].filter(Boolean);
  return roles.length > 1 ? roles.slice(0, 2).join(' & ') : roles[0] || 'Artist';
}

export function artistsView(root, sub, qs, { home }) {
  if (sub && sub[0]) { artistPage(root, Number(sub[0]), home); return; }
  const p = new URLSearchParams(qs);
  const st = { text: p.get('q') || '', role: p.get('role') || '', country: p.get('country') || '',
    sort: p.get('sort') || 'bookings', popular: p.get('popular') === '1', kind: p.get('kind') || '' };
  const countries = q(`SELECT DISTINCT country_code AS c FROM artist_countries WHERE country_code IS NOT NULL`).map(r => r.c)
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  // each artist's next festival of their own (not only as part of a couple)
  const next = Object.fromEntries(q(`SELECT ae.artist_id, e.city, e.country_code, min(e.start_date) AS start_date
      FROM artist_events ae JOIN events e ON e.id = ae.event_id
      WHERE ae.via = 'direct' AND e.start_date >= ? AND e.cancelled IS NOT 1 GROUP BY ae.artist_id`, [today()])
    .map(r => [r.artist_id, r]));

  const text = h('input', { type: 'search', class: 'mini-search', placeholder: 'Search a name', value: st.text, 'aria-label': 'Search artists' });
  const roleBtns = h('div', { class: 'seg', role: 'group', 'aria-label': 'Role' });
  const paintRoles = () => roleBtns.replaceChildren(...[['', 'Everyone'], ['teacher', 'Teachers'], ['dj', 'DJs']].map(([v, t]) =>
    h('button', { type: 'button', class: st.role === v ? 'on' : '', 'aria-pressed': String(st.role === v),
      onclick: () => { st.role = v; render(); } }, t)));
  const sel = (k, opts, label) => h('label', { class: 'field' }, h('span', {}, label),
    h('select', { class: 'plain', onchange: ev => { st[k] = ev.target.value; render(); } },
      opts.map(([v, t]) => h('option', { value: v, selected: st[k] === v }, t))));
  const pop = h('input', { type: 'checkbox', checked: st.popular, onchange: ev => { st.popular = ev.target.checked; render(); } });
  const moreBtn = h('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false', 'aria-controls': 'artist-filters' });
  const panel = h('div', { class: 'more-panel', id: 'artist-filters', hidden: true },
    sel('kind', [['', 'People and couples'], ['person', 'People'], ['couple', 'Couples']], 'Show'),
    sel('country', [['', 'Anywhere'], ...countries.map(c => [c, `${flag(c)} ${countryName(c)}`])], 'Booked in'),
    sel('sort', [['bookings', 'Most festivals'], ['abroad', 'Most festivals abroad'], ['countries', 'Most countries'], ['next', 'Next festival soonest'], ['name', 'Name']], 'Order'),
    h('label', { class: 'check' }, pop, ' Only well-known artists (10+ festivals)'));
  moreBtn.addEventListener('click', ev => { ev.stopPropagation(); panel.hidden = !panel.hidden; moreBtn.setAttribute('aria-expanded', String(!panel.hidden)); });
  document.addEventListener('click', function close(ev) {
    if (!root.isConnected) return document.removeEventListener('click', close);
    if (!panel.hidden && !panel.contains(ev.target)) { panel.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); }
  });
  const summary = h('p', { class: 'list-summary' });
  const list = h('ul', { class: 'artist-list' });
  const showMore = h('button', { type: 'button', class: 'more-btn show-more' });
  let shown = PAGE, rows = [];

  root.replaceChildren(h('section', { class: 'artists-page' },
    h('div', { class: 'map-bar' }, text, roleBtns, h('div', { class: 'filters-wrap' }, moreBtn, panel)),
    summary, list, showMore));

  function render() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(st)) if (v && !(k === 'sort' && v === 'bookings')) params.set(k === 'text' ? 'q' : k, v === true ? '1' : v);
    history.replaceState(null, '', '#artists' + (params.toString() ? '?' + params : ''));
    paintRoles();
    const extra = [st.kind, st.country, st.sort !== 'bookings', st.popular].filter(Boolean).length;
    moreBtn.textContent = `More${extra ? ` (${extra})` : ''} ▾`;
    const order = { bookings: 'st.bookings DESC', abroad: 'st.abroad_bookings DESC, st.bookings DESC',
      countries: 'st.countries DESC, st.bookings DESC', next: 'st.bookings DESC', name: 'a.display_name' }[st.sort];
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
    if (st.sort === 'next') rows = rows.filter(a => next[a.artist_id]).sort((a, b) => next[a.artist_id].start_date.localeCompare(next[b.artist_id].start_date));
    shown = PAGE; paint();
  }
  function paint() {
    summary.textContent = `${rows.length.toLocaleString('en-GB')} ${rows.length === 1 ? 'artist' : 'artists'}` +
      (st.country ? ` booked in ${countryName(st.country)}` : '');
    list.replaceChildren(...rows.slice(0, shown).map(a => row(a, next[a.artist_id])));
    showMore.hidden = shown >= rows.length;
    showMore.textContent = `Show ${Math.min(PAGE, rows.length - shown)} more`;
  }
  showMore.addEventListener('click', () => { shown += PAGE; paint(); });
  let t; text.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.text = text.value.trim(); render(); }, 150); });
  render();
}

function row(a, nx) {
  return h('li', {}, h('a', { href: `#artist/${a.artist_id}`, class: 'artist-row' },
    h('span', { class: 'name' }, a.display_name),
    h('span', { class: 'meta' }, a.home_country ? [flag(a.home_country), ' ', countryName(a.home_country), ' · '] : null,
      roleLabel(a), ' · ', festivals(a.bookings)),
    h('span', { class: 'next' }, nx ? ['Next: ', flag(nx.country_code), ' ', nx.city || countryName(nx.country_code), ', ', day(nx.start_date)]
      : 'Nothing coming up yet')));
}

function artistPage(root, id, home) {
  const moved = one('SELECT new_id FROM artist_redirects WHERE old_id = ?', [id]);   // merged into another artist
  if (moved) id = moved.new_id;
  const a = one(`SELECT st.*, a.display_name, a.kind FROM artist_stats st JOIN artists a ON a.id = st.artist_id WHERE a.id = ?`, [id])
    || one(`SELECT a.id AS artist_id, a.display_name, a.kind, 0 AS bookings FROM artists a WHERE a.id = ?`, [id]);
  if (!a) { root.replaceChildren(h('p', {}, 'Artist not found.')); return; }
  const events = enrich(q(`SELECT ${EVENT_COLS} FROM events e JOIN event_stats s ON s.event_id = e.id
    WHERE e.id IN (SELECT event_id FROM artist_events WHERE artist_id = ? AND via = 'direct') ORDER BY e.start_date`, [id]), home);
  const roles = Object.fromEntries(q(`SELECT event_id, group_concat(DISTINCT role) AS r FROM artist_events WHERE artist_id = ? AND via = 'direct' GROUP BY event_id`, [id])
    .map(r => [r.event_id, r.r]));
  const now = today();
  const upcoming = events.filter(e => (e.end_date || e.start_date) >= now && !e.cancelled);
  const past = events.filter(e => (e.end_date || e.start_date) < now).reverse();
  const members = q(`SELECT m.id, m.display_name, st.bookings FROM couple_members cm JOIN artists m ON m.id = cm.member_id
    LEFT JOIN artist_stats st ON st.artist_id = m.id WHERE cm.couple_id = ?`, [id]);
  const couples = q(`SELECT c.id, c.display_name, st.bookings FROM couple_members cm JOIN artists c ON c.id = cm.couple_id
    LEFT JOIN artist_stats st ON st.artist_id = c.id WHERE cm.member_id = ? ORDER BY st.bookings DESC`, [id]);
  const cs = q(`SELECT country_code, bookings, is_home FROM artist_countries WHERE artist_id = ? AND country_code IS NOT NULL
    ORDER BY is_home DESC, bookings DESC`, [id]);
  const aliases = q('SELECT alias FROM artist_aliases WHERE artist_id = ? ORDER BY mentions DESC LIMIT 6', [id]).map(r => r.alias)
    .filter(x => x.toLowerCase() !== a.display_name.toLowerCase());
  const max = Math.max(1, ...cs.map(c => c.bookings));
  const person = (p, extra) => [h('a', { href: `#artist/${p.id}`, class: 'artist' }, p.display_name), extra];
  const list = (xs, f) => xs.flatMap((x, i) => [i ? (i === xs.length - 1 ? ' and ' : ', ') : '', ...f(x)]);

  root.replaceChildren(h('article', { class: 'artist-profile' },
    h('a', { href: '#artists', class: 'back-link' }, '← All artists'),
    h('header', { class: 'profile-head' },
      h('h1', {}, a.display_name),
      h('p', { class: 'lede' }, a.bookings ? [roleLabel(a), a.home_country ? [' from ', flag(a.home_country), ' ', countryName(a.home_country)] : null,
        ' · ', festivals(a.bookings), a.abroad_bookings ? `, ${a.abroad_bookings} abroad` : ''] : 'Only booked as part of a couple'),
      members.length ? h('p', {}, 'Partners: ', list(members, m => person(m, m.bookings ? h('span', { class: 'muted' }, ` (${festivals(m.bookings)} on their own)`) : null))) : null,
      couples.length ? h('p', {}, a.kind === 'couple' ? 'Also part of ' : 'Also books as ', list(couples, c => person(c, h('span', { class: 'muted' }, ` (${festivals(c.bookings || 0)})`)))) : null),
    h('section', {}, h('h2', {}, upcoming.length ? `Coming up (${upcoming.length})` : 'Coming up'),
      upcoming.length ? h('div', { class: 'calm-cards' }, upcoming.map(e => eventCard(e, home)))
        : h('p', { class: 'muted' }, 'No upcoming festivals listed yet.')),
    cs.length ? h('section', {}, h('h2', {}, couples.length && a.kind !== 'couple' ? 'Where they’re booked on their own' : 'Where they’re booked'),
      h('ul', { class: 'bars' }, cs.map(c => h('li', {},
        h('span', { class: 'label' }, flag(c.country_code), ' ', countryName(c.country_code), c.is_home ? h('small', { class: 'muted' }, ' home') : null),
        h('span', { class: 'bar', style: `--w:${(100 * c.bookings / max).toFixed(1)}%` }),
        h('span', { class: 'n' }, c.bookings))))) : null,
    past.length ? h('details', { class: 'past' }, h('summary', {}, `Past festivals (${past.length})`),
      h('ul', {}, past.map(e => h('li', {},
        h('span', { class: 'when' }, dayYear(e.start_date)),
        h('a', { href: `#map/event/${e.id}` }, tidyTitle(e.title)),
        h('span', { class: 'muted' }, ' · ', flag(e.country_code), ' ', e.city || countryName(e.country_code),
          roles[e.id] && roles[e.id] !== 'teacher' ? ` · ${roles[e.id].replace(/,/g, ', ')}` : ''))))) : null,
    h('div', { class: 'profile-notes' },
      aliases.length ? h('p', {}, 'Also written as ', aliases.join(' · ')) : null,
      a.home_country ? h('p', {}, a.home_basis === 'stated' ? 'Home country as stated in line-ups.' : 'Home country guessed from where they’re booked most.') : null)));
}
