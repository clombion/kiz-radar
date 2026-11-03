// A strip of days, as a contribution graph draws them: a row for each weekday from Monday, a column for each week from
// today's, each day shaded by how many people are away on it. It is one stop for the keyboard: the arrows move a day
// (up, down) or a week (left, right), and the day in focus, under the pointer or tapped says who is away, in a popover
// Escape or a tap elsewhere closes.
import { type Away, type Day, shade, weeksFrom } from './calendar.ts';
import { addDays } from './days.ts';
import { button, h, type Kid, nodes } from './dom.ts';
import { dayYear, monthShort } from './ui.ts';
import { plural } from './wording.ts';

const WEEKS = 53; // a year of weeks at most
const SHADES = [null, 'strip-1', 'strip-2', 'strip-3'] as const;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
// the arrows' steps, in days: a row is a weekday, a column a week
const STEPS: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };

export interface Strip<A extends Away> {
  today: string;
  days: ReadonlyMap<string, Day<A>>;
  label: (day: string, on: Day<A> | undefined) => string; // what a screen reader says of a day
  detail: (day: string, on: Day<A> | undefined) => Kid[]; // what its popover says
  starts: readonly string[]; // the first days of the festivals, to count those the strip has no room for
  toList: () => void; // shows where the festivals are listed
  signal: AbortSignal;
}

export function strip<A extends Away>(s: Strip<A>): HTMLElement {
  const last = [s.today, ...s.days.keys()].toSorted((a, b) => a.localeCompare(b)).at(-1) ?? s.today;
  const weeks = weeksFrom(s.today, last, WEEKS);
  const shown = weeks.at(-1)?.[6] ?? s.today;
  const most = Math.max(0, ...[...s.days.values()].map((d) => d.people));
  const cells = new Map<string, HTMLTableCellElement>();
  const pop = h('div', { class: 'strip-pop', role: 'tooltip', id: 'strip-pop', hidden: true });
  let described: HTMLElement | undefined;
  const close = () => {
    pop.hidden = true;
    described?.removeAttribute('aria-describedby');
  };
  const open = (cell: HTMLElement) => {
    const day = cell.dataset['day'] ?? '';
    pop.replaceChildren(...nodes(s.detail(day, s.days.get(day))));
    pop.hidden = false;
    described?.removeAttribute('aria-describedby');
    cell.setAttribute('aria-describedby', pop.id);
    described = cell;
    const w = wrap.getBoundingClientRect(),
      c = cell.getBoundingClientRect();
    const left = Math.max(0, Math.min(c.left - w.left - 8, w.width - pop.offsetWidth));
    pop.style.setProperty('left', `${left}px`);
    pop.style.setProperty('top', `${c.bottom - w.top + 6}px`);
  };
  const cellOf = (t: EventTarget | null) => (t instanceof HTMLElement ? t.closest<HTMLElement>('td[data-day]') : null);
  const day = (d: string): HTMLTableCellElement => {
    const n = s.days.get(d)?.people ?? 0;
    const cell = h('td', {
      role: 'gridcell',
      tabindex: d === s.today ? 0 : -1,
      class: [SHADES[shade(n, most)], d === s.today && 'strip-today', d < s.today && 'strip-past'],
      'aria-current': d === s.today ? 'date' : null,
      'aria-label': s.label(d, s.days.get(d)),
      dataset: { day: d },
    });
    cells.set(d, cell);
    return cell;
  };
  // a month's name over the week its first day is in (and today's), with the year where a year begins
  const month = (week: readonly string[], i: number): string => {
    const first = i === 0 ? s.today : week.find((d) => d.endsWith('-01'));
    if (first === undefined) return '';
    return first.slice(5, 7) === '01' ? `${monthShort(first)} ${first.slice(0, 4)}` : monthShort(first);
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
          h('th', { scope: 'row', 'aria-label': name }, r % 2 === 0 ? name.slice(0, 3) : ''),
          weeks.map((w) => day(w[r] ?? '')),
        ),
      ),
    ),
  );
  table.addEventListener('focusin', (e) => {
    const cell = cellOf(e.target);
    if (cell) open(cell);
  });
  table.addEventListener('mouseover', (e) => {
    const cell = cellOf(e.target);
    if (cell) open(cell);
  });
  table.addEventListener('click', (e) => cellOf(e.target)?.focus());
  table.addEventListener('keydown', (e) => {
    const cell = cellOf(e.target);
    if (cell === null) return;
    if (e.key === 'Escape') {
      close();
      return;
    }
    const step = STEPS[e.key];
    const to = step === undefined ? undefined : cells.get(addDays(cell.dataset['day'] ?? '', step));
    if (to === undefined) return;
    e.preventDefault();
    cell.tabIndex = -1;
    to.tabIndex = 0;
    to.focus();
  });
  const after = s.starts.filter((d) => d > shown).length;
  const wrap = h(
    'div',
    { class: 'strip-wrap' },
    h('div', { class: 'strip-clip' }, table),
    after > 0
      ? h(
          'p',
          { class: 'muted' },
          button({ class: 'link', onclick: s.toList }, `and ${plural(after, 'more trip')} after ${dayYear(shown)}`),
        )
      : null,
    pop,
  );
  wrap.addEventListener('mouseleave', () => {
    if (!wrap.contains(document.activeElement)) close();
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!(e.target instanceof Node && wrap.contains(e.target))) close();
    },
    { signal: s.signal },
  );
  return wrap;
}
