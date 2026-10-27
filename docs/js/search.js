// Search across the site, in a dialog opened from the header (or with / and Ctrl/⌘+K). Results come in groups that
// always keep their order: people who share their plans, festivals, artists, places, then dances and highlights. The text field keeps the
// focus and the arrow keys move a highlight through the results (the WAI-ARIA combobox with a listbox).
// Picking a result goes where that kind of thing lives: a festival opens on the map, an artist on their page, a city
// on the map, and a country, style or highlight narrows the festival list, keeping its other choices.
import { q, site } from './db.js';
import { h, away, flag, dayMonth } from './ui.js';
import { today } from './days.js';
import { festivals, DANCES, WITH, hasWith } from './festivals.js';
import { icon } from './icons.js';
import { KEY } from './states.js';
import { text } from './wording.js';
import { festivalsHref, eventOnMapHref, cityOnMapHref, artistHref, artistsHref, mapHref, personHref } from './routes.js';
import { person } from './plans.js';
import { roleLabel } from './artists.js';
import { modal } from './modal.js';

const SHOWN = 5;                      // results per group until "Show all"
const GROUPS = [['person', 'Friends'], ['festival', 'Festivals'], ['artist', 'Artists'], ['place', 'Places'], ['tag', 'Dances & highlights']];
// before anything is typed: what can be searched, as things to tap
const SUGGEST = { styles: [KEY.genre.SALSA, KEY.genre.ZOUK, KEY.genre.BACHATA, KEY.genre.KOMPA],
  highlights: [KEY.feature.PROMO_CODE, 'taxi', KEY.feature.POOL_PARTY, 'allin'], countries: 4 };

// "Łódź" and "lodz" match, and so do "Rencontres" and "rencontrés"
const fold = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ł/g, 'l').replace(/[øœ]/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/đ/g, 'd').replace(/ı/g, 'i');
const words = s => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

// Every token typed must start a word of the item; an item whose name is the query, or starts with it, comes first.
function score(item, tokens, query) {
  if (!tokens.every(t => item.words.some(w => w.startsWith(t)))) return 0;
  const name = fold(item.name);
  return name === query ? 4 : name.startsWith(query) ? 3 : item.nameWords.some(w => w.startsWith(tokens[0])) ? 2 : 1;
}

// Where the festival list is now, so a country or style picked here keeps the time and price already chosen.
function finderParams() {
  const [path, qs = ''] = location.hash.slice(1).split('?');
  return (path || 'finder') === 'finder' ? Object.fromEntries(new URLSearchParams(qs)) : {};
}

function buildIndex() {
  const pool = festivals();             // what the festival list can show: everything still to come
  const items = [];
  const add = (kind, name, extra, more) => items.push({ kind, name, words: words([name, ...extra].join(' ')), nameWords: words(name), ...more });

  // festivals, coming ones first and soonest first, then past ones, latest first
  const now = today();
  for (const e of q(`SELECT r.id, r.title, x.listed_title, r.venue, r.city, r.country_code, r.start_date, r.end_date, r.upcoming,
      r.cancelled, r.lat, x.url, p.code FROM event_rows r JOIN events x ON x.id = r.id LEFT JOIN event_promos p ON p.event_id = r.id`))
    add('festival', e.title, [e.listed_title, e.venue || '', e.city, e.code || ''], { e, past: !e.upcoming,
      rank: e.upcoming ? 2e9 - Date.parse(e.start_date) / 864e5 : Date.parse(e.start_date) / 864e5 });

  // people who share their plans, by name and by the artists they are
  for (const r of q(`SELECT pe.key, pe.name, sum(e.upcoming) AS upcoming FROM people pe JOIN plans p ON p.person_id = pe.id
      JOIN event_rows e ON e.id = p.event_id GROUP BY pe.id`)) {
    const p = person(r.key);
    add('person', r.name, p.artists.map(a => a.display_name), { p, upcoming: r.upcoming, past: !r.upcoming, rank: 1e3 + r.upcoming });
  }
  const sharing = new Set(q(`SELECT artist_id FROM person_artists UNION SELECT couple_id FROM couple_members
    WHERE member_id IN (SELECT artist_id FROM person_artists)`).map(r => r.artist_id));

  const aliases = {};
  for (const a of q('SELECT artist_id, alias FROM artist_aliases')) (aliases[a.artist_id] ||= []).push(a.alias);
  for (const a of q(`SELECT a.id, a.display_name, a.kind, s.bookings, s.teacher, s.dj, s.performer, s.home_country FROM artist_stats s
      JOIN artists a ON a.id = s.artist_id`))
    add('artist', a.display_name, aliases[a.id] || [], { a, shares: sharing.has(a.id), rank: a.bookings });

  const inCountry = {};
  for (const e of pool) inCountry[e.country_code] = (inCountry[e.country_code] || 0) + 1;
  for (const c of site().destinations) add('place', c.name, [c.code], { country: c, n: inCountry[c.code] || 0, past: !inCountry[c.code], rank: 1e6 + (inCountry[c.code] || 0) });
  const cities = new Map();
  for (const e of q('SELECT city, country_code, upcoming FROM event_rows WHERE lat IS NOT NULL AND city != \'\'')) {
    const k = e.city + '|' + e.country_code;
    if (!cities.has(k)) cities.set(k, { city: e.city, cc: e.country_code, upcoming: 0, all: 0 });
    const c = cities.get(k); c.all++; c.upcoming += e.upcoming;
  }
  for (const c of cities.values()) add('place', c.city, [], { city: c, past: !c.upcoming, rank: c.upcoming * 100 + c.all });

  // styles and highlights narrow the festival list; taxi dancers and the all-in-one hotel use its own checkboxes
  const tag = (key, name, params, test, svg = DANCES.includes(key) ? null : icon(key)) => {
    const n = pool.filter(test).length;
    if (n) add('tag', name, [key.replace(/_/g, ' ')], { key, params, n, icon: svg, style: DANCES.includes(key), rank: n });
  };
  for (const [key, name] of WITH) tag(key, name, { with: key }, e => hasWith(e, key));
  tag('taxi', text('feature', KEY.feature.TAXI_DANCERS), { taxi: 1 }, e => e.taxi_dancers, icon(KEY.feature.TAXI_DANCERS));
  tag('allin', text('feature', KEY.feature.ALL_IN_ONE), { allin: 1 }, e => e.all_in_one, icon(KEY.feature.ALL_IN_ONE));
  return items;
}

// the closest name to a query with no results, if it is only a typo or two away
function nearest(items, query) {
  if (query.length < 4) return null;
  const dist = (a, b) => {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  };
  const limit = query.length < 7 ? 1 : 2;
  let best = null, bestD = limit + 1;
  for (const it of items) {
    const name = fold(it.name);
    if (Math.abs(name.length - query.length) > limit) continue;
    const d = dist(query, name);
    if (d < bestD || (best && d === bestD && it.rank > best.rank)) { best = it; bestD = d; }
  }
  return best;
}

export function initSearch(trigger, data) {
  let items = null, query = '', expanded = new Set(), active = -1, withPast = false;
  const input = h('input', { type: 'text', class: 'search-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'search-list',
    'aria-autocomplete': 'list', placeholder: 'Festivals, artists, places, styles…', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go' });
  const list = h('div', { class: 'search-list', id: 'search-list', role: 'listbox', 'aria-label': 'Results' });
  const status = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const glass = h('span', { class: 'search-glass', 'aria-hidden': 'true' }); glass.innerHTML = trigger.querySelector('svg').outerHTML;
  const cancel = h('button', { type: 'button', class: 'search-cancel', onclick: () => shut() }, 'Cancel');
  // past festivals, and places with nothing coming up, only when asked for: what people share is what's ahead
  const pastBox = h('input', { type: 'checkbox', onchange: () => { withPast = pastBox.checked; expanded = new Set(); render(); } });
  const includePast = () => { pastBox.checked = withPast = true; render(); input.focus(); };
  const dlg = h('dialog', { class: 'search', 'aria-label': 'Search' }, h('div', { class: 'search-top' }, glass, input, cancel),
    h('label', { class: 'search-past' }, pastBox, ' Include past festivals'), status, list);
  const { open: show, shut, go } = modal(dlg);

  const options = () => [...list.querySelectorAll('[role=option]')];
  function highlight(i) {                // -1 for none; past either end it wraps
    const opts = options();
    active = i < 0 || !opts.length ? -1 : i % opts.length;
    opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === active)));
    if (active < 0) return input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-activedescendant', opts[active].id);
    opts[active].scrollIntoView({ block: 'nearest' });
  }

  function pick(it) {
    if (it.kind === 'festival') {
      if (it.e.lat == null) { window.open(it.e.url, '_blank', 'noopener'); shut(); return; }   // nowhere on the map
      return go(eventOnMapHref(it.e.id));
    }
    if (it.kind === 'person') return go(personHref(it.p.key));
    if (it.kind === 'artist') return go(artistHref(it.a.id));
    if (it.city) return go(cityOnMapHref(it.city.city, it.city.cc));
    if (it.country) return go(festivalsHref({ ...finderParams(), country: it.country.code }));
    go(festivalsHref({ ...finderParams(), ...it.params }));
  }

  const marked = (text, tokens) => {        // the typed beginnings of words in bold
    if (!tokens.length) return text;
    const out = [], re = /[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu;
    for (const [w] of text.matchAll(re)) {
      const t = tokens.find(t => fold(w).startsWith(t));
      if (!t) { out.push(w); continue; }
      let cut = 0; while (cut < w.length && fold(w.slice(0, cut + 1)).length <= t.length) cut++;
      out.push(h('mark', {}, w.slice(0, cut)), w.slice(cut));
    }
    return out;
  };
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  let nextId = 0;
  function row(it, tokens) {
    let lead, sub;
    if (it.kind === 'festival') {
      const e = it.e, yr = e.start_date.slice(0, 4) !== today().slice(0, 4) ? ' ' + e.start_date.slice(0, 4) : '';
      lead = h('span', { class: 'lead date' }, dayMonth(e.start_date).replace(' ', ' '));
      sub = [flag(e.country_code), ' ', e.city || 'Place not given', yr,
        e.cancelled ? ' · cancelled' : !e.upcoming ? ' · has taken place' : '', e.lat == null ? [' · on kizomba-world', away()] : ''];
    } else if (it.kind === 'person') {
      lead = h('span', { class: 'lead mono' }, it.name[0]);
      sub = [it.upcoming ? `${plural(it.upcoming, 'festival')} planned` : 'no plans coming up',
        it.p.artists.length ? ` · also ${it.p.artists.map(a => a.display_name).join(', ')}` : ''];
    } else if (it.kind === 'artist') {
      const a = it.a;
      lead = h('span', { class: 'lead mono' }, a.display_name.trim()[0] || '?');
      sub = [a.home_country ? flag(a.home_country) + ' ' : '', roleLabel(a),
        ' · ', plural(a.bookings, 'festival'), it.shares ? ' · shares plans' : ''];
    } else if (it.country) {
      lead = h('span', { class: 'lead flag' }, flag(it.country.code));
      sub = ['Country · ', it.n ? `${plural(it.n, 'festival')} coming up` : 'none coming up'];
    } else if (it.city) {
      lead = h('span', { class: 'lead flag' }, flag(it.city.cc));
      sub = ['City · ', it.city.upcoming ? `${plural(it.city.upcoming, 'festival')} coming up` : 'past festivals only'];
    } else {
      lead = h('span', { class: 'lead icon' }); lead.innerHTML = it.icon || '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      sub = [it.style ? 'Dance' : 'Highlight', ' · ', `${plural(it.n, 'festival')} coming up`];
    }
    return h('div', { class: 'search-row' + (it.kind === 'festival' && !it.e.upcoming ? ' past' : ''), role: 'option', id: `search-o${++nextId}`,
      'aria-selected': 'false', onclick: () => pick(it) },
      lead, h('span', { class: 'what' }, h('span', { class: 'name' }, it.style ? 'Also with ' : null, marked(it.name, tokens)), h('span', { class: 'sub' }, sub)));
  }
  function group(kind, title, found, tokens) {
    const all = expanded.has(kind), id = `search-g-${kind}`;
    const more = !all && found.length > SHOWN ? h('div', { class: 'search-row search-more', role: 'option', id: `search-o${++nextId}`, 'aria-selected': 'false',
      onclick: () => { expanded.add(kind); render(); } }, h('span', { class: 'what' }, `Show all ${found.length} ${title.toLowerCase()}`)) : null;
    return h('div', { class: 'search-group', role: 'group', 'aria-labelledby': id },
      h('div', { class: 'search-group-title', id, role: 'presentation' }, title), found.slice(0, all ? found.length : SHOWN).map(it => row(it, tokens)), more);
  }

  function render() {
    nextId = 0;
    if (!items) { list.replaceChildren(h('p', { class: 'search-note' }, 'Loading festivals…')); return; }
    const tokens = words(query), folded = tokens.join(' ');
    if (!tokens.length) {
      const by = (kind, keys) => keys.map(k => items.find(it => it.kind === 'tag' && it.key === k)).filter(Boolean);
      const countries = items.filter(it => it.country).sort((a, b) => b.n - a.n).slice(0, SUGGEST.countries);
      list.replaceChildren(h('p', { class: 'search-note' }, 'Search festivals, people, artists, cities, countries, dances and highlights. Or try:'),
        group('styles', 'Also with', by('tag', SUGGEST.styles), []), group('highlights', 'Highlights', by('tag', SUGGEST.highlights), []),
        group('countries', 'Countries', countries, []));
      status.textContent = '';
      return highlight(-1);
    }
    const matched = items.map(it => ({ it, s: score(it, tokens, folded) })).filter(r => r.s)
      .sort((a, b) => b.s - a.s || b.it.rank - a.it.rank).map(r => r.it);
    const found = matched.filter(it => withPast || !it.past);
    const hiddenPast = withPast ? 0 : matched.filter(it => it.past && it.kind === 'festival').length;
    const pastNote = hiddenPast ? h('p', { class: 'search-note' }, `${plural(hiddenPast, 'past festival')} ${hiddenPast === 1 ? 'matches' : 'match'} too. `,
      h('button', { type: 'button', class: 'link', onclick: includePast }, 'Include past festivals')) : null;
    const groups = GROUPS.map(([kind, title]) => [kind, title, found.filter(it => it.kind === kind)]).filter(([, , f]) => f.length);
    if (!groups.length && hiddenPast) {
      list.replaceChildren(h('div', { class: 'search-none' }, h('p', {}, 'No festival coming up matches “', query.trim(), '”.'), pastNote));
      status.textContent = 'No upcoming results';
      return highlight(-1);
    }
    if (!groups.length) {
      const near = nearest(items.filter(it => withPast || !it.past), folded);
      list.replaceChildren(h('div', { class: 'search-none' },
        h('p', {}, 'Nothing matches “', query.trim(), '”.'),
        near ? h('p', {}, 'Did you mean ', h('button', { type: 'button', class: 'link', onclick: () => { input.value = query = near.name; render(); input.focus(); } }, near.name), '?') : null,
        h('p', {}, 'You can also ', h('a', { href: artistsHref({ q: query.trim() }), onclick: ev => { ev.preventDefault(); go(ev.currentTarget.getAttribute('href')); } }, 'browse all artists'),
          ' or ', h('a', { href: mapHref(), onclick: ev => { ev.preventDefault(); go(ev.currentTarget.getAttribute('href')); } }, 'explore the map'), '.')));
      status.textContent = 'No results';
      return highlight(-1);
    }
    list.replaceChildren(...groups.map(([kind, title, f]) => group(kind, title, f, tokens)), ...pastNote ? [pastNote] : []);
    status.textContent = plural(found.length, 'result');
    highlight(0);                         // Enter opens the best match
  }

  input.addEventListener('input', () => { query = input.value; expanded = new Set(); render(); });
  input.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); highlight(active + 1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); highlight((active <= 0 ? options().length : active) - 1); }
    else if (ev.key === 'Enter' && active >= 0) { ev.preventDefault(); options()[active].click(); }
  });
  // Escape clears the text first, then closes
  dlg.addEventListener('cancel', ev => { if (input.value) { ev.preventDefault(); input.value = query = ''; render(); } });

  function open() {
    if (!show(trigger)) return;
    input.select();                       // the last query stays, ready to refine or type over
    render();
    if (!items) data.then(() => { items = buildIndex(); if (dlg.open) render(); });
  }
  trigger.addEventListener('click', open);
  addEventListener('keydown', ev => {
    const typing = ev.target.closest?.('input, textarea, select, [contenteditable]');
    if ((ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey) || ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k')) {
      ev.preventDefault(); open();
    }
  });
}
