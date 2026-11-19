// What house/fetch refuses outside net.ts: the global fetch, called, with or without its options, awaited or not,
// optionally, or passed as a value, and as window's, globalThis's or self's, by name, by a key in quotes or destructured.
declare const url: string;
export const page = fetch(url); // refused
export const none = fetch(); // refused
export const signalled = fetch(url, { signal: AbortSignal.timeout(1000) }); // refused
export const read = async (): Promise<string> => (await fetch(url)).text(); // refused
export const optional = fetch?.(url); // refused
export const passed = [url].map(fetch); // refused
export const windowed = window.fetch(url); // refused
export const keyed = window['fetch'](url); // refused
export const global = globalThis.fetch(url); // refused
export const own = self.fetch; // refused
export const { fetch: taken } = window; // refused
