// A trip's roster: its days across the top, from the first of the community to arrive to the last to leave, the
// festival's own days a soft band behind, and a line for each party travelling together (a couple as one): its name,
// a highlighter's swipe from the hour they arrive to the hour they leave with its times at its ends (and its airports,
// on a computer), and where it stays, beside it on a computer and under its name on a phone. Everyone who has not said
// how they travel shares the last line, over a dotted band across the festival's days. It is drawn for the eye: a
// line no one sees says it all in words to a screen reader.
import { daysInto, daysOf, WEEKDAYS, weekday } from './calendar.ts';
import { h, type Kid } from './dom.ts';
import { swipe } from './ink.ts';

// a party's swipe, across its lane: level, whatever its length, so a computer's long bar slopes no more than a phone's
const INK = { height: [0.55, 0.7], drop: [0, 0.04], tilt: 0 } as const; // thin, and level however long

// how someone travels: arrive and leave as local times, YYYY-MM-DDTHH:MM, and the airports when they fly
interface Flight {
  arrive: string;
  arrive_at: string | null;
  leave: string;
  leave_from: string | null;
}
// a party: who travels together, on one flight in and one out and to one stay (a couple as one), what they do there,
// and how they travel
export interface Party {
  name: string;
  tag: Kid; // "teaching", "going"
  stay: string | null;
  flight: Flight;
}

// "17:05 OSL": a time of a flight, and its airport when known
const timeAt = (time: string, airport: string | null): string =>
  `${time.slice(11)}${airport === null ? '' : ` ${airport}`}`;
// "Thu 17:05 OSL"
export const dayTimeAt = (time: string, airport: string | null): string =>
  `${WEEKDAYS[weekday(time)]?.slice(0, 3)} ${timeAt(time, airport)}`;
// a bar's end: its time, and its airport, which a phone leaves out
const end = (time: string, airport: string | null): HTMLElement =>
  h('span', {}, time.slice(11), airport === null ? null : h('span', { class: 'gantt-ap' }, ` ${airport}`));

export function gantt(t: {
  from: string;
  to: string;
  festival: { start_date: string; end_date: string };
  place: string;
  parties: readonly Party[];
  unsaid: readonly Kid[]; // the names of everyone going who has not said how they travel
  describedBy: string; // the id of the line that says it in words
  seed: string; // the festival's, which with a party's name makes its bar's swipe
}): HTMLElement {
  const days = daysOf(t.from, t.to);
  const share = (n: number) => `${(100 * n) / days.length}%`;
  const start = days.indexOf(t.festival.start_date),
    last = days.indexOf(t.festival.end_date);
  const band = { left: share(Math.max(0, start)), width: share(last - Math.max(0, start) + 1) };
  const stays = t.parties.some((p) => p.stay !== null);
  // a lane: the festival's band, and the party's swipe from when they arrive to when they leave
  const lane = (p: Party): HTMLElement => {
    const f = p.flight;
    const at = { from: daysInto(t.from, f.arrive), to: daysInto(t.from, f.leave) };
    return h(
      'div',
      { class: 'gantt-lane' },
      h('div', { class: 'gantt-band', style: band }),
      h(
        'div',
        { class: 'gantt-bar', style: { left: share(at.from), width: share(at.to - at.from) } },
        // the highlighter's ink, under the times: its own swipe for the party and the festival
        h('span', {
          class: 'gantt-ink',
          style: swipe(`${p.name} ${t.seed}`, INK, { before: false, after: false }),
          'aria-hidden': 'true',
        }),
        end(f.arrive, f.arrive_at),
        end(f.leave, f.leave_from),
      ),
    );
  };
  const line = (p: Party): Kid[] => [
    h(
      'div',
      { class: 'gantt-name' },
      p.name,
      ' ',
      p.tag,
      p.stay === null ? null : [' ', h('span', { class: 'gantt-stay-under' }, p.stay)],
    ),
    lane(p),
    stays ? h('div', { class: 'gantt-stay' }, p.stay ?? '') : null,
  ];
  return h(
    'div',
    {
      class: ['gantt', stays && 'gantt-stays'],
      role: 'img',
      'aria-label': `Who is in ${t.place} when`,
      'aria-describedby': t.describedBy,
    },
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
    stays ? h('div', { class: 'gantt-stay' }, 'Staying') : null,
    t.parties.map(line),
    // everyone who has not said, on one muted line over a dotted band across the festival's days
    t.unsaid.length > 0 || t.parties.length === 0
      ? [
          h('div', { class: ['gantt-name', 'gantt-unsaid'] }, t.unsaid),
          h(
            'div',
            { class: 'gantt-lane' },
            h('div', { class: ['gantt-band', t.unsaid.length > 0 && 'gantt-dotted'], style: band }),
          ),
          stays ? h('div', { class: 'gantt-stay' }) : null,
        ]
      : null,
  );
}
