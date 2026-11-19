// The pages the footer links to, on the fixture's data: the SQL page, which runs what a visitor types on a copy of
// the database, and the sources page, which promotes no one. And how the page asked for sql.js's WebAssembly.
import { expect, test } from 'vitest';
import { EXPLORE, sourcesHref, sqlHref } from '../../site/routes.ts';
import { startSite } from './app.ts';

// read from the database the page is served, before it starts: its festivals, and every company a ticket page sells
// through (the fixture's data has one today)
let events = 0;
let resellers: string[] = [];
const app = await startSite({
  now: '2026-11-01',
  plant: (db) => {
    events = Number(db.exec('SELECT count(*) FROM events')[0]?.values[0]?.[0]);
    resellers = (db.exec('SELECT DISTINCT reseller FROM ticket_pages WHERE reseller IS NOT NULL')[0]?.values ?? []).map(
      ([name]) => String(name),
    );
  },
});
const main = () => document.querySelector('main');

test('sql.js’s WebAssembly is asked for as every file is, with a deadline', () => {
  const wasm = app.asked.filter(({ url }) => url.pathname.endsWith('/sql-wasm.wasm'));
  expect(wasm.map(({ init }) => init.signal instanceof AbortSignal)).toEqual([true]);
});

// a query run on the SQL page as a visitor runs it, typed and then its button pressed: the rows it shows, each a list
// of its cells
function ran(query: string): string[][] {
  const area = main()?.querySelector('textarea');
  const run = [...(main()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Run (Ctrl+Enter)');
  if (area == null || run === undefined) throw new Error(`no query to type or run: <main> says ${main()?.textContent}`);
  area.value = query;
  run.click();
  return [...(main()?.querySelectorAll('.sql-out tbody tr') ?? [])].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent ?? ''),
  );
}

test('what the SQL page runs changes its own copy, never the database the views read', async () => {
  expect(events).toBeGreaterThan(0);
  await app.open(sqlHref());
  const count = 'SELECT count(*) FROM events';
  expect(ran(count)).toEqual([[String(events)]]);
  ran('DELETE FROM events');
  expect(ran(count)).toEqual([['0']]);
  // This week, which reads the views' database, still has the fixture's festival of its week (KUOF, 20–22 November)
  await app.open(EXPLORE.find(([k]) => k === 'week')?.[2] ?? '', '2026-11-21');
  expect(main()?.textContent).toContain('KUOF – Kizomba & Urban Kiz Oslo Festival');
});

// The admin's rule: the sources page promotes no one. It names no company a price is resold by (the fares' reseller,
// nor any a ticket page sells through) and no model by its maker, in its words or its links.
test('the sources page names no reseller and no model’s maker', async () => {
  await app.open(sourcesHref());
  const shown =
    `${main()?.textContent} ${[...(main()?.querySelectorAll('a') ?? [])].map((a) => a.href).join(' ')}`.toLowerCase();
  expect(shown).toContain('a reseller’s');
  expect(['kiwi', 'claude', 'anthropic', ...resellers].filter((name) => shown.includes(name.toLowerCase()))).toEqual(
    [],
  );
});
