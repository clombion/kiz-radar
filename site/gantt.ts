// A trip's small Gantt: its days across the top, from the first of the community to arrive to the last to leave, the
// festival's own days a soft band behind, and a bar for each party travelling together, from the hour they arrive to
// the hour they leave, its times and airports at its ends. Someone who has not said how they travel has a dotted bar
// over the festival's days. It is drawn for the eye: the line under it says the same in words.
import { daysInto, daysOf, WEEKDAYS, weekday } from './calendar.ts';
import { h, type Kid } from './dom.ts';

// how someone travels: arrive and leave as local times, YYYY-MM-DDTHH:MM, and the airports when they fly
interface Flight {
  arrive: string;
  arrive_at: string | null;
  leave: string;
  leave_from: string | null;
}
// a party: who travels together (a couple as one), what their name says on hover (who added them), and how they
// travel, or null when they have not said
export interface Party {
  name: string;
  title: string | null;
  flight: Flight | null;
}
// a party's name, made anew for each place that shows it
export const partyName = (p: Party): Kid => (p.title === null ? p.name : h('span', { title: p.title }, p.name));

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
  describedBy: string; // the id of the line that says it in words
}): HTMLElement {
  const days = daysOf(t.from, t.to);
  const share = (n: number) => `${(100 * n) / days.length}%`;
  const start = days.indexOf(t.festival.start_date),
    end = days.indexOf(t.festival.end_date);
  const band = { left: share(Math.max(0, start)), width: share(end - Math.max(0, start) + 1) };
  const lane = (p: Party): HTMLElement => {
    const f = p.flight;
    const at = f === null ? null : { from: daysInto(t.from, f.arrive), to: daysInto(t.from, f.leave) };
    return h(
      'div',
      { class: 'gantt-lane' },
      h('div', { class: 'gantt-band', style: band }),
      f === null || at === null
        ? h('div', { class: ['gantt-bar', 'gantt-unsaid'], style: band }, 'not said')
        : h(
            'div',
            { class: 'gantt-bar', style: { left: share(at.from), width: share(at.to - at.from) } },
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
    t.parties.map((p) => [h('div', { class: 'gantt-name' }, partyName(p)), lane(p)]),
  );
}
