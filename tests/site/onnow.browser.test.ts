// A festival on now, in Chromium on the database the build ships: its phase from its first to its last day, its card's
// tag and cost without the flight, and the Festivals page's On now filter. Two festivals of the data are made the
// fixture's, on days of their own, and every other is moved years away, so no test reads a real date: one on from
// Friday 6 to Monday 9 November 2026, which is today, the other from 20 to 22 November.
import type { Database } from 'sql.js';
import { beforeAll, expect, test, vi } from 'vitest';
import { one, site, sql } from '../../site/db.ts';
import { eventCard } from '../../site/eventcard.ts';
import { type Festival, festivals } from '../../site/festivals.ts';
import { num, str } from '../../site/rows.ts';
import { sentenceView } from '../../site/sentence.ts';
import { KEY } from '../../site/states.ts';
import { pass, tier } from './samples.ts';
import { loadShipped } from './shipped.ts';

const TODAY = '2026-11-06';
let db: Database | undefined;
let on = 0, // the festival on today
  ahead = 0; // the one to come
let elsewhere = ''; // the country of the one to come, which the one on is not in

beforeAll(async () => {
  db = await loadShipped(new Map());
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  db.run('UPDATE today SET day = ?', [TODAY]);
  const [first, second] =
    db.exec('SELECT id FROM events ORDER BY id LIMIT 2')[0]?.values.map((r) => Number(r[0])) ?? [];
  [on, ahead] = [first ?? 0, second ?? 0];
  const [here = '', there = ''] = site().destinations.map((c) => c.code);
  elsewhere = there;
  db.run(
    `UPDATE events SET start_date = '2031-01-03', end_date = '2031-01-05', weekend_friday = '2031-01-03'
     WHERE id NOT IN (?, ?)`,
    [on, ahead],
  );
  const plant = (id: number, start: string, end: string, country: string) =>
    db?.run(
      `UPDATE events SET start_date = ?, end_date = ?, weekend_friday = ?, listing = ?, cancelled = 0,
       country_code = ? WHERE id = ?`,
      [start, end, start, KEY.listing.LISTED, country, id],
    );
  plant(on, '2026-11-06', '2026-11-09', here);
  plant(ahead, '2026-11-20', '2026-11-22', there);
});

test('a festival is on from its first day to its last, both included, and still to attend while it is', () => {
  const phaseOn = (day: string) => {
    db?.run('UPDATE today SET day = ?', [day]);
    try {
      const r = one({ phase: str, upcoming: num }, sql`SELECT phase, upcoming FROM event_rows WHERE id = ?`, [on]);
      return [r?.phase, r?.upcoming];
    } finally {
      db?.run('UPDATE today SET day = ?', [TODAY]);
    }
  };
  expect(phaseOn('2026-11-05')).toEqual([KEY.phase.AHEAD, 1]); // the day before
  expect(phaseOn('2026-11-06')).toEqual([KEY.phase.ON, 1]); // its first day
  expect(phaseOn('2026-11-09')).toEqual([KEY.phase.ON, 1]); // its last
  expect(phaseOn('2026-11-10')).toEqual([KEY.phase.ENDED, 0]); // the day after
});

const said = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/gu, ' ').trim();
const festival = (id: number): Festival => {
  const e = festivals().find((f) => f.id === id);
  if (!e) throw new Error(`no festival ${id}`);
  return e;
};
// a card of a festival, with its price and trip set as a priced one's are: a full pass of 1 240, and a flight known
const priced = (e: Festival): HTMLElement => {
  const t = { ...tier(1240, { currency: 'NOK' }), lo: null, hi: null };
  return eventCard({
    ...e,
    price: {
      point: 'card_price',
      key: KEY.card_price.FULL_PASS,
      pass: pass([t]),
      now: { state: KEY.tier_today.NOW, tier: t, next: undefined },
    },
    airport: 'LIS',
    airport_city: 'Lisbon',
    depart: e.start_date,
    fare: { home: false, price: 120, back: '2026-11-09' },
    trip: 2000,
  });
};

test('a festival on now has an On now tag before its place on its card, and one to come none', () => {
  expect(said(eventCard(festival(on)).querySelector('.where .now-tag'))).toBe('On now');
  expect(eventCard(festival(ahead)).querySelector('.now-tag')).toBeNull();
});

test('the cost of a festival on now leaves the flight out: its weekend’s return has begun', () => {
  const started = priced(festival(on));
  expect(said(started.querySelector('.cost-parts'))).toMatch(/full pass · already started, no flight priced$/u);
  expect(said(started.querySelector('.cost-parts'))).not.toContain('+');
  // and with no price, the flight line says the same
  const unpriced = eventCard({ ...festival(on), price: { point: 'price', key: KEY.price.NOT_YET } });
  expect(said(unpriced.querySelector('.flight'))).toBe('✈ already started, no flight priced');
  // one to come adds its flight
  expect(said(priced(festival(ahead)).querySelector('.cost-parts'))).toMatch(/full pass \+ .*flight/u);
});

// the Festivals page with an address's choices, its data in
async function finder(qs: string): Promise<HTMLElement> {
  const root = document.createElement('main');
  for (const shown of document.querySelectorAll('main')) shown.remove(); // one Festivals page at a time
  document.body.append(root);
  sentenceView(root, qs, { signal: new AbortController().signal, data: Promise.resolve() });
  await vi.waitFor(() => {
    if (root.querySelector('.festival-cards, .empty') === null) throw new Error('the festivals are not in yet');
  });
  return root;
}
const onNow = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLLabelElement>('#more-panel label.check')].find((l) =>
    l.textContent?.startsWith(' On now only'),
  );
const cards = (root: HTMLElement) => [...root.querySelectorAll('.festival-card .title-btn')].map((b) => b.textContent);
const tags = (root: HTMLElement) => [...root.querySelectorAll('.sentence-hero .with-tag .tag')].map((t) => said(t));

test('the filters keep only the festivals on today, shown as an On now tag and kept in the address', async () => {
  const root = await finder('reach=');
  expect(cards(root)).toEqual([festival(on).title, festival(ahead).title]);
  const box = onNow(root)?.querySelector('input');
  expect([box?.checked, box?.disabled]).toEqual([false, false]);
  box?.click();
  expect(cards(root)).toEqual([festival(on).title]);
  expect(tags(root)).toEqual(['On now ×']);
  expect(location.hash).toContain('onnow=1');
  // from the address again (any price, which the address leaves out as it does today, said again)
  const again = await finder(`reach=&${location.hash.split('?')[1] ?? ''}`);
  expect([onNow(again)?.querySelector('input')?.checked, cards(again), tags(again)]).toEqual([
    true,
    [festival(on).title],
    ['On now ×'],
  ]);
  // the tag's × takes it off
  again.querySelector<HTMLButtonElement>('.sentence-hero .with-tag .tag .remove')?.click();
  expect([cards(again).length, tags(again), location.hash.includes('onnow')]).toEqual([2, [], false]);
  // an address asking for what the filter is not leaves it off
  const odd = await finder('reach=&onnow=2');
  expect([onNow(odd)?.querySelector('input')?.checked, cards(odd).length]).toEqual([false, 2]);
});

test('with no festival on today among those the other choices keep, the filter is off and says why', async () => {
  const root = await finder(`reach=&country=${elsewhere}`);
  const label = onNow(root);
  expect(label?.querySelector('input')?.disabled).toBe(true);
  expect(said(label)).toBe('On now only (none on today)');
  expect(cards(root)).toEqual([festival(ahead).title]);
});
