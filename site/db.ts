// Loads the site summary (small, so the page can show itself straight away), then sql.js, the database and the
// latest fares, and exposes the query helpers: each reads its rows by a shape (rows.ts).
import type { BindParams, Database, QueryExecResult } from 'sql.js';
import { type RowOf, read, type Shape } from './rows.ts';

const SQLJS = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
const DATA = new URL('../data/', import.meta.url);

// site.json, written by the same build as kiz.sqlite: home airport, destinations, dates covered, build time
export interface Summary {
  home: { code: string; city: string };
  destinations: { code: string; name: string }[];
  events_range: [string, string];
  built_at: string;
}
const isPlace = (v: unknown): v is { code: string; name: string } =>
  typeof v === 'object' &&
  v !== null &&
  'code' in v &&
  typeof v.code === 'string' &&
  'name' in v &&
  typeof v.name === 'string';
function summaryOf(v: unknown): Summary {
  if (
    typeof v === 'object' &&
    v !== null &&
    'home' in v &&
    typeof v.home === 'object' &&
    v.home !== null &&
    'code' in v.home &&
    typeof v.home.code === 'string' &&
    'city' in v.home &&
    typeof v.home.city === 'string' &&
    'destinations' in v &&
    Array.isArray(v.destinations) &&
    v.destinations.every(isPlace) &&
    'events_range' in v &&
    Array.isArray(v.events_range) &&
    v.events_range.length === 2 &&
    typeof v.events_range[0] === 'string' &&
    typeof v.events_range[1] === 'string' &&
    'built_at' in v &&
    typeof v.built_at === 'string'
  )
    return {
      home: { code: v.home.code, city: v.home.city },
      destinations: v.destinations,
      events_range: [v.events_range[0], v.events_range[1]],
      built_at: v.built_at,
    };
  throw new TypeError('data/site.json: not the summary the build writes');
}

let db: Database | undefined;
let summary: Summary | undefined;

export async function loadSite(): Promise<void> {
  const r = await fetch(new URL('site.json', DATA));
  if (!r.ok) throw new Error(`data/site.json: ${r.status}`);
  summary = summaryOf(await r.json());
}
export const site = (): Summary => {
  if (!summary) throw new Error('site.json is not loaded yet');
  return summary;
};

export async function load(): Promise<Database> {
  const [SQL, dbBuf, faresText] = await Promise.all([
    initSqlJs({ locateFile: (f) => SQLJS + f }),
    fetch(new URL('kiz.sqlite', DATA)).then((r) => {
      if (!r.ok) throw new Error(`data/kiz.sqlite: ${r.status}`);
      return r.arrayBuffer();
    }),
    fetch(new URL('fares.csv', DATA), { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : '')),
  ]);
  db = new SQL.Database(new Uint8Array(dbBuf));
  if (faresText) replaceFares(db, faresText);
  return db;
}

const opened = (): Database => {
  if (!db) throw new Error('the database is not loaded yet');
  return db;
};

const LINE_BREAK = /\r?\n/u;
// The DB ships with a fares snapshot; the CSV is refreshed by the GitHub Action more often.
function replaceFares(to: Database, csv: string): void {
  const [first = '', ...lines] = csv.trim().split(LINE_BREAK);
  const head = first.split(',');
  const cols = ['airport', 'depart', 'return', 'price', 'currency', 'fetched_at'].map((name) => head.indexOf(name));
  if (cols.some((i) => i < 0)) throw new Error(`data/fares.csv: unexpected columns ${head.join(',')}`);
  to.run('BEGIN');
  to.run('DELETE FROM fares');
  const st = to.prepare('INSERT OR REPLACE INTO fares VALUES (?,?,?,?,?,?)');
  for (const line of lines) {
    const v = line.split(',');
    st.run(cols.map((i, k) => (k === 3 ? Number(v[i]) : (v[i] ?? null))));
  }
  st.free();
  to.run('COMMIT');
}

// the query's rows, each read by the shape (rows.ts)
export function q<S extends Shape>(shape: S, sql: string, params: BindParams = []): RowOf<S>[] {
  const st = opened().prepare(sql);
  st.bind(params);
  const rows: RowOf<S>[] = [];
  while (st.step()) rows.push(read(shape, st.getAsObject()));
  st.free();
  return rows;
}

export const one = <S extends Shape>(shape: S, sql: string, params?: BindParams): RowOf<S> | undefined =>
  q(shape, sql, params)[0];

// a query someone types (the SQL page): its columns and values as they are
export const exec = (sql: string): QueryExecResult[] => opened().exec(sql);
