// The database the build ships, loaded in Chromium as the page loads it (db.ts), from public/data/: every file read
// from disk (the data written there before the run when missing: data.setup.ts; sql.js's WebAssembly from its
// package, which the build copies to public/vendor/), anything else from the server; each file asked for is noted
// with the signal it was asked with.
import initSqlJs, { type Database } from 'sql.js';
import { vi } from 'vitest';
import { commands } from 'vitest/browser';
import { load, loadSite } from '../../site/db.ts';

export function loadShipped(asked: Map<string, AbortSignal | null | undefined>): Promise<Database> {
  // the library index.html loads as a script
  Reflect.set(globalThis, 'initSqlJs', initSqlJs);
  const fetched = fetch;
  vi.stubGlobal('fetch', async (url: URL | string, init?: RequestInit) => {
    if (!(url instanceof URL)) return fetched(url, init);
    asked.set(url.pathname, init?.signal);
    const file = url.pathname.split('/').at(-1) ?? '';
    const path = file === 'sql-wasm.wasm' ? `node_modules/sql.js/dist/${file}` : `public/data/${file}`;
    const data = await commands.readFile(path, 'base64');
    return new Response(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
  });
  return load(loadSite());
}
