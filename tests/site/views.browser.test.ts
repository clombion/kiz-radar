// The views on the database the build ships, in Chromium: loaded as the page loads it (db.ts), from public/data/.
import initSqlJs, { type Database } from 'sql.js';
import { beforeAll, expect, test, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import { artistsView } from '../../site/artists.ts';
import { communityView } from '../../site/communities.ts';
import { exec, load, loadSite, one, q, sql } from '../../site/db.ts';
import { h } from '../../site/dom.ts';
import { festivals } from '../../site/festivals.ts';
import { artistHref, personHref } from '../../site/routes.ts';
import { num, str } from '../../site/rows.ts';
import { monthShort } from '../../site/ui.ts';

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
  communityView(root, [key], new AbortController().signal);
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

// trips planted in the database the views read while then runs, each [person, festival, arrive, leave, stay]; the
// Prague trip trips.csv has stays
type Planted = readonly [string, number, string, string, string | null];
function withTrips(trips: readonly Planted[], then: () => void): void {
  for (const [key, event, arrive, leave, stay] of trips)
    db?.run("INSERT INTO trips SELECT id, ?, ?, 'OSL', ?, 'OSL', ? FROM people WHERE key = ?", [
      event,
      arrive,
      leave,
      stay,
      key,
    ]);
  try {
    then();
  } finally {
    db?.run('DELETE FROM trips WHERE event_id IN (SELECT value FROM json_each(?))', [
      JSON.stringify(trips.map(([, event]) => event)),
    ]);
  }
}
// people the manager added, planted while then runs, each [name, festival]
function withAdded(added: readonly (readonly [string, number])[], then: () => void): void {
  for (const [i, [name, event]] of added.entries())
    db?.run("INSERT INTO community_seeded VALUES (?, 1, ?, ?, 'going')", [900 + i, name, event]);
  try {
    then();
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
// Christina alone of the members goes to Glasgow, named as herself; Sian, added by Cédric, teaches there
const GLASGOW = 'Christina teaching · Sian teaching and Carolina going';

test('a community’s head says who it is, when most members travel and where next, and whom it is for', () => {
  const root = onDay('2026-11-03', () => communityPage(COMMUNITY));
  expect(said(root.querySelector('h1'))).toBe('Norwegians in festivals');
  expect(said(root.querySelector('.lede'))).toBe('2 members · managed by Cédric');
  expect(root.querySelector('.lede a')?.getAttribute('href')).toBe(personHref('cedric'));
  const head = [...root.querySelectorAll('.profile-head p')].map((p) => said(p));
  // KUOF: Cédric, Christina and the three added; Glasgow, this Friday, comes first
  expect(head).toContain('Most members are travelling 20–22 Nov: 5 people, to Oslo. Next: Glasgow, this Friday.');
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
    'Next: Glasgow, now.',
  );
  expect(said(onDay('2026-11-10', () => communityPage(COMMUNITY)).querySelector('.profile-head'))).toContain(
    'Next: Oslo, on 20 Nov.',
  );
});

test('the agenda has a heading a month and a row a trip, soonest first, naming who of the community goes', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  expect([...root.querySelectorAll('.agenda h2')].map((h2) => said(h2))).toEqual([
    'November · 3 trips',
    'January 2027 · 1 trip',
    'February · 1 trip',
  ]);
  const rows = [...root.querySelectorAll<HTMLElement>('.trip')];
  expect(rows.map((r) => said(r.querySelector('.trip-when')))).toEqual([
    'Fri 6 – Mon 9 Nov',
    'Fri 20 – Sun 22 Nov',
    'Thu 26 Nov – Tue 1 Dec',
    'Thu 14 – Mon 18 Jan',
    'Fri 26 – Sun 28 Feb',
  ]);
  expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-who'))).toBe(KUOF);
  expect(said(agendaRow(root, 'Glasgow')?.querySelector('.trip-who'))).toBe(GLASGOW);
  expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-what'))).toBeUndefined();
  expect(said(agendaRow(root, 'KUOF')?.querySelector('p'))).toContain('· 🇳🇴 Oslo');
  // who added them is said on hover only, on each added name
  expect(said(root)).not.toContain('added by');
  expect(titled(agendaRow(root, 'KUOF')?.querySelector('.trip-who'))).toEqual(
    ['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, 'Added by Cédric']),
  );
  const sian = one({ id: num }, sql`SELECT id FROM artists WHERE match_key = ?`, ['p:sian@dance'])?.id;
  expect(
    [...(agendaRow(root, 'Glasgow')?.querySelectorAll('.trip-who a') ?? [])].map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]),
  ).toEqual([
    ['Christina', personHref('christina')],
    ['Sian', artistHref(sian ?? Number.NaN)],
  ]);
  // the next trip open, the others closed; a row opens and closes from its button
  const toggles = rows.map((r) => r.querySelector<HTMLElement>('.trip-toggle'));
  expect(toggles.map((t) => t?.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false', 'false', 'false']);
  expect(rows.map((r) => r.querySelector<HTMLElement>('.trip-body')?.hidden)).toEqual([false, true, true, true, true]);
  toggles[1]?.click();
  expect(rows[1]?.querySelector<HTMLElement>('.trip-body')?.hidden).toBe(false);
  expect(toggles[1]?.getAttribute('aria-expanded')).toBe('true');
  expect(toggles[1]?.getAttribute('aria-label')).toBe('Who travels when, to KUOF – Kizomba & Urban Kiz Oslo Festival');
  // its line-up and prices, the festival's card, opened in place
  const lineup = [...(rows[1]?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Line-up & prices ▾');
  lineup?.click();
  expect(lineup?.getAttribute('aria-expanded')).toBe('true');
  expect(rows[1]?.querySelector('.trip-lineup .festival-card.open .card-details')).not.toBeNull();
  expect(root.querySelectorAll('.festival-card')).toHaveLength(1); // no cards but the one opened
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

test('the months are today’s and those with a trip, a festival one stroke across its days, its count once', () => {
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
  // Prague from trips.csv: in on Wednesday 13, the day before it, a travel day; its stroke from the 14th
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

test('a trip every month shows every month, and a line says which months go without', () => {
  const months = q(
    { m: str, id: num },
    sql`SELECT substr(start_date, 1, 7) AS m, min(id) AS id FROM event_rows
    WHERE start_date >= '2026-11-01' AND start_date < '2027-11-01' AND upcoming GROUP BY m ORDER BY m`,
  );
  withAdded(
    months.map(({ id }) => ['Ola', id] as const),
    () => {
      const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
      const shown = monthsOf(root).map((m) => said(m.querySelector('.days-caption')));
      for (const { m } of months) expect(shown).toContain(`${monthShort(`${m}-01`)} ${m.slice(0, 4)}`);
      // a month without a trip, between two with, is said once
      const gaps = [...root.querySelectorAll('.days-gap')].map((p) => said(p));
      expect(gaps.length).toBe(months.filter((x, i) => i > 0 && x.m !== nextMonthOf(months[i - 1]?.m ?? x.m)).length);
      for (const g of gaps) expect(g).toMatch(/^Nothing planned /u);
    },
  );
});
const nextMonthOf = (m: string) => {
  const [y = 0, mo = 0] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

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
const ganttOf = (row: HTMLElement | undefined) => {
  const g = row?.querySelector<HTMLElement>('.gantt');
  return {
    axis: [...(g?.querySelectorAll('.gantt-axis span') ?? [])].map((s) => ({
      day: said(s),
      festival: s.matches('.gantt-fest'),
    })),
    parties: [...(g?.querySelectorAll('.gantt-name') ?? [])].map((n) => said(n)),
    bars: [...(g?.querySelectorAll<HTMLElement>('.gantt-bar') ?? [])].map((b) => ({
      said: said(b),
      left: Number.parseFloat(b.style.left),
      width: Number.parseFloat(b.style.width),
    })),
    bands: [...(g?.querySelectorAll<HTMLElement>('.gantt-band') ?? [])].map((b) => [
      Number.parseFloat(b.style.left),
      Number.parseFloat(b.style.width),
    ]),
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
    // the couple as one party, on one flight, the one bar; the people added, who never travel, on the line under it
    expect(kuof.parties).toEqual(['Cédric & Christina']);
    const [couple, ...others] = kuof.bars;
    expect(others).toEqual([]);
    expect(couple?.said).toBe('17:05 OSL09:40 OSL');
    expect(couple?.left).toBeCloseTo((100 * (17 + 5 / 60)) / 24 / 5, 3); // 17:05 on the first of five days
    expect((couple?.left ?? 0) + (couple?.width ?? 0)).toBeCloseTo((100 * (4 + (9 + 40 / 60) / 24)) / 5, 3);
    // the festival's band, the second to the fourth of five days
    expect(kuof.bands).toEqual([[20, 60]]);
    expect(kuof.said).toBe('Cédric & Christina in Thu 17:05 OSL, out Mon 09:40 OSL');
    expect(kuof.unsaid).toBe('Not said yet: Tonje, Ragnhild and Maja');
    expect(titled(agendaRow(root, 'KUOF')?.querySelector('.gantt-unsaid'))).toEqual(
      ['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, 'Added by Cédric']),
    );
    expect(root.querySelectorAll('.gantt-unsaid .gantt-bar, .gantt .gantt-unsaid')).toHaveLength(0);
    expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-label')?.parentElement)).toBe(
      'Staying Scandic Holberg · Cédric & Christina',
    );
    // Prague from trips.csv: in on the Wednesday before it
    expect(ganttOf(opened(root, 'Prague')).axis.map((a) => a.day)).toEqual(['W13', 'T14', 'F15', 'S16', 'S17', 'M18']);
    // Glasgow, where no one said how they travel: its own days and its band, no bar, everyone named once under it
    const glasgow = ganttOf(agendaRow(root, 'Glasgow'));
    expect(glasgow.axis.map((a) => a.day)).toEqual(['F6', 'S7', 'S8', 'M9']);
    expect(glasgow.bars).toEqual([]);
    expect(glasgow.bands).toEqual([[0, 100]]);
    expect(glasgow.parties).toEqual([]);
    expect(glasgow.said).toBeUndefined();
    expect(glasgow.unsaid).toBe('Not said yet: Christina, Sian and Carolina');
    expect(titled(agendaRow(root, 'Glasgow')?.querySelector('.gantt-unsaid'))).toEqual(
      ['Sian', 'Carolina'].map((n) => [n, 'Added by Cédric']),
    );
    // a couple who has not said is named as one
    expect(ganttOf(opened(root, 'HOT Ice')).unsaid).toBe('Not said yet: Cédric & Christina');
    expect(said(root)).not.toContain('not said');
  });
});

test('a festival from a Wednesday to a Tuesday, a week long, fills its every day and its Gantt’s axis', () => {
  withAdded([['Ola', ALBANIA]], () => {
    const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
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
async function atWidth(width: number, then: () => void): Promise<void> {
  await styled(async () => {
    await page.viewport(width, 900);
    try {
      then();
    } finally {
      await page.viewport(414, 896);
    }
  });
}

test('on a computer a day’s popover opens beside its month, never over it', async () => {
  await atWidth(1200, () => {
    inPage('2026-11-01', (root) => {
      for (const day of ['2026-11-20', '2026-11-06', '2027-01-13', '2027-02-27']) {
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

test('each trip is a card, as a festival’s, opening in place; only the next one open', async () => {
  await styled(() => {
    inPage('2026-11-01', (root) => {
      const trips = [...root.querySelectorAll<HTMLElement>('.agenda .trip')];
      expect(trips.length).toBeGreaterThan(1);
      const look = (el: HTMLElement) => {
        const st = getComputedStyle(el);
        return [st.borderTopLeftRadius, st.backgroundColor, st.boxShadow === 'none', st.borderTopStyle];
      };
      const card = h('article', { class: 'festival-card' });
      document.body.append(card);
      try {
        const festival = look(card);
        for (const t of trips) expect(look(t)).toEqual([festival[0], festival[1], false, 'solid']);
      } finally {
        card.remove();
      }
      // the body opens inside its card
      expect(trips.map((t) => t.querySelector<HTMLElement>('.trip-body')?.hidden)).toEqual(
        trips.map((_, i) => i !== 0),
      );
      expect(trips.every((t) => t.contains(t.querySelector('.trip-body')))).toBe(true);
    });
  });
});
