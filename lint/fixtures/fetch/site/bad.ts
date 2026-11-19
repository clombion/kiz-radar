// What house/fetch refuses outside net.ts: a call of fetch, with or without its options, awaited or not.
declare const url: string;
export const page = fetch(url); // refused
export const none = fetch(); // refused
export const signalled = fetch(url, { signal: AbortSignal.timeout(1000) }); // refused
export const read = async (): Promise<string> => (await fetch(url)).text(); // refused
