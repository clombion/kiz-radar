// What house/routes refuses outside routes.ts: a link spelled in a string or a template's text, starting with a route's
// hash, a chunk after a template's value too.
declare const name: string;
export const finder = '#finder'; // refused
export const map = '#map?country=no'; // refused
export const artist = `#artist/${name}`; // refused
export const sources = `${name}#sources`; // refused
export const isPeople = (hash: string): boolean => hash === '#people'; // refused
