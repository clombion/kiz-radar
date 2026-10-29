// Loads the site summary (small, so the page can show itself straight away), and alongside it sql.js and the
// database, and exposes the query helpers: each reads its rows by a shape (rows.ts). The two data files come from one
// build: both are asked again of the server each visit, and a database of another build than the summary's (a
// publish between the two requests) is refused.
import type { BindParams, Database, QueryExecResult } from 'sql.js';
import { today } from './days.ts';
import { get } from './net.ts';
import { type RowOf, read, type Shape } from './rows.ts';

const SQLJS = new URL('../vendor/', import.meta.url); // sql-wasm.wasm, beside the script index.html loads
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
let openCopy: (() => Database) | undefined; // another database from the same file, for the SQL page
let copy: Database | undefined;
let summary: Summary | undefined;

export async function loadSite(): Promise<void> {
  summary = summaryOf(await (await get(new URL('site.json', DATA), { revalidate: true })).json());
}
export const site = (): Summary => {
  if (!summary) throw new Error('site.json is not loaded yet');
  return summary;
};

// a library index.html loads as a script, which a failed load leaves undefined: said by the file that did not load
export function needs(name: string, file: string): void {
  if (!Reflect.has(globalThis, name)) throw new Error(`${file} did not load`);
}

// the database, once it and the summary are in (siteLoaded)
export async function load(siteLoaded: Promise<void>): Promise<Database> {
  needs('initSqlJs', 'vendor/sql-wasm.js');
  const [SQL, dbBuf] = await Promise.all([
    initSqlJs({ locateFile: (f) => new URL(f, SQLJS).href }),
    get(new URL('kiz.sqlite', DATA), { revalidate: true }).then((r) => r.arrayBuffer()),
  ]);
  const bytes = new Uint8Array(dbBuf);
  // the festivals as seen from the visitor's own day (event_rows)
  const open = (): Database => {
    const d = new SQL.Database(bytes);
    d.run('UPDATE today SET day = ?', [today()]);
    return d;
  };
  const opening = open();
  await siteLoaded;
  const [built] = opening.exec("SELECT value FROM meta WHERE key = 'built_at'")[0]?.values[0] ?? [];
  if (built !== site().built_at) throw new Error('the site was updated while the page loaded: reload the page');
  db = opening;
  openCopy = open;
  return db;
}

const opened = (): Database => {
  if (!db) throw new Error('the database is not loaded yet');
  return db;
};

// SQL written in the code. A query is one, joined only from others (sql`… ${other} …`, Sql.joined), so a value from
// outside is never part of its text: it is bound to a ? instead.
export class Sql {
  readonly #text: string;
  private constructor(text: string) {
    this.#text = text;
  }
  static of(parts: TemplateStringsArray, ...between: readonly Sql[]): Sql {
    return new Sql(String.raw({ raw: parts.raw }, ...between.map((s) => s.#text)));
  }
  static joined(parts: readonly Sql[], by: Sql): Sql {
    return new Sql(parts.map((s) => s.#text).join(by.#text));
  }
  get text(): string {
    return this.#text;
  }
}
export const sql = (parts: TemplateStringsArray, ...between: readonly Sql[]): Sql => Sql.of(parts, ...between);

// the query's rows, each read by the shape (rows.ts)
export function q<S extends Shape>(shape: S, query: Sql, params: BindParams = []): RowOf<S>[] {
  const st = opened().prepare(query.text);
  st.bind(params);
  const rows: RowOf<S>[] = [];
  while (st.step()) rows.push(read(shape, st.getAsObject()));
  st.free();
  return rows;
}

export const one = <S extends Shape>(shape: S, query: Sql, params?: BindParams): RowOf<S> | undefined =>
  q(shape, query, params)[0];

// a query someone types (the SQL page): its columns and values as they are. It runs on a copy of the database, opened
// on the first one, so what it changes (a DELETE, say) changes nothing the other pages read.
export function exec(typed: string): QueryExecResult[] {
  if (!openCopy) throw new Error('the database is not loaded yet');
  copy ??= openCopy();
  return copy.exec(typed);
}
