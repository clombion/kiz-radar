// The months a community travels in, a small grid each: a row a week from Monday, each festival a highlighter stroke
// behind its days, a dot under a day only travelled, today ringed, and at a row's end how many go to the festivals
// that begin that week. Four months show at a time, a period from today's month (calendar.ts), between buttons to
// the periods before and after it, as far as the last trip. Only a day someone travels on does anything: each month
// is one stop for the keyboard, whose arrows move among those days; the day in focus, under the pointer or tapped
// opens one popover saying who travels, which Escape, a tap elsewhere or on the day again closes. It never covers the
// day's month: on a computer it sits beside it, on a phone it is a panel under its row of months, which moves what
// follows down. Drawn by Solid: the period shown, the day the popover is open on and each month's stop are signals,
// the popover's place measured in an effect; the community's page draws it.

import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createEffect, createMemo, createSignal, flush, For, Show } from 'solid-js';
import { styled, uniqueId } from './bits.ts';
import { type Away, type Day, monthsIn, periodSaid, WEEKDAYS, weeksOf } from './calendar.ts';
import { addDays } from './days.ts';
import { Drawing } from './icons.ts';
import { swipe } from './ink.ts';
import { MEDIA } from './media.ts';
import { overPage } from './over.ts';
import { Reported } from './placed.tsx';
import { monthShort, monthYear, weekDay } from './ui.ts';
import { plural } from './wording.ts';

// a festival the community goes to, as the months draw it: its days, and how many of the community go
interface Marked {
  readonly id: number;
  readonly title: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly people: number;
  readonly ended: boolean; // a trip over: its stroke grey as the days gone by, and no longer counted
}
// what the months say of the days: who travels on each, a day's words, the festivals, the days only travelled, and
// what a day's popover says
export interface Days<A extends Away> {
  readonly today: string;
  readonly days: ReadonlyMap<string, Day<A>>;
  readonly label: (day: string, on: Day<A>) => string; // what a screen reader says of a day someone travels on
  readonly festivals: readonly Marked[];
  readonly travel: ReadonlySet<string>; // the days someone travels on outside their festival's: before it, or after
  readonly detail: (day: string) => JSX.Element;
}

// a festival's swipe over the lower half of its days' numbers; a second festival's lower and thinner, under it
const OVER = { height: [0.48, 0.66], drop: [0.18, 0.3], tilt: 1.4 } as const; // a week long at most
const UNDER = { height: [0.26, 0.36], drop: [0.42, 0.52], tilt: 1.4 } as const;

// The strokes of a week: each festival on any of its days, from its first day in the week to its last, across the
// columns of those days; open at an end where the festival goes on in the week before or after. A second festival on
// the same days has its stroke under the first.
function strokes(week: readonly (string | null)[], festivals: readonly Marked[]): JSX.Element {
  const days = week.flatMap((d) => (d === null ? [] : [d]));
  const [first = '', last = first] = [days[0], days.at(-1)];
  return festivals
    .filter((f) => f.start_date <= last && f.end_date >= first)
    .map((f, n) => {
      const from = week.findIndex((d) => d !== null && d >= f.start_date),
        to = week.findLastIndex((d) => d !== null && d <= f.end_date);
      const before = f.start_date < (week[from] ?? ''),
        after = f.end_date > (week[to] ?? '');
      return (
        <span
          class={[
            'days-stroke',
            before && 'days-stroke-from',
            after && 'days-stroke-on',
            f.ended && 'days-stroke-past',
          ]}
          ref={styled({
            'grid-column': `${from + 1} / ${to + 2}`,
            ...swipe(`${f.id} ${first}`, n % 2 === 1 ? UNDER : OVER, { before, after }),
          })}
          title={f.title}
          aria-hidden="true"
        />
      );
    });
}

// how many go to the festivals that begin in a week, said once, where each begins
function count<A extends Away>(s: Days<A>, week: readonly (string | null)[]): JSX.Element {
  const days = week.flatMap((d) => (d === null ? [] : [d]));
  const [first = '', last = first] = [days[0], days.at(-1)];
  const begin = s.festivals.filter((f) => !f.ended && f.start_date >= first && f.start_date <= last);
  const n = begin.reduce((sum, f) => sum + f.people, 0);
  const said = begin.map((f) => `${f.title}: ${plural(f.people, 'person', 'people')}`).join('; ');
  return (
    <span
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a cell of the calendar's grid (WAI-ARIA's grid pattern), its markup kept as h() drew it during the port (revisit after 4.10)
      role="gridcell"
      class="days-count"
      ref={styled({ 'grid-column': '8' })}
      title={begin.length > 1 ? said : undefined}
      aria-label={begin.length === 0 ? 'no festival begins this week' : said}
    >
      {n === 0 ? '' : n}
    </span>
  );
}

// what a month's days read of the calendar: the popover's id, whether a day is the one the popover is open on, and the
// days someone travels on as they are drawn, by their dates
interface Shown {
  readonly id: string;
  readonly described: (day: string) => boolean;
  readonly cells: Map<string, HTMLElement>;
}

// A month: its name and year, the weekdays M to S, and its weeks, each a row of days over the festivals' strokes, a
// dot under a day only travelled, today ringed, and at the row's end how many go to the festivals beginning that week.
// It is one stop for the keyboard among its days with someone travelling, in their order (a signal: its first from
// today, or else its first): left and right move to the one before or after, up and down to the first a week or more
// before or after. The days no one travels on are passed over.
function month<A extends Away>(s: Days<A>, m: string, shown: Shown): JSX.Element {
  const on = (d: string) => s.days.get(d);
  const travelled = weeksOf(m)
    .flat()
    .flatMap((d) => (d !== null && on(d) !== undefined ? [d] : []));
  const [stop, setStop] = createSignal(travelled.find((d) => d >= s.today) ?? travelled[0]);
  const day = (d: string | null, col: number): JSX.Element => {
    if (d === null) return null;
    const away = on(d);
    return (
      <span
        ref={(el) => {
          styled({ 'grid-column': String(col + 1) })(el);
          if (away !== undefined) shown.cells.set(d, el);
        }}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a day of the calendar's grid (WAI-ARIA's grid pattern), its markup kept as h() drew it during the port (revisit after 4.10)
        role="gridcell"
        class={['days-day', away !== undefined && 'days-on', d < s.today && 'days-past']}
        aria-current={d === s.today ? 'date' : undefined}
        aria-label={away === undefined ? weekDay(d) : s.label(d, away)}
        aria-describedby={shown.described(d) ? shown.id : undefined}
        tabindex={away === undefined ? undefined : stop() === d ? 0 : -1}
        // every day its date; only one someone travels on opens anything
        data-date={d}
        data-day={away === undefined ? undefined : d}
      >
        {d === s.today ? (
          <span
            class="days-ring"
            aria-hidden="true"
            ref={(el) => {
              Drawing.RING.into(el);
            }}
          />
        ) : null}
        <span>{Number(d.slice(8))}</span>
        {s.travel.has(d) ? <span class="days-dot" aria-hidden="true" /> : null}
      </span>
    );
  };
  // the arrows move the month's stop among its days someone travels on
  const roved = (e: KeyboardEvent) => {
    const at =
      e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-day]')?.dataset['day'] : undefined;
    const i = at === undefined ? -1 : travelled.indexOf(at);
    if (at === undefined || i < 0) return;
    const to =
      e.key === 'ArrowRight'
        ? travelled[i + 1]
        : e.key === 'ArrowLeft'
          ? travelled[i - 1]
          : e.key === 'ArrowDown'
            ? travelled.find((x) => x >= addDays(at, 7))
            : e.key === 'ArrowUp'
              ? travelled.findLast((x) => x <= addDays(at, -7))
              : undefined;
    if (to === undefined) return;
    e.preventDefault();
    flush(() => setStop(to));
    shown.cells.get(to)?.focus();
  };
  return (
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the grid itself takes no focus: its one stop is a day (roving tabindex, WAI-ARIA's grid pattern), whose arrows it hears
    <div class="days-month" role="grid" aria-label={monthYear(`${m}-01`)} onKeyDown={roved}>
      <p class="days-caption" aria-hidden="true">
        {monthShort(`${m}-01`)} <small>{m.slice(0, 4)}</small>
      </p>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the grid's row of weekdays (WAI-ARIA's grid pattern), its markup kept as h() drew it during the port (revisit after 4.10) */}
      <div class={['days-week', 'days-head']} role="row">
        <For each={WEEKDAYS}>
          {(name) => (
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a weekday heading the grid's column (WAI-ARIA's grid pattern), its markup kept as h() drew it during the port (revisit after 4.10)
            <span role="columnheader" title={name} aria-label={name}>
              {name[0]}
            </span>
          )}
        </For>
      </div>
      <For each={weeksOf(m)}>
        {(week) => {
          const days = week.map(day);
          return (
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a week of the calendar's grid (WAI-ARIA's grid pattern), its markup kept as h() drew it during the port (revisit after 4.10)
            <div class="days-week" role="row">
              {strokes(week, s.festivals)}
              {days}
              {count(s, week)}
            </div>
          );
        }}
      </For>
    </div>
  );
}

// Where the popover goes: on a computer beside the day's month, at the day's height, to its right, or to its left where
// the right has no room, or else under it, in the calendar; on a phone, a panel after the last month of the day's row,
// the full width of the page.
function placed(pop: HTMLElement, cell: HTMLElement, wrap: HTMLElement, wide: boolean): void {
  const grid = cell.closest<HTMLElement>('.days-month') ?? cell;
  if (!wide) {
    pop.style.removeProperty('left');
    pop.style.removeProperty('top');
    const row = [...(grid.parentElement?.children ?? [])].filter(
      (el) => el !== pop && el instanceof HTMLElement && el.offsetTop === grid.offsetTop,
    );
    (row.at(-1) ?? grid).after(pop);
    return;
  }
  wrap.append(pop);
  const w = wrap.getBoundingClientRect(),
    g = grid.getBoundingClientRect(),
    c = cell.getBoundingClientRect();
  const right = g.right - w.left + 8,
    left = g.left - w.left - 8 - pop.offsetWidth;
  const x = right + pop.offsetWidth <= w.width ? right : left >= 0 ? left : null;
  pop.style.setProperty('left', `${x ?? Math.max(0, g.left - w.left)}px`);
  pop.style.setProperty('top', `${x === null ? g.bottom - w.top + 6 : c.top - w.top}px`);
}

// The calendar: a period's four months, a grid each, under its name between the buttons to the periods before and
// after it in steps (each off at its end), and the key; a button draws the period it goes to in place, and tells moved
// of it. A day's popover, the one card over the page (over.ts) while it shows, is drawn the first time a day opens it,
// at the end of the calendar, and placed from there: its words drawn once a day, however often the pointer moves over
// the day it is open on, in a boundary that reports what throws and draws nothing.
export function months<A extends Away>(
  s: Days<A> & { readonly from: string; readonly steps: readonly string[]; readonly moved: (from: string) => void },
): JSX.Element {
  const [at, setAt] = createSignal(s.from);
  const [day, setDay] = createSignal<string | null>(null);
  const [panel, setPanel] = createSignal(false); // the popover as a phone's panel
  const [resized, setResized] = createSignal(0);
  const opens = createMemo((was) => was === true || day() !== null);
  const shown: Shown = { id: uniqueId('day-pop'), described: (d) => card.shown() && day() === d, cells: new Map() };
  let wrap: HTMLDivElement | undefined,
    pop: HTMLDivElement | undefined,
    back: HTMLButtonElement | undefined,
    on: HTMLButtonElement | undefined;
  const card = overPage({
    within: () => (wrap === undefined ? [] : [wrap, ...(pop === undefined ? [] : [pop])]),
    place: () => {
      setPanel(!matchMedia(MEDIA.WIDE).matches);
      setResized((n) => n + 1);
    },
  });
  // open on a day: its detail drawn once, however often the pointer moves over the day it is already open on; a day
  // whose words throw leaves the popover closed, as it stayed hidden before, its boundary saying what went wrong
  const open = (d: string) => {
    if (card.shown() && day() === d) return;
    card.opened();
    flush(() => {
      setPanel(!matchMedia(MEDIA.WIDE).matches);
      setDay(d);
      setResized((n) => n + 1);
    });
    if ('thrown' in said()) card.close();
  };
  // placed beside its day, or under its row, once it shows, and again once the window's size changes
  createEffect(
    () => {
      resized();
      return [day(), !panel()] as const;
    },
    ([d, wide]) => {
      const cell = d === null ? undefined : shown.cells.get(d);
      if (pop !== undefined && wrap !== undefined && cell !== undefined) placed(pop, cell, wrap, wide);
    },
  );
  const dayOf = (t: EventTarget | null) =>
    t instanceof HTMLElement ? t.closest<HTMLElement>('[data-day]')?.dataset['day'] : undefined;
  const show = (e: Event) => {
    const d = dayOf(e.target);
    if (d !== undefined) open(d);
  };
  // a tap on the day whose popover is open closes it; a tap on another day opens that one
  let again: string | undefined;
  const step = (by: -1 | 1) => {
    const to = s.steps[s.steps.indexOf(at()) + by];
    if (to === undefined) return;
    card.close();
    shown.cells.clear();
    flush(() => setAt(to));
    s.moved(to);
    // a step its own press turned off leaves the focus to the other
    const [self, other] = by < 0 ? [back, on] : [on, back];
    if (self?.disabled === true) other?.focus();
  };
  const i = () => s.steps.indexOf(at());
  // a step to the period before or after, off at its end
  const stepButton = (by: -1 | 1, label: string, icon: Drawing) => (
    <button
      ref={(el) => {
        if (by < 0) back = el;
        else on = el;
        icon.into(el);
      }}
      type="button"
      class="days-step"
      aria-label={label}
      disabled={by < 0 ? i() <= 0 : i() >= s.steps.length - 1}
      onClick={() => step(by)}
    />
  );
  // what the day the popover is open on says (kept, hidden, once it closes), or what its words threw, which the
  // popover's boundary is handed again (words) to say
  const said = createMemo((): { readonly words: JSX.Element } | { readonly thrown: unknown } => {
    const d = day();
    try {
      return { words: d === null ? null : s.detail(d) };
    } catch (e) {
      return { thrown: e };
    }
  });
  const words = (): JSX.Element => {
    const w = said();
    if ('thrown' in w) throw w.thrown;
    return w.words;
  };
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the calendar hears its days' events as they bubble, no control of its own: a day's keys are its focus, which opens it, and the arrows (each month's onKeyDown); Escape, which closes it, is over.ts's, heard on the document
    <div
      ref={wrap}
      class="days-wrap"
      onFocusIn={show}
      // oxlint-disable-next-line jsx-a11y/mouse-events-have-key-events -- the pointer over a day opens it, as the focus on it does (onFocusIn above, which bubbles where focus does not)
      onMouseOver={show}
      onPointerDown={(e) => {
        const d = dayOf(e.target);
        again = d !== undefined && card.shown() && day() === d ? d : undefined;
      }}
      onClick={(e) => {
        const d = dayOf(e.target);
        if (d !== undefined && d === again) card.close();
        else if (d !== undefined) shown.cells.get(d)?.focus();
      }}
      onMouseLeave={() => {
        if (!(wrap?.contains(document.activeElement) ?? false)) card.close();
      }}
    >
      <div class="days-nav">
        {stepButton(-1, 'Previous four months', Drawing.PREVIOUS)}
        <h2 class="days-said" aria-live="polite">
          {periodSaid(at(), (m) => monthShort(`${m}-01`))}
        </h2>
        {stepButton(1, 'Next four months', Drawing.NEXT)}
      </div>
      <div class="days-months">
        <For each={monthsIn(at())}>{(m) => month(s, m, shown)}</For>
      </div>
      {key()}
      <Show when={opens()}>
        <div ref={pop} class={['day-pop', panel() && 'day-panel']} role="tooltip" id={shown.id} hidden={!card.shown()}>
          <Reported where="a day's popover">{words()}</Reported>
        </div>
      </Show>
    </div>
  );
}

// what the marks mean: "festival · travel day · today · how many go, at the week it begins"
const key = (): JSX.Element => (
  <p class="days-legend">
    <span class="days-key">
      <span class={['days-stroke', 'days-sample']} aria-hidden="true" />
      festival
    </span>{' '}
    <span class="days-key">
      <span class={['days-dot', 'days-sample']} aria-hidden="true" />
      travel day
    </span>{' '}
    <span class="days-key">
      <span
        class={['days-ring', 'days-sample']}
        aria-hidden="true"
        ref={(el) => {
          Drawing.RING.into(el);
        }}
      />
      today
    </span>{' '}
    <span class="days-key">· at a row’s end, how many go to the festivals that begin that week</span>
  </p>
);
