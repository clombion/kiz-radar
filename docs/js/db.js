// Loads sql.js, the site database and the latest fares, and exposes small query helpers.
const SQLJS = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';

let db;

export async function load(onStatus) {
  onStatus('Loading database…');
  const [SQL, dbBuf, faresText] = await Promise.all([
    initSqlJs({ locateFile: f => SQLJS + f }),
    fetch('data/kiz.sqlite').then(r => { if (!r.ok) throw new Error('data/kiz.sqlite: ' + r.status); return r.arrayBuffer(); }),
    fetch('data/fares.csv', { cache: 'no-cache' }).then(r => r.ok ? r.text() : ''),
  ]);
  db = new SQL.Database(new Uint8Array(dbBuf));
  if (faresText) replaceFares(faresText);
  return db;
}

// The DB ships with a fares snapshot; the CSV is refreshed by the GitHub Action more often.
function replaceFares(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines.shift().split(',');
  const idx = name => head.indexOf(name);
  const cols = ['airport', 'depart', 'return', 'price', 'currency', 'fetched_at'].map(idx);
  if (cols.some(i => i < 0)) return;
  db.run('BEGIN');
  db.run('DELETE FROM fares');
  const st = db.prepare('INSERT OR REPLACE INTO fares VALUES (?,?,?,?,?,?)');
  for (const line of lines) {
    const v = line.split(',');
    st.run(cols.map((i, k) => k === 3 ? Number(v[i]) : v[i]));
  }
  st.free();
  db.run('COMMIT');
}

export function q(sql, params = []) {
  const st = db.prepare(sql);
  st.bind(params);
  const rows = [];
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  return rows;
}

export const one = (sql, params) => q(sql, params)[0];

export function exec(sql) { return db.exec(sql); }

export function meta() {
  return Object.fromEntries(q('SELECT key, value FROM meta').map(r => [r.key, r.value]));
}
