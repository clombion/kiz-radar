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

test('a community’s head says who it is, when most of it is away and where next, and whom it is for', () => {
  const root = onDay('2026-11-03', () => communityPage(COMMUNITY));
  expect(said(root.querySelector('h1'))).toBe('Norwegians in festivals');
  expect(said(root.querySelector('.lede'))).toBe('2 members · managed by Cédric');
  expect(root.querySelector('.lede a')?.getAttribute('href')).toBe(personHref('cedric'));
  const head = [...root.querySelectorAll('.profile-head p')].map((p) => said(p));
  // KUOF: Cédric, Christina and the three added; Glasgow, this Friday, comes first
  expect(head).toContain('Most of the community is away 20–22 Nov: 5 people, in Oslo. Next: Glasgow, this Friday.');
  expect([...(root.querySelector('.share-row')?.children ?? [])].map((c) => said(c))).toEqual([
    'Share this page',
    'Visible to its 2 members only',
  ]);
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
const monthsOf = (root: HTMLElement) => [...root.querySelectorAll<HTMLTableElement>('.days-month')];
const cellOn = (root: HTMLElement, day: string) =>
  root.querySelector<HTMLElement>(`.days-month td[data-day="${day}"]`) ?? undefined;
const awayOn = (cell: HTMLElement | undefined) =>
  Number(/: (?<n>\d+) (?:person|people) away/u.exec(cell?.ariaLabel ?? '')?.groups?.['n'] ?? 0);
const weekMost = (root: HTMLElement, day: string) =>
  said(cellOn(root, day)?.closest('tr')?.querySelector('.days-most'));
const focusedDay = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement.dataset['day'] : undefined;
const popover = (root: HTMLElement) => root.querySelector<HTMLElement>('.day-pop');
// a key pressed where the focus is
const press = (key: string) =>
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

test('the months are today’s and those with a trip, each day shaded by who is away, by the sentence’s count', () => {
  const root = onDay('2026-11-01', () => communityPage(COMMUNITY));
  expect(monthsOf(root).map((m) => said(m.caption))).toEqual(['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027']);
  expect([...(monthsOf(root)[0]?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)).toEqual([
    'M',
    'T',
    'W',
    'T',
    'F',
    'S',
    'S',
  ]);
  const cells = [...root.querySelectorAll<HTMLElement>('.days-month td[data-day]')];
  const most = Math.max(...cells.map(awayOn));
  expect(most).toBe(5);
  expect(cells.filter((c) => awayOn(c) === most).map((c) => c.dataset['day'])).toEqual([
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ]);
  // each day in the shade of its count, as the legend says the shades
  expect(said(root.querySelector('.days-legend'))).toBe('People away: 1 2–3 4–5 today · the week’s most at its end');
  const ranges = [...root.querySelectorAll('.days-legend .days-key')].slice(0, 3).map((k) => {
    const [from = 0, to = from] = (k.textContent ?? '').split('–').map(Number);
    return { shade: k.querySelector('.days-swatch')?.className.split(' ')[1], from, to };
  });
  for (const c of cells.filter((x) => awayOn(x) > 0))
    expect(c.matches(`.${ranges.find((r) => awayOn(c) >= r.from && awayOn(c) <= r.to)?.shade}`)).toBe(true);
  // the festival's days underlined, the days only travelled not
  withTrips(TO_KUOF, () => {
    const again = onDay('2026-11-01', () => communityPage(COMMUNITY));
    expect(['19', '20', '22', '23'].map((d) => cellOn(again, `2026-11-${d}`)?.matches('.days-fest'))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(awayOn(cellOn(again, '2026-11-19'))).toBe(2);
  });
  // each week's most at its end; Prague from trips.csv, Wednesday to Monday
  expect(weekMost(root, '2026-11-20')).toBe('5');
  expect(weekMost(root, '2026-12-08')).toBe('·');
  expect(['12', '13', '18', '19'].map((d) => awayOn(cellOn(root, `2027-01-${d}`)))).toEqual([0, 2, 2, 0]);
  // today outlined, the days before it greyed
  expect(root.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  expect(cellOn(root, '2026-11-01')?.getAttribute('aria-current')).toBe('date');
  const later = onDay('2026-11-10', () => communityPage(COMMUNITY));
  expect(cellOn(later, '2026-11-09')?.matches('.days-past')).toBe(true);
  expect(cellOn(later, '2026-11-11')?.matches('.days-past')).toBe(false);
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
      const shown = monthsOf(root).map((m) => said(m.caption));
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

test('a month is one stop for the keyboard: the arrows move by a day or a week, Escape or a tap elsewhere closes', () => {
  inPage('2026-11-01', (root) => {
    const stops = (month: HTMLTableElement | undefined) =>
      [...(month?.querySelectorAll<HTMLElement>('td[data-day]') ?? [])].filter((c) => c.tabIndex === 0);
    const [november, december] = monthsOf(root);
    expect(stops(november).map((c) => c.dataset['day'])).toEqual(['2026-11-01']);
    expect(stops(december).map((c) => c.dataset['day'])).toEqual(['2026-12-01']);
    stops(november)[0]?.focus();
    expect(popover(root)?.hidden).toBe(false);
    press('ArrowDown'); // a week on
    expect(focusedDay()).toBe('2026-11-08');
    press('ArrowLeft'); // a day back
    press('ArrowLeft');
    expect(focusedDay()).toBe('2026-11-06');
    expect(stops(november).map((c) => c.dataset['day'])).toEqual(['2026-11-06']);
    expect(said(popover(root))).toContain('Glasgow Kizomba Festival 5.0 · Glasgow');
    expect(said(popover(root))).toContain('There: Christina, Sian and Carolina');
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

test('two festivals on at once both have their row, and a day counts everyone away at either', () => {
  withAdded([['Ola', PARIS]], () => {
    inPage('2026-11-01', (root) => {
      expect(said(root.querySelector('.agenda h2'))).toBe('November · 4 trips');
      expect(agendaRow(root, 'Paris Kizomba Congress')).toBeDefined();
      expect(agendaRow(root, 'KUOF')).toBeDefined();
      expect(awayOn(cellOn(root, '2026-11-21'))).toBe(6);
      expect(awayOn(cellOn(root, '2026-11-19'))).toBe(1); // Paris begins the day before
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
      unsaid: b.matches('.gantt-unsaid'),
      left: Number.parseFloat(b.style.left),
      width: Number.parseFloat(b.style.width),
    })),
    said: said(row?.querySelector('.gantt-said')),
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
    // the couple as one party, on one flight; the people added, who never travel, not said
    expect(kuof.parties).toEqual(['Cédric & Christina', 'Tonje', 'Ragnhild', 'Maja']);
    const [couple, ...unsaid] = kuof.bars;
    expect(couple?.said).toBe('17:05 OSL09:40 OSL');
    expect(couple?.left).toBeCloseTo((100 * (17 + 5 / 60)) / 24 / 5, 3); // 17:05 on the first of five days
    expect((couple?.left ?? 0) + (couple?.width ?? 0)).toBeCloseTo((100 * (4 + (9 + 40 / 60) / 24)) / 5, 3);
    // over the festival's three days, the second to the fourth of five
    expect(unsaid.map((b) => [b.unsaid, b.left, b.width])).toEqual(unsaid.map(() => [true, 20, 60]));
    expect(kuof.said).toBe(
      'Cédric & Christina in Thu 17:05 OSL, out Mon 09:40 OSL · Tonje not said · Ragnhild not said · Maja not said',
    );
    expect(said(agendaRow(root, 'KUOF')?.querySelector('.trip-body p:nth-of-type(2)'))).toBe(
      'Staying Scandic Holberg · Cédric & Christina',
    );
    // Prague from trips.csv: in on the Wednesday before it
    expect(ganttOf(opened(root, 'Prague')).axis.map((a) => a.day)).toEqual(['W13', 'T14', 'F15', 'S16', 'S17', 'M18']);
    // Glasgow, where no one said how they travel: its own days, every bar dotted over them
    const glasgow = ganttOf(agendaRow(root, 'Glasgow'));
    expect(glasgow.axis.map((a) => a.day)).toEqual(['F6', 'S7', 'S8', 'M9']);
    expect(glasgow.bars.map((b) => [b.unsaid, b.left, b.width])).toEqual([
      [true, 0, 100],
      [true, 0, 100],
      [true, 0, 100],
    ]);
    expect(titled(agendaRow(root, 'Glasgow')?.querySelector('.gantt'))).toEqual(
      ['Sian', 'Carolina'].map((n) => [n, 'Added by Cédric']),
    );
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

test('with nothing to come, the community’s page has no sentence of when it is away, nor months', () => {
  const root = onDay('2028-01-01', () => communityPage(COMMUNITY));
  expect(said(root)).not.toContain('Most of the community');
  expect(root.querySelector('.days-month')).toBeNull();
  expect(said(root)).toContain('No one in this community has said they’re going anywhere yet.');
});
