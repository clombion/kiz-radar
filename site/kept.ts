// What the review dashboard keeps in this browser: the admin's token, for the tab only unless its maker asks to keep
// it on this device; the day it expires, as they entered it (GitHub never tells a page); and the items settled since
// the build the page shows, so a reload keeps the progress until the next build lists what is left. Storage may be
// refused (a private window): then each lasts as long as the page. read and write are each such value's, the site's
// others too (updating.ts).
const TOKEN = 'kiz-radar-claims-token';
const EXPIRES = 'kiz-radar-claims-token-expires';
const SETTLED = 'kiz-radar-review-settled';

// what a refused storage would hold, for the page: each storage's own entries
const page = new Map<() => Storage, Map<string, string>>();
const held = (s: () => Storage): Map<string, string> => {
  const entries = page.get(s) ?? new Map<string, string>();
  page.set(s, entries);
  return entries;
};
export const read = (s: () => Storage, key: string): string | null => {
  try {
    return s().getItem(key);
  } catch {
    return held(s).get(key) ?? null;
  }
};
export const write = (s: () => Storage, key: string, value: string | null): void => {
  try {
    if (value === null) s().removeItem(key);
    else s().setItem(key, value);
  } catch {
    if (value === null) held(s).delete(key);
    else held(s).set(key, value);
  }
};
export const tab = () => sessionStorage;
const device = () => localStorage;

export const token = (): string | null => read(tab, TOKEN) ?? read(device, TOKEN);
export const remembered = (): boolean => read(device, TOKEN) !== null;
export function keepToken(t: string, onDevice: boolean): void {
  write(tab, TOKEN, onDevice ? null : t);
  write(device, TOKEN, onDevice ? t : null);
}
export function forgetToken(): void {
  write(tab, TOKEN, null);
  write(device, TOKEN, null);
  write(device, EXPIRES, null);
}

// the day the token expires (YYYY-MM-DD), not secret, so kept on the device
export const expires = (): string | null => read(device, EXPIRES);
export const keepExpires = (day: string | null): void => {
  write(device, EXPIRES, day);
};

// the items settled since the build the page shows (built_at), by their ids; another build starts over
export function settled(built: string): Set<string> {
  const v = read(device, SETTLED);
  const [at, ...ids] = v === null ? [] : v.split('\n');
  return new Set(at === built ? ids : []);
}
// an id settled already, written again ("already written"), is kept once
export function markSettled(built: string, id: string): void {
  const ids = settled(built);
  if (!ids.has(id)) write(device, SETTLED, [built, ...ids, id].join('\n'));
}
