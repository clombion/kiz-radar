// The Festivals page: a sentence with blanks, festival cards below, and a sticky bar with the same choices
// (plus "More filters") once the sentence has scrolled away.
import { h, flag, home, loading } from './ui.js';
import { addDays, today } from './days.js';
import { KEY } from './states.js';
import { text } from './wording.js';
import { site } from './db.js';
import { festivals, readState, changed, WITH, hasWith, withPhrase } from './festivals.js';
import { money, step, currency } from './money.js';
import { friendsIn } from './plans.js';
import { eventCard } from './eventcard.js';
import { blanksHint, exploreHint, artistHint } from './hints.js';
import { festivalsHref, showInAddressBar } from './routes.js';

// reach is the most the trip may cost (the full pass and a Fri→Mon return flight); 0 is any price. with is a dance or highlight picked in the search;
// friends keeps the festivals that featured people said they're going to.
const DEFAULTS = { months: 6, reach: 150, country: '', with: '', friends: 0, taxi: 0, allin: 0, lineup: 0, unchecked: 0, sort: 'date' };
const LOOSEST = { months: 12, reach: 0, country: '', with: '', friends: 0, taxi: 0, allin: 0, lineup: 0, unchecked: 0 };

// Hand-drawn hints next to the blanks. Static SVG, so building it from a string is safe.
const ARROWS = {
  up: '<svg viewBox="0 0 64 52" width="54" height="44"><path d="M56 44 C36 45 18 34 13 9"/><path d="M13 9 L6 19 M13 9 L21 16"/></svg>',
};
function note(cls, arrow, ...text) {
  const art = h('span', { class: 'arrow' }); art.innerHTML = ARROWS[arrow];
  const words = h('span', { class: 'hand' }, ...text.map(t => t === 'click' ? [h('span', { class: 'click' }, 'click'), h('span', { class: 'tap' }, 'tap')] : t));
  return h('span', { class: 'note ' + cls, 'aria-hidden': 'true' }, art, words);
}

// the dance in the sentence changes every few seconds; "a" gains its n before a vowel ("an Urban Kiz festival")
const DANCES = [KEY.genre.KIZOMBA, KEY.genre.URBANKIZ, KEY.genre.TARRAXO].map(g => text('genre', g));
const takesAn = word => /^[aeiou]/i.test(word);
// in words, and in digits for screens where only the shorter form keeps the blank on the "festival in" line
const WHEN = [[1, 'the next month'], [2, 'the next two months'], [3, 'the next three months'], [6, 'the next six months'], [12, 'the coming year']];
const WHEN_DIGITS = { 2: 'the next 2 months', 3: 'the next 3 months', 6: 'the next 6 months' };
// the sentence says it in words; the bar and the filtering use the numbers
// reach 150 and 250 name the cheap and fair trip steps, round numbers in the visitor's currency (money.js)
const PRICE = [[0, 'any price'], [250, 'a reasonable price'], [150, 'a cheap price']];
const STEP = { 150: 'cheap', 250: 'fair' };
const under = reach => money(step('trip', STEP[reach]), currency);
const SHORT_LABEL = {
  months: { 1: '1 month', 2: '2 months', 3: '3 months', 6: '6 months', 12: '12 months' },
  reach: { 0: 'Any price', 250: `Under ${under(250)}`, 150: `Under ${under(150)}` } };
const FLAGS = [0, 1];
const LINEUP = [[0, 'Any size'], [10, '10+ artists'], [20, '20+ artists']];
const ORDER = [['date', 'Soonest first'], ['fare', 'Cheapest first']];

function matches(all, s) {
  const end = addDays(today(), Math.round(s.months * 30.4));
  return all.filter(e => e.depart <= end &&
      // with a price limit: the trip within it; sold out never; an unknown trip only when asked for
      (!s.reach || (e.price.point === 'card_price' && e.price.key === KEY.card_price.SOLD_OUT ? false : e.trip != null ? e.trip <= step('trip', STEP[s.reach]) : s.unchecked)) &&
      (!s.country || e.country_code === s.country) && (!s.with || hasWith(e, s.with)) && (!s.friends || e.goers.some(g => g.featured)) &&
      (!s.taxi || e.taxi_dancers) && (!s.allin || e.all_in_one) &&
      e.lineup >= s.lineup)
    .sort(s.sort === 'fare'
      ? (a, b) => (a.trip ?? 1e9) - (b.trip ?? 1e9) || (a.fare?.price ?? 1e9) - (b.fare?.price ?? 1e9) || a.depart.localeCompare(b.depart)
      : (a, b) => a.depart.localeCompare(b.depart));
}

export function sentenceView(root, qs, { signal, data }) {
  let all = null;                  // the festivals, once the database is in
  const countries = site().destinations;
  const s = readState(qs, DEFAULTS, { months: WHEN.map(([v]) => v), reach: PRICE.map(([v]) => v),
    country: ['', ...countries.map(c => c.code)], with: ['', ...WITH.keys()], friends: FLAGS, lineup: LINEUP.map(([v]) => v), sort: ORDER.map(([v]) => v),
    taxi: FLAGS, allin: FLAGS, unchecked: FLAGS });

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
  const sentenceBlanks = { months: blank('months', WHEN), country: blank('country', DEST), reach: blank('reach', PRICE) };
  const live = h('p', { class: 'live', 'aria-live': 'polite' });
  const withTag = h('p', { class: 'with-tag' });
  // the choices that only show as tags, under the sentence and in the Filters panel alike
  const tag = ([lead, what], remove) => h('span', { class: 'tag' }, lead, h('strong', {}, what), ' ',
    h('button', { type: 'button', class: 'remove', 'aria-label': `Remove “${what}”`, onclick: ev => { ev.stopPropagation(); remove(); render(); } }, '×'));
  const tags = () => [s.with ? tag(withPhrase(s.with), () => { s.with = ''; }) : null,
    s.friends ? tag(['With ', 'friends going'], () => { s.friends = 0; }) : null].filter(Boolean);
  const festivalIn = h('span', {}, ' festival in ');
  // words where they fit after "festival in", digits where only they do (narrow phones); otherwise words
  const fitMonths = () => {
    const el = sentenceBlanks.months, sameLine = () => Math.abs(el.offsetTop - festivalIn.offsetTop) < el.offsetHeight / 2;
    const label = digits => { for (const o of el.options) o.textContent = (digits && WHEN_DIGITS[o.value]) || WHEN.find(([v]) => String(v) === o.value)[1]; fit(el); };
    label(false);
    if (!sameLine()) { label(true); if (!sameLine()) label(false); }
  };
  // the hint under "anywhere" hangs to the right of it, or to the left where the menu ends near the edge
  const whereNote = note('note-bottom', 'up', 'click', ' to change where');
  const placeNote = () => {
    whereNote.classList.remove('flip');
    if (whereNote.getBoundingClientRect().right > hero.getBoundingClientRect().right) whereNote.classList.add('flip');
  };
  const layout = () => { fitMonths(); placeNote(); };
  const dance = h('span', { class: 'dance' }, DANCES.map(d => h('span', {}, d)));
  const n = h('span', { class: 'article-n' }, 'n');
  const hero = h('header', { class: 'sentence-hero arriving' },
    h('p', { class: 'kicker', 'aria-hidden': 'true' }, 'Kiz Radar'),      // a phone's header shows only the logo
    h('p', { class: 'sentence' }, 'I want to go to a',
      h('span', { 'aria-hidden': 'true' }, n, ' ', dance), h('span', { class: 'visually-hidden' }, ' ', text('genre', KEY.genre.KIZOMBA)),
      h('br', { class: 'phone-break' }), festivalIn,
      sentenceBlanks.months, `, flying from ${home().city} to `,
      h('span', { class: 'anchor' }, sentenceBlanks.country, whereNote),
      ' for ', h('span', { class: 'nowrap' }, sentenceBlanks.reach, '.'), ruler),
    withTag,
    note('note-inline', 'up', 'click', ' to change'),
    live,
    h('p', { class: 'nevermind' }, h('button', { type: 'button', class: 'link', onclick: () => {
      Object.assign(s, LOOSEST); render(); results.scrollIntoView({ behavior: 'smooth' }); } }, 'Never mind, show me all events')));

  // sticky bar: the same three choices in short form, the count, and "More filters"
  const barBlanks = {
    months: blank('months', Object.entries(SHORT_LABEL.months), 'mini'),
    country: blank('country', DEST_SHORT, 'mini'),
    reach: blank('reach', Object.entries(SHORT_LABEL.reach), 'mini') };
  const barCount = h('span', { class: 'bar-count' });
  const moreBtn = h('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false', 'aria-controls': 'more-panel' }, 'More filters ▾');
  const check = (key, label) => { const c = h('input', { type: 'checkbox' }); c.checked = !!s[key];
    c.addEventListener('change', () => { s[key] = c.checked ? 1 : 0; render(); }); return h('label', { class: 'check' }, c, ' ', label); };
  const moreFields = () => [
    tags().length ? h('div', { class: 'with-tag' }, tags()) : null,
    h('div', { class: 'core-fields' },
      h('label', { class: 'field' }, h('span', {}, 'Destination'), blank('country', DEST_SHORT, 'plain'))),
    h('label', { class: 'field' }, h('span', {}, 'Line-up'), blank('lineup', LINEUP, 'plain')),
    h('label', { class: 'field' }, h('span', {}, 'Order'), blank('sort', ORDER, 'plain')),
    h('div', { class: 'checks' }, check('friends', 'Only festivals friends go to'), check('taxi', text('feature', KEY.feature.TAXI_DANCERS)), check('allin', text('feature', KEY.feature.ALL_IN_ONE)),
      check('unchecked', 'Include festivals with unknown prices')),
  ];
  const panel = h('div', { class: 'more-panel', id: 'more-panel', hidden: true }, moreFields());
  moreBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; moreBtn.setAttribute('aria-expanded', String(!panel.hidden)); });
  const bar = h('div', { class: 'sticky-bar', 'aria-label': 'Filters' },
    h('div', { class: 'bar-inner' }, barBlanks.months,
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
  rotate(dance, n, signal);
  // sit flush under the site header, whatever its height on this screen
  const header = document.querySelector('header.top');
  const place_ = () => { if (header) bar.style.top = header.getBoundingClientRect().height + 'px'; };
  place_(); addEventListener('resize', place_, { signal });
  // a hint under the Explore tab, until someone has been there
  const tab = document.querySelector('a[data-nav="explore"]');
  const tabNote = !exploreHint.seen() ? note('note-tab', 'up', 'psst… more here') : null;
  if (tabNote) tab.append(tabNote);
  const io = new IntersectionObserver(([en]) => {
    bar.classList.toggle('shown', !en.isIntersecting);
    tabNote?.classList.toggle('away', !en.isIntersecting);          // don't float over the cards
  }, { rootMargin: '-60px 0px 0px 0px' });
  io.observe(hero);
  signal.addEventListener('abort', () => { io.disconnect(); tabNote?.remove(); });

  // "Cédric & Christina are going to 3 of these. Show only those", when featured people go to some of them
  function friendsLine(rows) {
    const f = !s.friends && friendsIn(rows);
    if (!f) return null;
    const all_ = f.n === rows.length;
    return h('span', { class: 'friends' }, f.faces, h('span', {}, f.names, ` ${f.many ? 'are' : 'is'} going to `,
      all_ ? (rows.length === 1 ? 'this one' : 'all of these') : f.n === 1 ? 'one of these' : `${f.n} of these`, '. ',
      all_ ? null : h('button', { type: 'button', class: 'link', onclick: () => { s.friends = 1; render(); } }, 'Show only those')));
  }

  function render() {
    showInAddressBar(festivalsHref(changed(s, DEFAULTS)));
    for (const k of ['months', 'country', 'reach']) { sentenceBlanks[k].value = String(s[k]); barBlanks[k].value = String(s[k]); fit(sentenceBlanks[k]); }
    layout();
    panel.replaceChildren(...moreFields());
    const extra = ['with', 'friends', 'taxi', 'allin', 'lineup', 'unchecked'].filter(k => s[k] !== DEFAULTS[k]).length;
    const hiddenOnPhone = +!!s.country;     // only counted where the destination lives in the panel
    moreBtn.replaceChildren(h('span', { class: 'wide' }, 'More filters'), h('span', { class: 'narrow' }, 'Filters', extra + hiddenOnPhone ? ` (${extra + hiddenOnPhone})` : ''),
      h('span', { class: 'wide' }, extra ? ` (${extra})` : ''), ' ▾');
    const shown = tags();
    withTag.hidden = !shown.length;
    withTag.replaceChildren(...shown);
    if (!all) { live.textContent = 'Looking for festivals like that…'; barCount.textContent = ''; results.replaceChildren(loading()); return; }
    const rows = matches(all, s);
    // when the time and price hide everything, offer to widen just those, keeping the place and the rest
    const widened = rows.length || (s.months === 12 && !s.reach) ? 0 : matches(all, { ...s, months: 12, reach: 0 }).length;
    const widen = () => h('button', { type: 'button', class: 'link', onclick: () => { Object.assign(s, { months: 12, reach: 0 }); render(); } },
      `Show the ${widened} in the coming year, at any price`);
    live.replaceChildren(rows.length
      ? h('span', {}, `${rows.length} festival${rows.length > 1 ? 's' : ''} like that`,
          !s.reach ? '. ' : h('span', { class: 'price-note' }, ` (full pass and Friday-to-Monday return flight under ${under(s.reach)}). `),
          h('a', { href: '#', onclick: ev => { ev.preventDefault(); results.scrollIntoView({ behavior: 'smooth' }); } }, 'Show them ↓'),
          friendsLine(rows))
      : widened ? h('span', {}, 'None in that time or for that price. ', widen())
      : 'Nothing like that yet. Try a longer time, anywhere, or any price.');
    barCount.textContent = `${rows.length} festival${rows.length === 1 ? '' : 's'}`;
    results.replaceChildren(rows.length
      ? h('div', { class: 'festival-cards' }, rows.map((e, i) => eventCard(e, { hint: i === firstWithArtists(rows) && !artistHint.seen() ? note('note-artist', 'up', 'click', ' a name to see where else they teach') : null })))
      : widened ? h('p', { class: 'empty' }, 'No festival fits that time and price. ', widen())
      : h('p', { class: 'empty' }, 'No festival fits all of that. ',
          h('button', { type: 'button', class: 'link', onclick: () => { Object.assign(s, LOOSEST); render(); } }, 'Show all events instead')));
  }
  render();
  data.then(() => { if (!signal.aborted) { all = festivals(); render(); } },
    e => { live.replaceChildren(h('span', { class: 'error' }, 'Could not load the festivals: ' + e.message)); });
  const refit = () => { Object.values(sentenceBlanks).forEach(fit); layout(); };
  requestAnimationFrame(refit);                                   // and again once the web font has loaded
  // The sentence fades in once its fonts are in (or after a second at most), so it is laid out once, in its own
  // fonts, instead of jumping when they swap in.
  Promise.race([document.fonts.ready, new Promise(done => setTimeout(done, 1000))])
    .then(() => { if (signal.aborted) return; refit(); requestAnimationFrame(() => hero.classList.remove('arriving')); });
  addEventListener('resize', layout, { signal });
}

// Each dance shows for a few seconds, then cross-fades to the next while its slot eases to the new width, so the
// words after it slide along; the n of "an" fades in and out the same way. On a phone the dance ends its line.
// Should a dance's width still change the line breaks at some screen width, the slot keeps the widest width there.
// With reduced motion the first dance stays.
const SHOWN_MS = 3000;
function rotate(el, n, signal) {
  const words = [...el.children], sentence = el.closest('.sentence');
  let i = 0, eases = false;
  const width = k => (eases ? words[k].scrollWidth : Math.max(...words.map(w => w.scrollWidth))) + 'px';
  const show = () => {
    words.forEach((w, k) => w.classList.toggle('on', k === i));
    n.classList.toggle('on', takesAn(words[i].textContent));
    n.classList.toggle('held', !eases);                         // keeps its space and only fades, like the dance
    el.style.width = width(i);
  };
  const lines = () => [...sentence.querySelectorAll('select')].map(s => s.offsetTop).join();
  function measure() {                                          // would any dance's own width change the line breaks?
    el.style.transition = n.style.transition = 'none';
    const seen = new Set(words.map(w => {
      el.style.width = w.scrollWidth + 'px'; n.classList.remove('held'); n.classList.toggle('on', takesAn(w.textContent)); return lines(); }));
    eases = seen.size === 1;
    show(); el.offsetWidth; el.style.transition = n.style.transition = '';
  }
  measure();
  document.fonts?.ready.then(measure);                          // widths change once the web font is in
  addEventListener('resize', measure, { signal });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const timer = setInterval(() => { i = (i + 1) % words.length; show(); }, SHOWN_MS);
  signal.addEventListener('abort', () => clearInterval(timer));
}

// the hint about artist names goes on the first card that has any, until someone has opened an artist
const firstWithArtists = rows => rows.findIndex(e => e.headliners.length);

