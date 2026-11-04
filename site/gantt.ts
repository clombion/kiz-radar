// A trip's roster: its days across the top, from the first of the community to arrive to the last to leave, the
// festival's own days marked on them, and a line for each group that travels alike (roster.ts): its name, a
// highlighter's swipe from the hour they arrive to the hour they leave with its times at its ends (and its airports, on
// a computer), and where it stays, beside it on a computer and under its name on a phone. Those who have not said how
// they travel share the last line, a thin rule across the festival's days. A line called collectively ("Everyone
// else") names its people on hover, and from its button by tap or keyboard. It is drawn for the eye: a screen reader
// hears its names, and a line no one sees says the rest in words.
import { daysInto, daysOf, WEEKDAYS, weekday } from './calendar.ts';
import { button, h, type Kid } from './dom.ts';
import { swipe } from './ink.ts';
import type { Line, Unit } from './roster.ts';
import { joined } from './wording.ts';

// a line's swipe, across its lane: level, whatever its length, so a computer's long bar slopes no more than a phone's
const INK = { height: [0.55, 0.7], drop: [0, 0.04], tilt: 0 } as const; // thin, and level however long

// "17:05 OSL": a time of a flight, and its airport when known
const timeAt = (time: string, airport: string | null): string =>
  `${time.slice(11)}${airport === null ? '' : ` ${airport}`}`;
// "Thu 17:05 OSL"
export const dayTimeAt = (time: string, airport: string | null): string =>
  `${WEEKDAYS[weekday(time)]?.slice(0, 3)} ${timeAt(time, airport)}`;
// a bar's end: its time, and its airport, which a phone leaves out
const end = (time: string, airport: string | null): HTMLElement =>
  h('span', {}, time.slice(11), airport === null ? null : h('span', { class: 'gantt-ap' }, ` ${airport}`));

// A collective line's name: a button saying it ("Everyone else"), which shows the names of its people while the
// pointer is over it, and from a tap or a key until the next (or Escape).
function collective(id: string, said: string, names: readonly Kid[]): HTMLElement {
  const list = h('span', { class: 'gantt-who-names', id }, names);
  const toggle = button(
    {
      class: ['link', 'gantt-who'],
      'aria-expanded': 'false',
      'aria-controls': id,
      onclick: () => toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true')),
    },
    said,
  );
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggle.setAttribute('aria-expanded', 'false');
  });
  return h('span', { class: 'gantt-group' }, toggle, list);
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
  // a lane: the line's swipe from when they arrive to when they leave or, not said, a thin rule across the festival
  const lane = (l: Line<P>, key: string): HTMLElement => {
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
            end(f.leave, f.leave_from),
          ),
    );
  };
  const line = (l: Line<P>, i: number): Kid[] => {
    const stay = l.travel?.stay ?? null;
    const names = joined(l.units.map(t.named));
    return [
      h(
        'div',
        { class: ['gantt-name', l.travel === null && 'gantt-unsaid'] },
        l.collective === null ? names : collective(`${t.describedBy}-names-${i}`, l.collective, names),
        stay === null ? null : [' ', h('span', { class: 'gantt-stay-under' }, stay)],
      ),
      lane(l, l.units.map((u) => u.name).join(', ')),
      stays ? h('div', { class: 'gantt-stay', 'aria-hidden': 'true' }, stay ?? '') : null,
    ];
  };
  return h(
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
}
