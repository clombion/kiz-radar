// The views on the database the build ships, in Chromium: loaded as the page loads it (db.ts), from public/data/.
import type { Database } from 'sql.js';
import { beforeAll, expect, test, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { artistsView } from '../../site/artists.ts';
import { communityView } from '../../site/communities.ts';
import { exec, freshDay, one, site, sql } from '../../site/db.ts';
import { h } from '../../site/dom.ts';
import { eventCard } from '../../site/eventcard.ts';
import { festivals } from '../../site/festivals.ts';
import { friendsTabs, friendsView, NEAR_KM } from '../../site/friends.ts';
import { ganttByPlace } from '../../site/gantt.ts';
import { personView, SAID_MS } from '../../site/people.ts';
import { doingTag, friendsIn, NAMED_UP_TO, whoLines } from '../../site/plans.ts';
import { byPlace } from '../../site/roster.ts';
import { eventOnMapHref, personHref } from '../../site/routes.ts';
import { num, str, unsure } from '../../site/rows.ts';
import { cityEntries } from '../../site/search.ts';
import { sourcesView } from '../../site/sources.ts';
import { KEY } from '../../site/states.ts';
import { FIXTURE_COMMUNITY, FIXTURE_FESTIVALS, FIXTURE_NAME } from './community.fixture.ts';
import { loadShipped } from './shipped.ts';

// each file the page asked for, with the signal it was asked with
const asked = new Map<string, AbortSignal | null | undefined>();
let db: Database | undefined; // the database the views read

beforeAll(async () => {
  // the community and festivals its tests read are the fixture's (data.setup.ts), never the real rows, which age
  db = await loadShipped(asked);
});

test('the community the tests read is the fixture alone, whatever the real rows say or the day it was built', () => {
  const rows = (query: string) => db?.exec(query)[0]?.values.map((r) => r.join(' ')) ?? [];
  expect(rows('SELECT p.key, t.event_id, t.arrive, t.leave FROM travel t JOIN people p ON p.id = t.person_id')).toEqual(
    [
      'cedric 18666 2027-01-13T14:30 2027-01-18T15:10',
      'christina 18666 2027-01-13T14:30 2027-01-18T15:10',
      'christina 18964 2026-11-06 2026-11-09T19:10',
      'sian 18964 2026-11-05 ',
    ],
  );
  expect(rows('SELECT count(*) FROM stays')).toEqual(['0']);
  expect(rows('SELECT name, event_id, status FROM community_seeded ORDER BY id')).toEqual([
    'Tonje 19033 going',
    'Ragnhild 19033 going',
    'Maja 19033 going',
    'Caroline 18964 going',
    'Tonje 18666 maybe',
  ]);
  expect(rows('SELECT key FROM communities')).toEqual([FIXTURE_COMMUNITY]);
  expect(rows("SELECT count(*) FROM plans p JOIN people pe ON pe.id = p.person_id WHERE pe.key = 'christina'")).toEqual(
    ['5'],
  );
  expect(
    rows(
      `SELECT count(*) FROM events WHERE listing = '${KEY.listing.LISTED}' AND NOT cancelled AND id IN (${FIXTURE_FESTIVALS.join(', ')})`,
    ),
  ).toEqual([String(FIXTURE_FESTIVALS.length)]);
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
const COMMUNITY = FIXTURE_COMMUNITY;
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
// what an element shows, as text: what only a screen reader hears inside it (visually-hidden) left out
const said = (el: Element | null | undefined) => {
  const shown = el?.cloneNode(true);
  if (!(shown instanceof Element)) return;
  for (const hidden of shown.querySelectorAll('.visually-hidden')) hidden.remove();
  return shown.textContent?.replace(/\s+/gu, ' ').trim();
};
// what a screen reader hears of an element, its hidden words in
const heard = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/gu, ' ').trim();
// the names in an element that say on hover who added them, each with what it says
const titled = (el: Element | null | undefined) =>
  [...(el?.querySelectorAll('[title]') ?? [])].map((n) => [said(n), n.getAttribute('title')]);
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
        // an airport with a time only, as records.Travel holds
        "INSERT INTO travel SELECT id, ?, ?, iif(length(?) = 16, 'OSL', NULL), ?, iif(length(?) = 16, 'OSL', NULL) FROM people WHERE key = ?",
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
// Christina and Siân, members, go to Glasgow and teach there, each named as herself; Caroline, added by Cédric, goes
const GLASGOW = 'Christina teaching and Siân teaching · Caroline going';

test('a community’s head says who it is, when most members travel and where next, and whom it is for', () => {
  const root = onDay('2026-11-03', () => communityPage(COMMUNITY));
  expect(said(root.querySelector('h1'))).toBe(FIXTURE_NAME);
  // the badge says how many members; who manages it is said with the members, at the foot
  expect(said(root.querySelector('.profile-head'))).not.toMatch(/members ·|managed by/u);
  const head = [...root.querySelectorAll('.profile-head p')].map((p) => said(p));
  // KUOF: Cédric, Christina and the three added; Glasgow, this Friday, comes first
  expect(head).toContain('Most people are travelling 20–22 Nov: 5 people, to Oslo.');
  expect(said(root.querySelector('.profile-head .community-next'))).toBe('Next: Glasgow, this Friday');
  expect(said(root)).not.toMatch(/\baway\b|Most of the community/u);
  // who sees it, as a badge beside Share: a lock, people and their number, named in full
  const badge = root.querySelector<HTMLElement>('.share-row .privacy');
  expect(said(root.querySelector('.share-row button'))).toBe('Share this page');
  expect([badge?.getAttribute('role'), badge?.ariaLabel, badge?.title]).toEqual([
    'img',
    'Anyone with the link can see this page · 3 members',
    'Anyone with the link can see this page · 3 members',
  ]);
  expect([badge?.querySelectorAll('svg').length, said(badge)]).toEqual([2, '3']);
  // a week on, Glasgow is under way and KUOF is two weeks off
  expect(said(onDay('2026-11-07', () => communityPage(COMMUNITY)).querySelector('.community-next'))).toBe(
    'Now: Glasgow, until Mon · Next: Oslo, on 20 Nov',
  );
  expect(said(onDay('2026-11-10', () => communityPage(COMMUNITY)).querySelector('.community-next'))).toBe(
    'Next: Oslo, on 20 Nov',
  );
});

// ----- a trip while it happens and after: Glasgow, Friday 6 to Monday 9 November, Siân there from the Thursday and
// Christina leaving on the Monday at 19:10 -----
const glasgowOn = (day: string) => {
  const root = onDay(day, () => communityPage(COMMUNITY));
  const row = agendaRow(root, 'Glasgow');
  return {
    next: said(root.querySelector('.community-next')),
    now: row?.querySelector('.now-tag')?.textContent ?? '',
    open: row?.querySelector<HTMLElement>('.trip-body')?.hidden === false,
    first: said(root.querySelector('.trip .trip-fest')),
    opened: [...root.querySelectorAll<HTMLElement>('.trip-body')].filter((b) => !b.hidden).length,
    stroke: [...root.querySelectorAll<HTMLElement>('.days-stroke')]
      .filter((st) => st.title.startsWith('Glasgow'))
      .map((st) => st.matches('.days-stroke-past')),
    count: countOn(root, '2026-11-06'),
  };
};

test('before Glasgow, it is next, its row open', () => {
  expect(glasgowOn('2026-11-04')).toEqual({
    next: 'Next: Glasgow, this Friday',
    now: '',
    open: true,
    first: 'Glasgow Kizomba Festival 5.0',
    opened: 1,
    stroke: [false, false],
    count: '3',
  });
});

test('while Glasgow is on, from its first arrival to its last departure, its row says Now and is open', () => {
  // Siân arrives on the Thursday: the trip is on from then
  expect(glasgowOn('2026-11-05').now).toBe('Now');
  const friday = onDay('2026-11-06', () => communityPage(COMMUNITY));
  expect(glasgowOn('2026-11-06')).toEqual({
    next: 'Now: Glasgow, until Mon · Next: Oslo, on 20 Nov',
    now: 'Now',
    open: true,
    first: 'Glasgow Kizomba Festival 5.0',
    opened: 1,
    stroke: [false, false],
    count: '3',
  });
  // the "Now" tag before its days, and today's ring on its stroke
  expect(said(agendaRow(friday, 'Glasgow')?.querySelector('.trip-head p'))).toMatch(/^Now Fri 6 – Mon 9 Nov /u);
  expect(cellOn(friday, '2026-11-06')?.ariaCurrent).toBe('date');
  expect(cellOn(friday, '2026-11-06')?.querySelector('.days-ring')).not.toBeNull();
  expect(strokesOn(friday, '2026-11-06').map((st) => st.title)).toEqual(['Glasgow Kizomba Festival 5.0']);
  // its last day, Christina leaving that evening
  expect(glasgowOn('2026-11-09')).toMatchObject({
    next: 'Now: Glasgow, until today · Next: Oslo, on 20 Nov',
    now: 'Now',
  });
});

test('after Glasgow, it leaves the agenda, its stroke stays grey, and it is no longer counted', () => {
  for (const day of ['2026-11-10', '2026-11-13'])
    expect(glasgowOn(day)).toEqual({
      next: 'Next: Oslo, on 20 Nov',
      now: '',
      open: false,
      first: 'KUOF – Kizomba & Urban Kiz Oslo Festival',
      opened: 1,
      stroke: [true, true],
      count: '',
    });
  // the period still starts at today's month
  const after = onDay('2026-11-10', () => communityPage(COMMUNITY));
  expect(said(after.querySelector('.days-said'))).toMatch(/^Nov/u);
});

test('the sentence of when most members travel leaves out a trip that has ended', () => {
  // Glasgow with five more people added: the most at once, until it ends
  const added = ['Ola', 'Kari', 'Per', 'Nils', 'Eva'].map((n) => [n, 18_964] as const);
  const when = (day: string) =>
    withAdded(added, () => said(onDay(day, () => communityPage(COMMUNITY)).querySelector('.community-when')));
  expect(when('2026-11-04')).toBe('Most people are travelling 6–9 Nov: 8 people, to Glasgow.');
  expect(when('2026-11-10')).toBe('Most people are travelling 20–22 Nov: 5 people, to Oslo.');
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
  agendaRow(root, 'Glasgow')?.querySelector<HTMLElement>('.trip-toggle')?.click(); // closed: its whole who-line
  expect(
    [...(agendaRow(root, 'Glasgow')?.querySelectorAll('.trip-who a') ?? [])].map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]),
  ).toEqual([
    ['Christina', personHref('christina')],
    // a member now, her plans page as Christina's
    ['Siân', personHref('sian')],
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
  expect(said(members?.querySelector('p'))).toBe('Cédric manager, Christina and Siân');
});

test('the people a manager added are named on the community’s page only, never on a festival’s card elsewhere', () => {
  const kuof = onDay('2026-11-01', () => festivals().find((e) => e.title.startsWith('KUOF')));
  expect(kuof?.goers.map((g) => g.key).sort()).toEqual(['cedric', 'christina']);
});

test('a trip’s chart is drawn the first time its row opens, not with the agenda', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const rows = [...root.querySelectorAll<HTMLElement>('.trip')];
  expect(rows.map((r) => r.querySelector('.gantt') !== null)).toEqual([true, false, false, false, false, false]);
  rows[1]?.querySelector<HTMLElement>('.trip-toggle')?.click();
  expect(rows[1]?.querySelectorAll('.gantt')).toHaveLength(1);
  expect(rows[1]?.querySelector('.trip-body > .gantt + .gantt-said')).not.toBeNull(); // before its line-up, as drawn
  rows[1]?.querySelector<HTMLElement>('.trip-toggle')?.click();
  rows[1]?.querySelector<HTMLElement>('.trip-toggle')?.click();
  expect(rows[1]?.querySelectorAll('.gantt')).toHaveLength(1); // once
});

test('a festival cancelled or no longer listed stays on the community’s page, said so, never on now', () => {
  const kuof = (change: string) => db?.run(`UPDATE events SET ${change} WHERE title LIKE 'KUOF%'`);
  const row = (root: HTMLElement) => agendaRow(root, 'KUOF');
  try {
    const listed = onDay('2026-11-21', () => communityPage(COMMUNITY));
    expect([said(row(listed)?.querySelector('.now-tag')), row(listed)?.querySelector('.trip-off')]).toEqual([
      'Now',
      null,
    ]);
    kuof('cancelled = 1');
    const cancelled = onDay('2026-11-21', () => communityPage(COMMUNITY));
    expect(said(row(cancelled)?.querySelector('.trip-off'))).toBe('This festival was cancelled.');
    expect(row(cancelled)?.querySelector('.now-tag')).toBeNull();
    kuof(`cancelled = 0, listing = '${KEY.listing.GONE}'`);
    const gone = onDay('2026-11-21', () => communityPage(COMMUNITY));
    expect(said(row(gone)?.querySelector('.trip-off'))).toBe('This festival is no longer listed.');
  } finally {
    kuof(`cancelled = 0, listing = '${KEY.listing.LISTED}'`);
  }
});

test('a page left open past midnight reads where each festival stands by the new day', () => {
  const kuof = () => festivals().find((e) => e.title.startsWith('KUOF'));
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date(2026, 10, 21, 23, 59));
    expect([freshDay(), kuof()?.phase]).toEqual(['2026-11-21', KEY.phase.ON]);
    vi.setSystemTime(new Date(2026, 10, 23, 0, 1)); // the festival ended on the 22nd
    expect(freshDay()).toBe('2026-11-23');
    expect(one({ day: str }, sql`SELECT day FROM today`)?.day).toBe('2026-11-23');
    expect(kuof()).toBeUndefined();
  } finally {
    vi.useRealTimers();
    freshDay();
  }
});

test('a link to no community says so', () => {
  expect(said(communityPage('no-such-community-here'))).toBe('No community at this link.');
});

test('the community’s page shares its page for a shared link, copied when the browser has no share sheet', async () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const share = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Share this page');
  const copied = vi.fn(() => Promise.resolve());
  vi.stubGlobal('navigator', { clipboard: { writeText: copied } });
  try {
    share?.click();
    await expect.poll(() => share?.textContent).toBe('Link copied');
    // its page for a shared link, which chat apps read for its card, not the site's hash, which they never see
    expect(copied).toHaveBeenCalledWith(new URL(`c/${COMMUNITY}/`, location.href.split('#')[0]).href);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('the Share button says what to do when there is no clipboard or it is refused, then shows its label again', async () => {
  const shared = async (browser: object) => {
    const share = [...onDay('2026-11-01', () => communityPage(COMMUNITY)).querySelectorAll('button')].find(
      (b) => b.textContent === 'Share this page',
    );
    vi.stubGlobal('navigator', browser);
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      share?.click();
      await vi.advanceTimersByTimeAsync(0);
      const first = share?.textContent;
      await vi.advanceTimersByTimeAsync(SAID_MS);
      return [first, share?.textContent];
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  };
  const copy = 'Copy the address bar to share';
  expect(await shared({ clipboard: { writeText: () => Promise.resolve() } })).toEqual([
    'Link copied',
    'Share this page',
  ]);
  expect(await shared({})).toEqual([copy, 'Share this page']);
  expect(
    await shared({ clipboard: { writeText: () => Promise.reject(new DOMException('no', 'NotAllowedError')) } }),
  ).toEqual([copy, 'Share this page']);
  // the visitor closing the share sheet is not refused: nothing said
  expect(await shared({ share: () => Promise.reject(new DOMException('closed', 'AbortError')) })).toEqual([
    'Share this page',
    'Share this page',
  ]);
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
    // Siân in to Glasgow the day before it; Cédric and Christina in to Oslo the day before KUOF and out the day after;
    // Prague's Wednesday
    expect(dots).toEqual(['2026-11-05', '2026-11-19', '2026-11-23', '2027-01-13']);
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

test('each page’s day popover has an id of its own, which the day it is open on is described by', () => {
  const opened = () => {
    let ids: (string | null | undefined)[] = [];
    inPage('2026-11-01', (root) => {
      const day = cellOn(root, '2026-11-05');
      day?.focus();
      ids = [popover(root)?.id, day?.getAttribute('aria-describedby')];
    });
    return ids;
  };
  const [[firstPop, firstDay], [secondPop]] = [opened(), opened()];
  expect([firstPop?.startsWith('day-pop-'), firstPop === firstDay]).toEqual([true, true]);
  expect(secondPop).not.toBe(firstPop);
});

test('a month is one stop for the keyboard, its arrows passing over the days no one travels on', () => {
  inPage('2026-11-01', (root) => {
    const stops = (month: HTMLElement | undefined) =>
      [...(month?.querySelectorAll<HTMLElement>('[data-day]') ?? [])].filter((c) => c.tabIndex === 0);
    const [november] = monthsOf(root);
    // November's first day someone travels on: the Thursday Siân flies in to Glasgow
    expect(stops(november).map((c) => c.dataset['day'])).toEqual(['2026-11-05']);
    stops(november)[0]?.focus();
    expect(popover(root)?.hidden).toBe(false);
    press('ArrowRight');
    expect(focusedDay()).toBe('2026-11-06');
    press('ArrowRight');
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
    parties: [...(g?.querySelectorAll('.gantt-name:not(.gantt-unsaid)') ?? [])].map((n) => said(n)),
    bars: [...(g?.querySelectorAll<HTMLElement>('.gantt-bar') ?? [])].map((b) => ({
      // its times, at its ends
      said: [...b.querySelectorAll(':scope > span:not(.gantt-ink)')].map((t) => said(t)).join(''),
      left: Number.parseFloat(b.style.left),
      width: Number.parseFloat(b.style.width),
      // which of its ends fade, a time not said
      fades: ['gantt-fade-in', 'gantt-fade-out'].map((c) => b.matches(`.${c}`)),
      ink: ['height', 'translate', 'rotate', 'border-radius', 'opacity']
        .map((p) => b.querySelector<HTMLElement>('.gantt-ink')?.style.getPropertyValue(p) ?? '')
        .join(' '),
    })),
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
    const [couple, silent, ...others] = kuof.bars;
    expect(others).toEqual([]);
    expect([couple?.said, couple?.fades]).toEqual(['17:05 OSL09:40 OSL', [false, false]]);
    expect(couple?.left).toBeCloseTo((100 * (17 + 5 / 60)) / 24 / 5, 3); // 17:05 on the first of five days
    expect((couple?.left ?? 0) + (couple?.width ?? 0)).toBeCloseTo((100 * (4 + (9 + 40 / 60) / 24)) / 5, 3);
    // no band behind the stroke: the axis marks the festival's days. Those who have said nothing are there too: a
    // stroke over the festival's days, the second to the fourth of five, both its ends fading, nothing written
    expect(agendaRow(root, 'KUOF')?.querySelector('.gantt-lane')?.childElementCount).toBe(1);
    expect([silent?.left, silent?.width, silent?.fades, silent?.said]).toEqual([20, 60, [true, true], '']);
    expect(kuof.said).toBe(
      'Cédric & Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Scandic Holberg; not said: Maja, Ragnhild and Tonje',
    );
    // the three who have not said, more than half of the five but only three: named
    expect(kuof.unsaid).toBe('Maja, Ragnhild and Tonje');
    expect(titled(agendaRow(root, 'KUOF')?.querySelector('.gantt-unsaid'))).toEqual(
      ['Maja', 'Ragnhild', 'Tonje'].map((n) => [n, 'Added by Cédric']),
    );
    // no sentences about who has not said or where who stays: the lines say it
    expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-body'))).not.toMatch(/Not said|Staying/u);
    // Prague from travel.csv: in on the Wednesday before it
    expect(ganttOf(opened(root, 'Prague')).axis.map((a) => a.day)).toEqual(['W13', 'T14', 'F15', 'S16', 'S17', 'M18']);
    // Glasgow from travel.csv: Siân in on the Thursday before it, its day alone; Christina on its Friday, its day alone,
    // and out on Monday at 19:10 from Aberdeen; Caroline, who said nothing, on its days
    const glasgow = ganttOf(agendaRow(root, 'Glasgow'));
    expect(glasgow.axis.map((a) => a.day)).toEqual(['T5', 'F6', 'S7', 'S8', 'M9']);
    expect(glasgow.parties).toEqual(['Siân', 'Christina']);
    expect(glasgow.bars.map((b) => [b.left, Math.round((b.left + b.width) * 100) / 100, b.fades, b.said])).toEqual([
      [0, 100, [true, true], ''],
      [20, 95.97, [true, false], '19:10 ABZ'],
      [20, 100, [true, true], ''],
    ]);
    expect(glasgow.said).toBe(
      'Siân arrives Thu 5 Nov, time not said, departure not said; Christina arrives Fri 6 Nov, time not said, out Mon 19:10 ABZ; not said: Caroline',
    );
    expect(glasgow.unsaid).toBe('Caroline');
    expect(titled(agendaRow(root, 'Glasgow')?.querySelector('.gantt-unsaid'))).toEqual([
      ['Caroline', 'Added by Cédric'],
    ]);
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
  // its trips all over: none to come
  expect(said(root)).toContain('No trips coming up.');
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
    // the two flights, and those who said nothing on the festival's days
    expect(once.map((b) => b.said)).toEqual(['17:05 OSL09:40 OSL', '08:00 OSL20:00 OSL', '']);
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
        expect(bars).toHaveLength(3); // the two flights, and those who said nothing
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
    expect(ink).toHaveLength(2);
    for (const i of ink) expect(i.offsetHeight).toBeLessThanOrEqual(0.7 * rem + 0.5);
    // its times still on it
    expect(ganttOf(row).bars[0]?.said).toBe('17:05 OSL09:40 OSL');
    // the line in words: not shown, but what describes the chart
    const words = row?.querySelector<HTMLElement>('.gantt-said');
    expect(words?.textContent).toBe(
      'Cédric & Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Scandic Holberg; not said: Maja, Ragnhild and Tonje',
    );
    expect(words?.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(row?.querySelector('.gantt')?.getAttribute('aria-describedby')).toBe(words?.id);
    // the people who have not said, on their line
    expect(row?.querySelector<HTMLElement>('.gantt-unsaid')?.getBoundingClientRect().width).toBeGreaterThan(50);
  });
});

// a card of names, as it reads: each place's heading as "# place", each name (with its own nights)
const cardOf = (list: Element | null | undefined) =>
  [...(list?.querySelectorAll('.gantt-who-place, .gantt-who-list li') ?? [])].map((x) =>
    x.matches('.gantt-who-place') ? `# ${said(x)}` : (said(x) ?? ''),
  );

// what KUOF's roster shows with two more people added: its lines, its rule, and its collective line's names as they
// are shown and hidden, by a tap, Escape and the pointer, each time as [aria-expanded, the names seen]
async function collectiveOf(root: HTMLElement) {
  const row = opened(root, 'KUOF');
  const lines = [...(row?.querySelectorAll('.gantt-name') ?? [])];
  const who = row?.querySelector<HTMLButtonElement>('.gantt-who');
  const list = row?.querySelector(`#${who?.getAttribute('aria-controls')}`);
  const state = () => [who?.getAttribute('aria-expanded'), list?.checkVisibility() ?? null];
  // its label, before the pointer is over it: the colour of the text around it, underlined dotted as the other names
  const label = who
    ? [getComputedStyle(who).color === getComputedStyle(root).color, getComputedStyle(who).textDecorationStyle]
    : [];
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
  // and never over its own line: its name and its stroke
  const meets = (r: DOMRect | undefined) =>
    box !== undefined &&
    r !== undefined &&
    r.width > 0 &&
    Math.min(r.right, box.right) - Math.max(r.left, box.left) > 0.5 &&
    Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top) > 0.5;
  const own = who?.closest('.gantt-name');
  const coversItsLine = meets(own?.getBoundingClientRect()) || meets(own?.nextElementSibling?.getBoundingClientRect());
  const floats = list ? getComputedStyle(list).position : '';
  who?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  states.push(state());
  if (who) await userEvent.hover(who);
  states.push(state());
  if (who) await userEvent.unhover(who);
  states.push(state());
  return {
    lines: lines.map((n) => said(n.querySelector('.gantt-who') ?? n)),
    unsaid: lines.map((n) => n.matches('.gantt-unsaid')),
    silent: ganttOf(row).bars.at(-1),
    inCard,
    coversItsLine,
    floats,
    columns: list?.querySelector('.gantt-who-list')
      ? getComputedStyle(list.querySelector('.gantt-who-list') ?? list).columnCount
      : '',
    label,
    names: cardOf(list),
    states,
    words: said(row?.querySelector('.gantt-said')),
  };
}

test('on a computer the card of names floats by its text, in the trip’s card, over no part of its own line', async () => {
  await atWidth(1200, async () => {
    // Cédric and Christina flying apart, and five people added: "Everyone else", the third line, its card above it
    const apart: readonly Planted[] = [
      ['cedric', 19_033, '2026-11-19T17:05', '2026-11-23T09:40', 'Scandic Holberg'],
      ['christina', 19_033, '2026-11-20T09:00', '2026-11-23T09:40', 'Scandic Holberg'],
    ];
    const added = (['Ola', 'Kari'] as const).map((n) => [n, 19_033] as const);
    const root = withTrips(apart, () => withAdded(added, () => onDay('2026-11-01', () => communityPage(COMMUNITY))));
    document.body.append(root);
    const seen = await collectiveOf(root).finally(() => root.remove());
    expect(seen.lines).toEqual(['Cédric Scandic Holberg', 'Christina Scandic Holberg', 'Everyone else']);
    expect([seen.floats, seen.inCard, seen.coversItsLine]).toEqual(['absolute', true, false]);
    // five names: two columns of them
    expect(seen.columns).toBe('2');
  });
});

test('on a computer a card of names with no room to float by its text in the trip’s card goes in the flow', async () => {
  await atWidth(1200, async () => {
    // the couple, and ten people added: two lines, and ten names, too many to float above or below the last
    const added = ['Ola', 'Kari', 'Per', 'Nils', 'Eva', 'Liv', 'Siri'].map((n) => [n, 19_033] as const);
    const root = withTrips(TO_KUOF, () => withAdded(added, () => onDay('2026-11-01', () => communityPage(COMMUNITY))));
    document.body.append(root);
    const seen = await collectiveOf(root).finally(() => root.remove());
    expect([seen.floats, seen.inCard, seen.coversItsLine]).toEqual(['static', true, false]);
  });
});

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
      // the couple's line named, by arrival; the five who have not said "Everyone else", last, a stroke over the
      // festival's days, both its ends fading
      expect(seen.lines).toEqual(['Cédric & Christina Scandic Holberg', 'Everyone else']);
      expect(seen.unsaid).toEqual([false, true]);
      expect([seen.silent?.fades, seen.silent?.said]).toEqual([[true, true], '']);
      // its label as dark as the text, dotted under as the other names
      expect(seen.label).toEqual([true, 'dotted']);
      // its names, a list: hidden; shown by a tap, hidden again by Escape; shown while the pointer is over it; and in
      // the words
      expect(seen.names).toEqual(['Kari', 'Maja', 'Ola', 'Ragnhild', 'Tonje']);
      // a card in the trip's card, never over its own line: on a phone in the flow, on a computer floating by its text
      expect(seen.inCard).toBe(true);
      expect(seen.coversItsLine).toBe(false);
      expect(seen.floats).toBe(width < 700 ? 'static' : 'absolute');
      expect(seen.states).toEqual([
        ['false', false],
        ['true', true],
        ['false', false],
        ['false', true],
        ['false', false],
      ]);
      expect(seen.words).toContain('not said: Everyone else (Kari, Maja, Ola, Ragnhild and Tonje)');
    });
});

// a line of the roster laid out: its stay beside the bar or under the name, its airports, the stay's heading
const rosterAt = (root: HTMLElement) => {
  const row = opened(root, 'KUOF');
  const shown = (el: Element | null | undefined) =>
    el instanceof HTMLElement && el.checkVisibility() && el.offsetWidth > 0 ? said(el) : null;
  return {
    beside: shown(row?.querySelector('.gantt-name ~ .gantt-stay')),
    under: shown(row?.querySelector('.gantt-under')),
    airports: [...(row?.querySelectorAll('.gantt-ap') ?? [])].map((a) => shown(a)),
    // no heading over the column: what it holds says itself
    head: said(row?.querySelector('.gantt > div:nth-child(3)')),
  };
};

test('where a line stays is beside its stroke on a computer, under its name on a phone, airports only on a computer', async () => {
  const stay = 'Scandic Holberg';
  for (const [width, seen] of [
    [1200, { beside: stay, under: null, airports: ['OSL', 'OSL'], head: '' }],
    [390, { beside: null, under: stay, airports: [null, null], head: '' }],
  ] as const)
    await kuofAt(width, (root) => expect(rosterAt(root)).toEqual(seen));
});

// an element's colour's alpha, and its opacity
const alpha = (el: Element | null | undefined, pseudo?: string): [number, number] => {
  const st = el ? getComputedStyle(el, pseudo) : undefined;
  const channels = (st?.backgroundColor ?? '').match(/[\d.]+/gu) ?? [];
  return [channels.length > 3 ? Number(channels[3]) : 1, Number(st?.opacity ?? 1)];
};

test('the roster’s strokes are the calendar’s ink, its second pass the same, and light', async () => {
  await kuofAt(1200, (root) => {
    const ink = opened(root, 'KUOF')?.querySelector('.gantt-ink');
    const stroke = root.querySelector('.days-week .days-stroke');
    // one ink everywhere: the card's as the calendar's
    expect(ink ? getComputedStyle(ink).backgroundColor : '').toBe(
      stroke ? getComputedStyle(stroke).backgroundColor : '-',
    );
    expect(alpha(ink, '::after')[1]).toBe(alpha(stroke, '::after')[1]);
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
const HEAD = ['Most people are travelling 20–22 Nov: 5 people, to Oslo.', 'Next: Glasgow, this Friday'];
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
  const was = location.href;
  try {
    // Maja to Riga in September: March to June with nothing, then July to October
    withAdded([['Maja', RIGA]], () => {
      const root = onDay('2026-11-04', () => communityPage(COMMUNITY));
      const seen = [periodOf(root)];
      const addresses: string[] = [];
      for (const _ of [1, 2]) {
        step(root, 'Next four months');
        seen.push(periodOf(root));
        addresses.push(`${location.pathname.split('/').slice(-3).join('/')}${location.search}`);
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
      // the community's own address, c/<key>/, the period in its query
      expect(addresses).toEqual([`c/${COMMUNITY}/?from=2027-03`, `c/${COMMUNITY}/?from=2027-07`]);
      // the sentence and "Next" are of every trip, whatever period shows
      for (const t of seen) expect(t.head).toEqual(HEAD);
      for (const _ of [1, 2]) step(root, 'Previous four months');
      expect(periodOf(root).said).toBe('Nov 2026 – Feb 2027');
      expect(location.search).not.toContain('from=');
    });
  } finally {
    history.replaceState(null, '', was);
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

// ----- a roster of travels, each with its places, and the same people by place -----
// KUOF's roster, read: its lines' names, their strokes (what they say, which ends fade, where they run in days from
// the first, and their titles), what each line's column says and whether it opens names, and the words
const linesOf = (root: HTMLElement) => {
  const card = opened(root, 'KUOF');
  const g = card?.querySelector<HTMLElement>('.gantt:not([hidden])');
  const days = g?.querySelectorAll('.gantt-axis span').length ?? 1;
  const dayOf = (x: number) => Math.round(((x * days) / 100) * 100) / 100;
  return {
    names: [...(g?.querySelectorAll('.gantt-name') ?? [])].map((n) => said(n)),
    strokes: [...(g?.querySelectorAll<HTMLElement>('.gantt-bar') ?? [])].map((b) => ({
      said: [...b.querySelectorAll(':scope > span:not(.gantt-ink)')].map((x) => said(x)),
      fades: ['gantt-fade-in', 'gantt-fade-out'].map((c) => b.matches(`.${c}`)),
      at: [
        dayOf(Number.parseFloat(b.style.left)),
        dayOf(Number.parseFloat(b.style.left) + Number.parseFloat(b.style.width)),
      ],
      title: b.title,
    })),
    column: [...(g?.querySelectorAll<HTMLElement>('.gantt-name ~ .gantt-stay') ?? [])].map((x) => [
      said(x),
      x.querySelector('button') !== null,
    ]),
    under: [...(g?.querySelectorAll<HTMLElement>('.gantt-under') ?? [])].map((x) => [
      said(x),
      x.querySelector('button') !== null,
    ]),
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

test('two places are written beside the stroke, and counted under the name on a phone, the count opening names', async () => {
  await kuofAt(
    1200,
    (root) => {
      const seen = linesOf(root);
      // one travel, one line, its people each a unit, named
      expect(seen.names[0]).toBe('Cédric and Christina 2 places'); // the phone's, hidden here
      // written in full, a detail, no names behind it: no dotted underline
      expect(seen.column[0]).toEqual(['Comfort Xpress Oslo Sentrum 1 · Scandic Holberg 1', false]);
      expect(seen.words).toContain(
        'Cédric and Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying: Comfort Xpress Oslo Sentrum: Christina, Scandic Holberg: Cédric',
      );
      // nothing cut short, nor a "+1"
      expect(seen.text).not.toMatch(/…|\+\d/u);
    },
    flown,
    APART,
  );
  await kuofAt(
    390,
    (root) => {
      expect(linesOf(root).under[0]).toEqual(['2 places', true]);
      const count = opened(root, 'KUOF')?.querySelector<HTMLElement>('.gantt-under button');
      count?.click();
      // a small card of names by place: each place a heading, then its names
      expect(cardOf(document.getElementById(count?.getAttribute('aria-controls') ?? ''))).toEqual([
        '# Comfort Xpress Oslo Sentrum',
        'Christina',
        '# Scandic Holberg',
        'Cédric',
      ]);
      expect(count ? getComputedStyle(count).textDecorationStyle : '').toBe('dotted');
    },
    flown,
    APART,
  );
});

test('one person’s way is written with its arrow; three places are counted, wherever, dotted', async () => {
  const alone: readonly Planted[] = [['cedric', 19_033, '2026-11-19T17:05', '2026-11-23T09:40', null]];
  const two: readonly Slept[] = [
    ['cedric', 19_033, '2026-11-19', '2026-11-19', 'Airbnb'],
    ['cedric', 19_033, '2026-11-20', '2026-11-22', 'Scandic Holberg'],
  ];
  await kuofAt(
    1200,
    (root) => {
      const seen = linesOf(root);
      expect(seen.column[0]).toEqual(['Airbnb → Scandic Holberg', false]);
      expect(seen.words).toContain('Cédric in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Airbnb → Scandic Holberg');
    },
    alone,
    two,
  );
  const three: readonly Slept[] = [
    ['cedric', 19_033, '2026-11-19', '2026-11-19', 'Airbnb'],
    ['cedric', 19_033, '2026-11-20', '2026-11-20', 'Thon'],
    ['cedric', 19_033, '2026-11-21', '2026-11-22', 'Scandic Holberg'],
  ];
  await kuofAt(1200, (root) => expect(linesOf(root).column[0]).toEqual(['3 places', true]), alone, three);
});

test('a stroke is "there": hard ends at times said, fading where not, over the festival’s days at least', async () => {
  // Cédric said only his flight in; Christina only where she stays, Saturday night
  const halves: readonly Planted[] = [['cedric', 19_033, '2026-11-19T17:05', null, null]];
  await kuofAt(
    1200,
    (root) => {
      const seen = linesOf(root);
      // the axis from Thursday 19 to Sunday 22, the festival its days 1 to 4
      expect(seen.names).toEqual(['Cédric', 'Christina Comfort Xpress', 'Maja, Ragnhild and Tonje']);
      expect(seen.strokes.map((s) => [s.said, s.fades, s.at, s.title])).toEqual([
        // in at 17:05 on Thursday, a hard start; to the festival's close, fading
        [['17:05 OSL', ''], [false, true], [0.71, 4], 'departure not said'],
        // only where she stays: the festival's days, both ends fading; her night is in her place
        [['', ''], [true, true], [1, 4], 'arrival not said; departure not said'],
        // those who said nothing: the festival's days, both ends fading
        [['', ''], [true, true], [1, 4], 'arrival not said; departure not said'],
      ]);
      // no thin line, no question mark, no second ink
      expect(opened(root, 'KUOF')?.querySelectorAll('.gantt-none, .gantt-shared')).toHaveLength(0);
      expect(seen.text).not.toContain('?');
      // a fading end fades over a longer way than a hard one
      const masks = [...(opened(root, 'KUOF')?.querySelectorAll('.gantt-ink') ?? [])].map(
        (i) => getComputedStyle(i).maskImage,
      );
      expect(masks[0]).not.toBe(masks[1]);
      expect(seen.words).toContain('Cédric in Thu 17:05 OSL, departure not said');
      expect(seen.words).toContain('Christina, staying at Comfort Xpress');
    },
    halves,
    [['christina', 19_033, '2026-11-21', '2026-11-21', 'Comfort Xpress']],
  );
});

test('the axis is the calendar’s: festival days in the accent, a dot under a day only travelled, dates not bold', async () => {
  await kuofAt(1200, (root) => {
    const axis = [...(opened(root, 'KUOF')?.querySelectorAll<HTMLElement>('.gantt-axis span') ?? [])];
    const look = (s: HTMLElement) => [
      s.matches('.gantt-fest') ? 'festival' : 'travel',
      getComputedStyle(s, '::after').content !== 'none',
      Number(getComputedStyle(s.querySelector('b') ?? s).fontWeight) <= 500,
    ];
    expect(axis.map(look)).toEqual([
      ['travel', true, true],
      ['festival', false, false],
      ['festival', false, false],
      ['festival', false, false],
      ['travel', true, true],
    ]);
  });
});

test('a card whose people stay at two places or more can be seen by place, from icon buttons, kept for the visit', async () => {
  // one place for everyone: no choice
  await kuofAt(1200, (root) => expect(opened(root, 'KUOF')?.querySelector('.gantt-views')).toBeNull(), TO_KUOF);
  await kuofAt(
    1200,
    (root) => {
      const card = opened(root, 'KUOF');
      const choice = [...(card?.querySelectorAll<HTMLButtonElement>('.gantt-views button') ?? [])];
      const pressed = () => choice.map((b) => [b.ariaLabel, b.title, b.getAttribute('aria-pressed')]);
      expect(pressed()).toEqual([
        ['By travel', 'By travel', 'true'],
        ['By place', 'By place', 'false'],
      ]);
      expect(choice.map((b) => b.querySelector('svg') !== null && said(b) === '')).toEqual([true, true]);
      choice[1]?.click();
      expect(pressed().map((p) => p[2])).toEqual(['false', 'true']);
      // a line a place, the most people first, those who said none last, its people under its name; one stroke over
      // the nights anyone stays there, its ends the weekdays of the first evening and the morning after the last
      const seen = linesOf(root);
      expect(seen.names).toEqual([
        'Comfort Xpress Oslo Sentrum Christina',
        'Scandic Holberg Cédric',
        'Not said Maja, Ragnhild and Tonje',
      ]);
      expect(seen.strokes.map((s) => [s.said, s.fades, s.at])).toEqual([
        [
          ['Thu', 'Mon'],
          [false, false],
          [0, 4],
        ],
        [
          ['Thu', 'Mon'],
          [false, false],
          [0, 4],
        ],
        [
          ['', ''],
          [true, true],
          [1, 4],
        ],
      ]);
      expect(seen.words).toBe(
        'Comfort Xpress Oslo Sentrum, the nights of Thu 19 to Sun 22: Christina; Scandic Holberg, the nights of Thu 19 to Sun 22: Cédric; place not said: Maja, Ragnhild and Tonje',
      );
      // drawn again, as when the calendar steps: still by place
      const again = withStays(APART, () => withTrips(flown, () => onDay('2026-11-01', () => communityPage(COMMUNITY))));
      expect(opened(again, 'KUOF')?.querySelector('.gantt-views [aria-pressed="true"]')?.ariaLabel).toBe('By place');
      // another community's card of the festival is a roster of its own: by travel, until chosen there
      const elsewhere = 'quiet-amber-fjord-lark';
      db?.run("INSERT INTO communities SELECT 2, ?, 'Elsewhere', id FROM people WHERE key = 'cedric'", [elsewhere]);
      db?.run("INSERT INTO community_members SELECT 2, id FROM people WHERE key IN ('cedric', 'christina')");
      try {
        const other = withStays(APART, () =>
          withTrips(flown, () => onDay('2026-11-01', () => communityPage(elsewhere))),
        );
        expect(opened(other, 'KUOF')?.querySelector('.gantt-views [aria-pressed="true"]')?.ariaLabel).toBe('By travel');
      } finally {
        db?.run('DELETE FROM community_members WHERE community_id = 2');
        db?.run('DELETE FROM communities WHERE id = 2');
      }
      opened(again, 'KUOF')?.querySelector<HTMLElement>('.gantt-views button')?.click();
    },
    flown,
    APART,
  );
});

test('by place, the names a count opens say each one’s own nights when they are not all of the place’s', () => {
  // five at the Scandic, Thursday to Sunday nights, but Nora from Friday
  const stay = (first: string) => [{ first, last: '2026-11-22', place: 'Scandic Holberg' }];
  const goes = ['Ann', 'Bo', 'Cy', 'Di', 'Nora'].map((name) => ({
    person: name,
    key: name,
    name,
    couple: null,
    travel: null,
    stays: stay(name === 'Nora' ? '2026-11-20' : '2026-11-19'),
  }));
  const grid = ganttByPlace({
    from: '2026-11-19',
    to: '2026-11-23',
    festival: { start_date: '2026-11-20', end_date: '2026-11-22' },
    place: 'Oslo',
    describedBy: 'places',
    seed: '1',
    places: byPlace(goes),
    named: (u) => u.name,
  });
  const count = grid.querySelector<HTMLElement>('.gantt-who');
  count?.click();
  expect(said(count)).toBe('5 people');
  expect(cardOf(grid.querySelector('.gantt-who-names'))).toEqual(['Ann', 'Bo', 'Cy', 'Di', 'Nora · Fri–Sun']);
  expect(said(grid.querySelector('.gantt-who-nights'))).toBe('· Fri–Sun');
});

// ----- the Friends tab for a visitor: the people near the site's home city, where Cédric, Christina and Siân live -----
// the site's home city, from the data, and where it is
const homeOf = () =>
  one({ key: str, city: str, lat: num, lon: num }, sql`SELECT key, name AS city, lat, lon FROM cities WHERE key = ?`, [
    site().home.city_key,
  ]);
const friendsTab = (qs = '') => {
  const root = document.createElement('main');
  friendsView(root, qs, new AbortController().signal);
  return root;
};
// the list as read: its summary, and each festival's name with its lines of who goes, "Teaching: Christina and Siân"
const listOf = (root: HTMLElement) => ({
  panel: [...root.querySelectorAll('.now-next p')].map(
    (l) => `${said(l.querySelector('.who-label'))}: ${said(l.lastElementChild)}`,
  ),
  count: said(root.querySelector('.bar-count')),
  months: [...root.querySelectorAll('.month-head')].map((m) => said(m)),
  rows: [...root.querySelectorAll('.who-rows > li')].map((li) => ({
    name: said(li.querySelector('.who-name')),
    lines: [...li.querySelectorAll('.who-lines p')].map(
      (l) => `${said(l.querySelector('.who-label'))}: ${said(l.lastElementChild)}`,
    ),
  })),
  bar: root.querySelector('.sticky-bar') !== null,
});
// the festivals the list shows for an address's choices, by name
const listed = (qs: string) => listOf(onDay('2026-11-04', () => friendsTab(qs))).rows.map((r) => r.name);
const glasgowOf = (root: HTMLElement) => listOf(root).rows.find((r) => r.name?.includes('Glasgow'));
test('the Friends tab lists the festivals of the people near the home city by month, a line for what they do', () => {
  const root = onDay('2026-11-04', friendsTab);
  const list = listOf(root);
  const home = homeOf()?.city ?? '';
  expect(home).not.toBe('');
  expect(NEAR_KM).toBe(200);
  // the panel: who shares plans, named while they are few, and who goes next
  expect(list.panel[0]).toMatch(/^Who: Christina \(\d+\), Cédric \(\d+\) and Siân \(\d+\)$/u);
  expect(list.panel.at(-1)).toMatch(/^Next: /u);
  expect(list.months[0]).toBe('November 2026 · 3 festivals');
  expect(glasgowOf(root)?.lines).toEqual(['teaching: Christina and Siân']);
  expect(list.rows.map((r) => r.lines[0]?.split(':')[0])).toContain('going');
  // a short list: no bar to narrow it
  expect(list.bar).toBe(false);
  expect(friendsTabs().map(([k, words]) => [k, words])).toEqual([
    ['near', `Near ${home}`],
    ['everywhere', 'Everywhere'],
  ]);
});

test('a festival on now says so in the Friends tab, as on its card, and in its Now line', () => {
  const glasgow = one(
    { start_date: str },
    sql`SELECT start_date FROM event_rows WHERE city = 'Glasgow' AND id IN (SELECT event_id FROM plans) ORDER BY start_date`,
  );
  const on = onDay(glasgow?.start_date ?? '', friendsTab);
  expect(said(on.querySelector('.who-rows > li:has(.now-tag) .who-name'))).toContain('Glasgow');
  expect([...on.querySelectorAll('.now-next p')].map((l) => said(l.querySelector('.who-label')))).toEqual([
    'Who',
    'Now',
    'Next',
  ]);
  expect(said(on.querySelector('.now-next p:nth-child(2) span:last-child'))).toMatch(/^Glasgow.*\(2\)$/u);
  expect(onDay('2026-11-04', friendsTab).querySelector('.now-tag')).toBeNull();
});

test('a line names up to four people or couples, then three and how many more, the ticked always named', () => {
  const goer = (n: number, booked = false) => ({
    person_id: 1000 + n,
    key: `p${n}`,
    name: `P${n}`,
    featured: false,
    plan: KEY.plan.GOING,
    booked_as: booked ? KEY.role.TEACHER : null,
  });
  const lines = (goers: ReturnType<typeof goer>[], ticked: string[] = []) =>
    [
      ...whoLines(
        { goers, title: 'F', start_date: '2027-01-01', end_date: '2027-01-02', country_code: null, city: null },
        new Set(ticked),
      ).querySelectorAll('p'),
    ].map((p) => said(p));
  const four = [1, 2, 3, 4].map((n) => goer(n));
  expect(lines(four)).toEqual(['goingP1, P2, P3 and P4']);
  expect(lines([...four, goer(5)])).toEqual(['goingP1, P2, P3 and 2 more']);
  expect(lines([...four, goer(5)], ['p5'])).toEqual(['goingP5, P1, P2 and 2 more']);
  expect(lines([goer(9, true), ...four])).toEqual(['teachingP9', 'goingP1, P2, P3 and P4']);
  expect(NAMED_UP_TO).toBe(4);
});

test('the Friends tab keeps the festivals all the friends ticked go to, or any of them, and says when none is', () => {
  const glasgow = listed('').filter((n) => n?.includes('Glasgow'));
  expect(listed('with=christina,sian')).toEqual(glasgow); // both teach in Glasgow
  const none = onDay('2026-11-04', () => friendsTab('with=cedric,sian'));
  expect(said(none.querySelector('.who-list'))).toBe(
    'Cédric and Siân have no festival in common. Show those any of them goes to',
  );
  expect(said(none.querySelector('.bar-count'))).toBe('0 of 6 festivals in common');
  none.querySelector<HTMLButtonElement>('.who-list .link')?.click();
  expect(listOf(none).rows.length).toBe(listed('').length); // between them, every one
  expect(listed('with=cedric,sian&any=1').length).toBe(listed('').length);
  // a filter in the address shows the bar, however short the list
  expect(listOf(onDay('2026-11-04', () => friendsTab('with=sian'))).bar).toBe(true);
});

test('the Friends tab narrows the festivals by a festival’s name or city, and by the time ahead', () => {
  expect(listed('q=prague').every((n) => n?.includes('Prague'))).toBe(true);
  expect(listed('q=prague').length).toBe(2);
  expect(listed('q=PRÁGUE')).toEqual(listed('q=prague'));
  expect(listed('when=weekend').every((n) => n?.includes('Glasgow'))).toBe(true); // 6–8 Nov, the coming weekend
  expect(listed('when=months').length).toBeLessThan(listed('').length);
});

test('the Friends tab lists only the people living within 200 km of the home city, and Everywhere everyone', () => {
  // Siân moved this far north of the home city, in degrees of latitude (about 111 km each), while then runs
  const movedNorth = <T>(degrees: number, then: () => T): T => {
    db?.run(
      "INSERT INTO cities (key, name, country_code, lat, lon) SELECT 'elsewhere-no', 'Elsewhere', country_code, lat + ?, lon FROM cities WHERE key = ?",
      [degrees, homeOf()?.key ?? ''],
    );
    db?.run("UPDATE people SET home = 'elsewhere-no' WHERE key = 'sian'");
    try {
      return then();
    } finally {
      db?.run("UPDATE people SET home = ? WHERE key = 'sian'", [homeOf()?.key ?? '']);
      db?.run("DELETE FROM cities WHERE key = 'elsewhere-no'");
    }
  };
  const near = () => listOf(onDay('2026-11-04', friendsTab));
  expect(movedNorth(1.62, near).panel[0]).toContain('Siân'); // about 180 km
  expect(movedNorth(2.07, near).panel[0]).not.toContain('Siân'); // about 230 km
  // and the festivals name only the people near: Glasgow, Christina without Siân; everywhere, both
  expect(movedNorth(2.07, () => glasgowOf(onDay('2026-11-04', friendsTab)))?.lines).toEqual(['teaching: Christina']);
  expect(movedNorth(2.07, () => glasgowOf(onDay('2026-11-04', () => friendsTab('in=everywhere'))))?.lines).toEqual([
    'teaching: Christina and Siân',
  ]);
  expect(movedNorth(2.07, () => listOf(onDay('2026-11-04', () => friendsTab('in=everywhere')))).panel[0]).toContain(
    'Siân',
  );
});

test('who added someone is said to a screen reader too, not on hover alone', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const who = agendaRow(root, 'KUOF')?.querySelector('.trip-who');
  expect(said(who)).toBe(KUOF);
  expect(heard(who)).toContain('Tonje (added by Cédric)');
});

// the contrast of a colour on another, as WCAG measures it
const luminance = (rgb: string) => {
  const [r = 0, g = 0, b = 0] = (rgb.match(/\d+(?:\.\d+)?/gu) ?? []).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].toSorted((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};

test('a day gone by is struck through and readable; a travelled one keeps its weight; the view switch shows focus', async () => {
  await styled(() => {
    const root = onDay('2026-11-10', () => communityPage(COMMUNITY));
    document.body.append(root);
    try {
      const past = cellOn(root, '2026-11-02'),
        travelled = cellOn(root, '2026-11-06');
      const style = (el: Element | undefined) => (el === undefined ? undefined : getComputedStyle(el));
      const ground = getComputedStyle(document.body).backgroundColor;
      expect(style(past)?.textDecorationLine).toBe('line-through');
      expect(contrast(style(past)?.color ?? '', ground)).toBeGreaterThanOrEqual(4.5);
      expect([style(travelled)?.textDecorationLine, style(travelled)?.fontWeight]).toEqual(['line-through', '650']);
      // a bar's times at 0.7rem at least
      root.querySelector<HTMLButtonElement>('.trip-toggle')?.click();
      const bar = root.querySelector('.gantt-bar');
      expect(Number.parseFloat(style(bar ?? undefined)?.fontSize ?? '0')).toBeGreaterThanOrEqual(0.7 * 16);
      // the view switch's focus ring inside its rounded border, which clips what is outside it
      const view = h('button', { type: 'button' });
      const views = h('div', { class: 'gantt-views' }, view);
      root.append(views);
      view.focus({ focusVisible: true });
      expect([style(view)?.outlineStyle, style(view)?.outlineOffset]).toEqual(['solid', '-3px']);
    } finally {
      root.remove();
    }
  });
});

test('a day said without its time is drawn whole: arriving from its start, leaving to its end', () => {
  // Cédric and Christina to KUOF, in on the Friday and out on the Sunday, the days alone
  const trips: readonly Planted[] = ['cedric', 'christina'].map(
    (key) => [key, 19_033, '2026-11-20', '2026-11-22', null] as const,
  );
  const bar = withTrips(trips, () => {
    const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
    const row = agendaRow(root, 'KUOF');
    row?.querySelector<HTMLButtonElement>('.trip-toggle')?.click();
    return ganttOf(row).bars[0];
  });
  // the festival's three days, Friday to Sunday: all of them, the Sunday to its end
  expect([bar?.left, bar?.width]).toEqual([0, 100]);
  expect(bar?.fades).toEqual([true, true]);
});

test('two people added of one first name are two people, each on the calendar and in the day’s box', () => {
  withAdded(
    [
      ['Anna', 19_033],
      ['Anna', 19_033],
    ],
    () => {
      inPage('2026-11-01', (root) => {
        // KUOF's three added and Cédric and Christina, and two Annas
        expect(awayOn(cellOn(root, '2026-11-21'))).toBe(7);
        cellOn(root, '2026-11-21')?.focus();
        const there = [...(popover(root)?.querySelectorAll('p') ?? [])]
          .map((p) => said(p))
          .find((t) => t?.startsWith('There'));
        expect(there?.match(/Anna/gu)).toHaveLength(2);
      });
    },
  );
});

test('a day someone leaves one festival and flies to another says both', () => {
  // Christina out of Glasgow on the Monday at 19:10, and into Oslo that night for KUOF
  withTrips([['christina', 19_033, '2026-11-09T22:30', '2026-11-23T09:40', null]], () => {
    inPage('2026-11-01', (root) => {
      cellOn(root, '2026-11-09')?.focus();
      const box = [...(popover(root)?.querySelectorAll('p') ?? [])].map((p) => said(p));
      expect(box).toContain('Flying out: Christina 19:10 ABZ');
      expect(box).toContain('Flying in: Christina 22:30 OSL');
    });
  });
});

// ----- someone who may go -----
// the fixture's: Tonje, added, may go to Prague GOLD (where Cédric and Christina go), and Siân may go to Prague Kwanza
const PRAGUE = 'Prague GOLD';
const tags = (el: Element | null | undefined) =>
  [...(el?.querySelectorAll('.plan-tag') ?? [])].map((t) => [said(t), t.matches('.unsure')]);

test('on the community page someone who may go is named with a maybe tag and counted apart', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const row = agendaRow(root, PRAGUE);
  expect(said(row?.querySelector('.trip-who'))).toBe('Cédric & Christina going · Tonje maybe');
  expect(tags(row?.querySelector('.trip-who'))).toEqual([
    ['going', false],
    ['maybe', true],
  ]);
  opened(root, PRAGUE);
  expect(said(row?.querySelector('.trip-who'))).toBe('2 going · 1 maybe');
  // the roster: Tonje on her line, tagged, and in words
  expect(tags(row?.querySelector('.gantt'))).toEqual([['maybe', true]]);
  expect(said(row?.querySelector('.gantt-said'))).toContain('Tonje (maybe)');
  // of those added to KUOF, Maja only may go: named apart from those going
  db?.run(`UPDATE community_seeded SET status = '${KEY.plan.MAYBE}' WHERE name = 'Maja' AND event_id = 19033`);
  try {
    const kuof = agendaRow(
      onDay('2026-11-01', () => communityPage(COMMUNITY)),
      'KUOF',
    );
    expect(said(kuof?.querySelector('.trip-who'))).toBe(
      'Cédric & Christina teaching · Tonje and Ragnhild going and Maja maybe',
    );
  } finally {
    db?.run(`UPDATE community_seeded SET status = '${KEY.plan.GOING}' WHERE name = 'Maja'`);
  }
  // Siân, a member, may go to Prague Kwanza
  expect(said(agendaRow(root, 'Prague Kwanza')?.querySelector('.trip-who'))).toBe('Siân maybe');
});

test('the calendar and the sentence count those going, not those who may go, whom a day’s popover names', () => {
  inPage('2026-11-01', (root) => {
    // Prague GOLD's days: Cédric and Christina, not Tonje
    expect(awayOn(cellOn(root, '2027-01-15'))).toBe(2);
    expect(countOn(root, '2027-01-15')).toBe('2');
    cellOn(root, '2027-01-15')?.focus();
    expect(said(popover(root))).toBe(
      'Fri 15 JanPrague GOLD KIZ Tarraxo Festival · PragueThere: Cédric & Christina and Tonje maybe',
    );
    expect(tags(popover(root))).toEqual([['maybe', true]]);
    // Prague Kwanza, where only Siân may go: no day counted
    expect(awayOn(cellOn(root, '2027-02-12'))).toBe(0);
  });
  // everyone added to KUOF only maybe: KUOF counts Cédric and Christina alone, fewer than Glasgow's three
  const sentence = () => said(onDay('2026-11-01', () => communityPage(COMMUNITY)).querySelector('.community-when'));
  expect(sentence()).toContain('5 people, to Oslo');
  db?.run(`UPDATE community_seeded SET status = '${KEY.plan.MAYBE}' WHERE event_id = 19033`);
  try {
    expect(sentence()).toBe('Most people are travelling 6–9 Nov: 3 people, to Glasgow.');
  } finally {
    db?.run(`UPDATE community_seeded SET status = '${KEY.plan.GOING}' WHERE event_id = 19033`);
  }
});

test('a festival’s card and the Friends tab say who may go apart from who is going', () => {
  const kwanza = onDay('2026-11-01', () => festivals().find((e) => e.title.startsWith('Prague Kwanza')));
  expect(kwanza?.goers.map((g) => [g.key, g.plan])).toEqual([['sian', KEY.plan.MAYBE]]);
  const card = kwanza === undefined ? undefined : eventCard(kwanza, { open: true });
  expect(said(card?.querySelector('.going-line > span:last-child'))).toBe('Siân may go');
  expect(said(card?.querySelector('.who h4'))).toBe('Who’s going0 · 1 maybe');
  expect(tags(card?.querySelector('.who'))).toEqual([['maybe', true]]);
  // the hero's friends going: none, as Siân only may go
  expect(kwanza === undefined ? undefined : friendsIn([kwanza])).toBeNull();
  const kwanzaRow = listOf(onDay('2026-11-04', friendsTab)).rows.find((r) => r.name?.includes('Kwanza'));
  expect(kwanzaRow?.lines).toEqual(['maybe: Siân']);
});

test('a person’s page lists the festivals they said they’re going to', () => {
  const root = document.createElement('main');
  onDay('2026-11-04', () => personView(root, 'sian'));
  expect(said(root.querySelector('h1'))).toBe('Siân’s festival plans');
  expect(root.querySelectorAll('.festival-card').length).toBeGreaterThan(0);
  const nobody = document.createElement('main');
  personView(nobody, 'nobody');
  expect(said(nobody)).toBe('No one by that name has shared plans.');
});

test('someone in the line-up teaches there whatever their plan says, and is counted as going', () => {
  const booked = { plan: KEY.plan.MAYBE, booked_as: KEY.role.TEACHER };
  expect([said(doingTag([booked])), unsure(booked)]).toEqual(['teaching', false]);
  expect([said(doingTag([{ ...booked, booked_as: null }])), said(doingTag([]))]).toEqual(['maybe', 'going']);
});

// The admin's rule: the sources page promotes no one. It names no company a price is resold by (the fares' reseller,
// nor any a ticket page sells through) and no model by its maker, in its words or its links.
test('the sources page names no reseller and no model’s maker', () => {
  const resellers = (
    exec('SELECT DISTINCT reseller FROM ticket_pages WHERE reseller IS NOT NULL')[0]?.values ?? []
  ).map(([name]) => String(name));
  const root = h('div', {});
  sourcesView(root);
  const shown = `${root.textContent} ${[...root.querySelectorAll('a')].map((a) => a.href).join(' ')}`.toLowerCase();
  expect(shown).toContain('a reseller’s');
  expect(['kiwi', 'claude', 'anthropic', ...resellers].filter((name) => shown.includes(name.toLowerCase()))).toEqual(
    [],
  );
});

// ----- search: a city is one entry, by its key, however its festivals' listings spell it -----
test('search lists a city once, with every festival its listings spell two ways', () => {
  const entries = cityEntries();
  expect(new Set(entries.map((c) => c.key)).size).toBe(entries.length);
  const munich = entries.filter((c) => c.city === 'Munich');
  const spelt = one(
    { n: num, names: num },
    sql`SELECT count(*) AS n, count(DISTINCT x.city) AS names FROM events x WHERE x.city_key = 'munich-de'`,
  );
  expect(spelt?.names).toBe(2); // Munich and München
  expect(munich.map((c) => [c.key, c.cc, c.all])).toEqual([['munich-de', 'DE', spelt?.n]]);
});
