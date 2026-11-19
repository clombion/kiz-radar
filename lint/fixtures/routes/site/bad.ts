// What house/routes refuses outside routes.ts: a link spelled in a string or a template's text, starting with the hash
// of a route the site writes, a chunk after a template's value too; each route once.
declare const name: string;
export const finder = '#finder'; // refused
export const friends = `#friends/${name}`; // refused
export const week = '#week'; // refused
export const map = '#map?country=no'; // refused
export const artists = `#artists/${name}`; // refused
export const countries = '#countries'; // refused
export const sql = '#sql'; // refused
export const sources = `${name}#sources`; // refused
export const isFinder = (hash: string): boolean => hash === '#finder'; // refused
