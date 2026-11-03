// The views on the database the build ships, in Chromium: loaded as the page loads it (db.ts), from public/data/.
import initSqlJs, { type Database } from 'sql.js';
import { beforeAll, expect, test, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { artistsView } from '../../site/artists.ts';
import { communityView } from '../../site/communities.ts';
import { exec, load, loadSite, one, sql } from '../../site/db.ts';
import { festivals } from '../../site/festivals.ts';
import { artistHref, personHref } from '../../site/routes.ts';
import { num, str } from '../../site/rows.ts';

// each file the page asked for, with the signal it was asked with
const asked = new Map<string, AbortSignal | null | undefined>();
let db: Database | undefined; // the database the views read

beforeAll(async () => {
  // the library index.html loads as a script
  Reflect.set(globalThis, 'initSqlJs', initSqlJs);
  // every file read from disk: the data from public/data/ (written there before the run when missing: data.setup.ts),
  // sql.js's WebAssembly from its package, which the build copies to public/vendor/; anything else from the server
  const fetched = fetch;
  vi.stubGlobal('fetch', async (url: URL | string, init?: RequestInit) => {
    if (!(url instanceof URL)) return fetched(url, init);
    asked.set(url.pathname, init?.signal);
    const file = url.pathname.split('/').at(-1) ?? '';
    const path = file === 'sql-wasm.wasm' ? `node_modules/sql.js/dist/${file}` : `public/data/${file}`;
    const data = await commands.readFile(path, 'base64');
    return new Response(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
  });
  const site = loadSite();
  db = await load(site);
});

test('sql.js’s WebAssembly is asked for as every file is, with a deadline', () => {
  const wasm = [...asked].find(([path]) => path.endsWith('/sql-wasm.wasm'));
  expect(wasm?.[1]).toBeInstanceOf(AbortSignal);
});

test('what the SQL page runs changes its own copy, never the database the views read', () => {
  const events = sql`SELECT count(*) AS n FROM events`;
  const before = one({ n: num }, events)?.n ?? 0;
  expect(before).toBeGreaterThan(0);
  exec('DELETE FROM events');
  expect(exec('SELECT count(*) FROM events')[0]?.values).toEqual([[0]]);
  expect(one({ n: num }, events)?.n).toBe(before);
});

const names = (root: HTMLElement) => [...root.querySelectorAll('.artist-row .name')].map((n) => n.textContent);
const artists = (qs: string): (string | null)[] => {
  const root = document.createElement('main');
  artistsView(root, [], qs, { signal: new AbortController().signal, data: Promise.resolve() });
  return names(root);
};

test('the artist list finds a name whatever its accents and case, and what is typed is never a pattern', () => {
  const found = artists('q=elodie');
  expect(found).toContain('Boki & Élodie');
  expect(artists('q=%C3%89LODIE')).toEqual(found);
  expect(artists('q=%25')).toEqual([]);
  expect(artists('q=o_a')).toEqual([]); // LIKE '%o_a%' would find Rosa
});

// The community pipeline/communities.csv has, on a day before its festivals (the data's dates, whatever the day the
// test runs): its members and the people its manager added named under each festival.
const COMMUNITY = 'frost-lantern-river-maple';
function onDay<T>(day: string, then: () => T): T {
  const was = one({ day: str }, sql`SELECT day FROM today`)?.day;
  db?.run('UPDATE today SET day = ?', [day]);
  try {
    return then();
  } finally {
    db?.run('UPDATE today SET day = ?', [was ?? null]);
  }
}
const communityPage = (key: string): HTMLElement => {
  const root = document.createElement('main');
  communityView(root, [key]);
  return root;
};
const said = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/gu, ' ').trim();

// what the community's page says of each festival, on its card and in the list at the top
const KUOF = 'Cédric & Christina teaching · Tonje, Ragnhild and Maja going (added by Cédric)';
// Christina alone of the members goes to Glasgow, named as herself; Sian, added by Cédric, teaches there
const GLASGOW = 'Christina teaching · Sian teaching and Carolina going (added by Cédric)';

test('a community names who of it goes to each festival: members as their couple, and the people added', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  expect(said(root.querySelector('h1'))).toBe('Dancers in Norway');
  expect(said(root.querySelector('.lede'))).toBe('2 members · managed by Cédric');
  expect(root.querySelector('.lede a')?.getAttribute('href')).toBe(personHref('cedric'));
  expect(said(root.querySelector('.profile-head'))).toContain('Visible to the 2 members of Dancers in Norway');
  const cards = [...root.querySelectorAll('.festival-card')];
  expect(said(root.querySelector('section h2'))).toBe(`Coming up (${cards.length})`);
  const card = (title: string) => cards.find((c) => c.querySelector('h3')?.textContent?.startsWith(title));
  expect(said(card('KUOF')?.querySelector('.going-line'))).toBe(KUOF);
  expect(said(card('Glasgow')?.querySelector('.going-line'))).toBe(GLASGOW);
  // teaching, so linked to her artist page as a member is; Carolina, only going, has no page
  const sian = one({ id: num }, sql`SELECT id FROM artists WHERE match_key = ?`, ['p:sian@dance'])?.id;
  const links = [...(card('Glasgow')?.querySelectorAll('.going-line a') ?? [])];
  expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
    ['Christina', personHref('christina')],
    ['Sian', artistHref(sian ?? Number.NaN)],
  ]);
  // soonest first: Glasgow's weekend comes before KUOF's
  expect(cards.map((c) => said(c.querySelector('h3'))).slice(0, 2)).toEqual([
    'Glasgow Kizomba Festival 5.0',
    'KUOF – Kizomba & Urban Kiz Oslo Festival',
  ]);
  const members = root.querySelector('section:last-of-type');
  expect(said(members?.querySelector('h2'))).toBe('Members');
  expect([...(members?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'))).toEqual([
    personHref('cedric'),
    personHref('christina'),
  ]);
});

// the list of who goes where at the top of the page: each row's festival, whether it shows, and who goes
const rows = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.plan-list li')].map((li) => ({
    festival: said(li.querySelector('.what a')),
    shown: !li.hidden,
    who: said(li.querySelector('.who')),
  }));

test('the community’s list shows three festivals, soonest first, and See more shows the rest in place', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  document.body.append(root);
  try {
    const titles = [...root.querySelectorAll('.festival-card h3')].map((h) => said(h));
    const listed = rows(root);
    expect(listed.map((r) => r.festival)).toEqual(titles); // a row for each card, in their order
    expect(titles.length).toBeGreaterThan(3);
    expect(listed.map((r) => r.shown)).toEqual(titles.map((_, i) => i < 3));
    expect(listed.slice(0, 2).map((r) => r.who)).toEqual([GLASGOW, KUOF]);
    const more = root.querySelector<HTMLButtonElement>('button.more-btn');
    expect(more?.textContent).toBe('See more');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    more?.focus();
    expect(document.activeElement).toBe(more); // a keyboard reaches it
    more?.click();
    expect(rows(root).every((r) => r.shown)).toBe(true);
    expect(more?.getAttribute('aria-expanded')).toBe('true');
    more?.click();
    expect(rows(root).map((r) => r.shown)).toEqual(titles.map((_, i) => i < 3));
  } finally {
    root.remove();
  }
});

test('with three festivals or fewer to come, the list shows them all and has no See more', () => {
  // after HOT Ice ends: Prague and Cloudkiz are left
  const root = onDay('2026-12-02', () => communityPage(COMMUNITY));
  const listed = rows(root);
  expect(listed.length).toBeGreaterThan(0);
  expect(listed.length).toBeLessThanOrEqual(3);
  expect(listed.every((r) => r.shown)).toBe(true);
  expect(root.querySelector('button.more-btn')).toBeNull();
});

test('the people a manager added are named on the community’s page only, never on a festival’s card elsewhere', () => {
  const kuof = onDay('2026-11-01', () => festivals().find((e) => e.title.startsWith('KUOF')));
  expect(kuof?.goers.map((g) => g.key).sort()).toEqual(['cedric', 'christina']);
});

test('a link to no community says so', () => {
  expect(said(communityPage('no-such-community-here'))).toBe('No community at this link.');
});
