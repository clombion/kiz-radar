// What the site says of a state, from docs/js/states.js (written from pipeline/states.py): its words, or one of its
// named forms, with their {names} filled; how it is drawn (an icon, a link); and the states of a point a view shows.
// A state, a form or a point the table doesn't have fails where it is asked for.
import { STATES } from './states.js';

const row = (point, key) => {
  const r = STATES[point]?.[key];
  if (!r) throw new Error(`${point} ${JSON.stringify(key)} is no state in pipeline/states.py`);
  return r;
};
// the icon a state is drawn with, by its Lucide name (icons.js draws it)
export const iconOf = (point, key) => {
  const name = row(point, key).icon;
  if (!name) throw new Error(`${point} ${key}: no icon in pipeline/states.py`);
  return name;
};
// what a state's words link to (LINK.PAGE, LINK.PASSES), or null
export const linkOf = (point, key) => row(point, key).link;
// in table order, the states of a point with one of these dispositions
export const where = (point, ...dispositions) => {
  if (!STATES[point]) throw new Error(`${point} is no point the site has in pipeline/states.py`);
  return Object.keys(STATES[point]).filter(k => dispositions.includes(STATES[point][k].disposition));
};

// the words, or the named form of them, as parts to append (the values may be elements); null when the state shows
// none
export function say(point, key, values = {}, form = null) {
  const r = row(point, key);
  if (form && !(form in r.forms)) throw new Error(`${point} ${key}: no form ${form} in pipeline/states.py`);
  const words = form ? r.forms[form] : r.wording;
  if (words == null) return null;
  return words.split(/(\{\w+\})/).filter(Boolean).map(part => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    if (!name) return part;
    if (!(name in values)) throw new Error(`${point} ${key}${form ? ` (${form})` : ''}: no value for {${name}}`);
    return values[name];
  });
}
export const text = (point, key, values, form) => say(point, key, values, form)?.join('') ?? null;
