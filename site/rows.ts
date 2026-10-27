// The database's rows as the site reads them. A shape names each column a query returns and how to read it; q()
// reads every row by its shape and fails on a column it doesn't have or a value of another type, so a row's type is
// its shape's and nothing past this module meets an unread value.
import type { SqlValue } from 'sql.js';
import { isKey, type Key, type Point } from './wording.ts';

export type Column<T> = (value: SqlValue | undefined, name: string) => T;
export type Shape = Readonly<Record<string, Column<unknown>>>;
export type RowOf<S extends Shape> = { -readonly [K in keyof S]: ReturnType<S[K]> };

const wrong = (name: string, value: unknown, what: string): never => {
  throw new TypeError(`column ${name}: ${JSON.stringify(value)} is no ${what}`);
};
export const str: Column<string> = (v, name) => (typeof v === 'string' ? v : wrong(name, v, 'text'));
export const num: Column<number> = (v, name) => (typeof v === 'number' ? v : wrong(name, v, 'number'));
// a 0/1 column (SQLite has no booleans)
export const flag: Column<boolean> = (v, name) => (v === 0 || v === 1 ? v === 1 : wrong(name, v, 'flag'));
// a column that may be null
export const opt =
  <T>(col: Column<T>): Column<T | null> =>
  (v, name) =>
    v === null ? null : col(v, name);
// a column holding one of a point's states (pipeline/states.py)
export const state =
  <P extends Point>(point: P): Column<Key<P>> =>
  (v, name) =>
    typeof v === 'string' && isKey(point, v) ? v : wrong(name, v, `${point} state`);
// a comma-separated list of a point's states, empty when null
const states =
  <P extends Point>(point: P): Column<Key<P>[]> =>
  (v, name) =>
    v === null
      ? []
      : str(v, name)
          .split(',')
          .filter(Boolean)
          .map((k) => state(point)(k, name));

export const read = <S extends Shape>(shape: S, row: Readonly<Record<string, SqlValue>>): RowOf<S> => {
  const out: Record<string, unknown> = {};
  for (const [name, col] of Object.entries(shape)) {
    if (!Object.hasOwn(row, name)) throw new TypeError(`no column ${name} in the row`);
    out[name] = col(row[name], name);
  }
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: every column of the shape was read into out, by its own reader
  return out as RowOf<S>;
};

// ----- shapes of the tables and views more than one query reads -----

// a festival as event_rows has it (pipeline/build_site_db.py)
export const EVENT = {
  id: num,
  title: str,
  url: str,
  start_date: str,
  end_date: str,
  city: opt(str),
  country_code: opt(str),
  lat: opt(num),
  lon: opt(num),
  airport: opt(str),
  airport_km: opt(num),
  airport_city: opt(str),
  weekend_friday: opt(str),
  cancelled: opt(flag),
  venue: opt(str),
  lineup: opt(num),
  popular_artists: opt(num),
  kiz_only: opt(flag),
  taxi_dancers: opt(flag),
  all_in_one: opt(flag),
  genres: states('genre'),
  features: states('feature'),
  upcoming: flag,
  price_state: state('price'),
  ticket_page: opt(str),
  card_pass: opt(num),
} as const satisfies Shape;
export type EventRow = RowOf<typeof EVENT>;

export const PASS = {
  event_id: num,
  pass_no: num,
  kind: state('pass_kind'),
  style: opt(state('style')),
  label: opt(str),
  group_size: opt(num),
  people: state('people'),
  days: opt(num),
  includes_hotel: flag,
} as const satisfies Shape;

export const TIER = {
  event_id: num,
  pass_no: num,
  tier_no: num,
  amount: num,
  currency: str,
  fee: opt(num),
  valid_from: opt(str),
  valid_until: opt(str),
  door: flag,
  sold_out: flag,
} as const satisfies Shape;
export type TierRow = RowOf<typeof TIER>;

export const ARTIST_STATS = {
  artist_id: num,
  bookings: num,
  teacher: num,
  dj: num,
  performer: num,
  first_date: opt(str),
  last_date: opt(str),
  home_country: opt(str),
  home_basis: opt(state('home_basis')),
  booked_most_in: opt(str),
  countries: num,
  abroad_bookings: num,
  popular: flag,
  couple_bookings: num,
} as const satisfies Shape;
