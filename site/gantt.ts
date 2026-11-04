// A trip's small Gantt: its days across the top, from the first of the community to arrive to the last to leave, the
// festival's own days a soft band behind, and for each party travelling together a highlighter's swipe from the hour
// they arrive to the hour they leave, its times and airports at its ends. Only those who said how they travel have
// one: when no one has, it is the days and the band alone. It is drawn for the eye: the line under it says the same
// in words.
import { daysInto, daysOf, WEEKDAYS, weekday } from './calendar.ts';
import { h } from './dom.ts';
import { swipe } from './ink.ts';

// a party's swipe, across its lane: level, whatever its length, so a computer's long bar slopes no more than a phone's
const INK = { height: [0.78, 0.95], drop: [0.02, 0.08], tilt: 0 } as const; // level, however long

// how someone travels: arrive and leave as local times, YYYY-MM-DDTHH:MM, and the airports when they fly
interface Flight {
  arrive: string;
  arrive_at: string | null;
  leave: string;
  leave_from: string | null;
}
// a party: who travels together, on one flight in and one out (a couple as one), and how
export interface Party {
  name: string;
  flight: Flight;
}

// "17:05 OSL": a time of a flight, and its airport when known
const timeAt = (time: string, airport: string | null): string =>
  `${time.slice(11)}${airport === null ? '' : ` ${airport}`}`;
// "Thu 17:05 OSL"
export const dayTimeAt = (time: string, airport: string | null): string =>
  `${WEEKDAYS[weekday(time)]?.slice(0, 3)} ${timeAt(time, airport)}`;

export function gantt(t: {
  from: string;
  to: string;
  festival: { start_date: string; end_date: string };
  place: string;
  parties: readonly Party[];
  describedBy: string | null; // the id of the line that says it in words, when anyone travels
  seed: string; // the festival's, which with a party's name makes its bar's swipe
}): HTMLElement {
  const days = daysOf(t.from, t.to);
  const share = (n: number) => `${(100 * n) / days.length}%`;
  const start = days.indexOf(t.festival.start_date),
    end = days.indexOf(t.festival.end_date);
  const band = { left: share(Math.max(0, start)), width: share(end - Math.max(0, start) + 1) };
  // a lane: the festival's band, and the party's bar when there is one
  const lane = (p?: Party): HTMLElement => {
    const f = p?.flight;
    const at = f === undefined ? undefined : { from: daysInto(t.from, f.arrive), to: daysInto(t.from, f.leave) };
    return h(
      'div',
      { class: 'gantt-lane' },
      h('div', { class: 'gantt-band', style: band }),
      f === undefined || at === undefined
        ? null
        : h(
            'div',
            { class: 'gantt-bar', style: { left: share(at.from), width: share(at.to - at.from) } },
            // the highlighter's ink, under the times: its own swipe for the party and the festival
            h('span', {
              class: 'gantt-ink',
              style: swipe(`${p?.name ?? ''} ${t.seed}`, INK, { before: false, after: false }),
              'aria-hidden': 'true',
            }),
            h('span', {}, timeAt(f.arrive, f.arrive_at)),
            h('span', {}, timeAt(f.leave, f.leave_from)),
          ),
    );
  };
  return h(
    'div',
    { class: 'gantt', role: 'img', 'aria-label': `Who is in ${t.place} when`, 'aria-describedby': t.describedBy },
    h('div', {}),
    h(
      'div',
      { class: 'gantt-axis', style: { 'grid-template-columns': `repeat(${days.length}, minmax(0, 1fr))` } },
      days.map((d) =>
        h(
          'span',
          { class: d >= t.festival.start_date && d <= t.festival.end_date ? 'gantt-fest' : null },
          WEEKDAYS[weekday(d)]?.[0],
          h('b', {}, Number(d.slice(8))),
        ),
      ),
    ),
    t.parties.length > 0
      ? t.parties.map((p) => [h('div', { class: 'gantt-name' }, p.name), lane(p)])
      : [h('div', {}), lane()],
  );
}
