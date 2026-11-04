// A trip's roster: its days across the top, from the first of the community to arrive to the last to leave, the
// festival's own days marked on them, and a line a group, its name beside it.
//
// By travel (gantt): a line for each travel, in and out (roster.ts), and a highlighter's swipe from the hour they
// arrive to the hour they leave with its times at its ends (and its airports, on a computer). The visual rule is the
// bar for what was said and a thin line of the accent for what was not: an arrival not said is the thin line from the
// festival's start to the first they are known there (their first night, else the day they leave), a departure not
// said the thin line from the last they are known there (their last night, else the day they arrive) to its end;
// someone who said only where they stay is the bar over their nights and the thin line over the festival's other
// days; those who said nothing share the last line, the thin line across the festival's days. Where a line stays is
// said only when it is one place for all of it ("Scandic Holberg"), else as a count ("3 hotels"; one person moving,
// "2 places"), never cut short, the whole in its title: beside the bar on a computer; on a phone inside every bar
// when every bar holds its text, else under every line's name.
//
// By hotel (ganttByPlace): a line a place (roster.ts's byPlace), its name the line's, its people under it, and a bar
// over the nights anyone stays there, deeper over those all of them do; those who said no place last, on the thin
// line.
//
// A line called by what it is ("Everyone else", "5 people"), or whose people stay apart, names them from its button.
// It is drawn for the eye: a screen reader hears its names, and a line no one sees says the rest in words.
import { daysInto, daysOf, WEEKDAYS, weekday } from './calendar.ts';
import { addDays } from './days.ts';
import { button, h, type Kid, toggle } from './dom.ts';
import { swipe } from './ink.ts';
import type { Bucket, Line, Place, Unit } from './roster.ts';
import { joined, plural } from './wording.ts';

// a line's swipe, across its lane: level, whatever its length, so a computer's long bar slopes no more than a phone's
const INK = { height: [0.55, 0.7], drop: [0, 0.04], tilt: 0 } as const; // thin, and level however long

// "17:05 OSL": a time of a flight, and its airport when known
const timeAt = (time: string, airport: string | null): string =>
  `${time.slice(11)}${airport === null ? '' : ` ${airport}`}`;
// "Thu 17:05 OSL"
export const dayTimeAt = (time: string, airport: string | null): string =>
  `${WEEKDAYS[weekday(time)]?.slice(0, 3)} ${timeAt(time, airport)}`;
// a bar's end: its time, and its airport, which a phone leaves out; nothing when not said
const end = (time: string | null, airport: string | null): HTMLElement =>
  h(
    'span',
    {},
    time?.slice(11) ?? null,
    time === null || airport === null ? null : h('span', { class: 'gantt-ap' }, ` ${airport}`),
  );
// a line's stays in full: "Scandic Holberg 13 · Airbnb 3 · 4 not said", or its one place (or sequence) alone
const counted = (buckets: readonly Bucket<unknown>[]): string =>
  buckets.length === 1
    ? (buckets[0]?.place ?? '')
    : buckets.map((b) => (b.place === null ? `${b.people} not said` : `${b.place} ${b.people}`)).join(' · ');
// what a line says of where it stays, short: its one place; else how many ("3 hotels", or for one person moving
// "2 places"); nothing when none is said
function stayText(buckets: readonly Bucket<unknown>[]): string | null {
  const places = new Set(buckets.flatMap((b) => b.stays.map((s) => s.place)));
  const [place] = places;
  if (place === undefined) return null;
  if (buckets.length > 1) return plural(places.size, 'hotel');
  return places.size === 1 ? place : `${places.size} places`;
}

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

// On a phone, where the lines stay is said inside every bar when every bar holds its whole text, else under every
// line's name: one placement for the card, measured again whenever its size changes (opened, turned, resized).
function fitStays(grid: HTMLElement, inBars: readonly HTMLElement[]): void {
  if (inBars.length === 0) return;
  // the placement changes the next frame, so that the change it makes to the card's height is seen as any other
  new ResizeObserver(() => {
    const tight = inBars.some((b) => b.scrollWidth > b.clientWidth);
    requestAnimationFrame(() => toggle(grid, 'gantt-tight', tight));
  }).observe(grid);
}

// The frame of a roster, in either view: its days across the top, with what heads the column beside them, and its lines.
interface Frame {
  from: string;
  to: string;
  festival: { start_date: string; end_date: string };
  place: string;
  describedBy: string; // the id of the line that says it in words
  seed: string; // the festival's, which with a line's names makes its bar's swipe
}
function frame(t: Frame, column: string | null, lines: readonly Kid[]): HTMLElement {
  const days = daysOf(t.from, t.to);
  return h(
    'div',
    {
      class: ['gantt', column !== null && 'gantt-stays'],
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
    column === null ? null : h('div', { class: 'gantt-stay', 'aria-hidden': 'true' }, column),
    lines,
  );
}
// the drawing of a frame: where a time is, in days from its first; a share of its width; the thin line from one time
// to another (not said); a lane of drawings
function drawing(t: Frame) {
  const days = daysOf(t.from, t.to).length;
  const at = (time: string) => daysInto(t.from, time);
  const share = (n: number) => `${(100 * n) / days}%`;
  const opens = at(`${t.festival.start_date}T00:00`),
    closes = at(`${addDays(t.festival.end_date, 1)}T00:00`);
  const thin = (from: number, to: number) =>
    to > from ? h('div', { class: 'gantt-none', style: { left: share(from), width: share(to - from) } }) : null;
  const lane = (...drawn: Kid[]) => h('div', { class: 'gantt-lane', 'aria-hidden': 'true' }, drawn);
  const bar = (b: { span: { from: number; to: number }; key: string; title?: string | null; kids: Kid[] }) =>
    h(
      'div',
      {
        class: 'gantt-bar',
        title: b.title ?? null,
        style: { left: share(b.span.from), width: share(b.span.to - b.span.from) },
      },
      // the highlighter's ink, under the times: its own swipe for the line and the festival
      h('span', {
        class: 'gantt-ink',
        style: swipe(`${b.key} ${t.seed}`, INK, { before: false, after: false }),
        'aria-hidden': 'true',
      }),
      b.kids,
    );
  return { at, share, opens, closes, thin, lane, bar };
}
// the start of a night's day, and the morning after a night: where nights begin and end on a bar
const evening = (night: string) => `${night}T00:00`;
const morning = (night: string) => `${addDays(night, 1)}T00:00`;

export function gantt<P>(
  t: Frame & {
    lines: readonly Line<P>[]; // as roster() makes them: named, by number, everyone else, those who have not said
    named: (u: Unit<P>) => Kid; // a unit's name, as the page shows it
  },
): HTMLElement {
  const d = drawing(t);
  const stays = t.lines.some((l) => stayText(l.buckets) !== null);
  const inBars: HTMLElement[] = [];
  // a lane: what was said, the bar, from the arrival (else the first known there) to the departure (else the last
  // known there); what was not, the thin line to the festival's edge
  const lane = (l: Line<P>, key: string, inBar: HTMLElement | null): HTMLElement => {
    const f = l.travel;
    if (f === null && l.nights === null) return d.lane(d.thin(d.opens, d.closes));
    const arrive = f?.arrive ?? null,
      leave = f?.leave ?? null;
    const first = arrive ?? (l.nights ? evening(l.nights.first) : (leave ?? '').slice(0, 10).concat('T00:00'));
    const latest = [arrive === null ? null : morning(arrive.slice(0, 10)), l.nights ? morning(l.nights.last) : null]
      .filter((x) => x !== null)
      .toSorted((a, b) => a.localeCompare(b))
      .at(-1);
    const span = { from: d.at(first), to: d.at(leave ?? latest ?? first) };
    const unsaid = [arrive === null && 'Arrival not said', leave === null && 'Departure not said'].filter(Boolean);
    return d.lane(
      arrive === null ? d.thin(d.opens, span.from) : null,
      d.bar({
        span,
        key,
        title: unsaid.length > 0 ? unsaid.join('; ') : null,
        kids: [end(arrive, f?.arrive_at ?? null), inBar, end(leave, f?.leave_from ?? null)],
      }),
      leave === null ? d.thin(span.to, d.closes) : null,
    );
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
    const text = stayText(l.buckets);
    const title = counted(l.buckets);
    const inBar = text === null ? null : h('span', { class: 'gantt-bar-stay', title }, text);
    if (inBar) inBars.push(inBar);
    const name = h(
      'div',
      { class: ['gantt-name', l.travel === null && l.nights === null && 'gantt-unsaid'] },
      opens === null ? names : opens.opener,
      text === null ? null : [' ', h('span', { class: 'gantt-stay-under', title }, text)],
    );
    return [
      name,
      lane(l, l.units.map((u) => u.name).join(', '), inBar),
      stays ? h('div', { class: 'gantt-stay', title, 'aria-hidden': 'true' }, text ?? '') : null,
      opens?.list,
    ];
  };
  const grid = frame(t, stays ? 'Staying' : null, t.lines.map(line));
  fitStays(grid, inBars);
  return grid;
}

// The roster by where they stay: a line a place, its name the line's and its people under it (three or fewer named,
// more called by number, named from a button), a bar over the nights anyone stays there, deeper over those everyone
// there does; those who said no place last, on the thin line across the festival's days.
export function ganttByPlace<P>(t: Frame & { places: readonly Place<P>[]; named: (u: Unit<P>) => Kid }): HTMLElement {
  const d = drawing(t);
  const line = (p: Place<P>, i: number): Kid[] => {
    const names = joined(p.units.map(t.named));
    const opens = p.called === null ? null : collective(`${t.describedBy}-names-${i}`, p.called, names);
    const nights = p.nights;
    const span = nights && { from: d.at(evening(nights.first)), to: d.at(morning(nights.last)) };
    const shared = p.shared && span && { from: d.at(evening(p.shared.first)), to: d.at(morning(p.shared.last)) };
    const deep =
      shared && span
        ? h('span', {
            class: 'gantt-shared',
            style: {
              left: `${(100 * (shared.from - span.from)) / (span.to - span.from)}%`,
              width: `${(100 * (shared.to - shared.from)) / (span.to - span.from)}%`,
            },
          })
        : null;
    return [
      h(
        'div',
        { class: ['gantt-name', p.place === null && 'gantt-unsaid'] },
        h('span', { class: 'gantt-place-name' }, p.place ?? 'No place said'),
        ' ',
        h('span', { class: 'gantt-place-who' }, opens === null ? names : opens.opener),
      ),
      span === null ? d.lane(d.thin(d.opens, d.closes)) : d.lane(d.bar({ span, key: `${p.place} ${i}`, kids: [deep] })),
      opens?.list,
    ];
  };
  return frame(t, null, t.places.map(line));
}
