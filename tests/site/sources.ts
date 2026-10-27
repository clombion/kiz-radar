// The site's sources as text, for the checks no linter or type makes: the page, its stylesheets and its modules.
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');
const filesIn = (dir: string, ext: string) =>
  readdirSync(new URL(dir, ROOT))
    .filter((f) => f.endsWith(ext))
    .sort();

const COMMENT_BLOCK = /\/\*[\s\S]*?\*\//gu;
// a // comment, but not the // of a URL in a string or a regex
const COMMENT_LINE = /(?<before>^|[^:'"`\\])\/\/.*$/gmu;

export const html = read('docs/index.html');
// each stylesheet without its comments
export const css: ReadonlyMap<string, string> = new Map(
  filesIn('docs/css/', '.css').map((f) => [f, read(`docs/css/${f}`).replace(COMMENT_BLOCK, '')]),
);
export const modules: ReadonlyMap<string, string> = new Map(filesIn('site/', '.ts').map((f) => [f, read(`site/${f}`)]));
// each module but the generated state table, without its comments, where words may be quoted
export const code: ReadonlyMap<string, string> = new Map(
  [...modules]
    .filter(([f]) => f !== 'states.ts')
    .map(([f, src]) => [f, src.replace(COMMENT_BLOCK, '').replace(COMMENT_LINE, '$<before>')]),
);
