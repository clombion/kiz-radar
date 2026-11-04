// A trip's roster: its days across the top, from the first of the community to arrive to the last to leave, the
// festival's own days marked on them, and a line for each travel, in and out (roster.ts): its name, a highlighter's
// swipe from the hour they arrive to the hour they leave with its times at its ends (and its airports, on a computer),
// and where its people stay. An end not said fades out, its time "in ?" or "out ?"; said only where they stay, the bar
// is dashed over their nights. Where they stay is counted beside the bar on a computer ("Scandic Holberg 13 · Airbnb 3
// · 4 not said"); on a phone the bar says the biggest ("Scandic Holberg +2"), or under the name when the bar is too
// short; a line that changes places on the way has its bar cut at the change, each place between the times as wide as
// its nights. Those who have not said share the last line, a thin rule across the festival's days. A line called by
// what it is ("Everyone else", "5 people"), or whose people stay apart, names them, by their stays, from its button. It
// is drawn for the eye: a screen reader hears its names, and a line no one sees says the rest in words.
import { daysInto, daysOf, WEEKDAYS, weekday } from './calendar.ts';
import { addDays } from './days.ts';
import { button, h, type Kid, toggle } from './dom.ts';
import { swipe } from './ink.ts';
import type { Bucket, Line, Unit } from './roster.ts';
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
// a bar's end: its time, and its airport, which a phone leaves out; "in ?" or "out ?" when not said
const end = (time: string | null, airport: string | null, unsaid: string): HTMLElement =>
  time === null
    ? h('span', { class: 'gantt-q' }, unsaid)
    : h('span', {}, time.slice(11), airport === null ? null : h('span', { class: 'gantt-ap' }, ` ${airport}`));
// a line's stays, counted: "Scandic Holberg 13 · Airbnb 3 · 4 not said", or its one place alone
const counted = (buckets: readonly Bucket<unknown>[]): string =>
  buckets.length === 1
    ? (buckets[0]?.place ?? '')
    : buckets.map((b) => (b.place === null ? `${b.people} not said` : `${b.place} ${b.people}`)).join(' · ');

// A line's name as a button ("Everyone else", or its units' names when they stay apart), and the names of its people
// on a row of the roster under its line, covering nothing, shown while the pointer is over the name and from a tap or
// a key until the next (or Escape).
function collective(id: string, said: Kid, names: readonly Kid[]): { opener: HTMLElement; list: HTMLElement } {
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
  const stays = t.lines.some((l) => l.buckets.some((b) => b.place !== null));
  const inBars: { name: HTMLElement; inBar: HTMLElement }[] = [];
  const at = (time: string) => daysInto(t.from, time);
  // where a bar begins and ends, in days from the first: at its times, else at its first night and the morning after
  // its last, else at the festival's first day and the end of its last
  const span = (l: Line<P>) => {
    const f = l.travel;
    const from = f?.arrive ?? (l.nights ? `${l.nights.first}T00:00` : `${t.festival.start_date}T00:00`);
    const to = f?.leave ?? `${addDays(l.nights?.last ?? t.festival.end_date, 1)}T00:00`;
    return { from: at(from), to: at(to) };
  };
  // between a bar's times: where its people stay; places one after another cut the bar where they change, each as wide
  // as its nights; else the biggest stay, with how many others ("Scandic Holberg +2")
  const middle = (l: Line<P>, bar: { from: number; to: number }): { kids: Kid[]; inBar: HTMLElement | null } => {
    const [only] = l.buckets;
    const said = l.buckets.filter((b) => b.place !== null);
    if (l.buckets.length === 1 && only !== undefined && only.stays.length > 1) {
      const nights = (x: { first: string; last: string }) => daysInto(x.first, `${x.last}T00:00`) + 1;
      return {
        inBar: null,
        kids: [
          only.stays.slice(1).map((x) =>
            h('span', {
              class: 'gantt-cut',
              style: { left: `${(100 * (at(`${x.first}T12:00`) - bar.from)) / (bar.to - bar.from)}%` },
            }),
          ),
          h(
            'span',
            { class: 'gantt-segs' },
            only.stays.map((x) =>
              h('span', { class: 'gantt-seg', title: x.place, style: { 'flex-grow': String(nights(x)) } }, x.place),
            ),
          ),
        ],
      };
    }
    const [most] = said;
    if (most === undefined || most.place === null) return { inBar: null, kids: [] };
    const others = l.buckets.length - 1;
    const inBar = h(
      'span',
      { class: 'gantt-bar-stay', title: counted(l.buckets) },
      others > 0 ? `${most.place} +${others}` : most.place,
    );
    return { inBar, kids: [inBar] };
  };
  // a lane: the line's swipe from when they arrive to when they leave, or, not said, a thin rule across the festival
  const laneOf = (drawn: HTMLElement) => h('div', { class: 'gantt-lane', 'aria-hidden': 'true' }, drawn);
  const lane = (l: Line<P>, key: string): { lane: HTMLElement; inBar: HTMLElement | null } => {
    const f = l.travel;
    if (f === null && l.nights === null)
      return {
        inBar: null,
        lane: laneOf(h('div', { class: 'gantt-none', style: { left: share(start), width: share(last - start + 1) } })),
      };
    const bar = span(l);
    const inside = middle(l, bar);
    return {
      inBar: inside.inBar,
      lane: laneOf(
        h(
          'div',
          {
            class: [
              'gantt-bar',
              f?.arrive == null && 'gantt-open-start',
              f?.leave == null && 'gantt-open-end',
              f === null && 'gantt-stay-only',
            ],
            style: { left: share(bar.from), width: share(bar.to - bar.from) },
          },
          // the highlighter's ink, under the times: its own swipe for the line and the festival
          h('span', {
            class: 'gantt-ink',
            style: swipe(`${key} ${t.seed}`, INK, { before: false, after: false }),
            'aria-hidden': 'true',
          }),
          end(f?.arrive ?? null, f?.arrive_at ?? null, 'in ?'),
          inside.kids,
          end(f?.leave ?? null, f?.leave_from ?? null, 'out ?'),
        ),
      ),
    };
  };
  const line = (l: Line<P>, i: number): Kid[] => {
    const names = joined(l.units.map(t.named));
    // its people by where they stay, when they stay apart: "Scandic Holberg: A, B · Not said: C"
    const byStay: Kid[] =
      l.buckets.length > 1
        ? l.buckets.map((b, j) => [
            j > 0 ? ' · ' : null,
            h('b', {}, b.place ?? 'Not said'),
            ' ',
            joined(b.units.map(t.named)),
          ])
        : names;
    const opens =
      l.called === null && l.buckets.length < 2
        ? null
        : collective(`${t.describedBy}-names-${i}`, l.called ?? names, byStay);
    const { lane: drawn, inBar } = lane(l, l.units.map((u) => u.name).join(', '));
    const under = inBar === null ? null : inBar.textContent;
    const name = h(
      'div',
      { class: ['gantt-name', l.travel === null && l.nights === null && 'gantt-unsaid'] },
      opens === null ? names : opens.opener,
      under === null ? null : [' ', h('span', { class: 'gantt-stay-under' }, under)],
    );
    if (inBar) inBars.push({ name, inBar });
    return [
      name,
      drawn,
      stays ? h('div', { class: 'gantt-stay', 'aria-hidden': 'true' }, counted(l.buckets)) : null,
      opens?.list,
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
