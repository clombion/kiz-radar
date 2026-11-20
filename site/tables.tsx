// The SQL page: free queries against the database, run in the browser, on a copy of it (db.ts exec).
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createSignal, flush, For } from 'solid-js';
import type { SqlValue } from 'sql.js';
import { choices } from './controls.tsx';
import { exec, q, sql } from './db.ts';
import { Redrawn } from './mount.tsx';
import { message } from './report.ts';
import { opt, str } from './rows.ts';
import { KEY } from './states.ts';
import { plural } from './wording.ts';

const EXAMPLES: readonly (readonly [string, string])[] = [
  [
    'Most booked artists in Poland',
    `SELECT a.display_name, ac.bookings, st.home_country, st.bookings AS total
FROM artist_countries ac JOIN artists a ON a.id = ac.artist_id JOIN artist_stats st ON st.artist_id = a.id
WHERE ac.country_code = 'PL' ORDER BY ac.bookings DESC LIMIT 25;`,
  ],
  [
    'Cheapest festival weekends',
    `SELECT e.title, e.city, e.weekend_friday, f.price
FROM event_rows e JOIN fares f ON f.airport = e.airport AND f.depart = e.weekend_friday
WHERE e.upcoming ORDER BY f.price LIMIT 25;`,
  ],
  [
    'Festivals with taxi dancers',
    `SELECT title, city, country_code, start_date
FROM event_rows WHERE upcoming AND id IN (SELECT event_id FROM event_features WHERE feature = '${KEY.feature.TAXI_DANCERS}')
ORDER BY start_date;`,
  ],
  [
    'Artists booked in most countries',
    `SELECT a.display_name, st.countries, st.bookings, st.home_country
FROM artist_stats st JOIN artists a ON a.id = st.artist_id ORDER BY st.countries DESC, st.bookings DESC LIMIT 25;`,
  ],
  [
    'Fares per airport (next 3 months)',
    `SELECT airport, count(*) AS weekends, min(price) AS cheapest, round(avg(price)) AS average
FROM fares WHERE depart BETWEEN (SELECT day FROM today) AND date((SELECT day FROM today), '+3 months')
GROUP BY airport ORDER BY average;`,
  ],
  ['What each table holds', 'SELECT name, description FROM table_docs ORDER BY name;'],
];

// the most rows of a result set the page draws
const SHOWN = 1000;
// a value of a query's result as the page keeps it, a blob as its length alone (its cell says no more of it)
type Kept = Exclude<SqlValue, Uint8Array> | { readonly bytes: number };
const kept = (x: SqlValue): Kept => (x instanceof Uint8Array ? { bytes: x.length } : x);
// a result set as the page keeps it: its columns' names, how many rows it has, and the first SHOWN of them, the rest
// let go as the run is made
interface Got {
  readonly columns: readonly string[];
  readonly count: number;
  readonly rows: readonly (readonly Kept[])[];
}
// what a query gave: its result sets, or its own error's words, for its writer
type Ran = { readonly sets: readonly Got[] } | { readonly error: string };
function ran(query: string): Ran {
  try {
    return {
      sets: exec(query).map(({ columns, values }) => ({
        columns,
        count: values.length,
        rows: values.slice(0, SHOWN).map((row) => row.map(kept)),
      })),
    };
  } catch (e) {
    return { error: message(e) };
  }
}

// What a run gave is drawn once, never updated (the next run draws its own): plain markup, each value worked out before
// the JSX, so that no row, cell or class is a reactive expression of its own.
// a value of a query's result as its cell shows it, a number marked so
function cell(x: Kept): JSX.Element {
  if (typeof x === 'number') return <td class="num">{x}</td>;
  const words = x === null ? 'NULL' : typeof x === 'string' ? x : `${x.bytes} bytes`;
  return <td>{words}</td>;
}
// a result set as a table, under a line of how many rows it has
function table({ columns, count, rows }: Got): JSX.Element {
  const counted = `${plural(count, 'row')}${count > SHOWN ? ` (first ${SHOWN} shown)` : ''}`;
  const heads = columns.map((c) => <th scope="col">{c}</th>);
  const lines = rows.map((row) => {
    const cells = row.map(cell);
    return <tr>{cells}</tr>;
  });
  return (
    <div class="table-wrap">
      <p class={['muted', 'small']}>{counted}</p>
      <table>
        <thead>
          <tr>{heads}</tr>
        </thead>
        <tbody>{lines}</tbody>
      </table>
    </div>
  );
}
// what a query gave as the page shows it: each result set a table, or that there are none, or the query's error
function shown(now: Ran): JSX.Element {
  if ('error' in now) return <p class="error">{now.error}</p>;
  if (now.sets.length === 0) return <p class="muted">No rows.</p>;
  return now.sets.map(table);
}

// The page: the query typed (the first example's at first), run by its button or Ctrl/⌘+Enter, an example picked or a
// table's button writing one and running it; what the last run gave below it, drawn anew on each run, at once, in the
// run's listener, a throw as a run draws it said as the page's (Redrawn). The query is read from the
// field as it runs: a visitor's typing, and a script's value, reach it so.
export function sqlPage(): JSX.Element {
  const tables = q(
    { name: str, type: str, description: opt(str) },
    sql`SELECT m.name, m.type, d.description FROM sqlite_master m LEFT JOIN table_docs d ON d.name = m.name
    WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name`,
  );
  const first = EXAMPLES[0]?.[1] ?? '';
  const [result, setResult] = createSignal<Ran>(ran(first));
  let area: HTMLTextAreaElement | undefined;
  const run = () => {
    const query = area?.value ?? '';
    flush(() => {
      setResult(ran(query));
    });
  };
  const write = (query: string) => {
    if (area !== undefined) area.value = query;
    run();
  };
  return (
    <section class="sqlview">
      <div>
        <h2>SQL</h2>
        <p class="muted">
          The whole database runs in your browser (sql.js), on a copy for this page: a query that changes it changes
          nothing elsewhere, and reloading the page starts over.
        </p>
        <div class="toolbar">
          {choices(
            EXAMPLES.map(([title], i) => [i, title] as const),
            null,
            (i) => {
              const chosen = EXAMPLES[i];
              if (chosen) write(chosen[1]);
            },
            { label: 'Example queries' },
          )}
          <button type="button" onClick={run}>
            Run (Ctrl+Enter)
          </button>
        </div>
        <textarea
          ref={(el) => {
            area = el;
          }}
          rows={8}
          spellcheck="false"
          aria-label="SQL query"
          defaultValue={first}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              run();
            }
          }}
        />
        <div class="sql-out" aria-live="polite">
          <Redrawn>{shown(result())}</Redrawn>
        </div>
      </div>
      <aside class="schema">
        <h3>Tables</h3>
        <ul>
          <For each={tables}>
            {(t) => (
              <li>
                <button
                  type="button"
                  class="link"
                  title="Insert a query for this table"
                  onClick={() => {
                    write(`SELECT * FROM ${t.name} LIMIT 50;`);
                  }}
                >
                  {t.name}
                </button>
                {t.type === 'view' ? <small class="muted"> view</small> : null}
                {t.description !== null && t.description !== '' ? (
                  <p class={['small', 'muted']}>{t.description}</p>
                ) : null}
              </li>
            )}
          </For>
        </ul>
      </aside>
    </section>
  );
}
