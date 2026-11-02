// The views on the database the build ships, in Chromium: loaded as the page loads it (db.ts), from public/data/.
import initSqlJs from 'sql.js';
import { beforeAll, expect, test, vi } from 'vitest';
import { artistsView } from '../../site/artists.ts';
import { load, loadSite } from '../../site/db.ts';

beforeAll(async () => {
  // the library index.html loads as a script, with its WebAssembly from the package
  Reflect.set(globalThis, 'initSqlJs', () =>
    initSqlJs({ locateFile: (f: string) => `/node_modules/sql.js/dist/${f}` }),
  );
  // the data files, from public/data/ wherever the module is served from
  const fetched = fetch;
  vi.stubGlobal('fetch', (url: URL | string, init?: RequestInit) =>
    fetched(url instanceof URL ? `/data/${url.pathname.split('/').at(-1) ?? ''}` : url, init),
  );
  const site = loadSite();
  await load(site);
});

const names = (root: HTMLElement) => [...root.querySelectorAll('.artist-row .name')].map((n) => n.textContent);
const artists = (qs: string): (string | null)[] => {
  const root = document.createElement('main');
  artistsView(root, [], qs, { signal: new AbortController().signal, data: Promise.resolve() });
  return names(root);
};

test('the artist list finds a name whatever its accents and case, and what is typed is never a pattern', () => {
  const found = artists('q=elodie');
  expect(found).toContain('Boki & Élodie');
  expect(artists('q=%C3%89LODIE')).toEqual(found);
  expect(artists('q=%25')).toEqual([]);
  expect(artists('q=o_a')).toEqual([]); // LIKE '%o_a%' would find Rosa
});
