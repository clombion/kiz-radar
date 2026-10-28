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
export const cityOnMapHref = (city: string, cc: string, params?: Params) =>
  hash(`map/city/${cc}/${encodeURIComponent(city)}`, params);
export const artistsHref = (params?: Params) => hash('artists', params);
export const artistHref = (id: number) => hash(`artists/${id}`);
const friendsHref = () => hash('friends');
export const personHref = (key: string) => hash(`friends/${key}`);
export const countriesHref = (params?: Params) => hash('countries', params);

// the views a tab or a swipe goes to, by name, and the tabs of the header
export type Section = 'finder' | 'friends' | 'map' | 'artists' | 'countries';
export type Tab = 'finder' | 'friends' | 'explore';
// every view an address names: the sections, and the SQL page the footer links to (index.html)
export type Route = Section | 'sql';
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
// a link to someone's plans from before Friends had its name (#people/<key>), as it is now
export const renamed = (path: string): string | null =>
  path === 'people' || path.startsWith('people/') ? `#friends${path.slice('people'.length)}` : null;

// Show a view's state in the address bar without adding a history entry.
export const showInAddressBar = (href: string): void => history.replaceState(null, '', href);
