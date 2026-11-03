// Days as a community's strip lays them out: weeks from Monday, one column each, and who is away on each day. A
// member with a trip is away from the day they arrive to the day they leave; anyone else going, a member without one
// or someone the manager added, on the festival's own days, whatever weekdays those are.
import { addDays } from './days.ts';

// Monday 0 to Sunday 6
export const weekday = (iso: string): number => (new Date(`${iso.slice(0, 10)}T12:00Z`).getUTCDay() + 6) % 7;

// the days from start to end, both in
export function daysOf(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

// the weeks from the one `from` is in through the one `to` is in, at most `cap`, each its seven days from Monday
export function weeksFrom(from: string, to: string, cap: number): string[][] {
  const out: string[][] = [];
  for (let monday = addDays(from, -weekday(from)); monday <= to && out.length < cap; monday = addDays(monday, 7))
    out.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  return out;
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
  const sorted = [...days.keys()].sort((a, b) => a.localeCompare(b));
  const most = Math.max(0, ...[...days.values()].map((d) => d.people));
  const from = sorted.find((d) => days.get(d)?.people === most);
  if (from === undefined || most === 0) return undefined;
  let to = from;
  while (days.get(addDays(to, 1))?.people === most) to = addDays(to, 1);
  return { from, to, people: most, aways: daysOf(from, to).flatMap((d) => days.get(d)?.aways ?? []) };
}

// a day's shade: 0 when no one is away, else 1 to 3, by thirds of the most away on any day
export const shade = (people: number, most: number): 0 | 1 | 2 | 3 =>
  people === 0 ? 0 : people * 3 <= most ? 1 : people * 3 <= most * 2 ? 2 : 3;
