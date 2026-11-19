// The intended way: { type: 'json' }, with other attributes or not; a type's import, which is erased and takes no
// attribute, an import(), and a module whose name only holds the letters are not read.
import data from './data.json' with { type: 'json' };
import more from './data.json' with { type: 'json', other: 'x' };
import type Shape from './data.json';
import raw from './data.json?raw';
import config from './data.jsonc';

export * from './data.json' with { type: 'json' };
export type { Rows } from './data.json';
export const later = import('./data.json');
export { config, data, more, raw };
export type { Shape };
