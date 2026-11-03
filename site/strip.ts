// The days a community is away, drawn two ways: the overview, a strip as a contribution graph draws it (a row a
// weekday from Monday, a column a week from today's), and a row of days under each festival of the list, from the
// first to arrive to the last to leave. Each day is shaded by how many people are away on it, in three steps the
// legend says. Each strip or row is one stop for the keyboard, whose arrows move a day (or a week); the day in focus,
// under the pointer or tapped opens one popover saying who is away, which Escape or a tap elsewhere closes.
import { type Away, type Day, daysOf, shade, shadeRanges, weekday, weeksFrom } from './calendar.ts';
import { addDays } from './days.ts';
import { button, h, type Kid, nodes } from './dom.ts';
import { dayYear, monthShort } from './ui.ts';
import { plural } from './wording.ts';

const WEEKS = 53; // a year of weeks at most
const SHADES = [null, 'strip-1', 'strip-2', 'strip-3'] as const;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

// The popover of a day, one for the page: the strips and rows attached to it open it on their days.
export interface Popover {
  attach: (container: HTMLElement) => void;
}
export function popover(detail: (day: string) => Kid[], signal: AbortSignal): Popover {
  const pop = h('div', { class: 'strip-pop', role: 'tooltip', id: 'strip-pop', hidden: true });
  const containers: HTMLElement[] = [];
  let described: HTMLElement | undefined;
  const close = () => {
    pop.hidden = true;
    described?.removeAttribute('aria-describedby');
  };
  const open = (cell: HTMLElement, container: HTMLElement) => {
    container.append(pop);
    pop.replaceChildren(...nodes(detail(cell.dataset['day'] ?? '')));
    pop.hidden = false;
    described?.removeAttribute('aria-describedby');
    cell.setAttribute('aria-describedby', pop.id);
    described = cell;
    const w = container.getBoundingClientRect(),
      c = cell.getBoundingClientRect();
    const left = Math.max(0, Math.min(c.left - w.left - 8, w.width - pop.offsetWidth));
    pop.style.setProperty('left', `${left}px`);
    pop.style.setProperty('top', `${c.bottom - w.top + 6}px`);
  };
  const cellOf = (t: EventTarget | null) => (t instanceof HTMLElement ? t.closest<HTMLElement>('[data-day]') : null);
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target;
      if (!(t instanceof Node && containers.some((c) => c.contains(t)))) close();
    },
    { signal },
  );
  return {
    attach: (container) => {
      containers.push(container);
      const show = (e: Event) => {
        const cell = cellOf(e.target);
        if (cell) open(cell, container);
      };
      container.addEventListener('focusin', show);
      container.addEventListener('mouseover', show);
      container.addEventListener('click', (e) => cellOf(e.target)?.focus());
      container.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
      container.addEventListener('mouseleave', () => {
        if (!container.contains(document.activeElement)) close();
      });
    },
  };
}

// One stop for the keyboard among these cells, by day: the arrows step this many days, and the focus moves there
// when a cell is that day.
function rove(
  container: HTMLElement,
  cells: ReadonlyMap<string, HTMLElement>,
  steps: Readonly<Record<string, number>>,
) {
  container.addEventListener('keydown', (e) => {
    const cell = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-day]') : null;
    const step = steps[e.key];
    const to = cell === null || step === undefined ? undefined : cells.get(addDays(cell.dataset['day'] ?? '', step));
    if (cell === null || to === undefined) return;
    e.preventDefault();
    cell.tabIndex = -1;
    to.tabIndex = 0;
    to.focus();
  });
}

// what the strip and the rows share: who is away on each day, the most on any day, and what a day says
export interface Days<A extends Away> {
  today: string;
  days: ReadonlyMap<string, Day<A>>;
  most: number; // the most away on any day, which the three shades divide
  label: (day: string, on: Day<A> | undefined) => string; // what a screen reader says of a day
  pop: Popover;
}

// The overview: a row a weekday, labelled M to S, a column a week from today's (53 at most, then a line counting the
// trips after), a month's name over its first week (with the year in January and over the first), each day's count
// written in it where it is wide enough, and a legend of the shades.
export function strip<A extends Away>(s: Days<A> & { starts: readonly string[]; toList: () => void }): HTMLElement {
  const last = [s.today, ...s.days.keys()].toSorted((a, b) => a.localeCompare(b)).at(-1) ?? s.today;
  const weeks = weeksFrom(s.today, last, WEEKS);
  const shown = weeks.at(-1)?.[6] ?? s.today;
  const cells = new Map<string, HTMLElement>();
  const day = (d: string): HTMLTableCellElement => {
    const n = s.days.get(d)?.people ?? 0;
    const cell = h(
      'td',
      {
        role: 'gridcell',
        tabindex: d === s.today ? 0 : -1,
        class: [SHADES[shade(n, s.most)], d === s.today && 'strip-today', d < s.today && 'strip-past'],
        'aria-current': d === s.today ? 'date' : null,
        'aria-label': s.label(d, s.days.get(d)),
        dataset: { day: d },
      },
      n > 0 ? h('span', { class: 'strip-n', 'aria-hidden': 'true' }, n) : null,
    );
    cells.set(d, cell);
    return cell;
  };
  // the month a week begins, if one does (and today's over the first), with its year in January and over the first
  const month = (week: readonly string[], i: number): string => {
    const first = week.find((d) => d.endsWith('-01')) ?? (i === 0 ? s.today : undefined);
    if (first === undefined) return '';
    return first.slice(5, 7) === '01' || i === 0 ? `${monthShort(first)} ${first.slice(0, 4)}` : monthShort(first);
  };
  const table = h(
    'table',
    {
      class: 'strip',
      role: 'grid',
      'aria-label': 'Days the community is away, a column a week',
      // the page's width shared by the weeks, but a day no larger than a small square when they are few
      style: { 'max-width': `calc(1.5rem + ${weeks.length} * 1.3rem)` },
    },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('td', {}),
        weeks.map((w, i) => h('th', { scope: 'col' }, month(w, i))),
      ),
    ),
    h(
      'tbody',
      {},
      WEEKDAYS.map((name, r) =>
        h(
          'tr',
          {},
          h('th', { scope: 'row', abbr: name, title: name }, name[0]),
          weeks.map((w) => day(w[r] ?? '')),
        ),
      ),
    ),
  );
  rove(table, cells, { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 });
  const after = s.starts.filter((d) => d > shown).length;
  const wrap = h(
    'div',
    { class: 'strip-wrap' },
    h('div', { class: 'strip-clip' }, table),
    legend(s.most),
    after > 0
      ? h(
          'p',
          { class: 'muted' },
          button({ class: 'link', onclick: s.toList }, `and ${plural(after, 'more trip')} after ${dayYear(shown)}`),
        )
      : null,
  );
  s.pop.attach(wrap);
  return wrap;
}

// "People away: 1 · 2–3 · 4–5 · today": each shade with the counts it stands for, as the steps divide the most
const legend = (most: number): HTMLElement =>
  h(
    'p',
    { class: 'strip-legend' },
    'People away: ',
    shadeRanges(most).map((r) => [
      h(
        'span',
        { class: 'strip-key' },
        h('span', { class: ['strip-swatch', SHADES[r.shade]], 'aria-hidden': 'true' }),
        r.from === r.to ? String(r.from) : `${r.from}–${r.to}`,
      ),
      ' ',
    ]),
    h(
      'span',
      { class: 'strip-key' },
      h('span', { class: ['strip-swatch', 'strip-today'], 'aria-hidden': 'true' }),
      'today',
    ),
  );

// A festival's row: its days from the first of the community to arrive to the last to leave, each labelled with its
// weekday's initial and its number, the festival's own days marked apart from the days only travelled, shaded as the
// overview, with an arrow down on a day someone flies in and up on one someone flies out.
export function dayRow<A extends Away>(
  r: Days<A> & {
    from: string;
    to: string;
    festival: { start_date: string; end_date: string };
    arriving: ReadonlySet<string>;
    leaving: ReadonlySet<string>;
  },
): HTMLElement {
  const cells = new Map<string, HTMLElement>();
  const days = daysOf(r.from, r.to);
  const row = h(
    'div',
    {
      role: 'row',
      class: 'dayrow-days',
      // the days share the column, each no wider than a small tile
      style: {
        'grid-template-columns': `repeat(${days.length}, minmax(0, 1fr))`,
        'max-width': `${days.length * 2.6}rem`,
      },
    },
    days.map((d, i) => {
      const on = r.days.get(d),
        festival = d >= r.festival.start_date && d <= r.festival.end_date;
      const cell = h(
        'div',
        {
          role: 'gridcell',
          tabindex: i === 0 ? 0 : -1,
          class: ['dayrow-day', SHADES[shade(on?.people ?? 0, r.most)], festival ? 'dayrow-festival' : 'dayrow-travel'],
          'aria-label': `${r.label(d, on)}; ${festival ? 'a festival day' : 'a travel day'}${r.arriving.has(d) ? ', flying in' : ''}${r.leaving.has(d) ? ', flying out' : ''}`,
          dataset: { day: d },
        },
        h('span', { class: 'dayrow-w', 'aria-hidden': 'true' }, WEEKDAYS[weekday(d)]?.[0]),
        h('span', { class: 'dayrow-n', 'aria-hidden': 'true' }, Number(d.slice(8))),
        r.arriving.has(d) || r.leaving.has(d)
          ? h(
              'span',
              { class: 'dayrow-moves', 'aria-hidden': 'true' },
              r.arriving.has(d) ? '↓' : '',
              r.leaving.has(d) ? '↑' : '',
            )
          : null,
      );
      cells.set(d, cell);
      return cell;
    }),
  );
  const grid = h('div', { role: 'grid', class: 'dayrow', 'aria-label': 'The days of this trip' }, row);
  rove(grid, cells, { ArrowLeft: -1, ArrowRight: 1 });
  r.pop.attach(grid);
  return grid;
}
