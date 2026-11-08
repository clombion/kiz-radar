// A trip's roster: its days across the top as the calendar has them (the festival's in the accent, a dot under a day
// only travelled on), from the first of the community there to the last, and a line a group, its name beside it.
//
// One meaning a mark. A stroke of the calendar's ink is "there": everyone going has one over the festival's days at
// least. Its end is hard, with its time (and its airport, on a computer), where the time was said, and fades, with
// nothing written, where it was not: said nothing at all, or only where they stay, the festival's days with both ends
// fading; only a flight in, a hard start and the end fading at the festival's close (or the morning after their last
// night); only a day, the stroke from that day, its start fading. A dotted underline is names behind a text (a line
// called by what it is, places counted): hover or tap opens them. Muted text is a detail or an absence.
//
// By travel (gantt): a line for each travel, in and out (roster.ts). Where a line stays is written when it is one or
// two places ("Airbnb → Scandic Holberg" for one person's way; "Scandic Holberg 8 · Comfort Xpress 2 · 1 not said"),
// counted when more ("3 places"): beside the stroke on a computer, under the name on a phone, which counts two.
//
// By place (ganttByPlace): a line a place (roster.ts's byPlace), its people under its name, one stroke over the nights
// anyone stays there, from the evening of the first to the morning after the last, its ends their weekdays; each
// person's own nights in the names it opens ("Nora (Fri–Sun)"); those who said no place last.
//
// It is drawn for the eye: a screen reader hears its names, and a line no one sees says the rest in words.

import { awayDays, daysInto, daysOf, type Moment, WEEKDAYS, weekday, weekday3 } from './calendar.ts';
import { addDays } from './days.ts';
import { dismissable, WIDE } from './dismiss.ts';
import { button, h, type Kid, toggle } from './dom.ts';
import { swipe } from './ink.ts';
import { type Bucket, type Line, ownNights, type Place, type Unit } from './roster.ts';
import { dayMonth } from './ui.ts';
import { joined, plural } from './wording.ts';

// a line's swipe, across its lane: level, whatever its length, so a computer's long bar slopes no more than a phone's
const INK = { height: [0.55, 0.7], drop: [0, 0.04], tilt: 0 } as const; // thin, and level however long

// "17:05 OSL": the time of a flight, and its airport when known (an airport goes with a time: records.Travel)
export const timeAt = (time: string, airport: string | null): string =>
  `${time}${airport === null ? '' : ` ${airport}`}`;
// "Thu 17:05 OSL"
export const dayTimeAt = (at: Moment, airport: string | null): string =>
  `${weekday3(at.day)} ${timeAt(at.time ?? '', airport)}`;
// a stroke's end: its time, and its airport, which a phone leaves out; nothing when its time is not said
const end = (time: string | null, airport: string | null): HTMLElement =>
  h('span', {}, time, time !== null && airport !== null ? h('span', { class: 'gantt-ap' }, ` ${airport}`) : null);
// a line's places in full: "Scandic Holberg 8 · Comfort Xpress 2 · 1 not said", or its one place (or way) alone
const counted = (buckets: readonly Bucket<unknown>[]): string =>
  buckets.length === 1
    ? (buckets[0]?.place ?? '')
    : buckets.map((b) => (b.place === null ? `${b.people} not said` : `${b.place} ${b.people}`)).join(' · ');

// names behind a text, in groups: each a place (null: one list, with no heading) and its names, each with its own
// nights when they are not all of its place's
interface Group {
  heading: string | null;
  names: { name: Kid; nights: string | null }[];
}

// Where the card of names goes on a computer: under its text's line, from the text's left, inside the trip's card;
// above the line when the card has no room below it; never over the line itself; and in the roster's flow, as on a
// phone, when the card has room neither below nor above, so that the trip's card grows to hold it.
function place(list: HTMLElement, from: HTMLElement): void {
  const grid = from.closest<HTMLElement>('.gantt');
  const card = from.closest<HTMLElement>('.trip-body') ?? grid;
  const line = from.closest<HTMLElement>('.gantt-name, .gantt-stay') ?? from;
  if (grid === null || card === null) return;
  const g = grid.getBoundingClientRect(),
    c = card.getBoundingClientRect(),
    l = line.getBoundingClientRect(),
    t = from.getBoundingClientRect(),
    b = list.getBoundingClientRect();
  const gap = 4;
  const below = l.bottom + gap,
    above = l.top - gap - b.height;
  const fits = below + b.height <= c.bottom || above >= c.top;
  toggle(list, 'gantt-who-flow', !fits);
  if (!fits) return;
  const top = below + b.height <= c.bottom ? below : above;
  const left = Math.max(c.left, Math.min(t.left, c.right - b.width));
  list.style.top = `${top - g.top}px`;
  list.style.left = `${left - g.left}px`;
}

// A small card of names behind a text, and the texts that open it (dotted under): shown while the pointer is over one
// and from a tap or a key until the next (or Escape). Grouped by place when they stay apart, each place a small
// heading, those who said none last; each name with its own nights in muted text when they are not all of its
// place's. On a phone it is in the roster's flow, on a row of its own under its line; on a computer it floats by its
// text, inside the trip's card.
function behind(
  id: string,
  groups: readonly Group[],
): { list: HTMLElement; opener: (said: Kid) => HTMLElement; used: () => boolean } {
  const many = groups.reduce((n, g) => n + g.names.length, 0) > 4;
  const list = h(
    'div',
    { class: ['gantt-who-names', many && 'gantt-who-many'], id },
    groups.map((g) => [
      g.heading === null ? null : h('p', { class: 'gantt-who-place' }, g.heading),
      h(
        'ul',
        { class: 'gantt-who-list' },
        g.names.map((n) =>
          h('li', {}, n.name, n.nights === null ? null : h('span', { class: 'gantt-who-nights' }, ` · ${n.nights}`)),
        ),
      ),
    ]),
  );
  const openers: HTMLElement[] = [];
  let over: HTMLElement | null = null;
  const open = () => openers.find((o) => o.getAttribute('aria-expanded') === 'true') ?? null;
  const shown = () => {
    const by = over ?? open();
    toggle(list, 'gantt-open', by !== null);
    toggle(list, 'gantt-who-flow', false);
    if (by !== null && matchMedia(WIDE).matches) place(list, by);
    if (by === null) one.closed();
    else one.opened();
  };
  const one = dismissable({
    within: () => [list, ...openers],
    close: () => {
      over = null;
      for (const x of openers) x.setAttribute('aria-expanded', 'false');
      shown();
    },
    place: shown,
  });
  const opener = (said: Kid): HTMLElement => {
    const o = button(
      {
        class: ['goer-name', 'gantt-who'],
        'aria-expanded': 'false',
        'aria-controls': id,
        onclick: () => {
          const on = o.getAttribute('aria-expanded') !== 'true';
          for (const x of openers) x.setAttribute('aria-expanded', String(on && x === o));
          shown();
        },
        onmouseenter: () => {
          over = o;
          shown();
        },
        onmouseleave: () => {
          over = null;
          shown();
        },
      },
      said,
    );
    openers.push(o);
    return o;
  };
  return { list, opener, used: () => openers.length > 0 };
}

// The frame of a roster, in either view: its days across the top as the calendar has them, an empty head over the
// column beside them when there is one, and its lines.
interface Frame {
  from: string;
  to: string;
  festival: { start_date: string; end_date: string };
  place: string;
  describedBy: string; // the id of the line that says it in words
  seed: string; // the festival's, which with a line's names makes its stroke's swipe
}
function frame(t: Frame, column: boolean, lines: readonly Kid[]): HTMLElement {
  const days = daysOf(t.from, t.to);
  const fest = (d: string) => d >= t.festival.start_date && d <= t.festival.end_date;
  return h(
    'div',
    {
      class: ['gantt', column && 'gantt-stays'],
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
          { class: fest(d) ? 'gantt-fest' : 'gantt-travel' },
          WEEKDAYS[weekday(d)]?.[0],
          h('b', {}, Number(d.slice(8))),
        ),
      ),
    ),
    column ? h('div', { class: 'gantt-stay', 'aria-hidden': 'true' }) : null,
    lines,
  );
}
// the drawing of a frame: where a time is, in days from its first; the festival's opening and close; a lane; a stroke
function drawing(t: Frame) {
  const days = daysOf(t.from, t.to).length;
  const at = (day: string, edge: 'start' | 'end' = 'start') => daysInto(t.from, { day, time: null }, edge);
  const share = (n: number) => `${(100 * n) / days}%`;
  const opens = at(t.festival.start_date),
    closes = at(t.festival.end_date, 'end');
  const lane = (...drawn: Kid[]) => h('div', { class: 'gantt-lane', 'aria-hidden': 'true' }, drawn);
  const stroke = (s: {
    from: number;
    to: number;
    key: string;
    fades: { in: boolean; out: boolean };
    title: string | null;
    ends: [Kid, Kid];
  }) =>
    h(
      'div',
      {
        class: ['gantt-bar', s.fades.in && 'gantt-fade-in', s.fades.out && 'gantt-fade-out'],
        title: s.title,
        style: { left: share(s.from), width: share(s.to - s.from) },
      },
      // the calendar's ink, under the times: its own swipe for the line and the festival
      h('span', {
        class: 'gantt-ink',
        style: swipe(`${s.key} ${t.seed}`, INK, { before: false, after: false }),
        'aria-hidden': 'true',
      }),
      s.ends,
    );
  // a travel's end: its time, or its day's start (arriving) or end (leaving) when its time is not said
  const ends = (m: Moment, edge: 'start' | 'end') => daysInto(t.from, m, edge);
  return { at, ends, opens, closes, lane, stroke };
}
const morning = (night: string) => addDays(night, 1);

// when an end not said is: "arrival not said", "arrives Fri 6 Nov, time not said"
export function unsaidEnd(at: Moment | null, which: 'arrive' | 'leave'): string | null {
  if (at?.time != null) return null;
  if (at === null) return which === 'arrive' ? 'arrival not said' : 'departure not said';
  return `${which === 'arrive' ? 'arrives' : 'leaves'} ${dated(at.day)}, time not said`;
}
// "Fri 6 Nov"
const dated = (day: string) => `${weekday3(day)} ${dayMonth(day)}`;

export function gantt<P>(
  t: Frame & {
    lines: readonly Line<P>[]; // as roster() makes them: named, by number, everyone else, those who have not said
    named: (u: Unit<P>) => Kid; // a unit's name, as the page shows it
  },
): HTMLElement {
  const d = drawing(t);
  const column = t.lines.some((l) => l.buckets.some((b) => b.place !== null));
  // a line's stroke: from its arrival (else the festival's opening, or their first night when sooner) to its departure
  // (else the festival's close, or the morning after their last night when later); hard at a time said, else fading
  const lane = (l: Line<P>, key: string): HTMLElement => {
    const f = l.travel;
    const arrive = f?.arrive?.at ?? null,
      leave = f?.leave?.at ?? null;
    // an end not said where the calendar has it (awayDays): the festival's, or the line's nights when beyond it
    const away = awayDays(t.festival, { arrive: null, leave: null, nights: l.nights });
    const from = arrive === null ? d.at(away.from) : d.ends(arrive, 'start');
    const to = leave === null ? (away.to === t.festival.end_date ? d.closes : d.at(away.to)) : d.ends(leave, 'end');
    const unsaid = [unsaidEnd(arrive, 'arrive'), unsaidEnd(leave, 'leave')].filter((x) => x !== null);
    return d.lane(
      d.stroke({
        from,
        to,
        key,
        fades: { in: arrive?.time == null, out: leave?.time == null },
        title: unsaid.length > 0 ? unsaid.join('; ') : null,
        ends: [
          end(arrive?.time ?? null, f?.arrive?.airport ?? null),
          end(leave?.time ?? null, f?.leave?.airport ?? null),
        ],
      }),
    );
  };
  const line = (l: Line<P>, i: number): Kid[] => {
    const names = joined(l.units.map(t.named));
    const said = l.buckets.filter((b) => b.place !== null);
    // its people by where they stay, when they stay apart: "Scandic Holberg A, B · Not said C"
    const byStay: Group[] = l.buckets.map((b) => ({
      heading: b.place ?? 'Not said',
      names: b.units.map((u) => ({ name: t.named(u), nights: null })),
    }));
    const n = new Set(said.flatMap((b) => b.stays.map((s) => s.place))).size;
    const plain: Group[] = [{ heading: null, names: l.units.map((u) => ({ name: t.named(u), nights: null })) }];
    const list = behind(`${t.describedBy}-names-${i}`, l.buckets.length > 1 || n > 1 ? byStay : plain);
    const full = counted(l.buckets);
    // its places, written when at most `most` of them, else counted, the count opening its names by place
    const places = (most: number): Kid =>
      n === 0 ? null : n <= most ? h('span', { title: full }, full) : list.opener(plural(n, 'place'));
    const desk = column ? places(2) : null,
      phone = places(1);
    const label = l.called === null ? names : list.opener(l.called);
    return [
      h(
        'div',
        { class: ['gantt-name', l.travel === null && l.nights === null && 'gantt-unsaid'] },
        label,
        phone === null ? null : [' ', h('span', { class: 'gantt-under' }, phone)],
      ),
      lane(l, l.units.map((u) => u.name).join(', ')),
      column ? h('div', { class: 'gantt-stay' }, desk) : null,
      list.used() ? list.list : null,
    ];
  };
  return frame(t, column, t.lines.map(line));
}

// The roster by where they stay: a line a place, its name the line's and its people under it (three or fewer named,
// more called by number, named from it with each one's own nights when not all of the place's), one stroke over the
// nights anyone stays there, its ends the weekdays of the evening of the first and the morning after the last; those
// who said no place last, over the festival's days with both ends fading.
export function ganttByPlace<P>(t: Frame & { places: readonly Place<P>[]; named: (u: Unit<P>) => Kid }): HTMLElement {
  const d = drawing(t);
  const line = (p: Place<P>, i: number): Kid[] => {
    const { nights } = p;
    // a unit with its own nights there, when they are not all of the place's: "Nora · Fri–Sun"
    const own = (u: Unit<P>) => {
      const mine = ownNights(p, u);
      return { name: t.named(u), nights: mine === null ? null : `${weekday3(mine.first)}–${weekday3(mine.last)}` };
    };
    const list =
      p.called === null ? null : behind(`${t.describedBy}-names-${i}`, [{ heading: null, names: p.units.map(own) }]);
    return [
      h(
        'div',
        { class: ['gantt-name', p.place === null && 'gantt-unsaid'] },
        p.place ?? 'Not said',
        ' ',
        h('span', { class: 'gantt-under' }, list === null ? joined(p.units.map(t.named)) : list.opener(p.called)),
      ),
      d.lane(
        nights === null
          ? d.stroke({
              from: d.opens,
              to: d.closes,
              key: `none ${i}`,
              fades: { in: true, out: true },
              title: 'place not said',
              ends: [h('span', {}), h('span', {})],
            })
          : d.stroke({
              from: d.at(nights.first),
              to: d.at(morning(nights.last)),
              key: `${p.place} ${i}`,
              fades: { in: false, out: false },
              title: null,
              ends: [h('span', {}, weekday3(nights.first)), h('span', {}, weekday3(morning(nights.last)))],
            }),
      ),
      list?.list,
    ];
  };
  return frame(t, false, t.places.map(line));
}
