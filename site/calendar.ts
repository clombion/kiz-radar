// Days as a calendar lays them out: months of weeks from Monday to Sunday, and the weekends people travel, each the
// Friday of the week a festival starts in, with how many go that weekend and the busiest of them.
import { addDays } from './days.ts';

// Monday 0 to Sunday 6
const weekday = (iso: string): number => (new Date(`${iso.slice(0, 10)}T12:00Z`).getUTCDay() + 6) % 7;
// the weekend a festival starting on this day is travelled on: the Friday of its Monday-to-Sunday week
export const weekendOf = (start: string): string => addDays(start, 4 - weekday(start));

// the months from the one `from` is in through the one `to` is in, at most `cap` of them, each YYYY-MM
export function monthsFrom(from: string, to: string, cap: number): string[] {
  const out: string[] = [];
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  while (out.length < cap) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (month > to.slice(0, 7)) break;
    out.push(month);
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return out;
}

// a month's weeks, Monday first: each day as YYYY-MM-DD, null before its first day and after its last
export function weeksOf(month: string): (string | null)[][] {
  const days: (string | null)[] = Array.from({ length: weekday(`${month}-01`) }, () => null);
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) days.push(d);
  while (days.length % 7 > 0) days.push(null);
  return Array.from({ length: days.length / 7 }, (_, w) => days.slice(7 * w, 7 * w + 7));
}

// the days from start to end, both in
export function daysOf(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

// a weekend people travel: its Friday, how many people go to its festivals, and the festivals
export interface Weekend<F> {
  friday: string;
  people: number;
  festivals: F[];
}
// the weekends of these trips, soonest first, each festival's people counted in the weekend it starts
export function weekends<F>(trips: readonly { festival: F; start: string; people: number }[]): Weekend<F>[] {
  const by = new Map<string, Weekend<F>>();
  for (const t of trips) {
    const friday = weekendOf(t.start);
    const w = by.get(friday) ?? { friday, people: 0, festivals: [] };
    w.people += t.people;
    w.festivals.push(t.festival);
    by.set(friday, w);
  }
  return [...by.values()].sort((a, b) => a.friday.localeCompare(b.friday));
}
// the weekend most people travel, the soonest of those that tie; undefined when there is none
export const busiest = <F>(ws: readonly Weekend<F>[]): Weekend<F> | undefined =>
  ws.reduce<Weekend<F> | undefined>((best, w) => (best === undefined || w.people > best.people ? w : best), undefined);
