// Variant: season planner. The coming months as a calendar of weekends, each festival on one line.
import { h } from '../js/ui.js';
import { names, festivals, filtersBar, visible, flightLine, place, footerLinks, MONTHS, SHORT, WEEKDAY, d, stateFromHash, writeHash } from './common.js';

const DEFAULTS = { months: 6, style: 'kiz', reach: 'any' };

export function seasonView(root, qs, { home }) {
  const all = festivals(home);
  const s = stateFromHash(qs, DEFAULTS);
  const filters = h('div');
  const body = h('div', { class: 'season' });
  root.replaceChildren(h('section', { class: 'ed' },
    h('header', { class: 'ed-hero' },
      h('p', { class: 'kicker' }, 'Kizomba Radar · from Bergen'),
      h('h1', {}, 'Plan your dance season'),
      h('p', { class: 'lede' }, 'Every weekend with a Kizomba or Urban Kiz festival in the months ahead. Pick the weekends you’re free and see where you could be dancing.')),
    filters, body, footerLinks()));
  function render() {
    writeHash(s, DEFAULTS);
    filters.replaceChildren(filtersBar(s, render));
    const rows = visible(all, s);
    // month → weekend (Friday) → festivals
    const months = new Map();
    for (const e of rows) {
      const m = e.depart.slice(0, 7);
      if (!months.has(m)) months.set(m, new Map());
      const w = months.get(m);
      if (!w.has(e.depart)) w.set(e.depart, []);
      w.get(e.depart).push(e);
    }
    body.replaceChildren(
      h('p', { class: 'ed-note' }, `${rows.length} festivals on ${[...months.values()].reduce((n, w) => n + w.size, 0)} weekends. ✈ = Friday-to-Monday return from Bergen.`),
      ...[...months].map(([m, weeks]) => h('section', { class: 'month' },
        h('h2', {}, MONTHS.format(d(m + '-15')), h('small', {}, `${weeks.size} weekend${weeks.size > 1 ? 's' : ''}`)),
        h('ol', { class: 'weekends' }, [...weeks].map(([fri, evs]) => h('li', { class: 'weekend' },
          h('div', { class: 'wk' }, h('span', { class: 'wd' }, `${WEEKDAY.format(d(fri))} ${SHORT.format(d(fri))}`),
            h('span', { class: 'n muted small' }, evs.length > 1 ? `${evs.length} festivals` : '')),
          h('ul', { class: 'fests' }, evs.map(e => h('li', {},
            h('a', { href: `#map/event/${e.id}`, class: 'name' }, e.title),
            h('span', { class: 'meta' }, place(e), e.projected ? ' · likely, dates not out yet' : '',
              e.taxi_dancers ? ' · taxi dancers' : '', e.headliners[0] ? ` · with ${names(e).slice(0, 2).join(', ')}` : ''),
            flightLine(e, home))))))))));
  }
  render();
}
