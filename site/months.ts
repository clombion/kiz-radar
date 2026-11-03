// The months a community is away in, a small grid each: a row a week from Monday, a day a square shaded by how many
// people are away on it, in three steps the legend says, and at each week's end the most away on any of its days.
// Only today's month and those with a trip show; a line says which go without. Each month is one stop for the
// keyboard, whose arrows move a day (or a week); the day in focus, under the pointer or tapped opens one popover saying
// who is away, which Escape or a tap elsewhere closes.
import { type Away, type Day, monthsBetween, monthsOf, shade, shadeRanges, WEEKDAYS, weeksOf } from './calendar.ts';
import { addDays } from './days.ts';
import { h, type Kid, nodes } from './dom.ts';
import { monthShort, monthYear } from './ui.ts';

const SHADES = [null, 'days-1', 'days-2', 'days-3'] as const;

// The popover of a day, one for the page: the grids attached to it open it on their days.
export interface Popover {
  attach: (container: HTMLElement) => void;
}
export function popover(detail: (day: string) => Kid[], signal: AbortSignal): Popover {
  const pop = h('div', { class: 'day-pop', role: 'tooltip', id: 'day-pop', hidden: true });
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

// what the grids say of the days: who is away on each, the most on any day, a day's words, the festivals' days
export interface Days<A extends Away> {
  today: string;
  days: ReadonlyMap<string, Day<A>>;
  most: number; // the most away on any day, which the three shades divide
  label: (day: string, on: Day<A> | undefined) => string; // what a screen reader says of a day
  festival: ReadonlySet<string>; // the days a festival is on, which carry an underline when someone is away
  pop: Popover;
}

// a month's grid: its name (and year), the weekdays M to S, its weeks, and each week's most away
function month<A extends Away>(s: Days<A>, m: string): HTMLElement {
  const cells = new Map<string, HTMLElement>();
  const start = m === s.today.slice(0, 7) ? s.today : `${m}-01`;
  const day = (d: string | null): HTMLElement => {
    if (d === null) return h('td', {});
    const n = s.days.get(d)?.people ?? 0;
    const cell = h(
      'td',
      {
        role: 'gridcell',
        tabindex: d === start ? 0 : -1,
        class: [
          SHADES[shade(n, s.most)],
          n > 0 && s.festival.has(d) && 'days-fest',
          d === s.today && 'days-today',
          d < s.today && 'days-past',
        ],
        'aria-current': d === s.today ? 'date' : null,
        'aria-label': s.label(d, s.days.get(d)),
        dataset: { day: d },
      },
      Number(d.slice(8)),
    );
    cells.set(d, cell);
    return cell;
  };
  const most = (week: readonly (string | null)[]): HTMLElement => {
    const n = Math.max(0, ...week.map((d) => (d === null ? 0 : (s.days.get(d)?.people ?? 0))));
    return h(
      'td',
      {
        class: ['days-most', n === 0 && 'days-none'],
        'aria-label': n === 0 ? 'no one away that week' : `at most ${n} away that week`,
      },
      n === 0 ? '·' : n,
    );
  };
  const table = h(
    'table',
    { class: 'days-month', role: 'grid' },
    h('caption', {}, monthShort(`${m}-01`), ' ', h('small', {}, m.slice(0, 4))),
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        WEEKDAYS.map((name) => h('th', { scope: 'col', abbr: name, title: name }, name[0])),
        h('td', {}),
      ),
    ),
    h(
      'tbody',
      {},
      weeksOf(m).map((week) => h('tr', {}, week.map(day), most(week))),
    ),
  );
  rove(table, cells, { ArrowUp: -7, ArrowDown: 7, ArrowLeft: -1, ArrowRight: 1 });
  return table;
}

// "Nothing planned in December", "Nothing planned Mar–May"
const nothing = (gap: readonly string[]): HTMLElement => {
  const [first = '', last = first] = [gap[0], gap.at(-1)];
  return h(
    'p',
    { class: 'days-gap' },
    gap.length === 1
      ? `Nothing planned in ${monthYear(`${first}-01`).split(' ')[0]}`
      : `Nothing planned ${monthShort(`${first}-01`)}–${monthShort(`${last}-01`)}`,
  );
};

// The months: today's and each with a trip, a grid each, a line for the months between that go without, the legend.
export function months<A extends Away>(s: Days<A>): HTMLElement {
  const shown = monthsOf(s.today, s.days.keys());
  const wrap = h(
    'div',
    { class: 'days-wrap' },
    h(
      'div',
      { class: 'days-months' },
      shown.flatMap((m, i) => {
        const gap = i === 0 ? [] : monthsBetween(shown[i - 1] ?? m, m);
        return [gap.length > 0 ? nothing(gap) : null, month(s, m)];
      }),
    ),
    legend(s.most),
  );
  s.pop.attach(wrap);
  return wrap;
}

// "People away: 1 2–3 4–5 today · the week's most at its end": each shade with the counts it stands for
const legend = (most: number): HTMLElement =>
  h(
    'p',
    { class: 'days-legend' },
    'People away: ',
    shadeRanges(most).map((r) => [
      h(
        'span',
        { class: 'days-key' },
        h('span', { class: ['days-swatch', SHADES[r.shade]], 'aria-hidden': 'true' }),
        r.from === r.to ? String(r.from) : `${r.from}–${r.to}`,
      ),
      ' ',
    ]),
    h(
      'span',
      { class: 'days-key' },
      h('span', { class: ['days-swatch', 'days-today'], 'aria-hidden': 'true' }),
      'today',
    ),
    ' ',
    h('span', { class: 'days-key' }, '· the week’s most at its end'),
  );
