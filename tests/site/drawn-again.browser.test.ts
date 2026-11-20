// What a view draws again while it shows goes with the draw before, so the page holds as much after each draw as after
// one, however often the visitor draws it again: every owner under the page's (each draw an owner of the view's root,
// and what it draws owners of it). Countries' order, the friends' list (who goes, On now), Artists' filters, the
// Festivals page's line-up (its cards), the Map's search (its bubbles too, Leaflet's) and a city picked and let go (its
// panel), a community's page (a trip row's line of who goes, the agenda a step of the months draws, a day's words),
// and the SQL page's result, drawn anew on each run (its tables). On 1 November 2026, with a community beside the
// fixture's in which Tonje only may go to KUOF (a tag the lines of who goes and the days hold) and Ola, added, goes to
// Paris and Albania (two periods of the months, each with a trip).
import { expect, test } from 'vitest';
import { artistsHref, countriesHref, festivalsHref, friendsHref, mapHref, sqlHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { ALBANIA, KUOF, PARIS } from './community.fixture.ts';
import { drawnAlike, owners } from './owned.ts';
import { community } from './planted.ts';
import { COMM } from './seen.ts';

const REDRAWN = 'maybe-and-two-periods';
const ola = [PARIS, ALBANIA].map((e) => ['Ola', e] as const);
const app = await startSite({
  now: '2026-11-01',
  plant: (db) => community(db, REDRAWN, { maybe: [['Tonje', KUOF]], added: ola }),
});
const main = () => document.querySelector('main');
// the page's element of the selector, of a class, which it must have
function one<E extends HTMLElement>(selector: string, of: new () => E): E {
  const found = main()?.querySelector(selector);
  if (!(found instanceof of)) throw new Error(`the page has no ${selector}`);
  return found;
}

test('Countries’ order buttons drawn again on a choice hold the owners of their last draw alone', async () => {
  await app.open(countriesHref());
  const order = () => [...(main()?.querySelectorAll<HTMLElement>('.seg button') ?? [])];
  await drawnAlike(
    () => main()?.querySelector('.seg button'),
    () => {
      order()[1]?.click();
      order()[0]?.click();
    },
  );
  expect(main()?.querySelectorAll('.country-row').length).toBeGreaterThan(0);
});

test('Artists drawn again on a filter hold the owners of their last draw alone', async () => {
  await app.open(artistsHref());
  const role = () => [...(main()?.querySelectorAll<HTMLElement>('.seg button') ?? [])];
  await drawnAlike(
    () => main()?.querySelector('.artist-list'),
    () => {
      role()[1]?.click();
      role()[0]?.click();
    },
  );
  expect(main()?.querySelectorAll('.artist-row').length).toBeGreaterThan(0);
});

test('the Festivals page drawn again on a choice holds the owners of its last draw alone', async () => {
  await app.open(festivalsHref());
  const lineup = () => {
    const select = [...(main()?.querySelectorAll('label.field') ?? [])]
      .find((l) => l.textContent.startsWith('Line-up'))
      ?.querySelector('select');
    if (select == null) throw new Error('no Line-up select on the Festivals page');
    return select;
  };
  await drawnAlike(
    () => main()?.querySelector('.festival-cards'),
    () => {
      for (const i of [1, 0]) {
        lineup().selectedIndex = i;
        lineup().dispatchEvent(new Event('change'));
      }
    },
  );
  expect(main()?.querySelectorAll('.festival-card').length).toBeGreaterThan(0);
});

// the bubbles Leaflet draws, each a path in the map's overlay pane
const bubbles = () => main()?.querySelectorAll('.leaflet-overlay-pane path').length ?? 0;

test('the Map drawn again on a search holds the owners and the bubbles of its last draw alone', async () => {
  await app.open(mapHref());
  const search = one('input[type="search"]', HTMLInputElement);
  const drawn: number[] = [];
  await drawnAlike(
    () => main()?.querySelector('.panel-cards'),
    async () => {
      const panel = one('.panel-cards', HTMLElement);
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await expect.poll(() => panel.isConnected).toBe(false);
      drawn.push(bubbles());
    },
  );
  expect(drawn).toEqual([drawn[0], drawn[0], drawn[0]]);
  expect(drawn[0]).toBeGreaterThan(0);
});

test('the Map’s panel drawn again as a city is picked and let go holds the owners of its last draw alone', async () => {
  await app.open(mapHref());
  const city = () => main()?.querySelector('.leaflet-overlay-pane path');
  await drawnAlike(
    () => main()?.querySelector('.panel-cards'),
    async () => {
      city()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await expect.poll(() => main()?.querySelector('.sheet-body .back-link')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await expect.poll(() => main()?.querySelector('.sheet-body .back-link')).toBeNull();
    },
  );
});

test('the friends’ list drawn again holds the owners of its last draw alone', async () => {
  await app.open(friendsHref({ q: 'k' }));
  const search = one('input.mini-search', HTMLInputElement);
  await drawnAlike(
    () => main()?.querySelector('.who-rows'),
    () => {
      search.value = 'k';
      search.dispatchEvent(new Event('input'));
    },
  );
  expect(main()?.querySelectorAll('.who-list li').length).toBeGreaterThan(0);
});

test('a trip row’s line of who goes, drawn again as the row opens and closes, holds the owners of its last draw alone', async () => {
  await app.open(COMM(REDRAWN));
  // KUOF's row, closed: who goes, Tonje's maybe tagged
  const row = [...(main()?.querySelectorAll<HTMLElement>('.trip') ?? [])].find((t) => t.textContent.includes('KUOF'));
  const toggle = row?.querySelector<HTMLElement>('.trip-toggle');
  if (row === undefined || toggle == null) throw new Error('the community’s page has no row of KUOF');
  await drawnAlike(
    () => row.querySelector('.trip-who > *'),
    () => {
      toggle.click();
      toggle.click();
    },
  );
  expect(row.querySelector('.trip-who .plan-tag.unsure')).not.toBeNull();
});

test('the agenda a step of the months draws again holds the owners of its last draw alone', async () => {
  await app.open(COMM(REDRAWN));
  const steps = () => [...(main()?.querySelectorAll<HTMLElement>('.days-step') ?? [])];
  await drawnAlike(
    () => main()?.querySelector('.agenda .gantt'),
    () => {
      steps().at(-1)?.click();
      steps()[0]?.click();
    },
  );
  expect(main()?.querySelector('.agenda .gantt')).not.toBeNull();
});

test('a day’s words, drawn again for each day the pointer passes over, hold the owners of their last day alone', async () => {
  await app.open(COMM(REDRAWN));
  const days = [...(main()?.querySelectorAll<HTMLElement>('[data-day]') ?? [])];
  expect(days.length).toBeGreaterThan(1);
  const passed = () => {
    for (const day of days) day.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  };
  passed();
  await drawnAlike(() => main()?.querySelector('.day-pop > *'), passed);
  expect(main()?.querySelector('.day-pop')?.textContent).not.toBe('');
});

test('the SQL page’s result, drawn again on each run, holds the owners of its last run alone', async () => {
  await app.open(sqlHref());
  const run = [...(main()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Run (Ctrl+Enter)');
  await drawnAlike(
    () => main()?.querySelector('.sql-out table'),
    () => {
      run?.click();
    },
  );
  expect(main()?.querySelectorAll('.sql-out tbody tr').length).toBeGreaterThan(0);
});

// What a run draws is markup, made once: its result sets, rows and cells are no owners, as the h() page's were plain
// nodes, so a result of 1000 rows of ten columns holds the owners of a result of one value.
test('the SQL page’s rows and cells are no owners: a thousand rows hold the owners of one value', async () => {
  await app.open(sqlHref());
  const area = main()?.querySelector('textarea');
  const run = [...(main()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Run (Ctrl+Enter)');
  if (area == null || run === undefined) throw new Error('the SQL page has no query to run');
  const held = (query: string) => {
    area.value = query;
    run.click();
    return [main()?.querySelectorAll('.sql-out td').length, owners()];
  };
  const [, single] = held('SELECT 1');
  const thousand = held(
    'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1000) SELECT i, i, i, i, i, i, i, i, i, i FROM n',
  );
  expect(thousand).toEqual([10_000, single]);
});
