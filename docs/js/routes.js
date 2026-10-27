// Every link and URL the site builds goes through here, so a route has one spelling.
const hash = (path, params = {}) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false));
  return '#' + path + (p.size ? '?' + p : '');
};
export const festivalsHref = params => hash('finder', params);
export const mapHref = params => hash('map', params);
export const eventOnMapHref = (id, params) => hash(`map/event/${id}`, params);
export const cityOnMapHref = (city, cc, params) => hash(`map/city/${cc}/${encodeURIComponent(city)}`, params);
export const artistsHref = params => hash('artists', params);
export const artistHref = id => hash(`artists/${id}`);
const friendsHref = () => hash('friends');
export const personHref = key => hash(`friends/${key}`);
export const countriesHref = params => hash('countries', params);
// the header's tabs (a view's nav names its tab), and the second row Explore opens; a swipe on a touch screen steps
// through the sections in this order: Festivals, Friends, then Explore's
export const EXPLORE = [['map', 'Map', mapHref()], ['artists', 'Artists', artistsHref()], ['countries', 'Countries', countriesHref()]];
export const TABS = [['finder', 'Festivals', festivalsHref()], ['friends', 'Friends', friendsHref()], ['explore', 'Explore', mapHref()]];
export const SECTIONS = [['finder', festivalsHref()], ['friends', friendsHref()], ...EXPLORE.map(([k, , href]) => [k, href])];
// a link to someone's plans from before Friends had its name (#people/<key>), as it is now
export const renamed = path => (path === 'people' || path.startsWith('people/') ? '#friends' + path.slice('people'.length) : null);

// Show a view's state in the address bar without adding a history entry.
export const showInAddressBar = href => history.replaceState(null, '', href);
