// The data the site's tests read, built before they run when a checkout has none or it is older than what it is built
// from (public/data/ is never committed): the database, the summary and the review the build writes from the export, as
// mise run build:data does; then the database with the fixture's community and festivals in (community.fixture.ts),
// with the summary and the review beside it, in FIXTURE_DATA, which the tests of the whole site load.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { FIXTURE_DATA, plantCommunity } from './community.fixture.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATA = 'public/data';
const FILES = ['kiz.sqlite', 'site.json', 'review.json'];
// what the data is built from: the export, the pipeline's files and code, the claims
const INPUTS = ['source', 'pipeline', 'claims'];

// the latest change of any file under a folder, caches aside
function latest(dir: string): number {
  let at = 0;
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === '__pycache__' || e.name.startsWith('.')) continue;
    const path = join(dir, e.name);
    at = Math.max(at, e.isDirectory() ? latest(path) : statSync(join(ROOT, path)).mtimeMs);
  }
  return at;
}

function built(): void {
  const paths = FILES.map((f) => join(ROOT, DATA, f));
  const missing = paths.filter((p) => !existsSync(p));
  const since = Math.max(...INPUTS.filter((d) => existsSync(join(ROOT, d))).map(latest));
  const stale = missing.length === 0 && paths.some((p) => statSync(p).mtimeMs < since);
  if (missing.length === 0 && !stale) return;
  try {
    execFileSync('uv', ['run', '-q', '-m', 'pipeline.build_site_db'], { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    throw new Error(
      `the site's tests read ${DATA}/, ${missing.length > 0 ? 'which is missing' : 'which is older than what it is built from'}, and building it failed: run mise run build:data`,
      { cause: e },
    );
  }
}

export async function setup(): Promise<void> {
  built();
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(join(ROOT, DATA, 'kiz.sqlite')));
  plantCommunity(db);
  mkdirSync(join(ROOT, FIXTURE_DATA), { recursive: true });
  writeFileSync(join(ROOT, FIXTURE_DATA, 'kiz.sqlite'), db.export());
  db.close();
  for (const f of FILES.slice(1)) copyFileSync(join(ROOT, DATA, f), join(ROOT, FIXTURE_DATA, f));
}
