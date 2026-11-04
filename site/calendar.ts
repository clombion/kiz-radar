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
// a month n months after another (before, when n is negative), YYYY-MM
const plusMonths = (month: string, n: number): string => {
  const at = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}`;
};
const monthsApart = (from: string, to: string): number =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

// A community's calendar shows a trimester at a time: three months from today's, then the three after, and so on
// (November to January, February to April, …), each named by its first month, YYYY-MM.
const TRIMESTER = 3;
// the trimester a day or a month is in, today's for one before it
export const trimesterOf = (today: string, day: string): string => {
  const now = today.slice(0, 7);
  return plusMonths(now, TRIMESTER * Math.max(0, Math.floor(monthsApart(now, day.slice(0, 7)) / TRIMESTER)));
};
// a trimester's months
export const monthsIn = (first: string): string[] => Array.from({ length: TRIMESTER }, (_, i) => plusMonths(first, i));
// the trimesters the calendar steps through: today's, to the one the last day anyone is away is in
export function trimesters(today: string, last: string | undefined): string[] {
  const to = trimesterOf(today, last ?? today);
  const out = [trimesterOf(today, today)];
  while ((out.at(-1) ?? to) < to) out.push(plusMonths(out.at(-1) ?? to, TRIMESTER));
  return out;
}
// whether someone away from a day to a day is away on any day of a trimester
export const inTrimester = (first: string, away: { from: string; to: string }): boolean =>
  away.from < `${plusMonths(first, TRIMESTER)}-01` && away.to >= `${first}-01`;
// a trimester by its months' names (name gives "Nov"): "Nov 2026 – Jan 2027" across two years, else "Feb – Apr 2027";
// short, "Feb–Apr"
export function trimesterSaid(first: string, name: (month: string) => string, short = false): string {
  const last = plusMonths(first, TRIMESTER - 1);
  if (short) return `${name(first)}–${name(last)}`;
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${name(first)} – ${name(last)} ${last.slice(0, 4)}`
    : `${name(first)} ${first.slice(0, 4)} – ${name(last)} ${last.slice(0, 4)}`;
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
