// The pages the footer links to, on the fixture's data: the SQL page, which runs what a visitor types on a copy of
// the database (by its button, by Ctrl/⌘+Enter, by an example picked or a table's button), and the sources page,
// which promotes no one. And how the page asked for sql.js's WebAssembly.
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

// the rows the SQL page shows, each a list of its cells
const rows = (): string[][] =>
  [...(main()?.querySelectorAll('.sql-out tbody tr') ?? [])].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent),
  );
// the SQL page's field of the query, which it must have
function field(): HTMLTextAreaElement {
  const area = main()?.querySelector('textarea');
  if (area == null) throw new Error(`no query to type: <main> says ${main()?.textContent}`);
  return area;
}
// a query run on the SQL page as a visitor runs it, typed and then its button pressed: the rows it shows
function ran(query: string): string[][] {
  const run = [...(main()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Run (Ctrl+Enter)');
  if (run === undefined) throw new Error(`no query to run: <main> says ${main()?.textContent}`);
  field().value = query;
  run.click();
  return rows();
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

test('the SQL page starts on its first example, run, its query the field’s text, no example marked chosen', async () => {
  await app.open(sqlHref());
  const shown = rows();
  const { value, textContent } = field();
  expect(value).not.toBe('');
  expect(textContent).toBe(value);
  const options = [...(main()?.querySelectorAll('select option') ?? [])];
  expect(options.length).toBeGreaterThan(1);
  expect(options.filter((o) => o.hasAttribute('selected'))).toEqual([]);
  expect(main()?.querySelector('select')?.selectedIndex).toBe(0);
  expect(shown.length).toBeGreaterThan(0);
  expect(ran(value)).toEqual(shown);
});

test('an example picked, or a table’s button, writes its query into the field and runs it', async () => {
  await app.open(sqlHref());
  const select = main()?.querySelector('select');
  if (select == null) throw new Error('no examples on the SQL page');
  const before = field().value;
  select.selectedIndex = select.options.length - 1;
  select.dispatchEvent(new Event('change'));
  const picked = { query: field().value, rows: rows() };
  expect(picked.query).not.toBe(before);
  expect(picked.rows.length).toBeGreaterThan(0);
  expect(ran(picked.query)).toEqual(picked.rows);
  // the artists' table, which no query of this file changes
  const artists = [...(main()?.querySelectorAll('.schema li button') ?? [])].find((b) => b.textContent === 'artists');
  if (!(artists instanceof HTMLButtonElement)) throw new Error('no button of the artists table');
  artists.click();
  const listed = { query: field().value, rows: rows() };
  expect(listed.query).toBe('SELECT * FROM artists LIMIT 50;');
  expect(listed.rows.length).toBeGreaterThan(0);
  expect(ran(listed.query)).toEqual(listed.rows);
});

test('Ctrl+Enter and ⌘+Enter in the field run its query, Enter alone does not', async () => {
  await app.open(sqlHref());
  const area = field();
  // whether the key, pressed in the field, was taken (its default prevented)
  const pressed = (init: { readonly ctrlKey?: true; readonly metaKey?: true }): boolean => {
    const key = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    area.dispatchEvent(key);
    return key.defaultPrevented;
  };
  const first = rows();
  area.value = 'SELECT 1';
  expect(pressed({})).toBe(false);
  expect(rows()).toEqual(first);
  expect(pressed({ ctrlKey: true })).toBe(true);
  expect(rows()).toEqual([['1']]);
  area.value = 'SELECT 2';
  expect(pressed({ metaKey: true })).toBe(true);
  expect(rows()).toEqual([['2']]);
});

test('a query’s own error, and a query of no rows, are said where its rows would be', async () => {
  await app.open(sqlHref());
  expect(ran('SELECT nothing_here')).toEqual([]);
  expect(main()?.querySelector('.sql-out .error')?.textContent).toBe('no such column: nothing_here');
  expect(ran('CREATE TABLE written (x)')).toEqual([]);
  expect(main()?.querySelector('.sql-out')?.textContent).toBe('No rows.');
});

test('a result is drawn as the page drew it: a number marked so, NULL and bytes said, 1000 rows at most, all counted', async () => {
  await app.open(sqlHref());
  const out = main()?.querySelector('.sql-out');
  // the box a run draws in is a live region, the result said as it comes, in it
  expect(out?.getAttribute('aria-live')).toBe('polite');
  expect(ran("SELECT 1 AS n, NULL AS none, x'0102' AS blob, 'a' AS word, 2.5 AS half")).toEqual([
    ['1', 'NULL', '2 bytes', 'a', '2.5'],
  ]);
  expect([...(out?.querySelectorAll('th') ?? [])].map((th) => [th.textContent, th.getAttribute('scope')])).toEqual(
    ['n', 'none', 'blob', 'word', 'half'].map((name) => [name, 'col']),
  );
  expect([...(out?.querySelectorAll('td') ?? [])].map((td) => td.getAttribute('class'))).toEqual([
    'num',
    null,
    null,
    null,
    'num',
  ]);
  const counts = () => [...(out?.querySelectorAll('.table-wrap > p.muted.small') ?? [])].map((p) => p.textContent);
  expect(counts()).toEqual(['1 row']);
  // each result set a table of its own
  expect(ran('SELECT 1; SELECT 2, 3')).toEqual([['1'], ['2', '3']]);
  expect(counts()).toEqual(['1 row', '1 row']);
  const many = ran('WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1500) SELECT i FROM n');
  expect([many.length, many[0], many.at(-1)]).toEqual([1000, ['1'], ['1000']]);
  expect(counts()).toEqual(['1,500 rows (first 1000 shown)']);
});

test('the SQL page’s list of tables marks a view and says what a table holds', async () => {
  await app.open(sqlHref());
  const listed = [...(main()?.querySelectorAll('.schema li') ?? [])];
  const named = (name: string) => listed.find((li) => li.querySelector('button')?.textContent === name);
  expect(named('event_rows')?.querySelector('small.muted')?.textContent).toBe(' view');
  expect(named('artists')?.querySelector('small')).toBeNull();
  expect(named('artists')?.querySelector('p.small.muted')?.textContent.length).toBeGreaterThan(0);
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
