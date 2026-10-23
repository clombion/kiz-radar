// Variant: festival guide. Festivals grouped by month as magazine-style entries; the flight is a quiet line.
import { h, range, addDays } from '../js/ui.js';
import { eventDetail } from '../js/event.js';
import { withArtists, festivals, filtersBar, visible, flightLine, place, byMonth, footerLinks, styleLine, MONTHS, DAY, SHORT, d,
         stateFromHash, writeHash } from './common.js';

const DEFAULTS = { months: 4, style: 'kiz', reach: 'any' };

export function guideView(root, qs, { home }) {
  const all = festivals(home);
  const s = stateFromHash(qs, DEFAULTS);
  const filters = h('div');
  const body = h('div');
  root.replaceChildren(h('section', { class: 'ed guide' },
    h('header', { class: 'ed-hero' },
      h('p', { class: 'kicker' }, 'Kizomba Radar · from Bergen'),
      h('h1', {}, 'Where to dance next'),
      h('p', { class: 'lede' }, 'Kizomba and Urban Kiz festivals across Europe, month by month: who’s teaching, what the vibe is, and roughly what the trip from Bergen costs.')),
    filters, body, footerLinks()));
  function render() {
    writeHash(s, DEFAULTS);
    filters.replaceChildren(filtersBar(s, render));
    const rows = visible(all, s);
    const months = byMonth(rows);
    body.replaceChildren(
      h('p', { class: 'ed-note' }, rows.length
        ? `${rows.length} festivals${s.reach === 'any' ? '' : ' within easy reach'}. Flight prices are Friday-to-Monday returns from Bergen and change often.`
        : 'No festivals with these choices. Try a longer window or “Anywhere”.'),
      ...[...months].map(([m, evs]) => h('section', { class: 'month' },
        h('h2', {}, MONTHS.format(d(m + '-15')), h('small', {}, `${evs.length} festival${evs.length > 1 ? 's' : ''}`)),
        h('div', { class: 'entries' }, evs.map(e => entry(e, home))))));
  }
  render();
}

function entry(e, home) {
  const start = e.projected ? e.depart : e.start_date, end = e.projected ? addDays(e.depart, 2) : (e.end_date || e.start_date);
  const more = h('div', { class: 'entry-more', hidden: true });
  const toggle = h('button', { class: 'link', 'aria-expanded': 'false', onclick: () => {
    const open = more.hidden;
    if (open && !more.childElementCount) more.append(eventDetail(e.id, home, { compact: true }));
    more.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? 'Less' : 'Full line-up';
  } }, 'Full line-up');
  const extras = [e.taxi_dancers && 'taxi dancers', e.all_in_one && 'all-in-one hotel', e.lineup >= 15 && `${e.lineup} artists`].filter(Boolean);
  return h('article', { class: 'entry' + (e.projected ? ' projected' : '') },
    h('div', { class: 'datebox', 'aria-hidden': 'true' }, h('span', { class: 'dd' }, DAY.format(d(start))),
      h('span', { class: 'mm' }, SHORT.format(d(start)).split(' ')[1])),
    h('div', { class: 'entry-body' },
      h('p', { class: 'where' }, place(e), ' · ', e.projected ? `likely ${range(start, end)}` : range(start, end)),
      h('h3', {}, e.title),
      styleLine(e) ? h('p', { class: 'styles' }, styleLine(e), extras.length ? ' — ' + extras.join(', ') : '') : extras.length ? h('p', { class: 'styles' }, extras.join(', ')) : null,
      e.headliners.length ? withArtists(e) : null,
      e.projected ? h('p', { class: 'with muted' }, 'Last year’s edition was this weekend; this year’s dates aren’t listed yet.') : null,
      h('div', { class: 'entry-foot' }, flightLine(e, home), toggle, h('a', { href: `#map/event/${e.id}`, class: 'small' }, 'On the map')),
      more));
}
