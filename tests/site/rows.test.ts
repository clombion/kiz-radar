// The shapes the site reads its tables by (site/rows.ts) against the database it ships: each reads every row of its
// table, and a column it doesn't read is one the SQL page's table docs name, for whoever queries it there.
import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlValue } from 'sql.js';
import { expect, test } from 'vitest';
import { ARTIST_STATS, EVENT, PASS, read, type Shape, TIER } from '../../site/rows.ts';

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
