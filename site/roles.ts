// What an artist is booked as, in words: the roles their bookings count (artist_stats has a column for each), from
// pipeline/states.py through rows.ts BOOKED.
import { BOOKED, type Booked } from './rows.ts';
import { KEY } from './states.ts';
import { type Key, text, type WithForm } from './wording.ts';

// a role's name for one artist: "Teacher"
export const alone = (r: WithForm<'role', 'singular'>): string => text('role', r, {}, 'singular');

// an artist's kind and how many festivals they are booked at in each role
export type Booking = { readonly kind: Key<'artist_kind'> } & Readonly<Record<Booked, number>>;

// "Teaching couple", "Teacher & DJ", "DJ"; an artist booked in none is said by their kind
export function roleLabel(a: Booking): string {
  if (a.kind === KEY.artist_kind.COUPLE)
    return a.teacher || a.performer
      ? text('role', a.teacher ? KEY.role.TEACHER : KEY.role.PERFORMER, {}, 'pair')
      : text('artist_kind', a.kind, {}, 'singular');
  const roles = BOOKED.filter((r) => a[r] > 0).map(alone);
  return roles.length > 1
    ? roles.slice(0, 2).join(' & ')
    : (roles[0] ?? text('artist_kind', KEY.artist_kind.PERSON, {}, 'singular'));
}
