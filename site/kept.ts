// What the review dashboard keeps in this browser: the admin's token, for the tab only unless its maker asks to keep
// it on this device; the day it expires, as they entered it (GitHub never tells a page); and the items settled since
// the build the page shows, so a reload keeps the progress until the next build lists what is left. Storage may refuse
// a value (a private window, a full quota): then the value lasts as long as the page, until a write of its key is
// kept. read and write are each such value's, the site's others too (hints.ts, updating.ts).
const TOKEN = 'kiz-radar-claims-token';
const EXPIRES = 'kiz-radar-claims-token-expires';
const SETTLED = 'kiz-radar-review-settled';

// what a storage refused to keep, for the page: each storage's own entries (null: removed), each until the storage
// keeps a write of its key again, read before what the storage holds
const page = new Map<() => Storage, Map<string, string | null>>();
const held = (s: () => Storage): Map<string, string | null> => {
  const entries = page.get(s) ?? new Map<string, string | null>();
  page.set(s, entries);
  return entries;
};
export const read = (s: () => Storage, key: string): string | null => {
  const entries = held(s);
  if (entries.has(key)) return entries.get(key) ?? null;
  try {
    return s().getItem(key);
  } catch {
    return null;
  }
};
// true when the storage kept the write (a value, or its removal), false when it refused it: then held for the page
export const write = (s: () => Storage, key: string, value: string | null): boolean => {
  try {
    if (value === null) s().removeItem(key);
    else s().setItem(key, value);
  } catch {
    held(s).set(key, value);
    return false;
  }
  held(s).delete(key);
  return true;
};
export const tab = () => sessionStorage;
export const device = () => localStorage;

export const token = (): string | null => read(tab, TOKEN) ?? read(device, TOKEN);
export const remembered = (): boolean => read(device, TOKEN) !== null;
// on the device when asked and it keeps it; else for the tab, the device keeping none (so remembered() is false)
export function keepToken(t: string, onDevice: boolean): void {
  const kept = onDevice && write(device, TOKEN, t);
  write(tab, TOKEN, kept ? null : t);
  if (!kept) write(device, TOKEN, null);
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
