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
export const countriesHref = params => hash('countries', params);
export const EXPLORE = [['map', 'Map', mapHref()], ['artists', 'Artists', artistsHref()], ['countries', 'Countries', countriesHref()]];

// Show a view's state in the address bar without adding a history entry.
export const showInAddressBar = href => history.replaceState(null, '', href);
