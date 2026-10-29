// What the site says of a state, from site/states.ts (written from pipeline/states.py): its words, or one of its
// named forms, with their {names} filled; how it is drawn (an icon, a link); and the states of a point a view shows.
// A point, a state or a form is typed by the table, so one it doesn't have fails to compile; a key read from the
// database is parsed into its point's type where the row is read (rows.ts state).

import type { Kid } from './dom.ts';
import { type Counts, type Disposition, STATES, type StateRow } from './states.ts';

type Table = typeof STATES;
export type Point = keyof Table;
export type Key<P extends Point> = keyof Table[P] & string;
export type Form<P extends Point, K extends Key<P>> = Table[P][K] extends { forms: infer F } ? keyof F & string : never;
// the table as rows, for reading a state's fields whatever its point
const TABLE: Readonly<Record<Point, Readonly<Record<string, StateRow>>>> = STATES;

const row = <P extends Point>(point: P, key: Key<P>): StateRow => {
  const r = TABLE[point][key];
  if (!r) throw new Error(`${point} ${JSON.stringify(key)} is no state in pipeline/states.py`);
  return r;
};

// whether a text is one of the point's keys, for a value from outside (the database, the address)
export const isKey = <P extends Point>(point: P, value: string): value is Key<P> => Object.hasOwn(TABLE[point], value);

// the states of a point that have a named form, and whether one does
export type WithForm<P extends Point, F extends string> = { [K in Key<P>]: F extends Form<P, K> ? K : never }[Key<P>];
export const hasForm = <P extends Point, F extends string>(point: P, key: Key<P>, form: F): key is WithForm<P, F> =>
  Object.hasOwn(row(point, key).forms, form);

// the icon a state is drawn with, by its Lucide name (icons.ts draws it)
export const iconOf = <P extends Point>(point: P, key: Key<P>): string => {
  const name = row(point, key).icon;
  if (name === null) throw new Error(`${point} ${key}: no icon in pipeline/states.py`);
  return name;
};
// what a state's words link to (LINK.PAGE, LINK.PASSES), or null
export const linkOf = <P extends Point>(point: P, key: Key<P>): string | null => row(point, key).link;
// in table order, the states of a point with one of these dispositions
// the states of a point with one of these dispositions, by type as the generated table has them
export type KeysWhere<P extends Point, D extends Disposition> = {
  [K in Key<P>]: Table[P][K] extends { disposition: D } ? K : never;
}[Key<P>];
export const where = <P extends Point, D extends Disposition>(point: P, ...dispositions: D[]): KeysWhere<P, D>[] => {
  const shown: readonly Disposition[] = dispositions;
  return Object.keys(TABLE[point]).filter(
    (k): k is KeysWhere<P, D> => isKey(point, k) && shown.includes(row(point, k).disposition),
  );
};

// the states of a point counted at one of these levels (pipeline/states.py, Counts), by type and in table order
export type KeysCounted<P extends Point, C extends Counts> = {
  [K in Key<P>]: Table[P][K] extends { counts: C } ? K : never;
}[Key<P>];
export const counted = <P extends Point, C extends Counts>(point: P, ...levels: C[]): KeysCounted<P, C>[] => {
  const at: readonly (Counts | null)[] = levels;
  return Object.keys(TABLE[point]).filter(
    (k): k is KeysCounted<P, C> => isKey(point, k) && at.includes(row(point, k).counts),
  );
};

// a value's place in words, {name}: the words split around them, and one's name
const VALUES = /(?<value>\{\w+\})/u;
const VALUE = /^\{(?<name>\w+)\}$/u;
// the words, or the named form of them, as parts to append (the values may be elements); null when the state shows
// none
export function say<P extends Point, K extends Key<P>>(
  point: P,
  key: K,
  values: Readonly<Record<string, Kid>> = {},
  form?: Form<P, K>,
): Kid[] | null {
  const r = row(point, key);
  const forms: Readonly<Record<string, string>> = r.forms;
  if (form !== undefined && !Object.hasOwn(forms, form))
    throw new Error(`${point} ${key}: no form ${form} in pipeline/states.py`);
  const words = form === undefined ? r.wording : forms[form];
  if (words == null) return null;
  return words
    .split(VALUES)
    .filter(Boolean)
    .map((part) => {
      const name = VALUE.exec(part)?.groups?.['name'];
      if (name === undefined) return part;
      if (!Object.hasOwn(values, name))
        throw new Error(`${point} ${key}${form === undefined ? '' : ` (${form})`}: no value for {${name}}`);
      return values[name] ?? null;
    });
}
// what text gives: a form's words, or the state's own words, a string when the table has them for every state key
// may be, else possibly null
type Said<P extends Point, K extends Key<P>, F> =
  | (undefined extends F
      ? K extends Key<P>
        ? Table[P][K] extends { wording: string }
          ? string
          : null
        : never
      : never)
  | ([Exclude<F, undefined>] extends [never] ? never : string);
export const text = <P extends Point, K extends Key<P>, F extends Form<P, K> | undefined = undefined>(
  point: P,
  key: K,
  values?: Readonly<Record<string, Kid>>,
  form?: F,
): Said<P, K, F> =>
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: say gives the words exactly when the generated table has them, which Said reads
  (say(point, key, values, form)?.join('') ?? null) as Said<P, K, F>;
