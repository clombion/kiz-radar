// What the festival list can be narrowed by, and the festivals its choices keep: the dances and highlights a search
// or a checkbox picks, and the choices of the Festivals page. Pure: the day and the price limit are arguments.
import type { Step } from './currency.ts';
import { addDays } from './days.ts';
import type { Kid } from './dom.ts';
import { flightEur } from './fares.ts';
import type { Festival } from './festivals.ts';
import { MORE_TRAITS, TRAITS } from './icons.ts';
import { changed, readState } from './routes.ts';
import { KEY } from './states.ts';
import { type Key, text, where } from './wording.ts';

// the genres a card names, in the order pipeline/states.py lists them
export const DANCES = where('genre', 'card');
const DANCE_KEYS: ReadonlySet<string> = new Set(DANCES);
export const isDance = (k: string): k is Key<'genre'> => DANCE_KEYS.has(k);

// What "with" in the Festivals URL can name: a dance or a highlight, by key. Kizomba is on nearly every festival here,
// so it narrows nothing; taxi dancers and the all-in-one hotel have checkboxes of their own.
export type With = Key<'genre'> | Key<'feature'>;
export const WITH = new Map<With, string>([
  ...DANCES.filter((k) => k !== KEY.genre.KIZOMBA).map((k): [With, string] => [k, text('genre', k)]),
  ...[...TRAITS, ...MORE_TRAITS]
    .filter(([k]) => k !== KEY.feature.TAXI_DANCERS)
    .map(([k, words]): [With, string] => [k, words]),
]);
const WITH_KEYS: ReadonlySet<string> = new Set(WITH.keys());
export const isWith = (k: string): k is With => WITH_KEYS.has(k);
// how a with filter reads: "Also with Salsa" for a dance (the festivals are Kizomba ones anyway), "With Pool party"
export const withPhrase = (key: With): Kid[] => [isDance(key) ? 'Also with ' : 'With ', WITH.get(key)];
export const hasWith = (e: Pick<Festival, 'styles' | 'features'>, key: With): boolean =>
  isDance(key) ? e.styles.has(key) : e.features.has(key);
// the highlights the festival list has a checkbox for, as [its address parameter, the feature, whether a festival has
// it]
export const CHECKED = [
  ['taxi', KEY.feature.TAXI_DANCERS, (e: Festival) => e.features.has(KEY.feature.TAXI_DANCERS)],
  ['allin', KEY.feature.ALL_IN_ONE, (e: Festival) => e.features.has(KEY.feature.ALL_IN_ONE)],
] as const;
export type Checked = (typeof CHECKED)[number][0];

// a festival on today: between its first and its last day, on the day the site is seen from
export const isOn = (e: Pick<Festival, 'phase'>): boolean => e.phase === KEY.phase.ON;

// reach is the step the trip (the full pass and a Fri→Mon return flight) is within, cheap or fair, or '' for any
// price; unchecked keeps the festivals whose trip is not known within it. with is a dance or highlight picked in the
// search; friends keeps the festivals that featured people said they're going to; onnow those on today.
export type Sort = 'date' | 'fare';
export type Choices = {
  months: number;
  reach: '' | Step;
  country: string;
  with: string;
  friends: number;
  onnow: number;
  lineup: number;
  unchecked: number;
  sort: Sort;
} & Record<Checked, number>;

// what the list starts from, and what its address leaves out
export const DEFAULTS: Readonly<Choices> = {
  months: 6,
  reach: 'cheap',
  country: '',
  with: '',
  friends: 0,
  onnow: 0,
  taxi: 0,
  allin: 0,
  lineup: 0,
  unchecked: 0,
  sort: 'date',
};
// the values each choice the page offers can take; a flag is 0 or 1, a country one the site lists
export const VALUES = {
  months: [1, 2, 3, 6, 12],
  reach: ['', 'fair', 'cheap'],
  lineup: [0, 10, 20],
  sort: ['date', 'fare'],
} as const satisfies { [K in keyof Choices]?: readonly Choices[K][] };
const FLAGS = [0, 1];
export function allowedChoices(countries: readonly string[]): { [K in keyof Choices]?: readonly Choices[K][] } {
  return {
    ...VALUES,
    country: ['', ...countries],
    with: ['', ...WITH.keys()],
    friends: FLAGS,
    onnow: FLAGS,
    unchecked: FLAGS,
    ...Object.fromEntries(CHECKED.map(([k]) => [k, FLAGS])),
  };
}
// Any price is '' on the page but "any" in the address, which leaves an empty value out: an empty reach would read as
// the default, a cheap price. An older link's "reach=" still reads as any price.
const ANY = 'any';
export const choicesAddress = (s: Readonly<Choices>): Record<string, string | number> => {
  const c = changed(s, DEFAULTS);
  return c['reach'] === '' ? { ...c, reach: ANY } : c;
};
export function readChoices(qs: string, countries: readonly string[]): { state: Choices; dropped: string[] } {
  const p = new URLSearchParams(qs);
  if (p.get('reach') === ANY) p.set('reach', '');
  return readState(p.toString(), DEFAULTS, allowedChoices(countries));
}

// the festivals the choices keep, seen from a day, in the order chosen; max is the trip's limit in the visitor's
// currency (reach's step), null for any price
export function matches(all: readonly Festival[], s: Readonly<Choices>, day: string, max: number | null): Festival[] {
  const end = addDays(day, Math.round(s.months * 30.4));
  return all
    .filter(
      (e): e is Festival & { depart: string } =>
        e.depart !== null &&
        e.depart <= end &&
        // with a price limit: the trip within it; sold out never; an unknown trip only when asked for
        (max === null ||
          (e.price.point === 'card_price' && e.price.key === KEY.card_price.SOLD_OUT
            ? false
            : e.trip == null
              ? Boolean(s.unchecked)
              : e.trip <= max)) &&
        (!s.country || e.country_code === s.country) &&
        (!s.with || (isWith(s.with) && hasWith(e, s.with))) &&
        (!s.friends || e.goers.some((g) => g.featured)) &&
        (!s.onnow || isOn(e)) &&
        CHECKED.every(([k, , has]) => !s[k] || has(e)) &&
        e.lineup >= s.lineup,
    )
    .sort(
      s.sort === 'fare'
        ? (a, b) =>
            (a.trip ?? 1e9) - (b.trip ?? 1e9) ||
            (flightEur(a.fare) ?? 1e9) - (flightEur(b.fare) ?? 1e9) ||
            a.depart.localeCompare(b.depart)
        : (a, b) => a.depart.localeCompare(b.depart),
    );
}
