// The views on the database the build ships, in Chromium: loaded as the page loads it (db.ts), from public/data/.
import initSqlJs, { type Database } from 'sql.js';
import { beforeAll, expect, test, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { artistsView } from '../../site/artists.ts';
import { communityView } from '../../site/communities.ts';
import { exec, load, loadSite, one, sql } from '../../site/db.ts';
import { h } from '../../site/dom.ts';
import { festivals } from '../../site/festivals.ts';
import { artistHref, eventOnMapHref, personHref } from '../../site/routes.ts';
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
// a community's page, its address's query qs
const communityPage = (key: string, qs = ''): HTMLElement => {
  const root = document.createElement('main');
  communityView(root, [key], qs, new AbortController().signal);
  return root;
};
// the community's page on a day, in the document while then runs, as a visitor has it
function inPage(day: string, then: (root: HTMLElement) => void): void {
  const root = onDay(day, () => communityPage(COMMUNITY));
  document.body.append(root);
  try {
    then(root);
  } finally {
    root.remove();
  }
}
const said = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/gu, ' ').trim();
// the names in an element that say on hover who added them, each with what it says
const titled = (el: Element | null | undefined) =>
  [...(el?.querySelectorAll('[title]') ?? [])].map((n) => [n.textContent, n.getAttribute('title')]);
// the stylesheet, for a test of how the page is laid out, while then runs
async function styled(then: () => Promise<void> | void): Promise<void> {
  const style = h('style', {}, await commands.readFile('public/css/site.css'));
  document.head.append(style);
  try {
    await then();
  } finally {
    style.remove();
  }
}

// trips planted in the database the views read while then runs, each [person, festival, arrive, leave, stay], each
// end null when not said and the stay every night from the day they arrive to the day before they leave; the Prague
// trip of travel.csv has none
type Planted = readonly [string, number, string | null, string | null, string | null];
function withTrips<T>(trips: readonly Planted[], then: () => T): T {
  plant(trips);
  try {
    return then();
  } finally {
    uproot(trips);
  }
}
// the trips planted, and taken out again
function plant(trips: readonly Planted[]): void {
  for (const [key, event, arrive, leave, stay] of trips) {
    if (arrive !== null || leave !== null)
      db?.run(
        "INSERT INTO travel SELECT id, ?, ?, iif(? IS NULL, NULL, 'OSL'), ?, iif(? IS NULL, NULL, 'OSL') FROM people WHERE key = ?",
        [event, arrive, arrive, leave, leave, key],
      );
    if (stay !== null && arrive !== null && leave !== null)
      db?.run("INSERT INTO stays SELECT id, ?, ?, date(?, '-1 day'), ? FROM people WHERE key = ?", [
        event,
        arrive.slice(0, 10),
        leave.slice(0, 10),
        stay,
        key,
      ]);
  }
}
function uproot(trips: readonly Planted[]): void {
  for (const table of ['travel', 'stays'])
    db?.run(`DELETE FROM ${table} WHERE event_id IN (SELECT value FROM json_each(?))`, [
      JSON.stringify(trips.map(([, event]) => event)),
    ]);
}
// people the manager added, planted while then runs, each [name, festival]
function withAdded<T>(added: readonly (readonly [string, number])[], then: () => T): T {
  for (const [i, [name, event]] of added.entries())
    db?.run("INSERT INTO community_seeded VALUES (?, 1, ?, ?, 'going')", [900 + i, name, event]);
  try {
    return then();
  } finally {
    db?.run('DELETE FROM community_seeded WHERE id >= 900');
  }
}
// the illustrative KUOF trip of Cédric and Christina, from Thursday to Monday
const TO_KUOF: readonly Planted[] = ['cedric', 'christina'].map(
  (key) => [key, 19_033, '2026-11-19T17:05', '2026-11-23T09:40', 'Scandic Holberg'] as const,
);
const PARIS = 16_904; // Paris Kizomba Congress, 19–23 Nov 2026, as KUOF is on
const ALBANIA = 18_734; // Albania Afrolatin Festival, Wednesday 5 to Tuesday 11 May 2027

// ----- the head, the agenda's rows, and who they name -----
const agendaRow = (root: HTMLElement, title: string) =>
  [...root.querySelectorAll<HTMLElement>('.trip')].find((r) =>
    r.querySelector('.trip-fest')?.textContent?.startsWith(title),
  );
const KUOF = 'Cédric & Christina teaching · Tonje, Ragnhild and Maja going';
// Christina alone of the members goes to Glasgow, named as herself; Siân, added by Cédric, teaches there
const GLASGOW = 'Christina teaching · Siân teaching and Caroline going';

test('a community’s head says who it is, when most members travel and where next, and whom it is for', () => {
  const root = onDay('2026-11-03', () => communityPage(COMMUNITY));
  expect(said(root.querySelector('h1'))).toBe('Norwegians in festivals');
  // the badge says how many members; who manages it is said with the members, at the foot
  expect(said(root.querySelector('.profile-head'))).not.toMatch(/members ·|managed by/u);
  const head = [...root.querySelectorAll('.profile-head p')].map((p) => said(p));
  // KUOF: Cédric, Christina and the three added; Glasgow, this Friday, comes first
  expect(head).toContain('Most members are travelling 20–22 Nov: 5 people, to Oslo.');
  expect(said(root.querySelector('.profile-head .community-next'))).toBe('Next: Glasgow, this Friday');
  expect(said(root)).not.toMatch(/\baway\b|Most of the community/u);
  // who sees it, as a badge beside Share: a lock, people and their number, named in full
  const badge = root.querySelector<HTMLElement>('.share-row .privacy');
  expect(said(root.querySelector('.share-row button'))).toBe('Share this page');
  expect([badge?.getAttribute('role'), badge?.ariaLabel, badge?.title]).toEqual([
    'img',
    'Visible to its 2 members only',
    'Visible to its 2 members only',
  ]);
  expect([badge?.querySelectorAll('svg').length, said(badge)]).toEqual([2, '2']);
  // a week on, Glasgow is under way and KUOF is two weeks off
  expect(said(onDay('2026-11-07', () => communityPage(COMMUNITY)).querySelector('.profile-head'))).toContain(
    'Next: Glasgow, now',
  );
  expect(said(onDay('2026-11-10', () => communityPage(COMMUNITY)).querySelector('.profile-head'))).toContain(
    'Next: Oslo, on 20 Nov',
  );
});

test('the agenda has a heading a month and a row a trip, soonest first, naming who of the community goes', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  expect([...root.querySelectorAll('.agenda h2')].map((h2) => said(h2))).toEqual([
    'November · 3 trips',
    'January 2027 · 1 trip',
    'February · 2 trips',
  ]);
  const rows = [...root.querySelectorAll<HTMLElement>('.trip')];
  expect(rows.map((r) => said(r.querySelector('.trip-when')))).toEqual([
    'Fri 6 – Mon 9 Nov',
    'Fri 20 – Sun 22 Nov',
    'Thu 26 Nov – Tue 1 Dec',
    'Thu 14 – Mon 18 Jan',
    'Thu 11 – Mon 15 Feb',
    'Fri 26 – Sun 28 Feb',
  ]);
  expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-who'))).toBe(KUOF);
  // Glasgow's card is open: its row says how many go and who teaches; the card names everyone
  expect(said(agendaRow(root, 'Glasgow')?.querySelector('.trip-who'))).toBe('3 going · Christina and Siân teaching');
  agendaRow(root, 'Glasgow')?.querySelector<HTMLElement>('.trip-toggle')?.click(); // closed, the whole line again
  expect(said(agendaRow(root, 'Glasgow')?.querySelector('.trip-who'))).toBe(GLASGOW);
  agendaRow(root, 'Glasgow')?.querySelector<HTMLElement>('.trip-toggle')?.click();
  expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-what'))).toBeUndefined();
  expect(said(agendaRow(root, 'KUOF')?.querySelector('p'))).toContain('· 🇳🇴 Oslo');
  // who added them is said on hover only, on each added name
  expect(said(root)).not.toContain('added by');
  expect(titled(agendaRow(root, 'KUOF')?.querySelector('.trip-who'))).toEqual(
    ['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, 'Added by Cédric']),
  );
  const sian = one({ id: num }, sql`SELECT id FROM artists WHERE match_key = ?`, ['p:sian@dance'])?.id;
  agendaRow(root, 'Glasgow')?.querySelector<HTMLElement>('.trip-toggle')?.click(); // closed: its whole who-line
  expect(
    [...(agendaRow(root, 'Glasgow')?.querySelectorAll('.trip-who a') ?? [])].map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]),
  ).toEqual([
    ['Christina', personHref('christina')],
    ['Siân', artistHref(sian ?? Number.NaN)],
  ]);
  agendaRow(root, 'Glasgow')?.querySelector<HTMLElement>('.trip-toggle')?.click();
  // the next trip open, the others closed; a row opens and closes from its button
  const toggles = rows.map((r) => r.querySelector<HTMLElement>('.trip-toggle'));
  expect(toggles.map((t) => t?.getAttribute('aria-expanded'))).toEqual([
    'true',
    'false',
    'false',
    'false',
    'false',
    'false',
  ]);
  expect(rows.map((r) => r.querySelector<HTMLElement>('.trip-body')?.hidden)).toEqual([
    false,
    true,
    true,
    true,
    true,
    true,
  ]);
  toggles[1]?.click();
  expect(rows[1]?.querySelector<HTMLElement>('.trip-body')?.hidden).toBe(false);
  expect(toggles[1]?.getAttribute('aria-expanded')).toBe('true');
  expect(toggles[1]?.getAttribute('aria-label')).toBe('Who travels when, to KUOF – Kizomba & Urban Kiz Oslo Festival');
  // no link of its own to the line-up: the festival's name shows its line-up and prices, the festival's card opened
  // in the trip's, and hides them again
  expect(said(root)).not.toContain('Line-up & prices');
  const lineup = () => rows[2]?.querySelector<HTMLElement>('.trip-lineup');
  const name = rows[2]?.querySelector<HTMLButtonElement>('button.trip-fest');
  expect([name?.textContent, name?.getAttribute('aria-expanded')]).toEqual([
    'HOT Ice KIZ Festival 11th edition',
    'false',
  ]);
  expect(name?.getAttribute('aria-controls')).toBe(lineup()?.id);
  name?.click(); // its card was closed: the name opens it, on its line-up
  expect(rows[2]?.querySelector<HTMLElement>('.trip-body')?.hidden).toBe(false);
  expect(lineup()?.hidden).toBe(false);
  expect(name?.getAttribute('aria-expanded')).toBe('true');
  expect(rows[2]?.querySelector('.trip-toggle')?.getAttribute('aria-expanded')).toBe('true');
  expect(lineup()?.querySelector('.festival-card.open .card-details')).not.toBeNull();
  expect(root.querySelectorAll('.festival-card')).toHaveLength(1); // no cards but the one opened
  name?.click();
  expect([lineup()?.hidden, name?.getAttribute('aria-expanded')]).toEqual([true, 'false']);
  expect(rows[2]?.querySelector<HTMLElement>('.trip-body')?.hidden).toBe(false); // its card stays open
  // the next trip's card opens on who travels, its line-up folded
  expect(rows[0]?.querySelector<HTMLElement>('.trip-lineup')?.hidden).toBe(true);
  // where a festival is leads to it on the map
  const place = rows[1]?.querySelector<HTMLAnchorElement>('.trip-head a');
  expect([said(place), place?.getAttribute('href')]).toEqual(['🇳🇴 Oslo', eventOnMapHref(19_033)]);
  const members = [...root.querySelectorAll(':scope > article > section')].at(-1);
  expect(said(members?.querySelector('p'))).toBe('Cédric manager and Christina');
});

test('the people a manager added are named on the community’s page only, never on a festival’s card elsewhere', () => {
  const kuof = onDay('2026-11-01', () => festivals().find((e) => e.title.startsWith('KUOF')));
  expect(kuof?.goers.map((g) => g.key).sort()).toEqual(['cedric', 'christina']);
});

test('a link to no community says so', () => {
  expect(said(communityPage('no-such-community-here'))).toBe('No community at this link.');
});

test('the community’s page shares its link, copied when the browser has no share sheet', async () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const share = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Share this page');
  const copied = vi.fn(() => Promise.resolve());
  vi.stubGlobal('navigator', { clipboard: { writeText: copied } });
  try {
    share?.click();
    await expect.poll(() => share?.textContent).toBe('Link copied');
    expect(copied).toHaveBeenCalledWith(location.href);
  } finally {
    vi.unstubAllGlobals();
  }
});

// ----- the months -----
const monthsOf = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.days-month')];
// a day of the months, whether anyone travels on it or not
const cellOn = (root: HTMLElement, day: string) =>
  root.querySelector<HTMLElement>(`.days-month [data-date="${day}"]`) ?? undefined;
const awayOn = (cell: HTMLElement | undefined) =>
  Number(/: (?<n>\d+) (?:person|people) /u.exec(cell?.ariaLabel ?? '')?.groups?.['n'] ?? 0);
// the count at the end of a day's week row
const countOn = (root: HTMLElement, day: string) =>
  said(cellOn(root, day)?.closest('.days-week')?.querySelector('.days-count'));
// the festivals' strokes in a day's week row: the columns each spans, and whether it goes on before or after the row
const strokesOn = (root: HTMLElement, day: string) =>
  [...(cellOn(root, day)?.closest('.days-week')?.querySelectorAll<HTMLElement>('.days-stroke') ?? [])].map((s) => ({
    columns: s.style.gridColumn.replace(/\s/gu, ''),
    from: s.matches('.days-stroke-from'),
    on: s.matches('.days-stroke-on'),
    title: s.title,
  }));
const focusedDay = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement.dataset['day'] : undefined;
const popover = (root: HTMLElement) => root.querySelector<HTMLElement>('.day-pop');
// a key pressed where the focus is
const press = (key: string) =>
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

test('the months are today’s period, four of them, a festival one stroke across its days, its count once', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  expect(monthsOf(root).map((m) => said(m.querySelector('.days-caption')))).toEqual([
    'Nov 2026',
    'Dec 2026',
    'Jan 2027',
    'Feb 2027',
  ]);
  expect([...(monthsOf(root)[0]?.querySelectorAll('.days-head span') ?? [])].map((s) => s.textContent)).toEqual([
    'M',
    'T',
    'W',
    'T',
    'F',
    'S',
    'S',
  ]);
  // the most travelling on a day is the sentence's
  const cells = [...root.querySelectorAll<HTMLElement>('.days-month [data-day]')];
  const most = Math.max(...cells.map(awayOn));
  expect(most).toBe(5);
  expect(cells.filter((c) => awayOn(c) === most).map((c) => c.dataset['day'])).toEqual([
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ]);
  expect(cellOn(root, '2026-11-20')?.ariaLabel).toBe('Fri 20 Nov: 5 people at the festival in Oslo');
  // one colour, whatever the count: no shades, no shade key
  expect(root.querySelector('[class*="days-1"], [class*="days-2"], [class*="days-3"], .days-swatch')).toBeNull();
  expect(said(root.querySelector('.days-legend'))).toBe(
    'festival travel day today · at a row’s end, how many go to the festivals that begin that week',
  );
  // HOT Ice, Thursday 26 Nov to Tuesday 1 Dec: one stroke, round where it begins, cut where it goes on, its count on
  // the row it begins only
  expect(strokesOn(root, '2026-11-26')).toEqual([
    { columns: '4/8', from: false, on: true, title: 'HOT Ice KIZ Festival 11th edition' },
  ]);
  expect(strokesOn(root, '2026-11-30')).toEqual([
    { columns: '1/2', from: true, on: true, title: 'HOT Ice KIZ Festival 11th edition' },
  ]);
  expect(strokesOn(root, '2026-12-01')).toEqual([
    { columns: '2/3', from: true, on: false, title: 'HOT Ice KIZ Festival 11th edition' },
  ]);
  expect([countOn(root, '2026-11-26'), countOn(root, '2026-11-30'), countOn(root, '2026-12-01')]).toEqual([
    '2',
    '',
    '',
  ]);
  // KUOF's row: its 5, as the sentence; Glasgow's 3 on the row it begins, not on the Monday it ends
  expect(countOn(root, '2026-11-20')).toBe('5');
  expect([countOn(root, '2026-11-06'), countOn(root, '2026-11-09')]).toEqual(['3', '']);
  expect(countOn(root, '2026-12-08')).toBe('');
  // Prague from travel.csv: in on Wednesday 13, the day before it, a travel day; its stroke from the 14th
  expect(['12', '13', '18', '19'].map((d) => awayOn(cellOn(root, `2027-01-${d}`)))).toEqual([0, 2, 2, 0]);
  expect(strokesOn(root, '2027-01-14').map((s) => s.columns)).toEqual(['4/8']);
  expect(cellOn(root, '2027-01-13')?.querySelector('.days-dot')).not.toBeNull();
  expect(cellOn(root, '2027-01-14')?.querySelector('.days-dot')).toBeNull();
  // today ringed, the days before it greyed
  expect(root.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  expect(cellOn(root, '2026-11-01')?.querySelector('.days-ring svg')).not.toBeNull();
  const later = onDay('2026-11-10', () => communityPage(COMMUNITY));
  expect(cellOn(later, '2026-11-09')?.matches('.days-past')).toBe(true);
  expect(cellOn(later, '2026-11-11')?.matches('.days-past')).toBe(false);
});

test('a day only travelled has a dot, and a festival’s own days none', () => {
  withTrips(TO_KUOF, () => {
    const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
    const dots = [...root.querySelectorAll('.days-month .days-dot')].map(
      (d) => d.closest<HTMLElement>('[data-date]')?.dataset['date'],
    );
    // Cédric and Christina in to Oslo the day before KUOF and out the day after; Prague's Wednesday
    expect(dots).toEqual(['2026-11-19', '2026-11-23', '2027-01-13']);
    expect(cellOn(root, '2026-11-19')?.ariaLabel).toBe('Thu 19 Nov: 2 people travelling to Oslo');
  });
});

test('a day no one travels on does nothing: no popover, no tab stop, no pointer', async () => {
  await styled(() => {
    inPage('2026-11-01', (root) => {
      const empty = cellOn(root, '2026-11-15');
      expect(empty?.dataset['day']).toBeUndefined();
      expect(empty?.hasAttribute('tabindex')).toBe(false);
      expect(empty?.ariaLabel).toBe('Sun 15 Nov');
      expect(empty === undefined ? '' : getComputedStyle(empty).cursor).not.toBe('pointer');
      empty?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      empty?.click();
      expect(popover(root)?.hidden ?? true).toBe(true);
      const busy = cellOn(root, '2026-11-20');
      expect(busy === undefined ? '' : getComputedStyle(busy).cursor).toBe('pointer');
      // December, where only HOT Ice's last day is: its one stop
      const stops = [...(monthsOf(root)[1]?.querySelectorAll<HTMLElement>('[tabindex="0"]') ?? [])];
      expect(stops.map((c) => c.dataset['day'])).toEqual(['2026-12-01']);
    });
  });
});

test('a month is one stop for the keyboard, its arrows passing over the days no one travels on', () => {
  inPage('2026-11-01', (root) => {
    const stops = (month: HTMLElement | undefined) =>
      [...(month?.querySelectorAll<HTMLElement>('[data-day]') ?? [])].filter((c) => c.tabIndex === 0);
    const [november] = monthsOf(root);
    // November's first day someone travels on: Glasgow's Friday
    expect(stops(november).map((c) => c.dataset['day'])).toEqual(['2026-11-06']);
    stops(november)[0]?.focus();
    expect(popover(root)?.hidden).toBe(false);
    press('ArrowRight');
    expect(focusedDay()).toBe('2026-11-07');
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowRight'); // from Monday 9, over the empty days, to KUOF's Friday
    expect(focusedDay()).toBe('2026-11-20');
    press('ArrowLeft');
    expect(focusedDay()).toBe('2026-11-09');
    press('ArrowDown'); // the first day a week or more on that anyone travels: KUOF's Friday again
    expect(focusedDay()).toBe('2026-11-20');
    press('ArrowUp');
    expect(focusedDay()).toBe('2026-11-09');
    expect(stops(november).map((c) => c.dataset['day'])).toEqual(['2026-11-09']); // still one stop
    expect(said(popover(root))).toContain('Glasgow Kizomba Festival 5.0 · Glasgow');
    press('Escape');
    expect(popover(root)?.hidden).toBe(true);
    cellOn(root, '2026-11-20')?.click();
    expect(popover(root)?.hidden).toBe(false);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover(root)?.hidden).toBe(true);
  });
});

test('a day’s popover says who flies in and out, and when, who is there, and where they stay', () => {
  withTrips(TO_KUOF, () => {
    inPage('2026-11-01', (root) => {
      const open = (day: string) => {
        cellOn(root, day)?.focus();
        return [...(popover(root)?.querySelectorAll('p') ?? [])].map((p) => said(p));
      };
      expect(open('2026-11-19')).toEqual([
        'Thu 19 Nov',
        'KUOF – Kizomba & Urban Kiz Oslo Festival · Oslo',
        'Flying in: Cédric & Christina 17:05 OSL', // one flight, so the couple as one
        'Staying: Scandic Holberg: Cédric & Christina',
      ]);
      expect(open('2026-11-20')).toEqual([
        'Fri 20 Nov',
        'KUOF – Kizomba & Urban Kiz Oslo Festival · Oslo',
        'There: Cédric & Christina, Tonje, Ragnhild and Maja',
        'Staying: Scandic Holberg: Cédric & Christina',
      ]);
      expect(open('2026-11-23')).toContain('Flying out: Cédric & Christina 09:40 OSL');
      open('2026-11-20');
      expect(titled(popover(root))).toEqual(['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, 'Added by Cédric']));
    });
  });
});

test('two festivals on at once both have their row and stroke, a day counts everyone at either, their week both', () => {
  withAdded([['Ola', PARIS]], () => {
    inPage('2026-11-01', (root) => {
      expect(said(root.querySelector('.agenda h2'))).toBe('November · 4 trips');
      expect(agendaRow(root, 'Paris Kizomba Congress')).toBeDefined();
      expect(agendaRow(root, 'KUOF')).toBeDefined();
      expect(awayOn(cellOn(root, '2026-11-21'))).toBe(6);
      expect(awayOn(cellOn(root, '2026-11-19'))).toBe(1); // Paris begins the day before
      // two strokes, Paris under KUOF; the week's count their sum, each named on hover
      expect(strokesOn(root, '2026-11-21').map((s) => s.title)).toEqual([
        'Paris Kizomba Congress',
        'KUOF – Kizomba & Urban Kiz Oslo Festival',
      ]);
      const count = cellOn(root, '2026-11-21')?.closest('.days-week')?.querySelector<HTMLElement>('.days-count');
      expect(said(count)).toBe('6');
      expect(count?.title).toBe('Paris Kizomba Congress: 1 person; KUOF – Kizomba & Urban Kiz Oslo Festival: 5 people');
      cellOn(root, '2026-11-21')?.focus();
      expect(said(popover(root))).toContain('Paris Kizomba Congress · Paris');
      expect(said(popover(root))).toContain('KUOF – Kizomba & Urban Kiz Oslo Festival · Oslo');
    });
  });
});

// ----- the Gantt of an opened trip -----
// a colour's red, green and blue, 0 to 255, however the browser writes it: rgb(…) or color(srgb …) of a mix
const rgbOf = (colour: string): number[] => {
  const [r = 0, g = 0, b = 0] = (colour.match(/[\d.]+/gu) ?? []).map(Number);
  return (colour.startsWith('color(') ? [r * 255, g * 255, b * 255] : [r, g, b]).map(Math.round);
};
const ganttOf = (row: HTMLElement | undefined) => {
  const g = row?.querySelector<HTMLElement>('.gantt');
  return {
    axis: [...(g?.querySelectorAll('.gantt-axis span') ?? [])].map((s) => ({
      day: said(s),
      festival: s.matches('.gantt-fest'),
    })),
    parties: [...(g?.querySelectorAll('.gantt-name:not(.gantt-unsaid)') ?? [])].map((n) => said(n)),
    bars: [...(g?.querySelectorAll<HTMLElement>('.gantt-bar') ?? [])].map((b) => ({
      // its times, at its ends
      said: [...b.querySelectorAll(':scope > span:not(.gantt-ink, .gantt-bar-stay)')].map((t) => said(t)).join(''),
      left: Number.parseFloat(b.style.left),
      width: Number.parseFloat(b.style.width),
      ink: ['height', 'translate', 'rotate', 'border-radius', 'opacity']
        .map((p) => b.querySelector<HTMLElement>('.gantt-ink')?.style.getPropertyValue(p) ?? '')
        .join(' '),
    })),
    // the rule of those who have not said: where it runs, and how it is drawn, a line no box
    none: [...(g?.querySelectorAll<HTMLElement>('.gantt-none') ?? [])].map((b) => {
      const css = getComputedStyle(b);
      return {
        at: [Number.parseFloat(b.style.left), Number.parseFloat(b.style.width)],
        // how it is drawn: a straight line, its thickness, nothing under it, and its colour's channels
        drawn: [css.borderTopStyle, css.borderBottomStyle],
        thick: Number.parseFloat(css.borderTopWidth),
        rgb: rgbOf(css.borderTopColor),
      };
    }),
    said: said(row?.querySelector('.gantt-said')),
    unsaid: said(row?.querySelector('.gantt-unsaid')),
  };
};
const opened = (root: HTMLElement, title: string) => {
  const row = agendaRow(root, title);
  if (row?.querySelector<HTMLElement>('.trip-body')?.hidden) row.querySelector<HTMLElement>('.trip-toggle')?.click();
  return row;
};

test('an opened trip draws who travels when: the days from the first in to the last out, a bar a party', () => {
  withTrips(TO_KUOF, () => {
    const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
    const kuof = ganttOf(opened(root, 'KUOF'));
    // in the day before the festival, out the day after
    expect(kuof.axis).toEqual([
      { day: 'T19', festival: false },
      { day: 'F20', festival: true },
      { day: 'S21', festival: true },
      { day: 'S22', festival: true },
      { day: 'M23', festival: false },
    ]);
    // the couple as one party, on one flight, the one bar, and where they stay under their name on a phone (beside the
    // bar on a computer); the people added, who never travel, on one last line. What they do there is the row's to say:
    // the card has no role tag
    expect(kuof.parties).toEqual(['Cédric & Christina Scandic Holberg']);
    const card = agendaRow(root, 'KUOF')?.querySelector('.trip-body');
    expect(card?.querySelectorAll('.plan-tag')).toHaveLength(0);
    expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-who'))).toBe('5 going · Cédric & Christina teaching');
    const [couple, ...others] = kuof.bars;
    expect(others).toEqual([]);
    expect(couple?.said).toBe('17:05 OSL09:40 OSL');
    expect(couple?.left).toBeCloseTo((100 * (17 + 5 / 60)) / 24 / 5, 3); // 17:05 on the first of five days
    expect((couple?.left ?? 0) + (couple?.width ?? 0)).toBeCloseTo((100 * (4 + (9 + 40 / 60) / 24)) / 5, 3);
    // no band behind the bar: the axis marks the festival's days. Those who have not said are a thin rule across them,
    // the second to the fourth of five days
    expect(agendaRow(root, 'KUOF')?.querySelector('.gantt-lane')?.childElementCount).toBe(1);
    expect(kuof.none.map((n) => n.at)).toEqual([[20, 60]]);
    expect(kuof.said).toBe(
      'Cédric & Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Scandic Holberg; not said yet: Maja, Ragnhild and Tonje',
    );
    // the three who have not said, more than half of the five but only three: named
    expect(kuof.unsaid).toBe('Maja, Ragnhild and Tonje');
    expect(titled(agendaRow(root, 'KUOF')?.querySelector('.gantt-unsaid'))).toEqual(
      ['Maja', 'Ragnhild', 'Tonje'].map((n) => [n, 'Added by Cédric']),
    );
    // no sentences about who has not said or where who stays: the lines say it
    expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-body'))).not.toMatch(/Not said yet|Staying /u);
    // Prague from travel.csv: in on the Wednesday before it
    expect(ganttOf(opened(root, 'Prague')).axis.map((a) => a.day)).toEqual(['W13', 'T14', 'F15', 'S16', 'S17', 'M18']);
    // Glasgow, where no one said how they travel: its own days and its band, no bar, everyone named once under it
    const glasgow = ganttOf(agendaRow(root, 'Glasgow'));
    expect(glasgow.axis.map((a) => a.day)).toEqual(['F6', 'S7', 'S8', 'M9']);
    expect(glasgow.bars).toEqual([]);
    expect(glasgow.none.map((n) => n.at)).toEqual([[0, 100]]);
    expect(glasgow.parties).toEqual([]);
    expect(glasgow.said).toBe('not said yet: Caroline, Christina and Siân');
    expect(glasgow.unsaid).toBe('Caroline, Christina and Siân');
    expect(titled(agendaRow(root, 'Glasgow')?.querySelector('.gantt-unsaid'))).toEqual(
      ['Caroline', 'Siân'].map((n) => [n, 'Added by Cédric']),
    );
    // a couple who has not said is named as one
    expect(ganttOf(opened(root, 'HOT Ice')).unsaid).toBe('Cédric & Christina');
  });
});

test('a festival from a Wednesday to a Tuesday, a week long, fills its every day and its Gantt’s axis', () => {
  withAdded([['Ola', ALBANIA]], () => {
    const root = onDay('2026-11-01', () => communityPage(COMMUNITY, 'from=2027-03'));
    expect(['04', '05', '08', '11', '12'].map((d) => awayOn(cellOn(root, `2027-05-${d}`)))).toEqual([0, 1, 1, 1, 0]);
    expect(ganttOf(opened(root, 'Albania')).axis.map((a) => a.day)).toEqual([
      'W5',
      'T6',
      'F7',
      'S8',
      'S9',
      'M10',
      'T11',
    ]);
  });
});

test('on a phone the months go two a row and a fortnight’s Gantt fits, with no sideways scroll', async () => {
  await styled(async () => {
    const phone = h('div', { style: { width: '358px' } }); // 390px less the gutters
    document.body.append(phone);
    try {
      await page.viewport(390, 844);
      withTrips([['cedric', 17_493, '2026-11-19T10:00', '2026-12-02T18:00', null]], () => {
        const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
        phone.append(root);
        const hot = opened(root, 'HOT Ice');
        expect(ganttOf(hot).axis).toHaveLength(14);
        const [first, second] = monthsOf(root).map((m) => m.getBoundingClientRect());
        expect(second?.top).toBeCloseTo(first?.top ?? 0, 0); // side by side
        expect(phone.scrollWidth).toBeLessThanOrEqual(358);
        expect(hot?.querySelector('.gantt')?.getBoundingClientRect().width).toBeLessThanOrEqual(358);
        expect(cellOn(root, '2026-11-20')?.getBoundingClientRect().width).toBeGreaterThanOrEqual(16);
      });
    } finally {
      await page.viewport(414, 896);
      phone.remove();
    }
  });
});

test('with nothing to come, the community’s page has no sentence of when it travels, nor months', () => {
  const root = onDay('2028-01-01', () => communityPage(COMMUNITY));
  expect(said(root)).not.toContain('Most members');
  expect(root.querySelector('.days-month')).toBeNull();
  expect(said(root)).toContain('No one in this community has said they’re going anywhere yet.');
});

// where a day's popover is, against the month the day is in
const boxes = (root: HTMLElement, day: string) => {
  const cell = cellOn(root, day);
  cell?.focus();
  return {
    pop: popover(root)?.getBoundingClientRect(),
    grid: cell?.closest('.days-month')?.getBoundingClientRect(),
    shown: popover(root)?.hidden === false,
  };
};
const meet = (a?: DOMRect, b?: DOMRect) =>
  a !== undefined && b !== undefined && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// the page this wide, with its stylesheet, while then runs
async function atWidth(width: number, then: () => unknown): Promise<void> {
  await styled(async () => {
    await page.viewport(width, 900);
    try {
      await then();
    } finally {
      await page.viewport(414, 896);
    }
  });
}

test('on a computer a day’s popover opens beside its month, never over it', async () => {
  await atWidth(1200, () => {
    inPage('2026-11-01', (root) => {
      for (const day of ['2026-11-20', '2026-11-06', '2027-01-13']) {
        const b = boxes(root, day);
        expect(b.shown).toBe(true);
        expect(meet(b.pop, b.grid)).toBe(false);
      }
      // to the right of November, at the day's height
      const nov = boxes(root, '2026-11-20');
      expect(nov.pop?.left).toBeGreaterThanOrEqual(nov.grid?.right ?? Number.POSITIVE_INFINITY);
      expect(
        Math.abs((nov.pop?.top ?? 0) - (cellOn(root, '2026-11-20')?.getBoundingClientRect().top ?? 0)),
      ).toBeLessThan(1);
      expect(document.activeElement).toBe(cellOn(root, '2026-11-20')); // the focus stays in the month
    });
  });
});

test('on a phone a day opens a panel under its row of months, moving what follows down; a tap on it again closes', async () => {
  await atWidth(390, () => {
    inPage('2026-11-01', (root) => {
      const legend = () => root.querySelector('.days-legend')?.getBoundingClientRect().top ?? 0;
      const before = legend();
      const b = boxes(root, '2026-11-20');
      const pop = popover(root);
      expect(b.shown).toBe(true);
      expect(pop === null ? '' : getComputedStyle(pop).position).toBe('static'); // in the page's flow
      expect(meet(b.pop, b.grid)).toBe(false);
      expect(b.pop?.top).toBeGreaterThanOrEqual(b.grid?.bottom ?? Number.POSITIVE_INFINITY);
      // under November and December, which share a row, before January
      const [, december, january] = monthsOf(root);
      expect(b.pop?.top).toBeGreaterThanOrEqual(december?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY);
      expect(b.pop?.bottom).toBeLessThanOrEqual(january?.getBoundingClientRect().top ?? 0);
      expect(b.pop?.width).toBeGreaterThan((b.grid?.width ?? 0) * 1.5); // the page's width, not a month's
      expect(legend()).toBeGreaterThan(before); // what follows moved down
      expect(document.activeElement).toBe(cellOn(root, '2026-11-20'));
      // a tap on the day again closes it
      const cell = cellOn(root, '2026-11-20');
      cell?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      cell?.click();
      expect(pop?.hidden).toBe(true);
      expect(legend()).toBe(before);
    });
  });
});

test('a trip is a row of the agenda, and what it opens a card under it, as a festival’s; only the next one open', async () => {
  await styled(() => {
    inPage('2026-11-01', (root) => {
      const trips = [...root.querySelectorAll<HTMLElement>('.agenda .trip')];
      expect(trips.length).toBeGreaterThan(1);
      const look = (el: HTMLElement | null) => {
        const st = el === null ? undefined : getComputedStyle(el);
        return [st?.borderTopLeftRadius, st?.backgroundColor, st?.boxShadow !== 'none', st?.borderTopStyle];
      };
      const card = h('article', { class: 'festival-card' });
      document.body.append(card);
      try {
        const [radius, surface] = look(card);
        for (const t of trips) {
          // the row is no card: no radius, no shadow, no box but the line under it
          expect(look(t)).toEqual(['0px', 'rgba(0, 0, 0, 0)', false, 'none']);
          // what it opens is
          expect(look(t.querySelector('.trip-body'))).toEqual([radius, surface, true, 'solid']);
          expect(t.querySelector('.trip-head')?.closest('.trip-body')).toBeNull();
        }
      } finally {
        card.remove();
      }
      expect(trips.map((t) => t.querySelector<HTMLElement>('.trip-body')?.hidden)).toEqual(
        trips.map((_, i) => i !== 0),
      );
    });
  });
});

test('each festival’s stroke is a swipe of its own, the same however often it is drawn', () => {
  // each week's swipe of each festival: its shape, without where it lies
  const swipes = () =>
    new Map(
      [
        ...onDay('2026-11-01', () => communityPage(COMMUNITY)).querySelectorAll<HTMLElement>('.days-week .days-stroke'),
      ].map((s) => [
        `${s.title} ${s.closest('.days-week')?.querySelector('[data-date]')?.getAttribute('data-date') ?? ''}`,
        ['height', 'translate', 'rotate', 'border-radius', 'opacity'].map((p) => s.style.getPropertyValue(p)).join(' '),
      ]),
    );
  const once = swipes();
  expect(once.size).toBeGreaterThan(3);
  expect(swipes()).toEqual(once); // drawn again, the same
  expect(new Set(once.values()).size).toBe(once.size); // no two alike
  for (const shape of once.values()) expect(shape).toMatch(/^[\d.]+rem 0px [\d.]+rem -?[\d.]+deg /u);
});

test('a trip’s bars are highlighter swipes, each party its own, the same however often drawn', () => {
  const parties: readonly Planted[] = [
    ...TO_KUOF.slice(0, 1),
    ['christina', 19_033, '2026-11-20T08:00', '2026-11-22T20:00', null],
  ];
  withTrips(parties, () => {
    const bars = () =>
      ganttOf(
        opened(
          onDay('2026-11-01', () => communityPage(COMMUNITY)),
          'KUOF',
        ),
      ).bars;
    const once = bars();
    expect(once.map((b) => b.said)).toEqual(['17:05 OSL09:40 OSL', '08:00 OSL20:00 OSL']);
    for (const b of once) expect(b.ink).toMatch(/^[\d.]+rem 0px( [\d.]+rem)? -?[\d.]+deg /u);
    expect(once[0]?.ink).not.toBe(once[1]?.ink); // a party's own swipe
    expect(bars()).toEqual(once); // drawn again, the same
  });
});

test('a festival’s stroke runs across the lower half of its days’ numbers', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const strokes = [...root.querySelectorAll<HTMLElement>('.days-week .days-stroke')];
  expect(strokes.length).toBeGreaterThan(3);
  for (const s of strokes) {
    const height = Number.parseFloat(s.style.height),
      drop = Number.parseFloat(s.style.translate.split(' ')[1] ?? '');
    expect(height).toBeLessThanOrEqual(0.66); // thinner than a number is tall (1.45rem a row)
    expect(drop).toBeGreaterThanOrEqual(0.18); // and lower than its middle
  }
});

test('a count keeps its word: "5 people" never breaks', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const sentence = root.querySelector('.community-when')?.textContent ?? '';
  expect(sentence).toContain('5\u00a0people');
  expect(sentence).toContain('20–22\u00a0Nov');
});

test('a trip’s bars lie level, on a computer as on a phone: one end no more than 2px above the other', async () => {
  // each bar's ink in KUOF's card: how wide it is, and how far one end is above the other (its box's height less its
  // own)
  const slopes = () => {
    const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
    document.body.append(root);
    try {
      return [...(opened(root, 'KUOF')?.querySelectorAll<HTMLElement>('.gantt-ink') ?? [])].map((i) => ({
        wide: i.getBoundingClientRect().width,
        rise: i.getBoundingClientRect().height - i.offsetHeight,
      }));
    } finally {
      root.remove();
    }
  };
  const parties: readonly Planted[] = [
    ...TO_KUOF.slice(0, 1),
    ['christina', 19_033, '2026-11-20T08:00', '2026-11-22T20:00', null],
  ];
  plant(parties);
  try {
    for (const width of [1200, 390])
      await atWidth(width, () => {
        const bars = slopes();
        expect(bars).toHaveLength(2);
        for (const b of bars) {
          expect(b.wide).toBeGreaterThan(width === 1200 ? 150 : 50);
          expect(b.rise).toBeLessThanOrEqual(2);
        }
      });
  } finally {
    uproot(parties);
  }
});

// the community's page on a day with the illustrative KUOF trip, this wide, in the document while then runs
// stays planted while then runs, each [person, festival, first night, last night, place]
type Slept = readonly [string, number, string, string, string];
function withStays<T>(stays: readonly Slept[], then: () => T): T {
  for (const row of stays)
    db?.run('INSERT INTO stays SELECT id, ?, ?, ?, ? FROM people WHERE key = ?', [...row.slice(1), row[0]]);
  try {
    return then();
  } finally {
    db?.run("DELETE FROM stays WHERE person_id IN (SELECT id FROM people WHERE key IN ('cedric', 'christina'))");
  }
}
async function kuofAt(
  width: number,
  then: (root: HTMLElement) => unknown,
  trips = TO_KUOF,
  stays: readonly Slept[] = [],
): Promise<void> {
  const root = withStays(stays, () => withTrips(trips, () => onDay('2026-11-01', () => communityPage(COMMUNITY))));
  await atWidth(width, async () => {
    document.body.append(root);
    try {
      // KUOF's card open, and laid out a few frames, as its roster measures itself and places what it measured
      opened(root, 'KUOF');
      for (const _ of [1, 2, 3]) await new Promise(requestAnimationFrame);
      await then(root);
    } finally {
      root.remove();
    }
  });
}

test('a trip’s bars are thin, and the chart in words is for a screen reader alone', async () => {
  await kuofAt(1200, (root) => {
    const row = opened(root, 'KUOF');
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const ink = [...(row?.querySelectorAll<HTMLElement>('.gantt-ink') ?? [])];
    expect(ink).toHaveLength(1);
    for (const i of ink) expect(i.offsetHeight).toBeLessThanOrEqual(0.7 * rem + 0.5);
    // its times still on it
    expect(ganttOf(row).bars[0]?.said).toBe('17:05 OSL09:40 OSL');
    // the line in words: not shown, but what describes the chart
    const words = row?.querySelector<HTMLElement>('.gantt-said');
    expect(words?.textContent).toBe(
      'Cédric & Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Scandic Holberg; not said yet: Maja, Ragnhild and Tonje',
    );
    expect(words?.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(row?.querySelector('.gantt')?.getAttribute('aria-describedby')).toBe(words?.id);
    // the people who have not said, on their line
    expect(row?.querySelector<HTMLElement>('.gantt-unsaid')?.getBoundingClientRect().width).toBeGreaterThan(50);
  });
});

// what KUOF's roster shows with two more people added: its lines, its rule, and its collective line's names as they
// are shown and hidden, by a tap, Escape and the pointer, each time as [aria-expanded, the names seen]
async function collectiveOf(root: HTMLElement) {
  const row = opened(root, 'KUOF');
  const lines = [...(row?.querySelectorAll('.gantt-name') ?? [])];
  const who = row?.querySelector<HTMLButtonElement>('.gantt-who');
  const list = row?.querySelector(`#${who?.getAttribute('aria-controls')}`);
  const state = () => [who?.getAttribute('aria-expanded'), list?.checkVisibility() ?? null];
  const states = [state()];
  who?.click();
  states.push(state());
  // the names opened: their box inside the card's
  const card = row?.querySelector('.trip-body')?.getBoundingClientRect();
  const box = list?.getBoundingClientRect();
  const inCard =
    card !== undefined &&
    box !== undefined &&
    box.width > 0 &&
    box.left >= card.left &&
    box.right <= card.right &&
    box.top >= card.top &&
    box.bottom <= card.bottom;
  // and over nothing else of the roster: the other cells it meets, by their text
  const meets = (r: DOMRect) =>
    box !== undefined &&
    r.width > 0 &&
    Math.min(r.right, box.right) - Math.max(r.left, box.left) > 0.5 &&
    Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top) > 0.5;
  const covers = [...(row?.querySelectorAll('.gantt > *') ?? [])]
    .filter((c) => c !== list && meets(c.getBoundingClientRect()))
    .map((c) => said(c));
  who?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  states.push(state());
  if (who) await userEvent.hover(who);
  states.push(state());
  if (who) await userEvent.unhover(who);
  states.push(state());
  return {
    lines: lines.map((n) => said(n.querySelector('.gantt-who') ?? n)),
    unsaid: lines.map((n) => n.matches('.gantt-unsaid')),
    rule: ganttOf(row).none,
    inCard,
    covers,
    // its label: the colour of the text around it, underlined dotted as the other names
    label: who
      ? [getComputedStyle(who).color === getComputedStyle(root).color, getComputedStyle(who).textDecorationStyle]
      : [],
    accent: rgbOf(getComputedStyle(row?.querySelector('.gantt-fest') ?? root).color), // the festival's days, in it
    ink: row?.querySelector<HTMLElement>('.gantt-ink')?.offsetHeight ?? 0,
    names: said(list),
    states,
    words: said(row?.querySelector('.gantt-said')),
  };
}

test('a roster of more than three, its biggest line of more than three people "Everyone else", names them on demand', async () => {
  for (const width of [1200, 390])
    await atWidth(width, async () => {
      // Cédric and Christina flying together, and five people added who never say how they travel: seven people
      const added = (['Ola', 'Kari'] as const).map((n) => [n, 19_033] as const);
      const root = withTrips(TO_KUOF, () =>
        withAdded(added, () => onDay('2026-11-01', () => communityPage(COMMUNITY))),
      );
      document.body.append(root);
      const seen = await collectiveOf(root).finally(() => root.remove());
      // the couple's line named, by arrival; the five who have not said "Everyone else", last, on a rule
      expect(seen.lines).toEqual(['Cédric & Christina Scandic Holberg', 'Everyone else']);
      expect(seen.unsaid).toEqual([false, true]);
      // the rule: a straight line of the accent, 2 to 3px, thinner than a bar's ink
      const [rule] = seen.rule;
      expect(rule?.drawn).toEqual(['solid', 'none']);
      expect(rule?.thick).toBeGreaterThanOrEqual(2);
      expect(rule?.thick).toBeLessThanOrEqual(3);
      expect(rule?.thick).toBeLessThan(seen.ink);
      expect(rule?.rgb).toEqual(seen.accent);
      // its label as dark as the text, dotted under as the other names
      expect(seen.label).toEqual([true, 'dotted']);
      // its names: hidden; shown by a tap, under the line in the card and over nothing, hidden again by Escape; shown while the pointer is over
      // it; and in the words
      expect(seen.names).toBe('Kari, Maja, Ola, Ragnhild and Tonje');
      expect(seen.inCard).toBe(true);
      expect(seen.covers).toEqual([]);
      expect(seen.states).toEqual([
        ['false', false],
        ['true', true],
        ['false', false],
        ['false', true],
        ['false', false],
      ]);
      expect(seen.words).toContain('not said yet: Everyone else (Kari, Maja, Ola, Ragnhild and Tonje)');
    });
});

// a line of the roster laid out: its stay beside the bar or under the name, its airports, the stay's heading
const rosterAt = (root: HTMLElement) => {
  const row = opened(root, 'KUOF');
  const shown = (el: Element | null | undefined) =>
    el instanceof HTMLElement && el.checkVisibility({ visibilityProperty: true }) && el.offsetWidth > 0
      ? said(el)
      : null;
  const inBar = row?.querySelector<HTMLElement>('.gantt-bar-stay');
  return {
    beside: shown(row?.querySelector('.gantt-name ~ .gantt-stay:not(:empty)')),
    under: shown(row?.querySelector('.gantt-stay-under')),
    inBar: shown(inBar) === null ? null : [said(inBar), inBar?.title],
    airports: [...(row?.querySelectorAll('.gantt-ap') ?? [])].map((a) => shown(a)),
    header: shown(row?.querySelector('.gantt > .gantt-stay')),
  };
};

test('where a line stays is beside its days on a computer, in its bar on a phone (under its name when too short)', async () => {
  const stay = 'Scandic Holberg';
  // a day there: Saturday morning to Sunday morning
  const short = TO_KUOF.map(([key, event]) => [key, event, '2026-11-21T10:00', '2026-11-22T09:00', stay] as const);
  for (const [width, trips, seen] of [
    [1200, TO_KUOF, { beside: stay, under: null, inBar: null, airports: ['OSL', 'OSL'], header: 'Staying' }],
    [390, TO_KUOF, { beside: null, under: null, inBar: [stay, stay], airports: [null, null], header: null }],
    [390, short, { beside: null, under: stay, inBar: null, airports: [null, null], header: null }],
  ] as const)
    await kuofAt(width, (root) => expect(rosterAt(root)).toEqual(seen), trips);
});

// an element's colour's alpha, and its opacity
const alpha = (el: Element | null | undefined, pseudo?: string): [number, number] => {
  const st = el ? getComputedStyle(el, pseudo) : undefined;
  const channels = (st?.backgroundColor ?? '').match(/[\d.]+/gu) ?? [];
  return [channels.length > 3 ? Number(channels[3]) : 1, Number(st?.opacity ?? 1)];
};

test('the highlighter is light: its ink at most a quarter, the roster’s lighter, the second passes fainter still', async () => {
  await kuofAt(1200, (root) => {
    const ink = opened(root, 'KUOF')?.querySelector('.gantt-ink');
    const stroke = root.querySelector('.days-week .days-stroke');
    expect(alpha(ink)[0]).toBeLessThanOrEqual(0.15);
    expect(alpha(ink, '::after')[1]).toBeLessThanOrEqual(0.3);
    // the times on it as dark as any text
    const time = opened(root, 'KUOF')?.querySelector('.gantt-bar > span:not(.gantt-ink)');
    expect(time ? getComputedStyle(time).color : '').toBe(getComputedStyle(root).color);
    expect(alpha(stroke)[0]).toBeLessThanOrEqual(0.25);
    expect(alpha(stroke, '::after')[1]).toBeLessThanOrEqual(0.45);
  });
});

// ----- four months at a time: the calendar's period, and the agenda's trips with a day in it -----
// what the page shows of its period: its name, its months, its steps (on or off, by their labels), the agenda's
// headings or what it says when it has none, and the sentence and "Next"
const periodOf = (root: HTMLElement) => ({
  said: said(root.querySelector('.days-said')),
  months: monthsOf(root).map((m) => m.ariaLabel),
  steps: [...root.querySelectorAll<HTMLButtonElement>('.days-step')].map((b) => [b.ariaLabel, b.disabled]),
  agenda: [...root.querySelectorAll('.agenda h2, .agenda > p')].map((x) => said(x)),
  head: [said(root.querySelector('.community-when')), said(root.querySelector('.community-next'))],
});
const step = (root: HTMLElement, label: string) =>
  root.querySelector<HTMLButtonElement>(`.days-step[aria-label="${label}"]`)?.click();
const HEAD = ['Most members are travelling 20–22 Nov: 5 people, to Oslo.', 'Next: Glasgow, this Friday'];
const RIGA = 16_246; // ILKSF Meets HIK Latvia, in Riga, 3–6 September 2027

test('the calendar shows today’s four months between its steps, the agenda their trips', () => {
  const seen = periodOf(onDay('2026-11-04', () => communityPage(COMMUNITY)));
  // every trip of the community is in them: both steps off
  expect(seen).toEqual({
    said: 'Nov 2026 – Feb 2027',
    months: ['November 2026', 'December 2026', 'January 2027', 'February 2027'],
    steps: [
      ['Previous four months', true],
      ['Next four months', true],
    ],
    agenda: ['November · 3 trips', 'January 2027 · 1 trip', 'February · 2 trips'],
    head: HEAD,
  });
  // the steps are drawings, of the icons' module
  expect(onDay('2026-11-04', () => communityPage(COMMUNITY)).querySelector('.days-step svg')).not.toBeNull();
});

test('the steps go through the periods in place to the last trip’s, the agenda with them, the address keeping it', () => {
  const was = location.hash;
  try {
    // Maja to Riga in September: March to June with nothing, then July to October
    withAdded([['Maja', RIGA]], () => {
      const root = onDay('2026-11-04', () => communityPage(COMMUNITY));
      const seen = [periodOf(root)];
      const addresses: string[] = [];
      for (const _ of [1, 2]) {
        step(root, 'Next four months');
        seen.push(periodOf(root));
        addresses.push(location.hash.split('?')[1] ?? '');
      }
      expect(seen.map((t) => t.said)).toEqual(['Nov 2026 – Feb 2027', 'Mar – Jun 2027', 'Jul – Oct 2027']);
      expect(seen[1]?.months).toEqual(['March 2027', 'April 2027', 'May 2027', 'June 2027']);
      expect(seen.map((t) => t.agenda)).toEqual([
        ['November · 3 trips', 'January 2027 · 1 trip', 'February · 2 trips'],
        ['Nothing planned in Mar–Jun'],
        ['September 2027 · 1 trip'],
      ]);
      expect(seen.map((t) => t.steps.map(([, off]) => off))).toEqual([
        [true, false],
        [false, false],
        [false, true],
      ]);
      expect(addresses).toEqual(['from=2027-03', 'from=2027-07']);
      // the sentence and "Next" are of every trip, whatever period shows
      for (const t of seen) expect(t.head).toEqual(HEAD);
      for (const _ of [1, 2]) step(root, 'Previous four months');
      expect(periodOf(root).said).toBe('Nov 2026 – Feb 2027');
      expect(location.hash).not.toContain('from=');
    });
  } finally {
    history.replaceState(null, '', was || location.pathname);
  }
});

test('the period in the address shows, one the calendar does not step to is today’s', () => {
  withAdded([['Maja', RIGA]], () => {
    const at = (qs: string) => periodOf(onDay('2026-11-04', () => communityPage(COMMUNITY, qs))).said;
    expect(at('from=2027-03')).toBe('Mar – Jun 2027');
    expect(at('from=2027-02')).toBe('Nov 2026 – Feb 2027'); // no period begins in February
    expect(at('from=2027-11')).toBe('Nov 2026 – Feb 2027'); // after the last trip
    expect(at('from=2026-07')).toBe('Nov 2026 – Feb 2027'); // before today's
  });
});

test('a trip with a day in the period is among its trips, though its festival is in the next', () => {
  // seen from October, the first four months are October to January; Cédric flies in to Cloudkiz (26–28 Feb) on the
  // last day of January
  const early: readonly Planted[] = [['cedric', 18_760, '2027-01-31T20:00', '2027-03-01T10:00', null]];
  const fromOctober = () => periodOf(onDay('2026-10-15', () => communityPage(COMMUNITY)));
  expect(fromOctober().agenda).toEqual(['November · 3 trips', 'January 2027 · 1 trip']);
  expect(withTrips(early, fromOctober).agenda).toEqual([
    'November · 3 trips',
    'January 2027 · 1 trip',
    'February · 1 trip',
  ]);
});

test('trips only far off: today’s period shows empty, and the next its trips', () => {
  withAdded([['Maja', 18_766]], () => {
    // from 1 March 2027: March to June has none of the community; July to October, Maja's
    const root = onDay('2027-03-01', () => communityPage(COMMUNITY));
    expect(periodOf(root).agenda).toEqual(['Nothing planned in Mar–Jun']);
    step(root, 'Next four months');
    expect([periodOf(root).said, periodOf(root).agenda]).toEqual(['Jul – Oct 2027', ['July · 1 trip']]);
  });
});

test('a step that turns itself off leaves the focus on the other', () => {
  withAdded([['Maja', RIGA]], () =>
    inPage('2026-11-04', (root) => {
      const next = root.querySelector<HTMLButtonElement>('.days-step[aria-label="Next four months"]');
      next?.focus();
      next?.click();
      next?.click();
      expect(document.activeElement?.ariaLabel).toBe('Previous four months');
    }),
  );
});

test('on a phone a day’s panel opens under its row of months in a later period too', async () => {
  await atWidth(390, () =>
    withAdded([['Maja', RIGA]], () =>
      inPage('2026-11-04', (root) => {
        step(root, 'Next four months');
        step(root, 'Next four months');
        cellOn(root, '2027-09-04')?.focus();
        expect(popover(root)?.checkVisibility()).toBe(true);
        // a step closes it
        const pop = popover(root);
        step(root, 'Previous four months');
        expect(pop?.hidden).toBe(true);
      }),
    ),
  );
});

test('the steps sit on the line of the period’s name, and its months in two rows on a phone, one on a computer', async () => {
  for (const width of [390, 600, 1200])
    await atWidth(width, () =>
      inPage('2026-11-04', (root) => {
        const middle = (el: { getBoundingClientRect: () => DOMRect } | null) => {
          const r = el?.getBoundingClientRect();
          return r === undefined ? Number.NaN : r.top + r.height / 2;
        };
        // the name's text, by a range over it, whatever box its element has
        const text = document.createRange();
        const name = root.querySelector('.days-said');
        text.selectNodeContents(name ?? document.body);
        const at = middle(text);
        for (const b of root.querySelectorAll('.days-step')) expect(Math.abs(middle(b) - at)).toBeLessThanOrEqual(1);
        // the four months: two rows of two on a phone or a small tablet, one row of four on a computer, never three and one
        const placed = monthsOf(root).map((m) => m.getBoundingClientRect());
        const grid = [
          new Set(placed.map((b) => Math.round(b.top))).size,
          new Set(placed.map((b) => Math.round(b.left))).size,
        ];
        expect(grid).toEqual(width < 700 ? [2, 2] : [1, 4]);
      }),
    );
});

// ----- a roster of travels, each with its stays counted, and the same people by hotel -----
// KUOF's roster, read: its lines' names, their bars (what they say and their titles), the thin lines of what was not
// said (where they run, in days from the first), what each line's stay column says (and its title), and the words
const linesOf = (root: HTMLElement) => {
  const card = opened(root, 'KUOF');
  const g = card?.querySelector<HTMLElement>('.gantt:not([hidden])');
  const days = g?.querySelectorAll('.gantt-axis span').length ?? 1;
  const dayOf = (x: number) => Math.round(((x * days) / 100) * 100) / 100;
  return {
    names: [...(g?.querySelectorAll('.gantt-name') ?? [])].map((n) => said(n.querySelector('button') ?? n)),
    bars: [...(g?.querySelectorAll<HTMLElement>('.gantt-bar') ?? [])].map((b) => ({
      said: [...b.querySelectorAll(':scope > span:not(.gantt-ink, .gantt-shared)')].map((x) => said(x)),
      title: b.title,
      at: [
        dayOf(Number.parseFloat(b.style.left)),
        dayOf(Number.parseFloat(b.style.left) + Number.parseFloat(b.style.width)),
      ],
    })),
    thin: [...(g?.querySelectorAll<HTMLElement>('.gantt-bar ~ .gantt-none, .gantt-none:has(+ .gantt-bar)') ?? [])].map(
      (x) => [
        dayOf(Number.parseFloat(x.style.left)),
        dayOf(Number.parseFloat(x.style.left) + Number.parseFloat(x.style.width)),
      ],
    ),
    staying: [...(g?.querySelectorAll<HTMLElement>('.gantt-name ~ .gantt-stay') ?? [])].map((x) => [said(x), x.title]),
    unsaid: g?.querySelectorAll('.gantt-unsaid').length,
    words: said(card?.querySelector('.gantt-said:not([hidden])')),
    text: said(card?.querySelector('.trip-body')),
  };
};
const KUOF_NIGHTS = ['2026-11-19', '2026-11-22'] as const;
const flown: readonly Planted[] = TO_KUOF.map(([k, e, a, l]) => [k, e, a, l, null] as const);
const APART: readonly Slept[] = [
  ['cedric', 19_033, ...KUOF_NIGHTS, 'Scandic Holberg'],
  ['christina', 19_033, ...KUOF_NIGHTS, 'Comfort Xpress Oslo Sentrum'],
];

test('a couple flying alike and staying apart is one line, its stays a count, never a name cut short', async () => {
  await kuofAt(
    1200,
    (root) => {
      const seen = linesOf(root);
      // one travel, one line: the partners each a unit, named, a button for their stays
      expect(seen.names).toEqual(['Cédric and Christina', 'Maja, Ragnhild and Tonje']);
      // two places: a count, the whole in its title and the words
      expect(seen.staying[0]).toEqual(['2 hotels', 'Comfort Xpress Oslo Sentrum 1 · Scandic Holberg 1']);
      expect(seen.words).toContain(
        'Cédric and Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying: Comfort Xpress Oslo Sentrum: Christina, Scandic Holberg: Cédric',
      );
      const who = opened(root, 'KUOF')?.querySelector<HTMLElement>('.gantt-name button');
      who?.click();
      expect(said(document.getElementById(who?.getAttribute('aria-controls') ?? ''))).toBe(
        'Comfort Xpress Oslo Sentrum Christina · Scandic Holberg Cédric',
      );
      // no name shortened, nor "+1", anywhere on the card
      expect(seen.text).not.toMatch(/…|\+\d/u);
    },
    flown,
    APART,
  );
  await kuofAt(
    390,
    (root) => {
      const inBar = opened(root, 'KUOF')?.querySelector<HTMLElement>('.gantt-bar-stay');
      expect([said(inBar), inBar?.title]).toEqual(['2 hotels', 'Comfort Xpress Oslo Sentrum 1 · Scandic Holberg 1']);
    },
    flown,
    APART,
  );
});

test('someone moving from one place to another: "2 places", the way in its title and the words', async () => {
  const moving: readonly Slept[] = [
    ['cedric', 19_033, '2026-11-19', '2026-11-19', 'Airbnb'],
    ['cedric', 19_033, '2026-11-20', '2026-11-22', 'Scandic Holberg'],
  ];
  const alone: readonly Planted[] = [['cedric', 19_033, '2026-11-19T17:05', '2026-11-23T09:40', null]];
  await kuofAt(
    1200,
    (root) => {
      const seen = linesOf(root);
      expect(seen.bars[0]?.said).toEqual(['17:05 OSL', '2 places', '09:40 OSL']);
      expect(seen.staying[0]).toEqual(['2 places', 'Airbnb → Scandic Holberg']);
      expect(seen.words).toContain('Cédric in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Airbnb → Scandic Holberg');
      expect(opened(root, 'KUOF')?.querySelectorAll('.gantt-cut, .gantt-seg')).toHaveLength(0);
    },
    alone,
    moving,
  );
});

test('what was not said is the thin line: an end not said to the festival’s edge, nights alone between it', async () => {
  // Cédric said only his flight in; Christina only where she stays, Saturday night
  const halves: readonly Planted[] = [['cedric', 19_033, '2026-11-19T17:05', null, null]];
  await kuofAt(
    1200,
    (root) => {
      const seen = linesOf(root);
      // the axis from Thursday 19 to Sunday 22, the festival from the 20th to the end of the 22nd: days 1 to 4
      expect(seen.names).toEqual(['Cédric', 'Christina Comfort Xpress', 'Maja, Ragnhild and Tonje']);
      expect(seen.bars.map((b) => [b.said, b.title, b.at])).toEqual([
        // in at 17:05 on Thursday, known there to its end: the thin line on from Friday to the festival's end
        [['17:05 OSL', ''], 'Departure not said', [0.71, 1]],
        // her one night, Saturday into Sunday morning: the thin line over the festival's days before and after it
        [['', 'Comfort Xpress', ''], 'Arrival not said; Departure not said', [2, 3]],
      ]);
      expect(seen.thin).toEqual([
        [1, 4],
        [1, 2],
        [3, 4],
      ]);
      // no question marks, nor fading, anywhere
      expect(seen.text).not.toContain('?');
      const ink = opened(root, 'KUOF')?.querySelector('.gantt-ink');
      expect(ink ? getComputedStyle(ink).maskImage : '').toMatch(/0\.35rem|5\.6px/u);
      // saying where one stays is saying something: Christina is not among those who have not
      expect(seen.unsaid).toBe(1);
      expect(seen.words).toContain('Cédric in Thu 17:05 OSL, departure not said');
      expect(seen.words).toContain('Christina, staying at Comfort Xpress');
    },
    halves,
    [['christina', 19_033, '2026-11-21', '2026-11-21', 'Comfort Xpress']],
  );
});

// where a card's lines say where they stay on a phone: for each, in its bar or under its name
const placement = (root: HTMLElement) =>
  [...(opened(root, 'KUOF')?.querySelectorAll<HTMLElement>('.gantt-name') ?? [])].flatMap((n) => {
    const under = n.querySelector<HTMLElement>('.gantt-stay-under');
    return under === null ? [] : [under.checkVisibility() ? 'under' : 'in bar'];
  });

test('on a phone the card says where its lines stay all in their bars, or all under their names', async () => {
  // both bars long enough: each in its bar
  const stays: readonly Slept[] = [
    ['cedric', 19_033, ...KUOF_NIGHTS, 'Scandic'],
    ['christina', 19_033, '2026-11-20', '2026-11-22', 'Thon'],
  ];
  const long: readonly Planted[] = [
    ['cedric', 19_033, '2026-11-19T17:05', '2026-11-23T09:40', null],
    ['christina', 19_033, '2026-11-20T09:00', '2026-11-23T09:40', null],
  ];
  await kuofAt(390, (root) => expect(placement(root)).toEqual(['in bar', 'in bar']), long, stays);
  // Christina's one night too short for her hotel's name: both under their names
  const short: readonly Planted[] = [
    ['cedric', 19_033, '2026-11-19T17:05', '2026-11-23T09:40', null],
    ['christina', 19_033, '2026-11-21T09:00', '2026-11-22T09:00', null],
  ];
  const night: readonly Slept[] = [
    ['cedric', 19_033, ...KUOF_NIGHTS, 'Scandic'],
    ['christina', 19_033, '2026-11-21', '2026-11-21', 'Thon'],
  ];
  await kuofAt(390, (root) => expect(placement(root)).toEqual(['under', 'under']), short, night);
});

test('a card whose people stay at two places or more can be seen by hotel, its choice kept for the visit', async () => {
  // one place for everyone: no choice
  await kuofAt(1200, (root) => expect(opened(root, 'KUOF')?.querySelector('.gantt-views')).toBeNull(), TO_KUOF);
  await kuofAt(
    1200,
    (root) => {
      const card = opened(root, 'KUOF');
      const choice = [...(card?.querySelectorAll<HTMLButtonElement>('.gantt-views button') ?? [])];
      const pressed = () => choice.map((b) => [said(b), b.getAttribute('aria-pressed')]);
      expect(pressed()).toEqual([
        ['By travel', 'true'],
        ['By hotel', 'false'],
      ]);
      choice[1]?.click();
      expect(pressed()).toEqual([
        ['By travel', 'false'],
        ['By hotel', 'true'],
      ]);
      // a line a place, the most people first, those who said none last, each its people under its name
      const seen = linesOf(root);
      expect(seen.names).toEqual([
        'Comfort Xpress Oslo Sentrum Christina',
        'Scandic Holberg Cédric',
        'No place said Maja, Ragnhild and Tonje',
      ]);
      expect(seen.bars.map((b) => b.at)).toEqual([
        [0, 4],
        [0, 4],
      ]);
      expect(seen.words).toBe(
        'Comfort Xpress Oslo Sentrum, the nights of Thu 19 to Sun 22: Christina; Scandic Holberg, the nights of Thu 19 to Sun 22: Cédric; no place said: Maja, Ragnhild and Tonje',
      );
      // drawn again, as when the calendar steps: still by hotel
      const again = withStays(APART, () => withTrips(flown, () => onDay('2026-11-01', () => communityPage(COMMUNITY))));
      expect(opened(again, 'KUOF')?.querySelector('.gantt-views [aria-pressed="true"]')?.textContent).toBe('By hotel');
      opened(again, 'KUOF')?.querySelector<HTMLElement>('.gantt-views button')?.click();
    },
    flown,
    APART,
  );
});
