// A trip's roster: its days across the top, from the first of the community to arrive to the last to leave, the
// festival's own days marked on them, and a line for each group that travels alike (roster.ts): its name, a
// highlighter's swipe from the hour they arrive to the hour they leave with its times at its ends (and its airports, on
// a computer), and where it stays: beside it on a computer; on a phone, inside the bar between its times, or under its
// name when the bar is too short to hold it. Those who have not said how they travel share the last line, a thin rule
// across the festival's days. A line called collectively ("Everyone else") names its people on hover, and from its
// button by tap or keyboard, on a row of their own under it that the card grows to hold. It is drawn for the eye: a screen reader hears its
// names, and a line no one sees says the rest in words.
import { daysInto, daysOf, WEEKDAYS, weekday } from './calendar.ts';
import { button, h, type Kid, toggle } from './dom.ts';
import { swipe } from './ink.ts';
import type { Line, Unit } from './roster.ts';
import { joined } from './wording.ts';

// a line's swipe, across its lane: level, whatever its length, so a computer's long bar slopes no more than a phone's
const INK = { height: [0.55, 0.7], drop: [0, 0.04], tilt: 0 } as const; // thin, and level however long
const ROOM = 3; // the room, in rem, a stay needs between a bar's times to be said there, a few letters and an ellipsis

// "17:05 OSL": a time of a flight, and its airport when known
const timeAt = (time: string, airport: string | null): string =>
  `${time.slice(11)}${airport === null ? '' : ` ${airport}`}`;
// "Thu 17:05 OSL"
export const dayTimeAt = (time: string, airport: string | null): string =>
  `${WEEKDAYS[weekday(time)]?.slice(0, 3)} ${timeAt(time, airport)}`;
// a bar's end: its time, and its airport, which a phone leaves out
const end = (time: string, airport: string | null): HTMLElement =>
  h('span', {}, time.slice(11), airport === null ? null : h('span', { class: 'gantt-ap' }, ` ${airport}`));

// A collective line's name: a button saying it ("Everyone else"), and the names of its people on a row of the roster
// under its line, covering nothing, shown while the pointer is over the name and from a tap or a key until the next
// (or Escape).
function collective(id: string, said: string, names: readonly Kid[]): { opener: HTMLElement; list: HTMLElement } {
  const list = h('div', { class: 'gantt-who-names', id }, names);
  let over = false;
  const shown = () => toggle(list, 'gantt-open', over || opener.getAttribute('aria-expanded') === 'true');
  const opened = (on: boolean) => {
    opener.setAttribute('aria-expanded', String(on));
    shown();
  };
  const opener = button(
    {
      class: ['goer-name', 'gantt-who'],
      'aria-expanded': 'false',
      'aria-controls': id,
      onclick: () => opened(opener.getAttribute('aria-expanded') !== 'true'),
      onmouseenter: () => {
        over = true;
        shown();
      },
      onmouseleave: () => {
        over = false;
        shown();
      },
    },
    said,
  );
  opener.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') opened(false);
  });
  return { opener, list };
}

// On a phone, each stay said inside its bar when the room between the bar's times holds a few letters of it, else
// under its line's name; measured again whenever the roster's size changes (opened, turned, resized).
function fitStays(grid: HTMLElement, stays: readonly { name: HTMLElement; inBar: HTMLElement }[]): void {
  if (stays.length === 0) return;
  new ResizeObserver(() => {
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    for (const s of stays) toggle(s.name, 'gantt-tight', s.inBar.clientWidth < ROOM * rem);
  }).observe(grid);
}

export function gantt<P>(t: {
  from: string;
  to: string;
  festival: { start_date: string; end_date: string };
  place: string;
  lines: readonly Line<P>[]; // as roster() makes them: by arrival, those who have not said last
  named: (u: Unit<P>) => Kid; // a unit's name, as the page shows it
  describedBy: string; // the id of the line that says it in words
  seed: string; // the festival's, which with a line's names makes its bar's swipe
}): HTMLElement {
  const days = daysOf(t.from, t.to);
  const share = (n: number) => `${(100 * n) / days.length}%`;
  const start = Math.max(0, days.indexOf(t.festival.start_date)),
    last = days.indexOf(t.festival.end_date);
  const stays = t.lines.some((l) => l.travel !== null && l.travel.stay !== null);
  const inBars: { name: HTMLElement; inBar: HTMLElement }[] = [];
  // a lane: the line's swipe from when they arrive to when they leave, with its stay between its times on a phone, or,
  // not said, a thin rule across the festival
  const lane = (l: Line<P>, key: string, inBar: HTMLElement | null): HTMLElement => {
    const f = l.travel;
    const at = f && { from: daysInto(t.from, f.arrive), to: daysInto(t.from, f.leave) };
    return h(
      'div',
      { class: 'gantt-lane', 'aria-hidden': 'true' },
      f === null || at === null
        ? h('div', { class: 'gantt-none', style: { left: share(start), width: share(last - start + 1) } })
        : h(
            'div',
            { class: 'gantt-bar', style: { left: share(at.from), width: share(at.to - at.from) } },
            // the highlighter's ink, under the times: its own swipe for the line and the festival
            h('span', {
              class: 'gantt-ink',
              style: swipe(`${key} ${t.seed}`, INK, { before: false, after: false }),
              'aria-hidden': 'true',
            }),
            end(f.arrive, f.arrive_at),
            inBar,
            end(f.leave, f.leave_from),
          ),
    );
  };
  const line = (l: Line<P>, i: number): Kid[] => {
    const stay = l.travel?.stay ?? null;
    const names = joined(l.units.map(t.named));
    const called = l.collective === null ? null : collective(`${t.describedBy}-names-${i}`, l.collective, names);
    const name = h(
      'div',
      { class: ['gantt-name', l.travel === null && 'gantt-unsaid'] },
      called === null ? names : called.opener,
      stay === null ? null : [' ', h('span', { class: 'gantt-stay-under' }, stay)],
    );
    const inBar = stay === null ? null : h('span', { class: 'gantt-bar-stay', title: stay }, stay);
    if (inBar) inBars.push({ name, inBar });
    return [
      name,
      lane(l, l.units.map((u) => u.name).join(', '), inBar),
      stays ? h('div', { class: 'gantt-stay', 'aria-hidden': 'true' }, stay ?? '') : null,
      called?.list,
    ];
  };
  const grid = h(
    'div',
    {
      class: ['gantt', stays && 'gantt-stays'],
      role: 'group',
      'aria-label': `Who is in ${t.place} when`,
      'aria-describedby': t.describedBy,
    },
    h('div', {}),
    h(
      'div',
      {
        class: 'gantt-axis',
        'aria-hidden': 'true',
        style: { 'grid-template-columns': `repeat(${days.length}, minmax(0, 1fr))` },
      },
      days.map((d) =>
        h(
          'span',
          { class: d >= t.festival.start_date && d <= t.festival.end_date ? 'gantt-fest' : null },
          WEEKDAYS[weekday(d)]?.[0],
          h('b', {}, Number(d.slice(8))),
        ),
      ),
    ),
    stays ? h('div', { class: 'gantt-stay', 'aria-hidden': 'true' }, 'Staying') : null,
    t.lines.map(line),
  );
  fitStays(grid, inBars);
  return grid;
}
