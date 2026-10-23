// Variant: a sentence with blanks as the landing, calm cards below, and a sticky bar with the same
// choices (plus "More filters") once the sentence has scrolled away.
import { h, range, addDays, countryName, flag, today } from '../js/ui.js';
import { eventDetail } from '../js/event.js';
import { festivals, flightLine, place, styleLine, DAY, SHORT, d, stateFromHash, writeHash } from './common.js';

const DEFAULTS = { style: 'kiz', months: 3, reach: 'any', country: '', taxi: 0, allin: 0, lineup: 0, likely: 1, unchecked: 0, sort: 'date' };
const LOOSEST = { style: 'all', months: 12, reach: 'any', country: '', taxi: 0, allin: 0, lineup: 0, likely: 1, unchecked: 0 };

const STYLE = [['kiz', 'Kizomba & Urban Kiz'], ['all', 'any kizomba style']];
const WHEN = [[1, 'the next month'], [2, 'the next two months'], [3, 'the next three months'], [6, 'the next six months'], [12, 'the coming year']];
const REACH = [['any', 'anywhere'], [250, 'somewhere under €250 return'], [150, 'somewhere under €150 return']];
const SHORT_LABEL = { style: { kiz: 'Kiz & Urban Kiz', all: 'All styles' },
  months: { 1: '1 month', 2: '2 months', 3: '3 months', 6: '6 months', 12: '12 months' },
  reach: { any: 'Anywhere', 250: 'Under €250', 150: 'Under €150' } };

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
    el.addEventListener('change', () => { s[key] = /^\d+$/.test(el.value) ? Number(el.value) : el.value; render(); });
    return el;
  };
  // a native select is as wide as its longest option; size the sentence blanks to the chosen one instead
  const ruler = h('span', { class: 'ruler', 'aria-hidden': 'true' });
  const fit = el => { ruler.textContent = el.selectedOptions[0]?.textContent || ''; el.style.width = (ruler.getBoundingClientRect().width + 4) + 'px'; };
  const sentenceBlanks = { style: blank('style', STYLE), months: blank('months', WHEN), reach: blank('reach', REACH) };
  const live = h('p', { class: 'live', 'aria-live': 'polite' });
  const hero = h('header', { class: 'sentence-hero' },
    h('p', { class: 'kicker' }, 'Kizomba Radar'),
    h('p', { class: 'sentence' }, 'I’d like to dance ', sentenceBlanks.style, ' at a festival in ', sentenceBlanks.months,
      ', flying from Bergen to ', h('span', { class: 'nowrap' }, sentenceBlanks.reach, '.'), ruler),
    live,
    h('p', { class: 'nevermind' }, h('button', { type: 'button', class: 'link', onclick: () => {
      Object.assign(s, LOOSEST); render(); results.scrollIntoView({ behavior: 'smooth' }); } }, 'Never mind, show me all events')));

  // sticky bar: the same three choices in short form, the count, and "More filters"
  const barBlanks = {
    style: blank('style', Object.entries(SHORT_LABEL.style), 'mini'),
    months: blank('months', Object.entries(SHORT_LABEL.months), 'mini'),
    reach: blank('reach', Object.entries(SHORT_LABEL.reach), 'mini') };
  const barCount = h('span', { class: 'bar-count' });
  const summary = h('span', { class: 'bar-summary' });
  const moreBtn = h('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false', 'aria-controls': 'more-panel' }, 'More filters ▾');
  const check = (key, label) => { const c = h('input', { type: 'checkbox' }); c.checked = !!s[key];
    c.addEventListener('change', () => { s[key] = c.checked ? 1 : 0; render(); }); return h('label', { class: 'check' }, c, ' ', label); };
  const moreFields = () => [
    h('div', { class: 'core-fields' },
      h('label', { class: 'field' }, h('span', {}, 'Style'), blank('style', Object.entries(SHORT_LABEL.style), 'plain')),
      h('label', { class: 'field' }, h('span', {}, 'When'), blank('months', Object.entries(SHORT_LABEL.months), 'plain')),
      h('label', { class: 'field' }, h('span', {}, 'Flight'), blank('reach', Object.entries(SHORT_LABEL.reach), 'plain'))),
    h('label', { class: 'field' }, h('span', {}, 'Country'), blank('country', [['', 'Anywhere'], ...countries.map(c => [c, `${flag(c)} ${countryName(c)}`])], 'plain')),
    h('label', { class: 'field' }, h('span', {}, 'Line-up'), blank('lineup', [[0, 'Any size'], [10, '10+ artists'], [20, '20+ artists']], 'plain')),
    h('label', { class: 'field' }, h('span', {}, 'Order'), blank('sort', [['date', 'Soonest first'], ['fare', 'Cheapest flight first']], 'plain')),
    h('div', { class: 'checks' }, check('taxi', 'Taxi dancers'), check('allin', 'All-in-one hotel'),
      check('likely', 'Include likely next editions'), check('unchecked', 'Include festivals whose flight isn’t checked yet')),
  ];
  const panel = h('div', { class: 'more-panel', id: 'more-panel', hidden: true }, moreFields());
  moreBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; moreBtn.setAttribute('aria-expanded', String(!panel.hidden)); });
  const bar = h('div', { class: 'sticky-bar', 'aria-label': 'Filters' },
    h('div', { class: 'bar-inner' }, barBlanks.style, barBlanks.months, barBlanks.reach, summary, barCount, moreBtn), panel);
  document.addEventListener('click', ev => { if (!panel.hidden && !bar.contains(ev.target)) { panel.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); } });

  const results = h('section', { class: 'sentence-results' });
  root.replaceChildren(h('div', { class: 'sentence-page' }, hero, bar, results));
  // sit flush under the site header, whatever its height on this screen
  const header = document.querySelector('header.top');
  const place_ = () => { if (header) bar.style.top = header.getBoundingClientRect().height + 'px'; };
  place_(); addEventListener('resize', place_);
  const io = new IntersectionObserver(([en]) => bar.classList.toggle('shown', !en.isIntersecting), { rootMargin: '-60px 0px 0px 0px' });
  io.observe(hero);

  function render() {
    writeHash(s, DEFAULTS);
    for (const k of ['style', 'months', 'reach']) { sentenceBlanks[k].value = String(s[k]); barBlanks[k].value = String(s[k]); fit(sentenceBlanks[k]); }
    summary.textContent = `${SHORT_LABEL.style[s.style]} · ${SHORT_LABEL.months[s.months]} · ${SHORT_LABEL.reach[s.reach]}`;
    panel.replaceChildren(...moreFields());
    const rows = matches(all, s);
    const extra = ['country', 'taxi', 'allin', 'lineup', 'unchecked'].filter(k => s[k] !== DEFAULTS[k]).length + (s.likely ? 0 : 1);
    moreBtn.replaceChildren(h('span', { class: 'wide' }, 'More filters'), h('span', { class: 'narrow' }, 'Filters'), extra ? ` (${extra})` : '', ' ▾');
    live.replaceChildren(rows.length
      ? h('span', {}, `${rows.length} festival${rows.length > 1 ? 's' : ''} like that. `,
          h('a', { href: '#', onclick: ev => { ev.preventDefault(); results.scrollIntoView({ behavior: 'smooth' }); } }, 'Show them ↓'))
      : 'Nothing like that yet. Try a longer time or anywhere.');
    barCount.textContent = `${rows.length} festival${rows.length === 1 ? '' : 's'}`;
    results.replaceChildren(rows.length
      ? h('div', { class: 'calm-cards' }, rows.map(e => card(e, home)))
      : h('p', { class: 'empty' }, 'No festival fits all of that. ',
          h('button', { type: 'button', class: 'link', onclick: () => { Object.assign(s, LOOSEST); render(); } }, 'Show all events instead')));
  }
  render();
  requestAnimationFrame(() => Object.values(sentenceBlanks).forEach(fit));       // after the serif font has loaded
  document.fonts?.ready.then(() => Object.values(sentenceBlanks).forEach(fit));
  return () => { io.disconnect(); removeEventListener('resize', place_); };
}

function card(e, home) {
  const start = e.projected ? e.depart : e.start_date, end = e.projected ? addDays(e.depart, 2) : (e.end_date || e.start_date);
  const more = h('div', { class: 'calm-more', hidden: true });
  const toggle = h('button', { class: 'link', 'aria-expanded': 'false', onclick: () => {
    const open = more.hidden;
    if (open && !more.childElementCount) more.append(eventDetail(e.id, home, { compact: true }));
    more.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? 'Less' : 'Line-up & details';
    toggle.closest('.calm-card').classList.toggle('open', open);
  } }, 'Line-up & details');
  const extras = [e.taxi_dancers && 'taxi dancers', e.all_in_one && 'all-in-one'].filter(Boolean);
  return h('article', { class: 'calm-card' + (e.projected ? ' projected' : '') },
    h('div', { class: 'c-top' },
      h('div', { class: 'datebox', 'aria-hidden': 'true' }, h('span', { class: 'dd' }, DAY.format(d(start))), h('span', { class: 'mm' }, SHORT.format(d(start)).split(' ')[1])),
      h('div', {}, h('p', { class: 'where' }, place(e)), h('p', { class: 'when' }, e.projected ? `likely ${range(start, end)}` : range(start, end)))),
    h('h3', {}, e.title),
    styleLine(e) || extras.length ? h('p', { class: 'styles' }, [styleLine(e), extras.join(', ')].filter(Boolean).join(' · ')) : null,
    e.headliners.length ? h('p', { class: 'with' }, 'With ', e.headliners.join(', ')) : null,
    e.projected ? h('p', { class: 'with muted' }, 'This year’s dates aren’t out yet.') : null,
    h('div', { class: 'foot' }, flightLine(e, home)),
    h('div', { class: 'actions' }, toggle, h('a', { href: `#map/event/${e.id}` }, 'Map')),
    more);
}
