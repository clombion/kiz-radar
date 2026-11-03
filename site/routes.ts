// Every link and URL the site builds goes through here, so a route has one spelling.
// a view's state for its address: empty, null, undefined and false leave a key out
export type Params = Readonly<Record<string, string | number | boolean | null | undefined>>;
const hash = (path: string, params: Params = {}): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null && v !== false) p.set(k, String(v));
  return `#${path}${p.size > 0 ? `?${p}` : ''}`;
};
export const festivalsHref = (params?: Params) => hash('finder', params);
export const mapHref = (params?: Params) => hash('map', params);
export const eventOnMapHref = (id: number, params?: Params) => hash(`map/event/${id}`, params);
// a city on the map: its name and its country, null when the export has none. An address holds it as
// map/city/<country, or NO_COUNTRY>/<name>, each part encoded, so cityOf reads back the city cityOnMapHref wrote,
// whatever its name holds ('/' included)
export interface CityKey {
  readonly city: string;
  readonly cc: string | null;
}
const NO_COUNTRY = '-'; // no country code is a dash
export const cityOnMapHref = (k: CityKey, params?: Params) =>
  hash(`map/city/${encodeURIComponent(k.cc ?? NO_COUNTRY)}/${encodeURIComponent(k.city)}`, params);
// the city of an address's parts after map/city/, or null when they are no city's
export function cityOf(parts: readonly string[]): CityKey | null {
  const [cc, city, ...rest] = parts;
  if (cc === undefined || city === undefined || rest.length > 0) return null;
  try {
    return { cc: cc === NO_COUNTRY ? null : decodeURIComponent(cc), city: decodeURIComponent(city) };
  } catch {
    return null; // a part that is no encoding of anything (a lone %)
  }
}
export const artistsHref = (params?: Params) => hash('artists', params);
export const artistHref = (id: number) => hash(`artists/${id}`);
const friendsHref = () => hash('friends');
export const personHref = (key: string) => hash(`friends/${key}`);
// a community's page, which only its link reaches: nothing lists communities
export const communityHref = (key: string) => hash(`community/${key}`);
export const countriesHref = (params?: Params) => hash('countries', params);

// the views a tab or a swipe goes to, by name, and the tabs of the header
export type Section = 'finder' | 'friends' | 'map' | 'artists' | 'countries';
export type Tab = 'finder' | 'friends' | 'explore';
// A view, drawn into root from the address: the parts after the view's name, the query string, a signal that aborts
// once another view shows, and the database loading.
export type Show = (
  root: HTMLElement,
  sub: readonly string[],
  qs: string,
  opts: { signal: AbortSignal; data: Promise<unknown> },
) => void;
// every view an address names: the sections, the SQL page the footer links to (index.html), and a community's page
export type Route = Section | 'sql' | 'community';
// the header's tabs (a view's nav names its tab), and the second row Explore opens; a swipe on a touch screen steps
// through the sections in this order: Festivals, Friends, then Explore's
export const EXPLORE: readonly (readonly [Section, string, string])[] = [
  ['map', 'Map', mapHref()],
  ['artists', 'Artists', artistsHref()],
  ['countries', 'Countries', countriesHref()],
];
export const TABS: readonly (readonly [Tab, string, string])[] = [
  ['finder', 'Festivals', festivalsHref()],
  ['friends', 'Friends', friendsHref()],
  ['explore', 'Explore', mapHref()],
];
export const SECTIONS: readonly (readonly [Section, string])[] = [
  ['finder', festivalsHref()],
  ['friends', friendsHref()],
  ...EXPLORE.map(([k, , href]) => [k, href] as const),
];
// where a section name stands in SECTIONS, -1 for none
export const sectionAt = (name: string | null): number => SECTIONS.findIndex(([k]) => k === name);
// what an address (location.hash) names: its view, the parts after the view's name, and its query; an empty address
// is the festivals'
const HASH = /^#/u;
export function parseRoute(address: string): { name: string; sub: string[]; qs: string } {
  const [path = '', qs = ''] = (address.replace(HASH, '') || 'finder').split('?');
  const [name = '', ...sub] = path.split('/');
  return { name, sub, qs };
}

// Show a view's state in the address bar without adding a history entry.
export const showInAddressBar = (href: string): void => history.replaceState(null, '', href);

// A view's state in the URL. Each key keeps the type of its default; a value not in `allowed` keeps the default, and is
// named among the dropped (key=value), for the view to say so (leftOut); a key the defaults don't have is no state.
type Defaults = Readonly<Record<string, string | number>>;
export function readState<D extends Defaults>(
  qs: string,
  defaults: D,
  allowed: { readonly [K in keyof D]?: readonly D[K][] } = {},
): { state: { -readonly [K in keyof D]: D[K] }; dropped: string[] } {
  const s: Record<string, string | number> = { ...defaults };
  const dropped: string[] = [];
  for (const [k, v] of new URLSearchParams(qs)) {
    if (!Object.hasOwn(defaults, k)) continue; // not even an inherited one, such as constructor
    const d = defaults[k];
    const x = typeof d === 'number' ? Number(v) : v;
    const ok: readonly (string | number)[] | undefined = allowed[k];
    if (ok ? ok.includes(x) : typeof x !== 'number' || Number.isFinite(x)) s[k] = x;
    else dropped.push(`${k}=${v}`);
  }
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: s starts as the defaults and takes only values of their types
  return { state: s as { -readonly [K in keyof D]: D[K] }, dropped };
}
// The part of a state that differs from the defaults, for the URL.
export const changed = (s: Defaults, defaults: Defaults): Record<string, string | number> =>
  Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== defaults[k]));
