// Days as YYYY-MM-DD strings, which compare as they sort.
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// the visitor's own date, not the UTC one: past midnight where they are, it is the next day
export const today = (): string => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
