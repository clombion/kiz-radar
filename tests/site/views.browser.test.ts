// The views on the database the build ships, in Chromium: loaded as the page loads it (db.ts), from public/data/.
import initSqlJs, { type Database } from 'sql.js';
import { beforeAll, expect, test, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import { artistsView } from '../../site/artists.ts';
import { communityView } from '../../site/communities.ts';
import { exec, load, loadSite, one, sql } from '../../site/db.ts';
import { h } from '../../site/dom.ts';
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

// what the community's page says of each festival, on its card and in the list at the top
const KUOF = 'Cédric & Christina teaching · Tonje, Ragnhild and Maja going';
// Christina alone of the members goes to Glasgow, named as herself; Sian, added by Cédric, teaches there
const GLASGOW = 'Christina teaching · Sian teaching and Carolina going';
// the names in an element that say on hover who added them, each with what it says
const titled = (el: Element | null | undefined) =>
  [...(el?.querySelectorAll('[title]') ?? [])].map((n) => [n.textContent, n.getAttribute('title')]);

test('a community names who of it goes to each festival: members as their couple, and the people added', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  expect(said(root.querySelector('h1'))).toBe('Norwegians in festivals');
  expect(said(root.querySelector('.lede'))).toBe('2 members · managed by Cédric');
  expect(root.querySelector('.lede a')?.getAttribute('href')).toBe(personHref('cedric'));
  expect(said(root.querySelector('.profile-head'))).toContain('Visible to the 2 members of Norwegians in festivals');
  const cards = [...root.querySelectorAll('.festival-card')];
  expect(said(root.querySelector('section h2'))).toBe(`Where the community is going (${cards.length})`);
  const card = (title: string) => cards.find((c) => c.querySelector('h3')?.textContent?.startsWith(title));
  expect(said(card('KUOF')?.querySelector('.going-line'))).toBe(KUOF);
  expect(said(card('Glasgow')?.querySelector('.going-line'))).toBe(GLASGOW);
  // who added them is said on hover only, on each added name
  expect(said(root)).not.toContain('added by');
  expect(titled(card('KUOF')?.querySelector('.going-line'))).toEqual(
    ['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, 'Added by Cédric']),
  );
  expect(titled(card('Glasgow')?.querySelector('.going-line'))).toEqual(
    ['Sian', 'Carolina'].map((n) => [n, 'Added by Cédric']),
  );
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
  inPage('2026-11-01', (root) => {
    const titles = [...root.querySelectorAll('.festival-card h3')].map((t) => said(t));
    const listed = rows(root);
    expect(listed.map((r) => r.festival)).toEqual(titles); // a row for each card, in their order
    expect(titles.length).toBeGreaterThan(3);
    expect(listed.map((r) => r.shown)).toEqual(titles.map((_, i) => i < 3));
    expect(listed.slice(0, 2).map((r) => r.who)).toEqual([GLASGOW, KUOF]);
    const more = root.querySelector<HTMLButtonElement>('.plan-list + button');
    expect(more?.textContent).toBe('See more');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    more?.focus();
    expect(document.activeElement).toBe(more); // a keyboard reaches it
    more?.click();
    expect(rows(root).every((r) => r.shown)).toBe(true);
    expect(more?.getAttribute('aria-expanded')).toBe('true');
    more?.click();
    expect(rows(root).map((r) => r.shown)).toEqual(titles.map((_, i) => i < 3));
  });
});

test('with three festivals or fewer to come, the list shows them all and has no See more', () => {
  // after HOT Ice ends: Prague and Cloudkiz are left
  const root = onDay('2026-12-02', () => communityPage(COMMUNITY));
  const listed = rows(root);
  expect(listed.length).toBeGreaterThan(0);
  expect(listed.length).toBeLessThanOrEqual(3);
  expect(listed.every((r) => r.shown)).toBe(true);
  expect(root.querySelector('.plan-list + button')).toBeNull();
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

// the strip's days: each cell's day, what it says to a screen reader, and how many people that is
const cellsOf = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.strip td[data-day]')];
const cellOn = (root: HTMLElement, day: string) =>
  root.querySelector<HTMLElement>(`.strip td[data-day="${day}"]`) ?? undefined;
const awayOn = (cell: HTMLElement) =>
  Number(/: (?<n>\d+) (?:person|people) away/u.exec(cell.ariaLabel ?? '')?.groups?.['n'] ?? 0);
const focusedDay = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement.dataset['day'] : undefined;
// a key pressed where the focus is
const press = (key: string) =>
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const popover = (root: HTMLElement) => root.querySelector<HTMLElement>('.strip-pop');

// whether the popover of a day is hidden once Escape is pressed
const escaped = (root: HTMLElement): HTMLElement['hidden'] | undefined => {
  press('Escape');
  return popover(root)?.hidden;
};

test('the strip shades each day by who is away, and the sentence names the days most are, by the same count', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const head = [...root.querySelectorAll('.profile-head p')].map((p) => said(p));
  // KUOF: Cédric, Christina and the three added; Glasgow has three
  expect(head).toContain('Most of the community is away 20–22 Nov: 5 people, in Oslo.');
  const cells = cellsOf(root);
  const most = Math.max(...cells.map(awayOn));
  expect(most).toBe(5);
  expect(cells.filter((c) => awayOn(c) === most).map((c) => c.dataset['day'])).toEqual([
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ]);
  expect([...root.querySelectorAll<HTMLElement>('.strip td.strip-3')].every((c) => awayOn(c) * 3 > most * 2)).toBe(
    true,
  );
  expect(cellOn(root, '2026-11-20')?.ariaLabel).toBe('Fri 20 Nov: 5 people away, in Oslo');
  expect(cellOn(root, '2026-11-15')?.ariaLabel).toBe('Sun 15 Nov: no one away');
  // Glasgow from its Friday to its Monday, all of its days
  expect(['06', '07', '08', '09', '10'].map((d) => awayOn(cellOn(root, `2026-11-${d}`) ?? root))).toEqual([
    3, 3, 3, 3, 0,
  ]);
  // Cédric and Christina's trip to Prague (trips.csv): away from the Wednesday they fly in to the Monday they leave
  expect(['12', '13', '14', '18', '19'].map((d) => awayOn(cellOn(root, `2027-01-${d}`) ?? root))).toEqual([
    0, 2, 2, 2, 0,
  ]);
  // today outlined, and the weeks from today's Monday, the months named over them with the year where it turns
  expect(root.querySelectorAll('.strip td[aria-current="date"]')).toHaveLength(1);
  expect(cellOn(root, '2026-11-01')?.getAttribute('aria-current')).toBe('date');
  expect(cells[0]?.dataset['day']).toBe('2026-10-26');
  const months = [...root.querySelectorAll('.strip thead th')].map((th) => said(th)).filter(Boolean);
  expect(months).toEqual(['Nov 2026', 'Dec', 'Jan 2027', 'Feb']);
});

test('the strip is one stop for the keyboard: the arrows move by a day or a week, Escape or a tap elsewhere closes the day', () => {
  inPage('2026-11-01', (root) => {
    const stops = () => cellsOf(root).filter((c) => c.tabIndex === 0);
    expect(stops().map((c) => c.dataset['day'])).toEqual(['2026-11-01']);
    stops()[0]?.focus();
    expect(popover(root)?.hidden).toBe(false);
    press('ArrowRight'); // a week on
    expect(focusedDay()).toBe('2026-11-08');
    press('ArrowUp'); // a day back
    press('ArrowUp');
    expect(focusedDay()).toBe('2026-11-06');
    expect(stops().map((c) => c.dataset['day'])).toEqual(['2026-11-06']); // still one stop, where the focus is
    expect(said(popover(root))).toContain('Glasgow Kizomba Festival 5.0 · Glasgow');
    expect(said(popover(root))).toContain('There: Christina, Sian and Carolina');
    expect(escaped(root)).toBe(true);
    // a tap opens a day, and a tap elsewhere closes it
    cellOn(root, '2026-11-20')?.click();
    expect(popover(root)?.hidden).toBe(false);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover(root)?.hidden).toBe(true);
  });
});

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
// the illustrative KUOF trip of Cédric and Christina, from Thursday to Monday
const TO_KUOF: readonly Planted[] = ['cedric', 'christina'].map(
  (key) => [key, 19_033, '2026-11-19T21:05', '2026-11-23T09:30', 'Scandic Holberg'] as const,
);

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
        'Flying in: Cédric & Christina 21:05 OSL', // one flight, so the couple as one
        'Staying: Scandic Holberg: Cédric & Christina',
      ]);
      expect(open('2026-11-20')).toEqual([
        'Fri 20 Nov',
        'KUOF – Kizomba & Urban Kiz Oslo Festival · Oslo',
        'There: Cédric & Christina, Tonje, Ragnhild and Maja',
        'Staying: Scandic Holberg: Cédric & Christina',
      ]);
      expect(open('2026-11-23')).toContain('Flying out: Cédric & Christina 09:30 OSL');
      expect(titled(popover(root))).toEqual([]); // no one added is there on the 23rd
      open('2026-11-20');
      // the people added are named, saying on hover who added them, and never travel
      expect(titled(popover(root))).toEqual(['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, 'Added by Cédric']));
      // their trip is the strip's: away from the 19th to the 23rd
      expect(awayOn(cellOn(root, '2026-11-19') ?? root)).toBe(2);
      expect(awayOn(cellOn(root, '2026-11-23') ?? root)).toBe(2);
    });
  });
});

test('the strip is a year at most, and says how many trips come after it', () => {
  const root = onDay('2025-11-01', () => communityPage(COMMUNITY));
  expect(root.querySelectorAll('.strip thead th')).toHaveLength(53);
  // the year of weeks ends on Sunday 1 Nov 2026: every festival comes after it
  expect(said(root.querySelector('.strip-wrap p.muted'))).toBe('and 5 more trips after 1 Nov 2026');
});

test('on a phone the strip fits the page, with no sideways scroll', async () => {
  const style = h('style', {}, await commands.readFile('public/css/site.css'));
  document.head.append(style);
  const phone = h('div', { style: { width: '358px' } }); // 390px less the gutters
  document.body.append(phone);
  try {
    const root = onDay('2025-11-01', () => communityPage(COMMUNITY)); // the year's 53 weeks
    phone.append(root);
    const wrap = root.querySelector<HTMLElement>('.strip-wrap');
    expect(wrap?.scrollWidth).toBeLessThanOrEqual(358);
    expect(root.querySelector('.strip')?.getBoundingClientRect().width).toBeLessThanOrEqual(358);
    expect(cellOn(root, '2026-01-05')?.getBoundingClientRect().width).toBeGreaterThanOrEqual(4.5);
  } finally {
    phone.remove();
    style.remove();
  }
});

test('with nothing to come, the community’s page has no sentence of when it is away, nor a strip', () => {
  const root = onDay('2028-01-01', () => communityPage(COMMUNITY));
  expect(said(root)).not.toContain('Most of the community');
  expect(root.querySelector('.strip')).toBeNull();
});

test('the overview labels its seven weekdays, each month over its first week, and its shades with their counts', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  const weekdays = [...root.querySelectorAll('.strip tbody th')];
  expect(weekdays.map((th) => th.textContent)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  expect(weekdays.map((th) => th.getAttribute('abbr'))).toEqual([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]);
  // at most 5 away: the legend's ranges are the shades' steps, and each day is in the shade of its count
  expect(said(root.querySelector('.strip-legend'))).toBe('People away: 1 2–3 4–5 today');
  const ranges = [...root.querySelectorAll('.strip-legend .strip-key')].slice(0, -1).map((k) => {
    const [from = 0, to = from] = (k.textContent ?? '').split('–').map(Number);
    return { shade: k.querySelector('.strip-swatch')?.className.split(' ')[1], from, to };
  });
  expect(ranges.map((r) => r.shade)).toEqual(['strip-1', 'strip-2', 'strip-3']);
  const away = cellsOf(root).filter((c) => awayOn(c) > 0);
  expect(away.length).toBeGreaterThan(0);
  for (const c of away)
    expect(c.matches(`.${ranges.find((r) => awayOn(c) >= r.from && awayOn(c) <= r.to)?.shade}`)).toBe(true);
  // a month over the column of its first week, with its year in January and over the first
  const heads = [...root.querySelectorAll('.strip thead th')];
  const columnOf = (day: string) => {
    const cell = cellOn(root, day);
    return cell instanceof HTMLTableCellElement ? cell.cellIndex : -1;
  };
  expect(heads.findIndex((th) => th.textContent === 'Jan 2027') + 1).toBe(columnOf('2027-01-01'));
  expect(heads.findIndex((th) => th.textContent === 'Dec') + 1).toBe(columnOf('2026-12-01'));
});

test('on a computer each day the community is away on says its count; on a phone the label does', async () => {
  const style = h('style', {}, await commands.readFile('public/css/site.css'));
  document.head.append(style);
  try {
    await page.viewport(1200, 900);
    inPage('2026-11-01', (root) => {
      const kuof = cellOn(root, '2026-11-20')?.querySelector<HTMLElement>('.strip-n');
      expect(kuof?.textContent).toBe('5');
      expect(kuof === null || kuof === undefined ? 'none' : getComputedStyle(kuof).display).not.toBe('none');
      expect(cellOn(root, '2026-11-15')?.querySelector('.strip-n')).toBeNull(); // no one away, nothing written
    });
    await page.viewport(390, 844);
    inPage('2026-11-01', (root) => {
      const kuof = cellOn(root, '2026-11-20')?.querySelector<HTMLElement>('.strip-n');
      expect(kuof === null || kuof === undefined ? '' : getComputedStyle(kuof).display).toBe('none');
      expect(cellOn(root, '2026-11-20')?.ariaLabel).toContain('5 people away');
    });
  } finally {
    await page.viewport(414, 896);
    style.remove();
  }
});

// a festival's row of days, by its title: each day, its labels, whether it is the festival's, and its arrows
const dayRowOf = (root: HTMLElement, title: string) =>
  [...root.querySelectorAll('.plan-list li')]
    .find((li) => li.querySelector('.what a')?.textContent?.startsWith(title))
    ?.querySelector<HTMLElement>('.dayrow');
const daysIn = (row: HTMLElement | null | undefined) =>
  [...(row?.querySelectorAll<HTMLElement>('.dayrow-day') ?? [])].map((d) => ({
    day: d.dataset['day'],
    shown: `${said(d.querySelector('.dayrow-w'))} ${said(d.querySelector('.dayrow-n'))}`,
    festival: d.matches('.dayrow-festival'),
    moves: said(d.querySelector('.dayrow-moves')) ?? '',
  }));
// Cédric to HOT Ice, leaving before it ends; Christina without a trip
const TO_HOT_ICE: readonly Planted[] = [['cedric', 17_493, '2026-11-25T10:00', '2026-11-29T18:00', null]];

test('each festival’s row runs from the first to arrive to the last to leave, its own days apart, arrows on flights', () => {
  withTrips([...TO_KUOF, ...TO_HOT_ICE], () => {
    const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
    // KUOF: in the day before, out the day after
    expect(daysIn(dayRowOf(root, 'KUOF'))).toEqual([
      { day: '2026-11-19', shown: 'T 19', festival: false, moves: '↓' },
      { day: '2026-11-20', shown: 'F 20', festival: true, moves: '' },
      { day: '2026-11-21', shown: 'S 21', festival: true, moves: '' },
      { day: '2026-11-22', shown: 'S 22', festival: true, moves: '' },
      { day: '2026-11-23', shown: 'M 23', festival: false, moves: '↑' },
    ]);
    // HOT Ice goes on after Cédric leaves: its last days are in the row, without arrows
    expect(daysIn(dayRowOf(root, 'HOT Ice')).map((d) => [d.day, d.festival, d.moves])).toEqual([
      ['2026-11-25', false, '↓'],
      ['2026-11-26', true, ''],
      ['2026-11-27', true, ''],
      ['2026-11-28', true, ''],
      ['2026-11-29', true, '↑'],
      ['2026-11-30', true, ''],
      ['2026-12-01', true, ''],
    ]);
    // Prague from trips.csv, in its row behind See more: Wednesday in, Monday out
    expect(daysIn(dayRowOf(root, 'Prague')).map((d) => [d.shown, d.festival, d.moves])).toEqual([
      ['W 13', false, '↓'],
      ['T 14', true, ''],
      ['F 15', true, ''],
      ['S 16', true, ''],
      ['S 17', true, ''],
      ['M 18', true, '↑'],
    ]);
    // Glasgow, where no one said how they travel: its own days only
    expect(daysIn(dayRowOf(root, 'Glasgow')).map((d) => d.day)).toEqual([
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
    ]);
    // every day labelled, and said whole to a screen reader
    const all = [...root.querySelectorAll<HTMLElement>('.dayrow-day')];
    expect(
      all.every((d) =>
        /^[MTWFS] \d{1,2}$/u.test(`${said(d.querySelector('.dayrow-w'))} ${said(d.querySelector('.dayrow-n'))}`),
      ),
    ).toBe(true);
    expect(dayRowOf(root, 'KUOF')?.querySelector('[data-day="2026-11-19"]')?.ariaLabel).toBe(
      'Thu 19 Nov: 2 people away, in Oslo; a travel day, flying in',
    );
    expect(dayRowOf(root, 'KUOF')?.querySelector('[data-day="2026-11-23"]')?.ariaLabel).toBe(
      'Mon 23 Nov: 2 people away, in Oslo; a travel day, flying out',
    );
    expect(root.querySelectorAll('.plan-list li .dayrow')).toHaveLength(root.querySelectorAll('.plan-list li').length);
  });
});

test('a row of days opens the overview’s popover, and is one stop whose arrows move a day', () => {
  inPage('2026-11-01', (root) => {
    root.querySelector<HTMLElement>('.plan-list + button')?.click(); // Prague's row is behind See more
    const row = dayRowOf(root, 'Prague');
    expect([...(row?.querySelectorAll<HTMLElement>('[tabindex="0"]') ?? [])].map((d) => d.dataset['day'])).toEqual([
      '2027-01-13',
    ]);
    row?.querySelector<HTMLElement>('[data-day="2027-01-13"]')?.focus();
    const fromRow = said(popover(root));
    expect(fromRow).toContain('Flying in: Cédric & Christina 14:30 PRG');
    cellOn(root, '2027-01-13')?.focus();
    expect(said(popover(root))).toBe(fromRow); // the one popover, saying the same of the day
    expect(root.querySelectorAll('.strip-pop')).toHaveLength(1);
    row?.querySelector<HTMLElement>('[data-day="2027-01-13"]')?.focus();
    press('ArrowRight');
    expect(focusedDay()).toBe('2027-01-14');
    press('ArrowDown'); // a row has no other week
    expect(focusedDay()).toBe('2027-01-14');
    expect([...(row?.querySelectorAll<HTMLElement>('[tabindex="0"]') ?? [])].map((d) => d.dataset['day'])).toEqual([
      '2027-01-14',
    ]);
    expect(escaped(root)).toBe(true);
  });
});

test('on a phone a fortnight’s row of days fits, every day still labelled', async () => {
  const style = h('style', {}, await commands.readFile('public/css/site.css'));
  document.head.append(style);
  const phone = h('div', { style: { width: '358px' } });
  document.body.append(phone);
  try {
    await page.viewport(390, 844);
    withTrips([['cedric', 17_493, '2026-11-19T10:00', '2026-12-02T18:00', null]], () => {
      const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
      phone.append(root);
      const row = dayRowOf(root, 'HOT Ice');
      expect(row?.querySelectorAll('.dayrow-day')).toHaveLength(14);
      expect(row?.getBoundingClientRect().width).toBeLessThanOrEqual(358);
      expect(row === null || row === undefined ? 1 : row.scrollWidth - row.clientWidth).toBeLessThanOrEqual(0);
      expect(phone.scrollWidth).toBeLessThanOrEqual(358);
      expect(daysIn(row).every((d) => /^[MTWFS] \d{1,2}$/u.test(d.shown))).toBe(true);
    });
  } finally {
    await page.viewport(414, 896);
    phone.remove();
    style.remove();
  }
});
