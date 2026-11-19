// Exempt: net.ts is where every request is made.
export const get = (url: string, signal: AbortSignal): Promise<Response> => fetch(url, { signal });
