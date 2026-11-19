// The intended way: a request through net.ts's get(), with its deadline and the view's signal. A fetch of the file's
// own, and a type's typeof fetch, read no global.
import { get } from '../../../../site/net.ts';

export const page = (url: string, signal: AbortSignal): Promise<Response> => get(url, signal);

export const typed: typeof fetch | null = null;
export const ownFetch = (fetch: (url: string) => Promise<Response>, url: string): Promise<Response> => fetch(url);
