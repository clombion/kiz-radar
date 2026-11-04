// The database the build ships with the fixture's community and festivals in (FIXTURE_DATA, data.setup.ts), loaded in
// Chromium as the page loads it (db.ts): every file read
// from disk (the data written there before the run when missing: data.setup.ts; sql.js's WebAssembly from its
// package, which the build copies to public/vendor/), anything else from the server; each file asked for is noted
// with the signal it was asked with.
import initSqlJs, { type Database } from 'sql.js';
import { commands } from 'vitest/browser';
import { load, loadSite } from '../../site/db.ts';
import { FIXTURE_DATA } from './community.fixture.ts';

export function loadShipped(asked: Map<string, AbortSignal | null | undefined>): Promise<Database> {
  // the library index.html loads as a script
  Reflect.set(globalThis, 'initSqlJs', initSqlJs);
  // fetch for good, in this file's page: no unstubbing of another test's stubs takes it away
  const fetched = fetch;
  globalThis.fetch = async (url: URL | string | Request, init?: RequestInit) => {
    if (url instanceof Request) return fetched(url, init);
    if (!(url instanceof URL)) return fetched(url, init);
    asked.set(url.pathname, init?.signal);
    const file = url.pathname.split('/').at(-1) ?? '';
    const path = file === 'sql-wasm.wasm' ? `node_modules/sql.js/dist/${file}` : `${FIXTURE_DATA}/${file}`;
    const data = await commands.readFile(path, 'base64');
    return new Response(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
  };
  return load(loadSite());
}
