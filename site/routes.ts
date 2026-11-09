// Every link and URL the site builds goes through here, so a route has one spelling.
const FILE_NAME = /[^/]*$/u;
// a view's state for its address: empty, null, undefined and false leave a key out
export type Params = Readonly<Record<string, string | number | boolean | null | undefined>>;
// The choices every address keeps, whatever the page: the currency (?cur=, money.ts), in the query before any hash.
// The page's base holds them (siteRoot), so a hash link keeps them as it resolves; a path link (a community's page)
// adds them to its own query.
const SITEWIDE = ['cur'] as const;
export function sitewide(search: string): URLSearchParams {
  const asked = new URLSearchParams(search),
    kept = new URLSearchParams();
  for (const k of SITEWIDE) {
    const v = asked.get(k);
    if (v !== null) kept.set(k, v);
  }
  return kept;
}
const query = (params: Params = {}, keep = new URLSearchParams()): string => {
  const p = new URLSearchParams(keep);
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null && v !== false) p.set(k, String(v));
  return p.size > 0 ? `?${p}` : '';
};
// the site's root for a page, its base: the folder its base names (../../ on a community's page), the page's own file
// when it is that folder's (index.html), with the site-wide choices of its address
export function siteRoot(base: string, address: string): string {
  const at = new URL(address),
    root = new URL(base, at);
  if (root.pathname === at.pathname.replace(FILE_NAME, '')) root.pathname = at.pathname;
  root.search = `${sitewide(at.search)}`;
  root.hash = '';
  return root.href;
}
// the site-wide choices of the page's base, which a path link adds to its own
const baseChoices = (): URLSearchParams =>
  typeof document === 'undefined' ? new URLSearchParams() : sitewide(new URL(document.baseURI).search);
const hash = (path: string, params: Params = {}): string => `#${path}${query(params)}`;
export const festivalsHref = (params?: Params) => hash('finder', params);
export const mapHref = (params?: Params) => hash('map', params);
export const eventOnMapHref = (id: number, params?: Params) => hash(`map/event/${id}`, params);
// a city on the map, by its key (pipeline/cities.csv: munich-de), which no two cities share: map/city/<key>, encoded,
// so cityOf reads back the key cityOnMapHref wrote
export const cityOnMapHref = (key: string, params?: Params) => hash(`map/city/${encodeURIComponent(key)}`, params);
// the city key of an address's parts after map/city/, or null when they are no city's
export function cityOf(parts: readonly string[]): string | null {
  const [key, ...rest] = parts;
  if (key === undefined || key === '' || rest.length > 0) return null;
  try {
    return decodeURIComponent(key);
  } catch {
    return null; // a part that is no encoding of anything (a lone %)
  }
}
export const artistsHref = (params?: Params) => hash('artists', params);
export const artistHref = (id: number) => hash(`artists/${id}`);
export const friendsHref = (params?: Params) => hash('friends', params);
export const personHref = (key: string) => hash(`friends/${key}`);
// A community's page, which no tab links to (it is public all the same): a page of its own, c/<key>/ from the
// site's root (public/c/<key>/index.html, the site's page with the community's card for a shared link, made by
// pipeline/generate.py), its state in its query. Every page has its root as its base (<base>), so this one relative
// link is the same from any page; communityShareHref is it in full, the link its Share button gives.
export const communityHref = (key: string, params?: Params) =>
  `c/${encodeURIComponent(key)}/${query(params, baseChoices())}`;
export const communityShareHref = (key: string) => new URL(communityHref(key), document.baseURI).href;
export const countriesHref = (params?: Params) => hash('countries', params);
const weekHref = () => hash('week');
// the pages the footer links to, which no tab does
export const sqlHref = () => hash('sql');
export const sourcesHref = () => hash('sources');

// the views a tab or a swipe goes to, by name, and the tabs of the header
export type Section = 'finder' | 'friends' | 'week' | 'map' | 'artists' | 'countries';
export type Tab = 'finder' | 'friends' | 'explore';
// A view, drawn into root from the address: the parts after the view's name, the query string, a signal that aborts
// once another view shows, and the database loading.
export type Show = (
  root: HTMLElement,
  sub: readonly string[],
  qs: string,
  opts: { signal: AbortSignal; data: Promise<unknown> },
) => void;
// every view an address names: the sections, the SQL and sources pages the footer links to (index.html), and a
// community's page
export type Route = Section | 'sql' | 'sources' | 'community';
// the header's tabs (a view's nav names its tab), and the second row Explore opens; a swipe on a touch screen steps
// through the sections in this order: Festivals, Friends, then Explore's
export const EXPLORE: readonly (readonly [Section, string, string])[] = [
  ['week', 'This week', weekHref()],
  ['map', 'Map', mapHref()],
  ['artists', 'Artists', artistsHref()],
  ['countries', 'Countries', countriesHref()],
];
export const TABS: readonly (readonly [Tab, string, string])[] = [
  ['finder', 'Festivals', festivalsHref()],
  ['friends', 'Friends', friendsHref()],
  ['explore', 'Explore', weekHref()],
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
// What a page's address names, from the site's root (its base): a community's page by its path, c/<key>/, and every
// other view by its hash. An older link's #community/<key> names the community's page too, and moved is the address it
// has now, for the address bar.
// a part of an address decoded, or as it is when it decodes to nothing (a lone %): the view then finds nothing by it
const decoded = (part: string): string => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};
const COMMUNITY_PATH = /^c\/(?<key>[^/]+)\/(?:index\.html)?$/u;
export function routeOf(href: string, root: string): { name: string; sub: string[]; qs: string; moved: string | null } {
  const url = new URL(href),
    base = new URL(root).pathname.replace(FILE_NAME, '');
  const key = url.pathname.startsWith(base)
    ? COMMUNITY_PATH.exec(url.pathname.slice(base.length))?.groups?.['key']
    : undefined;
  if (key !== undefined) return { name: 'community', sub: [decoded(key)], qs: url.search.slice(1), moved: null };
  const { name, sub, qs } = parseRoute(url.hash);
  const [old] = sub;
  if (name === 'community' && old !== undefined && old !== '')
    return { name, sub: [old], qs, moved: communityHref(old, Object.fromEntries(new URLSearchParams(qs))) };
  return { name, sub, qs, moved: null };
}
// Go to a link the site built: from its root, so a hash link from a community's page goes to the root's view.
export const go = (href: string): void => location.assign(new URL(href, document.baseURI).href);

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
