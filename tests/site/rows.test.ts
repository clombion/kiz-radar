// The shapes the site reads its tables by (site/rows.ts) against the database it ships: each reads every row of its
// table, and a column it doesn't read is one the SQL page's table docs name, for whoever queries it there.
import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlValue } from 'sql.js';
import { expect, test } from 'vitest';
import { sameSchema, summaryOf } from '../../site/db.ts';
import { ARTIST_STATS, EVENT, PASS, read, type Shape, TIER } from '../../site/rows.ts';
import { SCHEMA } from '../../site/schema.ts';

const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(new URL('../../public/data/kiz.sqlite', import.meta.url)));
const rowsOf = (table: string): Record<string, SqlValue>[] => {
  const [result] = db.exec(`SELECT * FROM ${table}`);
  if (!result) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((c, i) => [c, values[i] ?? null])));
};
const columnsOf = (table: string): string[] =>
  db.exec(`SELECT name FROM pragma_table_info('${table}')`)[0]?.values.map(([name]) => String(name)) ?? [];
const docsOf = (table: string): string =>
  String(db.exec('SELECT description FROM table_docs WHERE name = ?', [table])[0]?.values[0]?.[0] ?? '');

const TABLES: readonly (readonly [string, Shape])[] = [
  ['event_rows', EVENT],
  ['event_passes', PASS],
  ['pass_tiers', TIER],
  ['artist_stats', ARTIST_STATS],
];

test.each(TABLES)('%s: the shape reads every row, and the docs name every column it leaves', (table, shape) => {
  const docs = docsOf(table);
  const unread = columnsOf(table).filter((c) => !Object.hasOwn(shape, c));
  expect(unread.filter((c) => !new RegExp(`\\b${c}\\b`, 'u').test(docs))).toEqual([]);
  const rows = rowsOf(table);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) read(shape, row);
});

test('a value of another type, or a column the row lacks, fails to read', () => {
  const [row] = rowsOf('pass_tiers');
  expect(row).toBeDefined();
  expect(() => read(TIER, { ...row, amount: 'ten' })).toThrow(/column amount: "ten" is no number/u);
  expect(() => read(TIER, { ...row, door: 2 })).toThrow(/column door: 2 is no flag/u);
  const { currency: _, ...without } = row ?? {};
  expect(() => read(TIER, without)).toThrow(/no column currency/u);
});

test('the summary the build writes beside the database is the one the page reads', () => {
  const summary = summaryOf(JSON.parse(readFileSync(new URL('../../public/data/site.json', import.meta.url), 'utf8')));
  expect(summary.destinations.length).toBeGreaterThan(10);
  const readSummary = (v: unknown) => {
    summaryOf(v);
  };
  expect(() => readSummary({ ...summary, events_range: [summary.built_at] })).toThrow(
    /data\/site\.json\.events_range: .* is no pair/u,
  );
  expect(() => readSummary({ ...summary, home: { code: summary.home.code } })).toThrow(
    'data/site.json.home.city: nothing is no field',
  );
});

test('a database of other tables than the scripts are built for says to reload, as a cached script would misread it', () => {
  const [found] = db.exec("SELECT value FROM meta WHERE key = 'schema'")[0]?.values[0] ?? [];
  expect(found).toBe(SCHEMA);
  expect(() => {
    sameSchema(found);
  }).not.toThrow();
  for (const other of ['0000000000000000', undefined])
    expect(() => {
      sameSchema(other);
    }).toThrow('the site has been updated since this page was saved: reload the page');
});
