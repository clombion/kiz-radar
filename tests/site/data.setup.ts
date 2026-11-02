// The data the site's tests read, built before they run when a checkout has none (public/data/ is never committed):
// the database, the summary and the review the build writes from the export, as mise run build:data does.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BUILT = ['kiz.sqlite', 'site.json', 'review.json'].map((f) => `public/data/${f}`);

export function setup(): void {
  const missing = BUILT.filter((f) => !existsSync(`${ROOT}${f}`));
  if (missing.length === 0) return;
  try {
    execFileSync('uv', ['run', '-q', '-m', 'pipeline.build_site_db'], { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    throw new Error(
      `the site's tests read ${missing.join(', ')}, which mise run build:data writes from the export, and building them failed`,
      { cause: e },
    );
  }
}
