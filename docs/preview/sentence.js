// Variant: a sentence with blanks as the landing, calm cards below, and a sticky bar with the same
// choices (plus "More filters") once the sentence has scrolled away.
import { h, addDays, countryName, flag, today, euro } from '../js/ui.js';
import { eventDetail } from '../js/event.js';
import { festivals, place, styleLine, d, stateFromHash, writeHash } from './common.js';
import { tidyTitle } from './titles.js';
import { PIN, TRAITS } from './icons.js';

const DEFAULTS = { style: 'kiz', months: 3, reach: 'any', country: '', taxi: 0, allin: 0, lineup: 0, likely: 1, unchecked: 0, sort: 'date' };
const LOOSEST = { style: 'all', months: 12, reach: 'any', country: '', taxi: 0, allin: 0, lineup: 0, likely: 1, unchecked: 0 };

// Hand-drawn hints next to the blanks. Static SVG, so building it from a string is safe.
const ARROWS = {
  down: '<svg viewBox="0 0 64 52" width="54" height="44"><path d="M58 9 C40 5 20 14 13 41"/><path d="M13 41 L6 31 M13 41 L22 35"/></svg>',
  up: '<svg viewBox="0 0 64 52" width="54" height="44"><path d="M56 44 C36 45 18 34 13 9"/><path d="M13 9 L6 19 M13 9 L21 16"/></svg>',
};
function note(cls, arrow, ...text) {
  const art = h('span', { class: 'arrow' }); art.innerHTML = ARROWS[arrow];
  const words = h('span', { class: 'hand' }, ...text.map(t => t === 'click' ? [h('span', { class: 'click' }, 'click'), h('span', { class: 'tap' }, 'tap')] : t));
  return h('span', { class: 'note ' + cls, 'aria-hidden': 'true' }, ...(arrow === 'down' ? [words, art] : [art, words]));
}
let seenHints = false;
try { seenHints = localStorage.getItem('kr-hints-seen') === '1'; } catch {}

const STYLE = [['kiz', 'Kizomba & Urban Kiz'], ['all', 'any kizomba style']];
const WHEN = [[1, 'the next month'], [2, 'the next two months'], [3, 'the next three months'], [6, 'the next six months'], [12, 'the coming year']];
// the sentence says it in words; the bar and the filtering use the numbers (Fri→Mon return from Bergen)
const PRICE = [['any', 'any price'], [250, 'a reasonable price'], [150, 'a cheap price']];
const SHORT_LABEL = { style: { kiz: 'Kiz & Urban Kiz', all: 'All styles' },
  months: { 1: '1 month', 2: '2 months', 3: '3 months', 6: '6 months', 12: '12 months' },
  reach: { any: 'Any price', 250: 'Under €250', 150: 'Under €150' } };

function matches(all, s) {
  const end = addDays(today(), Math.round(s.months * 30.4));
  return all.filter(e => e.depart <= end && (s.likely || !e.projected) && (s.style === 'all' || e.kiz_only) &&
      (s.reach === 'any' || (e.fare ? e.fare.price <= s.reach : s.unchecked)) &&
      (!s.country || e.country_code === s.country) && (!s.taxi || e.taxi_dancers) && (!s.allin || e.all_in_one) &&
      (e.lineup || 0) >= s.lineup)
    .sort(s.sort === 'fare'
      ? (a, b) => (a.fare?.price ?? 1e9) - (b.fare?.price ?? 1e9) || a.depart.localeCompare(b.depart)
      : (a, b) => a.depart.localeCompare(b.depart));
}

export function sentenceView(root, qs, { home }) {
  const all = festivals(home);
  const s = stateFromHash(qs, DEFAULTS);
  if (typeof s.country === 'number') s.country = '';      // stateFromHash parses numbers; country is a code
  for (const [k, v] of new URLSearchParams(qs)) if (k === 'country' || k === 'sort') s[k] = v;
  const countries = [...new Set(all.map(e => e.country_code))].filter(Boolean).sort((a, b) => countryName(a).localeCompare(countryName(b)));

  const blank = (key, opts, cls = 'blank') => {
    const el = h('select', { class: cls, 'aria-label': key }, opts.map(([v, t]) => h('option', { value: v }, t)));
    el.value = String(s[key]);
    el.addEventListener('change', () => { s[key] = /^\d+$/.test(el.value) ? Number(el.value) : el.value; hideHints(); render(); });
    return el;
  };
  // a native select is as wide as its longest option; size the sentence blanks to the chosen one instead
  const ruler = h('span', { class: 'ruler', 'aria-hidden': 'true' });
  const fit = el => { ruler.textContent = el.selectedOptions[0]?.textContent || ''; el.style.width = (ruler.getBoundingClientRect().width + 4) + 'px'; };
  const DEST = [['', 'anywhere'], ...countries.map(c => [c, countryName(c)])];
  const sentenceBlanks = { style: blank('style', STYLE), months: blank('months', WHEN), country: blank('country', DEST), reach: blank('reach', PRICE) };
  const live = h('p', { class: 'live', 'aria-live': 'polite' });
  const hero = h('header', { class: 'sentence-hero' },
    h('p', { class: 'kicker' }, 'Kiz Radar'),
    h('p', { class: 'sentence' }, 'I’d like to dance ',
      h('span', { class: 'anchor' }, sentenceBlanks.style, note('note-top', 'down', 'click', ' to change the dance')),
      ' at a festival in ', sentenceBlanks.months, ', flying from Bergen to ',
      h('span', { class: 'anchor' }, sentenceBlanks.country, note('note-bottom', 'up', '…or where you’d like to go')),
      ' for ', h('span', { class: 'nowrap' }, sentenceBlanks.reach, '.'), ruler),
    note('note-inline', 'up', 'click', ' to change'),
    live,
    h('p', { class: 'nevermind' }, h('button', { type: 'button', class: 'link', onclick: () => {
      Object.assign(s, LOOSEST); render(); results.scrollIntoView({ behavior: 'smooth' }); } }, 'Never mind, show me all events')));

  // sticky bar: the same three choices in short form, the count, and "More filters"
  const barBlanks = {
    style: blank('style', Object.entries(SHORT_LABEL.style), 'mini'),
    months: blank('months', Object.entries(SHORT_LABEL.months), 'mini'),
    country: blank('country', [['', 'Anywhere'], ...countries.map(c => [c, `${flag(c)} ${countryName(c)}`])], 'mini'),
    reach: blank('reach', Object.entries(SHORT_LABEL.reach), 'mini') };
  const barCount = h('span', { class: 'bar-count' });
  const moreBtn = h('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false', 'aria-controls': 'more-panel' }, 'More filters ▾');
  const check = (key, label) => { const c = h('input', { type: 'checkbox' }); c.checked = !!s[key];
    c.addEventListener('change', () => { s[key] = c.checked ? 1 : 0; render(); }); return h('label', { class: 'check' }, c, ' ', label); };
  const moreFields = () => [
    h('div', { class: 'core-fields' },
      h('label', { class: 'field' }, h('span', {}, 'Style'), blank('style', Object.entries(SHORT_LABEL.style), 'plain')),
      h('label', { class: 'field' }, h('span', {}, 'Destination'), blank('country', [['', 'Anywhere'], ...countries.map(c => [c, `${flag(c)} ${countryName(c)}`])], 'plain'))),
    h('label', { class: 'field' }, h('span', {}, 'Line-up'), blank('lineup', [[0, 'Any size'], [10, '10+ artists'], [20, '20+ artists']], 'plain')),
    h('label', { class: 'field' }, h('span', {}, 'Order'), blank('sort', [['date', 'Soonest first'], ['fare', 'Cheapest flight first']], 'plain')),
    h('div', { class: 'checks' }, check('taxi', 'Taxi dancers'), check('allin', 'All-in-one hotel'),
      check('likely', 'Include likely next editions'), check('unchecked', 'Include festivals whose flight isn’t checked yet')),
  ];
  const panel = h('div', { class: 'more-panel', id: 'more-panel', hidden: true }, moreFields());
  moreBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; moreBtn.setAttribute('aria-expanded', String(!panel.hidden)); });
  const bar = h('div', { class: 'sticky-bar', 'aria-label': 'Filters' },
    h('div', { class: 'bar-inner' }, h('span', { class: 'wide-only' }, barBlanks.style), barBlanks.months,
      h('span', { class: 'wide-only' }, barBlanks.country), barBlanks.reach, barCount, moreBtn), panel);
  document.addEventListener('click', ev => { if (!panel.hidden && !bar.contains(ev.target)) { panel.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); } });

  const results = h('section', { class: 'sentence-results' });
  // once someone has changed a blank they've got it: fade the hints, and don't show them again
  function hideHints() {
    hero.classList.add('hints-done');
    try { localStorage.setItem('kr-hints-seen', '1'); } catch {}
  }
  if (seenHints) hero.classList.add('hints-done');
  root.replaceChildren(h('div', { class: 'sentence-page' }, hero, bar, results));
  // sit flush under the site header, whatever its height on this screen
  const header = document.querySelector('header.top');
  const place_ = () => { if (header) bar.style.top = header.getBoundingClientRect().height + 'px'; };
  place_(); addEventListener('resize', place_);
  // a hint under the "Map & artists" tab, until someone has been there
  let exploreSeen = false;
  try { exploreSeen = localStorage.getItem('kr-explore-seen') === '1'; } catch {}
  const tab = document.querySelector('a[data-nav="explore"]');
  const tabNote = tab && !exploreSeen ? note('note-tab', 'up', 'psst… more here') : null;
  if (tabNote) tab.append(tabNote);
  const io = new IntersectionObserver(([en]) => {
    bar.classList.toggle('shown', !en.isIntersecting);
    tabNote?.classList.toggle('away', !en.isIntersecting);          // don't float over the cards
  }, { rootMargin: '-60px 0px 0px 0px' });
  io.observe(hero);

  function render() {
    writeHash(s, DEFAULTS);
    for (const k of ['style', 'months', 'country', 'reach']) { sentenceBlanks[k].value = String(s[k]); barBlanks[k].value = String(s[k]); fit(sentenceBlanks[k]); }
    panel.replaceChildren(...moreFields());
    const rows = matches(all, s);
    const extra = ['taxi', 'allin', 'lineup', 'unchecked'].filter(k => s[k] !== DEFAULTS[k]).length + (s.likely ? 0 : 1);
    const hiddenOnPhone = (s.style !== DEFAULTS.style) + !!s.country;     // only counted where those two live in the panel
    moreBtn.replaceChildren(h('span', { class: 'wide' }, 'More filters'), h('span', { class: 'narrow' }, 'Filters', extra + hiddenOnPhone ? ` (${extra + hiddenOnPhone})` : ''),
      h('span', { class: 'wide' }, extra ? ` (${extra})` : ''), ' ▾');
    live.replaceChildren(rows.length
      ? h('span', {}, `${rows.length} festival${rows.length > 1 ? 's' : ''} like that`,
          s.reach === 'any' ? '. ' : h('span', { class: 'price-note' }, ` (return flights under €${s.reach}, Friday to Monday). `),
          h('a', { href: '#', onclick: ev => { ev.preventDefault(); results.scrollIntoView({ behavior: 'smooth' }); } }, 'Show them ↓'))
      : 'Nothing like that yet. Try a longer time, anywhere, or any price.');
    barCount.textContent = `${rows.length} festival${rows.length === 1 ? '' : 's'}`;
    results.replaceChildren(rows.length
      ? h('div', { class: 'calm-cards' }, rows.map((e, i) => card(e, home, i === firstWithArtists(rows) && !artistSeen())))
      : h('p', { class: 'empty' }, 'No festival fits all of that. ',
          h('button', { type: 'button', class: 'link', onclick: () => { Object.assign(s, LOOSEST); render(); } }, 'Show all events instead')));
  }
  render();
  requestAnimationFrame(() => Object.values(sentenceBlanks).forEach(fit));       // after the serif font has loaded
  document.fonts?.ready.then(() => Object.values(sentenceBlanks).forEach(fit));
  return () => { io.disconnect(); removeEventListener('resize', place_); tabNote?.remove(); };
}

// the hint about artist names goes on the first card that has any, until someone has opened an artist
const firstWithArtists = rows => rows.findIndex(e => e.headliners.length);
const artistSeen = () => { try { return localStorage.getItem('kr-artist-seen') === '1'; } catch { return false; } };

// "23–25 Oct", or "30 Oct – 1 Nov" across a month end: the date is shown once, in the box
const DM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
function dateBox(start, end, projected) {
  const [a, b] = [d(start), d(end)];
  const [dd1, mm1] = DM.format(a).split(' '), [dd2, mm2] = DM.format(b).split(' ');
  const likely = projected ? h('span', { class: 'likely' }, 'likely') : null;
  if (mm1 !== mm2) return h('div', { class: 'datebox cross' }, likely,
    h('span', { class: 'dd' }, dd1, ' ', h('small', {}, mm1)), h('span', { class: 'dd' }, '– ', dd2, ' ', h('small', {}, mm2)));
  return h('div', { class: 'datebox' }, likely, h('span', { class: 'dd' }, start === end ? dd1 : `${dd1}–${dd2}`), h('span', { class: 'mm' }, mm1));
}


// "✈ ~€492 from Bergen (+104 km)", the price links to Google Flights for that weekend
function flight(e, home) {
  if (e.fare?.home) return h('p', { class: 'flight easy' }, 'In Bergen, no flight needed');
  if (!e.fare) return h('p', { class: 'flight muted' }, '✈ flight not checked yet');
  const url = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${home} to ${e.airport} on ${e.depart} through ${addDays(e.depart, 3)}`)}&curr=EUR`;
  return h('p', { class: 'flight' + (e.fare.price <= 150 ? ' easy' : '') }, '✈ ',
    h('a', { href: url, target: '_blank', rel: 'noopener', title: 'Friday to Monday return; check on Google Flights' }, '~' + euro(e.fare.price)),
    ' from Bergen', e.airport_km > 30 ? h('span', { class: 'muted' }, ` (+${e.airport_km} km)`) : '');
}

function card(e, home, hint = false) {
  const start = e.projected ? e.depart : e.start_date, end = e.projected ? addDays(e.depart, 2) : (e.end_date || e.start_date);
  const title = tidyTitle(e.title);
  const more = h('div', { class: 'calm-more', hidden: true });
  const toggles = [];
  const setOpen = open => {
    if (open && !more.childElementCount) more.append(
      title !== e.title ? h('p', { class: 'muted small listed' }, 'Listed as “', e.title, '”') : '',
      eventDetail(e.id, home, { compact: true }));
    more.hidden = !open; art.classList.toggle('open', open);
    for (const t of toggles) t.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Less' : 'Line-up & details';
  };
  const toggleBtn = (cls, ...kids) => { const b = h('button', { type: 'button', class: cls, 'aria-expanded': 'false',
    onclick: ev => { ev.stopPropagation(); setOpen(more.hidden); } }, ...kids); toggles.push(b); return b; };
  const label = h('span', {}, 'Line-up & details');
  const pin = h('a', { href: `#map/event/${e.id}`, class: 'pin', title: 'Show on the map', 'aria-label': 'Show on the map' });
  pin.innerHTML = PIN;

  const links = e.headliners.map(a => h('a', { href: `#artist/${a.id}`, class: 'artist',
    onclick: () => { try { localStorage.setItem('kr-artist-seen', '1'); } catch {} } }, a.name));
  const rest = (e.lineup || 0) - e.headliners.length;
  const withLine = links.length ? h('p', { class: 'with' }, 'With ',
    ...links.flatMap((l, i) => i ? [i === links.length - 1 && rest <= 0 ? ' and ' : ', ', l] : [l]),
    rest > 0 ? [' and ', toggleBtn('link more-names', `${rest} more`)] : null) : null;
  // up to three features as icon + short word (icons alone are guesswork); the rest are in the details
  const feats = new Set((e.features || '').split(','));
  const traits = TRAITS.filter(([k]) => feats.has(k));
  const traitRow = traits.length ? h('ul', { class: 'traits', 'aria-label': 'Highlights' },
    traits.slice(0, 3).map(([, label, icon]) => { const li = h('li', {}, h('span', { class: 'ic' }), label); li.firstChild.innerHTML = icon; return li; }),
    traits.length > 3 ? h('li', { class: 'more-traits' }, toggleBtn('link', `+${traits.length - 3}`)) : null) : null;

  const art = h('article', { class: 'calm-card' + (e.projected ? ' projected' : '') },
    h('div', { class: 'c-top' },
      dateBox(start, end, e.projected),
      h('div', { class: 'c-head' },
        h('p', { class: 'where' }, place(e)),
        h('h3', {}, toggleBtn('title-btn', title)))),
    styleLine(e) ? h('p', { class: 'styles' }, styleLine(e)) : null,
    traitRow,
    withLine,
    hint && withLine ? note('note-artist', 'up', 'click', ' a name to see where else they teach') : null,
    e.projected ? h('p', { class: 'with muted' }, 'This year’s dates aren’t out yet.') : null,
    h('div', { class: 'foot' }, flight(e, home), h('div', { class: 'actions' }, toggleBtn('link', label), pin)),
    more);
  // the whole card opens the details, except where it already holds a link or a button
  art.addEventListener('click', ev => { if (!ev.target.closest('a, button, select, input, label, .calm-more')) setOpen(more.hidden); });
  return art;
}
