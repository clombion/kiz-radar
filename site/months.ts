// The months a community travels in, a small grid each: a row a week from Monday, each festival a highlighter stroke
// behind its days, a dot under a day only travelled, today ringed, and at a row's end how many go to the festivals
// that begin that week. Only today's month and those with a trip show, the first four of them at first and the rest
// from a button; a line says which go without. Only a day someone
// travels on does anything: each month is one stop for the keyboard, whose arrows move among those days; the day in
// focus, under the pointer or tapped opens one popover saying who travels, which Escape, a tap elsewhere or on the day
// again closes. It never covers the day's month: on a computer
// it sits beside it, on a phone it is a panel under its row of months, which moves what follows down.
import { type Away, type Day, FOLD, folded, foldSaid, monthsBetween, monthsOf, WEEKDAYS, weeksOf } from './calendar.ts';
import { addDays } from './days.ts';
import { h, type Kid, nodes, shower, toggle } from './dom.ts';
import { Drawing } from './icons.ts';
import { swipe } from './ink.ts';
import { monthShort, monthYear, weekDay } from './ui.ts';
import { plural } from './wording.ts';

const WIDE = '(min-width: 700px)'; // a screen with room for the popover beside a month

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
    pop.replaceChildren(...nodes(detail(cell.dataset['day'] ?? '')));
    pop.hidden = false;
    described?.removeAttribute('aria-describedby');
    cell.setAttribute('aria-describedby', pop.id);
    described = cell;
    const grid = cell.closest<HTMLElement>('.days-month') ?? cell;
    const wide = matchMedia(WIDE).matches;
    toggle(pop, 'day-panel', !wide);
    if (!wide) {
      // a panel after the last month of the day's row, the full width of the page
      pop.style.removeProperty('left');
      pop.style.removeProperty('top');
      const row = [...(grid.parentElement?.children ?? [])].filter(
        (el) => el !== pop && el instanceof HTMLElement && el.offsetTop === grid.offsetTop,
      );
      (row.at(-1) ?? grid).after(pop);
      return;
    }
    container.append(pop);
    // beside the day's month, at the day's height: to its right, or to its left where the right has no room, or else
    // under it
    const w = container.getBoundingClientRect(),
      g = grid.getBoundingClientRect(),
      c = cell.getBoundingClientRect();
    const right = g.right - w.left + 8,
      left = g.left - w.left - 8 - pop.offsetWidth;
    const x = right + pop.offsetWidth <= w.width ? right : left >= 0 ? left : null;
    pop.style.setProperty('left', `${x ?? Math.max(0, g.left - w.left)}px`);
    pop.style.setProperty('top', `${x === null ? g.bottom - w.top + 6 : c.top - w.top}px`);
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
      // a tap on the day whose popover is open closes it; a tap on another day opens that one
      let again: HTMLElement | null = null;
      container.addEventListener('pointerdown', (e) => {
        const cell = cellOf(e.target);
        again = cell !== null && !pop.hidden && described === cell ? cell : null;
      });
      container.addEventListener('click', (e) => {
        const cell = cellOf(e.target);
        if (cell !== null && cell === again) close();
        else cell?.focus();
      });
      container.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
      container.addEventListener('mouseleave', () => {
        if (!container.contains(document.activeElement)) close();
      });
    },
  };
}

// One stop for the keyboard among a month's days with someone travelling, in their order: left and right move to the
// one before or after, up and down to the first a week or more before or after. The days no one travels on are
// passed over.
function rove(container: HTMLElement, cells: readonly HTMLElement[]) {
  const dayOf = (c: HTMLElement | undefined) => c?.dataset['day'] ?? '';
  container.addEventListener('keydown', (e) => {
    const cell = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-day]') : null;
    const i = cell === null ? -1 : cells.indexOf(cell);
    if (cell === null || i < 0) return;
    const d = dayOf(cell);
    const to =
      e.key === 'ArrowRight'
        ? cells[i + 1]
        : e.key === 'ArrowLeft'
          ? cells[i - 1]
          : e.key === 'ArrowDown'
            ? cells.find((c) => dayOf(c) >= addDays(d, 7))
            : e.key === 'ArrowUp'
              ? cells.findLast((c) => dayOf(c) <= addDays(d, -7))
              : undefined;
    if (to === undefined) return;
    e.preventDefault();
    cell.tabIndex = -1;
    to.tabIndex = 0;
    to.focus();
  });
}

// a festival the community goes to, as the months draw it: its days, and how many of the community go
interface Marked {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  people: number;
}
// what the months say of the days: who travels on each, a day's words, the festivals, the days only travelled
export interface Days<A extends Away> {
  today: string;
  days: ReadonlyMap<string, Day<A>>;
  label: (day: string, on: Day<A>) => string; // what a screen reader says of a day someone travels on
  festivals: readonly Marked[];
  travel: ReadonlySet<string>; // the days someone travels on outside their festival's: before it, or after
  pop: Popover;
}

// a festival's swipe over the lower half of its days' numbers; a second festival's lower and thinner, under it
const OVER = { height: [0.48, 0.66], drop: [0.18, 0.3], tilt: 1.4 } as const; // a week long at most
const UNDER = { height: [0.26, 0.36], drop: [0.42, 0.52], tilt: 1.4 } as const;

// The strokes of a week: each festival on any of its days, from its first day in the week to its last, across the
// columns of those days; open at an end where the festival goes on in the week before or after. A second festival on
// the same days has its stroke under the first.
function strokes(week: readonly (string | null)[], festivals: readonly Marked[]): HTMLElement[] {
  const days = week.flatMap((d) => (d === null ? [] : [d]));
  const [first = '', last = first] = [days[0], days.at(-1)];
  return festivals
    .filter((f) => f.start_date <= last && f.end_date >= first)
    .map((f, n) => {
      const from = week.findIndex((d) => d !== null && d >= f.start_date),
        to = week.findLastIndex((d) => d !== null && d <= f.end_date);
      const before = f.start_date < (week[from] ?? ''),
        after = f.end_date > (week[to] ?? '');
      return h('span', {
        class: ['days-stroke', before && 'days-stroke-from', after && 'days-stroke-on'],
        style: {
          'grid-column': `${from + 1} / ${to + 2}`,
          ...swipe(`${f.id} ${first}`, n % 2 === 1 ? UNDER : OVER, { before, after }),
        },
        title: f.title,
        'aria-hidden': 'true',
      });
    });
}

// A month: its name and year, the weekdays M to S, and its weeks, each a row of days over the festivals' strokes, a
// dot under a day only travelled, today ringed, and at the row's end how many go to the festivals beginning that week.
function month<A extends Away>(s: Days<A>, m: string): HTMLElement {
  const cells: HTMLElement[] = [];
  const day = (d: string | null, col: number): HTMLElement | null => {
    if (d === null) return null;
    const on = s.days.get(d);
    const cell = h(
      'span',
      {
        role: 'gridcell',
        class: ['days-day', on !== undefined && 'days-on', d < s.today && 'days-past'],
        style: { 'grid-column': String(col + 1) },
        'aria-current': d === s.today ? 'date' : null,
        'aria-label': on === undefined ? weekDay(d) : s.label(d, on),
        tabindex: on === undefined ? null : -1,
        // every day its date; only one someone travels on opens anything
        dataset: on === undefined ? { date: d } : { date: d, day: d },
      },
      d === s.today ? Drawing.RING.into(h('span', { class: 'days-ring', 'aria-hidden': 'true' })) : null,
      h('span', {}, Number(d.slice(8))),
      s.travel.has(d) ? h('span', { class: 'days-dot', 'aria-hidden': 'true' }) : null,
    );
    if (on !== undefined) cells.push(cell);
    return cell;
  };
  // how many go to the festivals that begin in the week, said once, where each begins
  const count = (week: readonly (string | null)[]): HTMLElement => {
    const days = week.flatMap((d) => (d === null ? [] : [d]));
    const [first = '', last = first] = [days[0], days.at(-1)];
    const begin = s.festivals.filter((f) => f.start_date >= first && f.start_date <= last);
    const n = begin.reduce((sum, f) => sum + f.people, 0);
    const said = begin.map((f) => `${f.title}: ${plural(f.people, 'person', 'people')}`).join('; ');
    return h(
      'span',
      {
        role: 'gridcell',
        class: 'days-count',
        style: { 'grid-column': '8' },
        title: begin.length > 1 ? said : null,
        'aria-label': begin.length === 0 ? 'no festival begins this week' : said,
      },
      n === 0 ? '' : n,
    );
  };
  const grid = h(
    'div',
    { class: 'days-month', role: 'grid', 'aria-label': monthYear(`${m}-01`) },
    h('p', { class: 'days-caption', 'aria-hidden': 'true' }, monthShort(`${m}-01`), ' ', h('small', {}, m.slice(0, 4))),
    h(
      'div',
      { class: ['days-week', 'days-head'], role: 'row' },
      WEEKDAYS.map((name) => h('span', { role: 'columnheader', title: name, 'aria-label': name }, name[0])),
    ),
    weeksOf(m).map((week) =>
      h('div', { class: 'days-week', role: 'row' }, strokes(week, s.festivals), week.map(day), count(week)),
    ),
  );
  // the month's one stop: its first day someone travels on from today, or else its first
  const stop = cells.find((c) => (c.dataset['day'] ?? '') >= s.today) ?? cells[0];
  if (stop) stop.tabIndex = 0;
  rove(grid, cells);
  return grid;
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

// The months: today's and each with a trip, a grid each, a line for the months between that go without, the key.
export function months<A extends Away>(s: Days<A>): HTMLElement {
  const all = monthsOf(s.today, s.days.keys());
  // each month, after the line of the months before it that go without; past the first four, hidden with that line
  const parts = all.map((m, i) => {
    const gap = i === 0 ? [] : monthsBetween(all[i - 1] ?? m, m);
    return [gap.length > 0 ? nothing(gap) : null, month(s, m)].filter((p) => p !== null);
  });
  const { more } = folded(all);
  const rest =
    more.length === 0
      ? null
      : shower('days-more', parts.slice(FOLD).flat(), {
          more: `Show ${foldSaid(more, (m) => monthYear(`${m}-01`).split(' ')[0] ?? m)}`,
          fewer: 'Show fewer months',
        });
  const wrap = h('div', { class: 'days-wrap' }, h('div', { class: 'days-months' }, parts), rest, key());
  s.pop.attach(wrap);
  return wrap;
}

// what the marks mean: "festival · travel day · today · how many go, at the week it begins"
const key = (): HTMLElement =>
  h(
    'p',
    { class: 'days-legend' },
    h(
      'span',
      { class: 'days-key' },
      h('span', { class: ['days-stroke', 'days-sample'], 'aria-hidden': 'true' }),
      'festival',
    ),
    ' ',
    h(
      'span',
      { class: 'days-key' },
      h('span', { class: ['days-dot', 'days-sample'], 'aria-hidden': 'true' }),
      'travel day',
    ),
    ' ',
    h(
      'span',
      { class: 'days-key' },
      Drawing.RING.into(h('span', { class: ['days-ring', 'days-sample'], 'aria-hidden': 'true' })),
      'today',
    ),
    ' ',
    h('span', { class: 'days-key' }, '· at a row’s end, how many go to the festivals that begin that week'),
  );
