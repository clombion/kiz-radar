// The Festivals page: a sentence with blanks, festival cards below, and a sticky bar with the same choices
// (plus "More filters") once the sentence has scrolled away.
import { h, addDays, flag, today, home } from './ui.js';
import { site } from './db.js';
import { festivals, readState, changed } from './festivals.js';
import { eventCard } from './eventcard.js';
import { blanksHint, exploreHint, artistHint } from './hints.js';
import { festivalsHref, showInAddressBar } from './routes.js';

// reach is the most a Fri→Mon return may cost; 0 is any price
const DEFAULTS = { style: 'kiz', months: 3, reach: 0, country: '', taxi: 0, allin: 0, lineup: 0, likely: 1, unchecked: 0, sort: 'date' };
const LOOSEST = { style: 'all', months: 12, reach: 0, country: '', taxi: 0, allin: 0, lineup: 0, likely: 1, unchecked: 0 };

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

const STYLE = [['kiz', 'Kizomba & Urban Kiz'], ['all', 'any kizomba style']];
const WHEN = [[1, 'the next month'], [2, 'the next two months'], [3, 'the next three months'], [6, 'the next six months'], [12, 'the coming year']];
// the sentence says it in words; the bar and the filtering use the numbers
const PRICE = [[0, 'any price'], [250, 'a reasonable price'], [150, 'a cheap price']];
const SHORT_LABEL = { style: { kiz: 'Kiz & Urban Kiz', all: 'All styles' },
  months: { 1: '1 month', 2: '2 months', 3: '3 months', 6: '6 months', 12: '12 months' },
  reach: { 0: 'Any price', 250: 'Under €250', 150: 'Under €150' } };
const FLAGS = [0, 1];
const LINEUP = [[0, 'Any size'], [10, '10+ artists'], [20, '20+ artists']];
const ORDER = [['date', 'Soonest first'], ['fare', 'Cheapest flight first']];

function matches(all, s) {
  const end = addDays(today(), Math.round(s.months * 30.4));
  return all.filter(e => e.depart <= end && (s.likely || !e.projected) && (s.style === 'all' || e.kiz_only) &&
      (!s.reach || (e.fare ? e.fare.price <= s.reach : s.unchecked)) &&
      (!s.country || e.country_code === s.country) && (!s.taxi || e.taxi_dancers) && (!s.allin || e.all_in_one) &&
      e.lineup >= s.lineup)
    .sort(s.sort === 'fare'
      ? (a, b) => (a.fare?.price ?? 1e9) - (b.fare?.price ?? 1e9) || a.depart.localeCompare(b.depart)
      : (a, b) => a.depart.localeCompare(b.depart));
}

export function sentenceView(root, qs, { signal, data }) {
  let all = null;                  // the festivals, once the database is in
  const countries = site().destinations;
  const s = readState(qs, DEFAULTS, { style: STYLE.map(([v]) => v), months: WHEN.map(([v]) => v), reach: PRICE.map(([v]) => v),
    country: ['', ...countries.map(c => c.code)], lineup: LINEUP.map(([v]) => v), sort: ORDER.map(([v]) => v),
    taxi: FLAGS, allin: FLAGS, likely: FLAGS, unchecked: FLAGS });

  const blank = (key, opts, cls = 'blank') => {
    const el = h('select', { class: cls, 'aria-label': key }, opts.map(([v, t]) => h('option', { value: v }, t)));
    el.value = String(s[key]);
    el.addEventListener('change', () => { s[key] = typeof DEFAULTS[key] === 'number' ? Number(el.value) : el.value; hideHints(); render(); });
    return el;
  };
  // a native select is as wide as its longest option; size the sentence blanks to the chosen one instead
  const ruler = h('span', { class: 'ruler', 'aria-hidden': 'true' });
  const fit = el => { ruler.textContent = el.selectedOptions[0]?.textContent || ''; el.style.width = (ruler.getBoundingClientRect().width + 4) + 'px'; };
  const DEST = [['', 'anywhere'], ...countries.map(c => [c.code, c.name])];
  const DEST_SHORT = [['', 'Anywhere'], ...countries.map(c => [c.code, `${flag(c.code)} ${c.name}`])];
  const sentenceBlanks = { style: blank('style', STYLE), months: blank('months', WHEN), country: blank('country', DEST), reach: blank('reach', PRICE) };
  const live = h('p', { class: 'live', 'aria-live': 'polite' });
  const hero = h('header', { class: 'sentence-hero' },
    h('p', { class: 'kicker' }, 'Kiz Radar'),
    h('p', { class: 'sentence' }, 'I’d like to dance ',
      h('span', { class: 'anchor' }, sentenceBlanks.style, note('note-top', 'down', 'click', ' to change the dance')),
      ' at a festival in ', sentenceBlanks.months, `, flying from ${home().city} to `,
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
    country: blank('country', DEST_SHORT, 'mini'),
    reach: blank('reach', Object.entries(SHORT_LABEL.reach), 'mini') };
  const barCount = h('span', { class: 'bar-count' });
  const moreBtn = h('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false', 'aria-controls': 'more-panel' }, 'More filters ▾');
  const check = (key, label) => { const c = h('input', { type: 'checkbox' }); c.checked = !!s[key];
    c.addEventListener('change', () => { s[key] = c.checked ? 1 : 0; render(); }); return h('label', { class: 'check' }, c, ' ', label); };
  const moreFields = () => [
    h('div', { class: 'core-fields' },
      h('label', { class: 'field' }, h('span', {}, 'Style'), blank('style', Object.entries(SHORT_LABEL.style), 'plain')),
      h('label', { class: 'field' }, h('span', {}, 'Destination'), blank('country', DEST_SHORT, 'plain'))),
    h('label', { class: 'field' }, h('span', {}, 'Line-up'), blank('lineup', LINEUP, 'plain')),
    h('label', { class: 'field' }, h('span', {}, 'Order'), blank('sort', ORDER, 'plain')),
    h('div', { class: 'checks' }, check('taxi', 'Taxi dancers'), check('allin', 'All-in-one hotel'),
      check('likely', 'Include likely next editions'), check('unchecked', 'Include festivals whose flight isn’t checked yet')),
  ];
  const panel = h('div', { class: 'more-panel', id: 'more-panel', hidden: true }, moreFields());
  moreBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; moreBtn.setAttribute('aria-expanded', String(!panel.hidden)); });
  const bar = h('div', { class: 'sticky-bar', 'aria-label': 'Filters' },
    h('div', { class: 'bar-inner' }, h('span', { class: 'wide-only' }, barBlanks.style), barBlanks.months,
      h('span', { class: 'wide-only' }, barBlanks.country), barBlanks.reach, barCount, moreBtn), panel);
  document.addEventListener('click', ev => { if (!panel.hidden && !bar.contains(ev.target)) { panel.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); } }, { signal });

  const results = h('section', { class: 'sentence-results' });
  // once someone has changed a blank they've got it: fade the hints, and don't show them again
  function hideHints() {
    hero.classList.add('hints-done');
    blanksHint.mark();
  }
  if (blanksHint.seen()) hero.classList.add('hints-done');
  root.replaceChildren(h('div', { class: 'sentence-page' }, hero, bar, results));
  // sit flush under the site header, whatever its height on this screen
  const header = document.querySelector('header.top');
  const place_ = () => { if (header) bar.style.top = header.getBoundingClientRect().height + 'px'; };
  place_(); addEventListener('resize', place_, { signal });
  // a hint under the "Map & artists" tab, until someone has been there
  const tab = document.querySelector('a[data-nav="explore"]');
  const tabNote = !exploreHint.seen() ? note('note-tab', 'up', 'psst… more here') : null;
  if (tabNote) tab.append(tabNote);
  const io = new IntersectionObserver(([en]) => {
    bar.classList.toggle('shown', !en.isIntersecting);
    tabNote?.classList.toggle('away', !en.isIntersecting);          // don't float over the cards
  }, { rootMargin: '-60px 0px 0px 0px' });
  io.observe(hero);
  signal.addEventListener('abort', () => { io.disconnect(); tabNote?.remove(); });

  function render() {
    showInAddressBar(festivalsHref(changed(s, DEFAULTS)));
    for (const k of ['style', 'months', 'country', 'reach']) { sentenceBlanks[k].value = String(s[k]); barBlanks[k].value = String(s[k]); fit(sentenceBlanks[k]); }
    panel.replaceChildren(...moreFields());
    const extra = ['taxi', 'allin', 'lineup', 'unchecked'].filter(k => s[k] !== DEFAULTS[k]).length + (s.likely ? 0 : 1);
    const hiddenOnPhone = (s.style !== DEFAULTS.style) + !!s.country;     // only counted where those two live in the panel
    moreBtn.replaceChildren(h('span', { class: 'wide' }, 'More filters'), h('span', { class: 'narrow' }, 'Filters', extra + hiddenOnPhone ? ` (${extra + hiddenOnPhone})` : ''),
      h('span', { class: 'wide' }, extra ? ` (${extra})` : ''), ' ▾');
    if (!all) { live.textContent = 'Looking for festivals like that…'; barCount.textContent = ''; return; }
    const rows = matches(all, s);
    live.replaceChildren(rows.length
      ? h('span', {}, `${rows.length} festival${rows.length > 1 ? 's' : ''} like that`,
          !s.reach ? '. ' : h('span', { class: 'price-note' }, ` (return flights under €${s.reach}, Friday to Monday). `),
          h('a', { href: '#', onclick: ev => { ev.preventDefault(); results.scrollIntoView({ behavior: 'smooth' }); } }, 'Show them ↓'))
      : 'Nothing like that yet. Try a longer time, anywhere, or any price.');
    barCount.textContent = `${rows.length} festival${rows.length === 1 ? '' : 's'}`;
    results.replaceChildren(rows.length
      ? h('div', { class: 'festival-cards' }, rows.map((e, i) => eventCard(e, { hint: i === firstWithArtists(rows) && !artistHint.seen() ? note('note-artist', 'up', 'click', ' a name to see where else they teach') : null })))
      : h('p', { class: 'empty' }, 'No festival fits all of that. ',
          h('button', { type: 'button', class: 'link', onclick: () => { Object.assign(s, LOOSEST); render(); } }, 'Show all events instead')));
  }
  render();
  data.then(() => { if (!signal.aborted) { all = festivals(); render(); } },
    e => { live.replaceChildren(h('span', { class: 'error' }, 'Could not load the festivals: ' + e.message)); });
  requestAnimationFrame(() => Object.values(sentenceBlanks).forEach(fit));       // and again once the web font has loaded
  document.fonts?.ready.then(() => Object.values(sentenceBlanks).forEach(fit));
}

// the hint about artist names goes on the first card that has any, until someone has opened an artist
const firstWithArtists = rows => rows.findIndex(e => e.headliners.length);

