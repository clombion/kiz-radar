// What waits for a review, as review.json holds it (pipeline/review.py, Review): read by its shape, so the page meets
// only values the build wrote.
import { int, list, nullable, record, text } from './json.ts';
import { plural } from './wording.ts';

// one key of a pair, as its mentions show it
const SIDE = record({
  key: text,
  name: text,
  festivals: int,
  roles: list(text),
  stated: list(text),
  booked_in: list(text),
  written: list(text),
});
const REVIEW = record({
  built_at: text,
  repository: text,
  countries: list(record({ code: text, name: text })),
  homes: list(
    record({
      artist_id: int,
      key: text,
      name: text,
      kind: text,
      bookings: int,
      basis: nullable(text),
      stated: list(record({ code: text, festivals: int, events: list(text) })),
      booked_in: list(text),
    }),
  ),
  merges: list(record({ a: SIDE, b: SIDE, shared: int, rationale: text })),
  artists: list(record({ key: text, name: text, kind: text, bookings: int, latest: list(text) })),
  festivals: list(
    record({
      event_id: int,
      event: text,
      start: text,
      waits_for: text,
      first_read: text,
      page: nullable(text),
      to_do: text,
    }),
  ),
  cities: list(
    record({
      key: text,
      name: text,
      country_code: text,
      festivals: int,
      events: list(text),
      proposal: nullable(record({ tier: text, gateways: list(text), note: text })),
    }),
  ),
  orphaned: list(record({ id: text, claim: text })),
  steps: list(record({ step: text, description: text, performed_at: text, performed_by: text })),
  reads: list(record({ at: text, event_id: int, event: text, status: text })),
});
export type Review = ReturnType<typeof REVIEW>;
export const reviewOf = (v: unknown): Review => REVIEW(v, 'data/review.json');

export type Merge = Review['merges'][number];
export type Home = Review['homes'][number];
export type Side = Merge['a'];
export type Booked = Review['artists'][number];

// why two artists can't be joined by a merge, or null when they can: one is the other, or they are of two kinds (a
// couple is two people, a group several, so neither is one person)
export function unjoinable(a: Booked, b: Booked) {
  if (a.key === b.key) return 'They are one artist already.';
  if (a.kind !== b.kind) return `A ${a.kind} and a ${b.kind} are not one artist.`;
  return null;
}

// the rows a pair is compared by: what the merge review weighed, side by side, and whether sides that share nothing
// there weigh on it (two names are always written differently)
export const COMPARED: readonly (readonly [string, (s: Side) => readonly string[], boolean])[] = [
  ['Line-ups state', (s) => s.stated, true],
  ['Booked in', (s) => s.booked_in, true],
  ['Roles', (s) => s.roles, true],
  ['Written as', (s) => s.written, false],
];
export const differs = (a: readonly string[], b: readonly string[]): boolean =>
  a.length > 0 && b.length > 0 && !a.some((x) => b.includes(x));

// an item's id among those settled (kept.ts): what its claim is about
export const mergeId = (m: Merge): string => `merge ${m.a.key} ${m.b.key}`;
export const homeId = (a: Home): string => `home ${a.key}`;

// the note a choice starts with, for its maker to keep or say better
export const mergeNote = (m: Merge, one: boolean): string =>
  `${m.a.name} / ${m.b.name}: ${one ? 'one artist' : 'two artists'}`;
export function homeNote(a: Home, code: string, name: string): string {
  const said = a.stated.find((s) => s.code === code);
  const festivals = said === undefined ? 0 : said.festivals;
  return said === undefined
    ? `${a.name}: from ${name}`
    : `${a.name}: from ${name}, as ${plural(festivals, 'line-up states', 'line-ups state')}`;
}

// the whole days from today to the day a token expires (negative once it has), both read as UTC days
export function daysLeft(expires: string, today: Date): number {
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((Date.parse(`${expires}T00:00:00Z`) - day) / 86_400_000);
}

// the next item after at not settled, going round; at itself when every other is settled
export function nextOpen(ids: readonly string[], at: number, done: ReadonlySet<string>): number {
  for (let step = 1; step <= ids.length; step++) {
    const i = (at + step) % ids.length;
    if (!done.has(ids[i] ?? '')) return i;
  }
  return at;
}
