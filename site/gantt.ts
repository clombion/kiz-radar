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
import { daysInto, daysOf, WEEKDAYS, weekday } from './calendar.ts';
import { addDays } from './days.ts';
import { button, h, type Kid, toggle } from './dom.ts';
import { swipe } from './ink.ts';
import { type Bucket, type Line, ownNights, type Place, type Unit } from './roster.ts';
import { dayMonth } from './ui.ts';
import { joined, plural } from './wording.ts';

// a line's swipe, across its lane: level, whatever its length, so a computer's long bar slopes no more than a phone's
const INK = { height: [0.55, 0.7], drop: [0, 0.04], tilt: 0 } as const; // thin, and level however long

const day3 = (iso: string) => WEEKDAYS[weekday(iso)]?.slice(0, 3) ?? '';
// whether a time of a travel says its hour, not only its day
export const timed = (time: string | null): time is string => time !== null && time.length > 10;
// "17:05 OSL": a time of a flight, and its airport when known
const timeAt = (time: string, airport: string | null): string =>
  `${time.slice(11)}${airport === null ? '' : ` ${airport}`}`;
// "Thu 17:05 OSL"
export const dayTimeAt = (time: string, airport: string | null): string => `${day3(time)} ${timeAt(time, airport)}`;
// a stroke's end: its time, and its airport, which a phone leaves out; nothing when its time is not said
const end = (time: string | null, airport: string | null): HTMLElement =>
  h(
    'span',
    {},
    timed(time) ? time.slice(11) : null,
    timed(time) && airport !== null ? h('span', { class: 'gantt-ap' }, ` ${airport}`) : null,
  );
// a line's places in full: "Scandic Holberg 8 · Comfort Xpress 2 · 1 not said", or its one place (or way) alone
const counted = (buckets: readonly Bucket<unknown>[]): string =>
  buckets.length === 1
    ? (buckets[0]?.place ?? '')
    : buckets.map((b) => (b.place === null ? `${b.people} not said` : `${b.place} ${b.people}`)).join(' · ');

// A list of names behind a text, on a row of the roster under its line, covering nothing, and the texts that open it
// (dotted under): shown while the pointer is over one and from a tap or a key until the next (or Escape).
function behind(
  id: string,
  names: readonly Kid[],
): { list: HTMLElement; opener: (said: Kid) => HTMLElement; used: () => boolean } {
  const list = h('div', { class: 'gantt-who-names', id }, names);
  const openers: HTMLElement[] = [];
  let over = false;
  const open = () => openers.some((o) => o.getAttribute('aria-expanded') === 'true');
  const shown = () => toggle(list, 'gantt-open', over || open());
  const opener = (said: Kid): HTMLElement => {
    const o = button(
      {
        class: ['goer-name', 'gantt-who'],
        'aria-expanded': 'false',
        'aria-controls': id,
        onclick: () => {
          const on = o.getAttribute('aria-expanded') !== 'true';
          for (const x of openers) x.setAttribute('aria-expanded', String(on));
          shown();
        },
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
    o.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      for (const x of openers) x.setAttribute('aria-expanded', 'false');
      shown();
    });
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
  const at = (time: string) => daysInto(t.from, time.length > 10 ? time : `${time}T00:00`);
  const share = (n: number) => `${(100 * n) / days}%`;
  const opens = at(t.festival.start_date),
    closes = at(addDays(t.festival.end_date, 1));
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
  return { at, opens, closes, lane, stroke };
}
const morning = (night: string) => addDays(night, 1);

// when an end not said is: "arrival not said", "arrives Fri 6 Nov, time not said"
export function unsaidEnd(time: string | null, which: 'arrive' | 'leave'): string | null {
  if (timed(time)) return null;
  if (time === null) return which === 'arrive' ? 'arrival not said' : 'departure not said';
  return `${which === 'arrive' ? 'arrives' : 'leaves'} ${dated(time)}, time not said`;
}
// "Fri 6 Nov"
const dated = (day: string) => `${day3(day)} ${dayMonth(day)}`;

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
    const arrive = f?.arrive ?? null,
      leave = f?.leave ?? null;
    const from = arrive === null ? Math.min(d.opens, l.nights ? d.at(l.nights.first) : d.opens) : d.at(arrive);
    const to = leave === null ? Math.max(d.closes, l.nights ? d.at(morning(l.nights.last)) : d.closes) : d.at(leave);
    const unsaid = [unsaidEnd(arrive, 'arrive'), unsaidEnd(leave, 'leave')].filter((x) => x !== null);
    return d.lane(
      d.stroke({
        from,
        to,
        key,
        fades: { in: !timed(arrive), out: !timed(leave) },
        title: unsaid.length > 0 ? unsaid.join('; ') : null,
        ends: [end(arrive, f?.arrive_at ?? null), end(leave, f?.leave_from ?? null)],
      }),
    );
  };
  const line = (l: Line<P>, i: number): Kid[] => {
    const names = joined(l.units.map(t.named));
    const said = l.buckets.filter((b) => b.place !== null);
    // its people by where they stay, when they stay apart: "Scandic Holberg A, B · Not said C"
    const byStay: Kid[] = l.buckets.map((b, j) => [
      j > 0 ? ' · ' : null,
      h('b', {}, b.place ?? 'Not said'),
      ' ',
      joined(b.units.map(t.named)),
    ]);
    const n = new Set(said.flatMap((b) => b.stays.map((s) => s.place))).size;
    const list = behind(`${t.describedBy}-names-${i}`, l.buckets.length > 1 || n > 1 ? byStay : names);
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
    // a unit with its own nights there, when they are not all of the place's: "Nora (Fri–Sun)"
    const own = (u: Unit<P>): Kid => {
      const mine = ownNights(p, u);
      return mine === null ? t.named(u) : [t.named(u), ` (${day3(mine.first)}–${day3(mine.last)})`];
    };
    const list = p.called === null ? null : behind(`${t.describedBy}-names-${i}`, joined(p.units.map(own)));
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
              ends: [h('span', {}, day3(nights.first)), h('span', {}, day3(morning(nights.last)))],
            }),
      ),
      list?.list,
    ];
  };
  return frame(t, false, t.places.map(line));
}
