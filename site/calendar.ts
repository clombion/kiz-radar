// Days as a community's page lays them out: months of weeks from Monday, the hours of a trip, and who is away on each
// day. A member with a trip is away from the day they arrive to the day they leave; anyone else going, a member
// without one or someone the manager added, on the festival's own days, whatever weekdays those are.
import { addDays } from './days.ts';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DAY_MS = 86_400_000;
const noon = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T12:00Z`);
// Monday 0 to Sunday 6
export const weekday = (iso: string): number => (new Date(noon(iso)).getUTCDay() + 6) % 7;

// the days from start to end, both in
export function daysOf(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

const byText = (a: string, b: string): number => a.localeCompare(b); // days and months sort as text
// the month after a month, YYYY-MM
const nextMonth = (month: string): string => addDays(`${month}-28`, 7).slice(0, 7);

// the months the page shows: today's, and each one a day someone is away is in, from today's on, in order
export const monthsOf = (today: string, days: Iterable<string>): string[] => {
  const now = today.slice(0, 7);
  return [...new Set([now, ...[...days].map((d) => d.slice(0, 7)).filter((m) => m >= now)])].sort(byText);
};
// A page of many months shows the first FOLD of them, and a button the rest: the months shown at first, and the
// months the button shows
export const FOLD = 4;
export const folded = (months: readonly string[]): { shown: string[]; more: string[] } => ({
  shown: months.slice(0, FOLD),
  more: months.slice(FOLD),
});
// what the button that shows these months says of them: "March to September (5 months)", "September (1 month)", each
// with its year when they span two ("December 2026 to February 2027 (3 months)"); name gives a month's name
export function foldSaid(more: readonly string[], name: (month: string) => string): string {
  const [first = '', last = first] = [more[0], more.at(-1)];
  const years = first.slice(0, 4) !== last.slice(0, 4);
  const said = (m: string) => (years ? `${name(m)} ${m.slice(0, 4)}` : name(m));
  const n = `(${more.length} ${more.length === 1 ? 'month' : 'months'})`;
  return more.length === 1 ? `${said(first)} ${n}` : `${said(first)} to ${said(last)} ${n}`;
}
// the months after one and before another, neither of them
export function monthsBetween(after: string, before: string): string[] {
  const out: string[] = [];
  for (let m = nextMonth(after); m < before; m = nextMonth(m)) out.push(m);
  return out;
}
// a month's weeks, Monday first: each day as YYYY-MM-DD, null before its first day and after its last
export function weeksOf(month: string): (string | null)[][] {
  const days: (string | null)[] = Array.from({ length: weekday(`${month}-01`) }, () => null);
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) days.push(d);
  while (days.length % 7 > 0) days.push(null);
  return Array.from({ length: days.length / 7 }, (_, w) => days.slice(7 * w, 7 * w + 7));
}

// how far a local time (YYYY-MM-DDTHH:MM) is into the days from `from`, in days: 1.5 is noon of the day after
export const daysInto = (from: string, time: string): number =>
  Math.round((noon(time) - noon(from)) / DAY_MS) +
  (Number(time.slice(11, 13)) * 60 + Number(time.slice(14, 16))) / 1440;

// a day said from today: "today", "tomorrow", "this Friday" later in today's week; null for one further off, or past
export function relativeDay(today: string, day: string): string | null {
  const ahead = Math.round((noon(day) - noon(today)) / DAY_MS);
  if (ahead === 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return ahead > 1 && ahead < 7 - weekday(today) ? `this ${WEEKDAYS[weekday(day)]}` : null;
}

// the days someone is away for a festival: their trip's, from the day they arrive to the day they leave (local times,
// YYYY-MM-DDTHH:MM), or else the festival's
export const awayDays = (
  festival: { start_date: string; end_date: string },
  trip?: { arrive: string; leave: string },
): { from: string; to: string } =>
  trip === undefined
    ? { from: festival.start_date, to: festival.end_date }
    : { from: trip.arrive.slice(0, 10), to: trip.leave.slice(0, 10) };

// someone away from a day to a day; who is the one person they are, however many festivals they go to
export interface Away {
  who: string;
  from: string;
  to: string;
}
// a day: everyone away on it, and how many people they are
export interface Day<A extends Away> {
  aways: A[];
  people: number;
}
// each day someone is away, with who is: the one count the strip's shades and the sentence both read
export function presence<A extends Away>(aways: readonly A[]): Map<string, Day<A>> {
  const days = new Map<string, Day<A>>();
  for (const a of aways)
    for (const d of daysOf(a.from, a.to)) {
      const day = days.get(d) ?? { aways: [], people: 0 };
      if (!day.aways.some((b) => b.who === a.who)) day.people++;
      day.aways.push(a);
      days.set(d, day);
    }
  return days;
}

// The days most people are away at once: the first day as many are away as on any, and the days after it with as many;
// everyone away on them. undefined when no one is away.
export function busiest<A extends Away>(
  days: ReadonlyMap<string, Day<A>>,
): { from: string; to: string; people: number; aways: A[] } | undefined {
  const sorted = [...days.keys()].sort(byText);
  const most = Math.max(0, ...[...days.values()].map((d) => d.people));
  const from = sorted.find((d) => days.get(d)?.people === most);
  if (from === undefined || most === 0) return undefined;
  let to = from;
  while (days.get(addDays(to, 1))?.people === most) to = addDays(to, 1);
  const run = [...days].filter(([d]) => d >= from && d <= to);
  return { from, to, people: most, aways: run.flatMap(([, day]) => day.aways) };
}

// the days a festival's row covers: from the first of the community to arrive, or its start when that is sooner, to
// the last to leave, or its end when that is later
export function spanOf(
  festival: { start_date: string; end_date: string },
  trips: readonly { arrive: string; leave: string }[],
): { from: string; to: string } {
  const sooner = (x: string, y: string) => (byText(x, y) <= 0 ? x : y),
    later = (x: string, y: string) => (byText(x, y) >= 0 ? x : y);
  return {
    from: trips.reduce((d, t) => sooner(d, t.arrive.slice(0, 10)), festival.start_date),
    to: trips.reduce((d, t) => later(d, t.leave.slice(0, 10)), festival.end_date),
  };
}
