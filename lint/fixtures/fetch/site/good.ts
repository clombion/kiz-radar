// The intended way: a request through net.ts's get(), with its deadline and the view's signal.
import { get } from '../../../../site/net.ts';

export const page = (url: string, signal: AbortSignal): Promise<Response> => get(url, signal);
