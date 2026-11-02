// What the review dashboard keeps in this browser: the admin's token, for the tab only unless its maker asks to keep
// it on this device; the day it expires, as they entered it (GitHub never tells a page); and the items settled since
// the build the page shows, so a reload keeps the progress until the next build lists what is left. Storage may be
// refused (a private window): then each lasts as long as the page.
const TOKEN = 'kiz-radar-claims-token';
const EXPIRES = 'kiz-radar-claims-token-expires';
const SETTLED = 'kiz-radar-review-settled';

const read = (s: () => Storage, key: string): string | null => {
  try {
    return s().getItem(key);
  } catch {
    return null;
  }
};
const write = (s: () => Storage, key: string, value: string | null): void => {
  try {
    if (value === null) s().removeItem(key);
    else s().setItem(key, value);
  } catch {
    // refused: kept for the page only
  }
};
const tab = () => sessionStorage;
const device = () => localStorage;

let held: string | null = null; // the token when storage refuses it
export const token = (): string | null => read(tab, TOKEN) ?? read(device, TOKEN) ?? held;
export const remembered = (): boolean => read(device, TOKEN) !== null;
export function keepToken(t: string, onDevice: boolean): void {
  held = t;
  write(tab, TOKEN, onDevice ? null : t);
  write(device, TOKEN, onDevice ? t : null);
}
export function forgetToken(): void {
  held = null;
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
export function markSettled(built: string, id: string): void {
  write(device, SETTLED, [built, ...settled(built), id].join('\n'));
}
