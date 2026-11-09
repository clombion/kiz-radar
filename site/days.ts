// Days as YYYY-MM-DD strings, which compare as they sort.
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// the day of the week of a day, Sunday 0
const weekday = (iso: string): number => new Date(`${iso.slice(0, 10)}T12:00Z`).getUTCDay();
const FRIDAY = 5;
// a day's calendar week, Monday to Sunday
export function weekOf(iso: string): { from: string; to: string } {
  const from = addDays(iso, -((weekday(iso) + 6) % 7));
  return { from, to: addDays(from, 6) };
}
// a day's weekend, Friday to Sunday: the coming one from Monday to Thursday, the one under way from Friday to Sunday
export function weekendOf(iso: string): { from: string; to: string } {
  const d = weekday(iso);
  const from = addDays(iso, d === 0 ? -2 : FRIDAY - d);
  return { from, to: addDays(from, 2) };
}
// whether a festival's days meet days from one to another
export const meets = (
  e: { readonly start_date: string; readonly end_date: string },
  days: { from: string; to: string },
) => e.start_date <= days.to && e.end_date >= days.from;

// the visitor's own date, not the UTC one: past midnight where they are, it is the next day
export const today = (): string => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
