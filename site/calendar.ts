// Days as a community's page lays them out: months of weeks from Monday, the hours of a trip, and who is away on each
// day. A member with a trip is away from the day they arrive to the day they leave; anyone else going, a member
// without one or someone the manager added, on the festival's own days, whatever weekdays those are.
import { addDays } from './days.ts';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DAY_MS = 86_400_000;
const noon = (day: string): number => Date.parse(`${day}T12:00Z`);
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

// A community's calendar shows four months at a time, a period: four months from today's, then the four after, and so
// on (November to February, March to June, July to October: three make a year), each named by its first month, YYYY-MM.
const PERIOD = 4;
// the period a day or a month is in, today's for one before it
export const periodOf = (today: string, day: string): string => {
  const now = today.slice(0, 7);
  return plusMonths(now, PERIOD * Math.max(0, Math.floor(monthsApart(now, day.slice(0, 7)) / PERIOD)));
};
// a period's months
export const monthsIn = (first: string): string[] => Array.from({ length: PERIOD }, (_, i) => plusMonths(first, i));
// the periods the calendar steps through: today's, to the one the last day anyone is away is in
export function periods(today: string, last: string | undefined): string[] {
  const to = periodOf(today, last ?? today);
  const out = [periodOf(today, today)];
  while ((out.at(-1) ?? to) < to) out.push(plusMonths(out.at(-1) ?? to, PERIOD));
  return out;
}
// whether someone away from a day to a day is away on any day of a period
export const inPeriod = (first: string, away: { from: string; to: string }): boolean =>
  away.from < `${plusMonths(first, PERIOD)}-01` && away.to >= `${first}-01`;
// a period by its months' names (name gives "Nov"): "Nov 2026 – Feb 2027" across two years, else "Mar – Jun 2027";
// short, "Mar–Jun"
export function periodSaid(first: string, name: (month: string) => string, short = false): string {
  const last = plusMonths(first, PERIOD - 1);
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

// how far a moment is into the days from `from`, in days: 1.5 is noon of the day after; a moment whose time is not
// said is at the start of its day, or at its end when it ends something (a departure drawn to the end of its day)
export const daysInto = (from: string, at: Moment, edge: 'start' | 'end' = 'start'): number => {
  const days = Math.round((noon(at.day) - noon(from)) / DAY_MS);
  if (at.time === null) return days + (edge === 'end' ? 1 : 0);
  return days + (Number(at.time.slice(0, 2)) * 60 + Number(at.time.slice(3, 5))) / 1440;
};

// a day said from today: "today", "tomorrow", "this Friday" later in today's week; null for one further off, or past
export function relativeDay(today: string, day: string): string | null {
  const ahead = Math.round((noon(day) - noon(today)) / DAY_MS);
  if (ahead === 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return ahead > 1 && ahead < 7 - weekday(today) ? `this ${WEEKDAYS[weekday(day)]}` : null;
}

// A moment of a travel (arrive, leave), as the site database holds it: its day, and its time ("HH:MM") when said. The
// database writes YYYY-MM-DD or YYYY-MM-DDTHH:MM (records.Moment); this is the one place that reads which.
export interface Moment {
  day: string;
  time: string | null;
}
export const moment = (text: string | null): Moment | null =>
  text === null ? null : { day: text.slice(0, 10), time: text.length > 10 ? text.slice(11, 16) : null };

// what someone said of how they go to a festival: when they arrive and leave, each when said, and the nights they
// stay, from the first to the last (by their evenings' dates), when said
export interface Said {
  arrive: string | null;
  leave: string | null;
  nights: { first: string; last: string } | null;
}
// The days someone is away for a festival, the one rule the calendar and a trip's chart both read: from the day they
// arrive, or else the festival's first day or their first night, whichever is sooner; to the day they leave, or else
// the festival's last day or the morning after their last night, whichever is later.
export const awayDays = (
  festival: { start_date: string; end_date: string },
  said?: Said,
): { from: string; to: string } => {
  const first = said?.nights?.first,
    after = said?.nights ? addDays(said.nights.last, 1) : undefined;
  return {
    from:
      moment(said?.arrive ?? null)?.day ??
      (first !== undefined && first < festival.start_date ? first : festival.start_date),
    to:
      moment(said?.leave ?? null)?.day ??
      (after !== undefined && after > festival.end_date ? after : festival.end_date),
  };
};

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
  aways: readonly { from: string; to: string }[],
): { from: string; to: string } {
  const sooner = (x: string, y: string) => (byText(x, y) <= 0 ? x : y),
    later = (x: string, y: string) => (byText(x, y) >= 0 ? x : y);
  return {
    from: aways.reduce((d, a) => sooner(d, a.from), festival.start_date),
    to: aways.reduce((d, a) => later(d, a.to), festival.end_date),
  };
}
