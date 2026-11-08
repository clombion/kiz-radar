// A festival's flights, in Chromium on the database the build ships: the Glasgow festival of the fixture made able to
// fly to three airports, with illustrative fares planted for its weekend (never real ones, nor a real day): Glasgow's
// own, 11 km away, at 210 with a stop out (and at 150 on separate tickets from a reseller); Edinburgh, 55 km, searched
// and with no direct flight; Aberdeen, 199 km, at 160 direct. Aberdeen saves 50, more than WORTH_EUR, so the card flies
// there (a self-transfer is never the card's); its Flights list every airport.
import type { Database } from 'sql.js';
import { beforeAll, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { q, sql } from '../../site/db.ts';
import { eventCard } from '../../site/eventcard.ts';
import type { Option } from '../../site/fares.ts';
import { type Festival, withDetails } from '../../site/festivals.ts';
import { EVENT } from '../../site/rows.ts';
import { KEY } from '../../site/states.ts';
import { loadShipped } from './shipped.ts';

const GLASGOW = 18_964; // the fixture's, its weekend's Friday 6 November 2026
const FRIDAY = '2026-11-06';
let db: Database | undefined;

beforeAll(async () => {
  db = await loadShipped(new Map());
  db.run('DELETE FROM event_airports WHERE event_id = ?', [GLASGOW]);
  for (const [code, name, city, lat, lon] of [
    ['ABZ', 'Aberdeen', 'Aberdeen', 57.202, -2.198],
    ['EDI', 'Edinburgh', 'Edinburgh', 55.95, -3.373],
  ] as const)
    db.run("INSERT OR IGNORE INTO airports VALUES (?, ?, ?, 'GB', ?, ?, 0)", [code, name, city, lat, lon]);
  for (const [code, km] of [
    ['GLA', 11],
    ['EDI', 55],
    ['ABZ', 199],
  ] as const)
    db.run('INSERT INTO event_airports VALUES (?, ?, ?)', [GLASGOW, code, km]);
  db.run('DELETE FROM fares WHERE depart = ?', [FRIDAY]);
  db.run('DELETE FROM fare_searches WHERE depart = ?', [FRIDAY]);
  const searched = '2026-10-30T06:00:00+00:00';
  const fare = `INSERT INTO fares (airport, depart, return, price, fetched_at, stops_out, stops_back, resold)
    VALUES (?, ?, '2026-11-09', ?, ?, ?, NULL, NULL)`;
  db.run(fare, ['GLA', FRIDAY, 210, searched, 1]);
  db.run(fare, ['ABZ', FRIDAY, 160, searched, 0]);
  const search = 'INSERT INTO fare_searches (airport, depart, searched_at, direct) VALUES (?, ?, ?, ?)';
  db.run(search, ['GLA', FRIDAY, searched, null]);
  db.run(search, ['EDI', FRIDAY, searched, 0]);
  db.run(search, ['ABZ', FRIDAY, searched, 1]);
  // Glasgow's own, cheaper on separate tickets from a reseller
  db.run('DELETE FROM fare_transfers WHERE depart = ?', [FRIDAY]);
  db.run('INSERT INTO fare_transfers (airport, depart, price, fetched_at, airlines) VALUES (?, ?, ?, ?, ?)', [
    'GLA',
    FRIDAY,
    150,
    searched,
    'Norwegian Air Shuttle and easyJet',
  ]);
});

// the Glasgow festival as a card has it, still to come and its flight not left, whatever the day the test runs
const glasgow = (): Festival => {
  const [e] = withDetails(q(EVENT, sql`SELECT * FROM event_rows WHERE id = ?`, [GLASGOW]));
  if (e === undefined) throw new Error('no Glasgow festival in the fixture');
  return { ...e, phase: KEY.phase.AHEAD, begun: false };
};
const said = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/gu, ' ').trim();

test('a festival can fly to every airport near it, the nearest first, and flies to the best of their fares', () => {
  const e = glasgow();
  expect(e.options.map((o) => [o.airport, o.km, o.fare?.price ?? null, o.fare?.stops.out ?? null, o.direct])).toEqual([
    ['GLA', 11, 210, 1, null],
    ['EDI', 55, null, null, false],
    ['ABZ', 199, 160, 0, true],
  ]);
  expect(e.fare).toMatchObject({ home: false, airport: 'ABZ', airport_city: 'Aberdeen', km: 199, price: 160 });
  const flight = eventCard(e).querySelector('.flight, .cost-parts');
  expect(said(flight)).toMatch(
    / flight to Aberdeen, then 199 km · Flights · 3$|to Aberdeen, then 199 km · Flights · 3$/u,
  );
});

test('Flights lists every airport with its distance, fare, stops and last check, the card’s marked, as a dialog', async () => {
  const card = eventCard(glasgow());
  document.body.append(card);
  try {
    const opener = card.querySelector<HTMLButtonElement>('.flights-btn');
    expect([opener?.getAttribute('aria-haspopup'), opener?.ariaLabel]).toEqual([
      'dialog',
      'Flights to Glasgow Kizomba Festival 5.0: 3 airports',
    ]);
    opener?.focus();
    opener?.click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.peek[aria-labelledby="flights-title"]');
    expect(dialog?.open).toBe(true);
    expect(said(dialog?.querySelector('#flights-title'))).toBe('Flights to Glasgow Kizomba Festival 5.0');
    expect(dialog?.contains(document.activeElement)).toBe(true); // the focus is in the dialog
    const rows = [...(dialog?.querySelectorAll('.peek-flights li') ?? [])];
    expect(rows.map((r) => said(r.querySelector('.flight-where')))).toEqual([
      'Glasgow (GLA)',
      'Edinburgh (EDI)',
      'Aberdeen (ABZ) on the card',
    ]);
    expect(rows.map((r) => r.matches('.chosen'))).toEqual([false, false, true]);
    const second = (r: Element) => said(r.querySelectorAll('p')[1]);
    expect(second(rows[0] ?? card)).toMatch(
      /^11 km from Glasgow · 1 stop out · checked (today|yesterday|\d+ days ago)$/u,
    );
    expect(second(rows[1] ?? card)).toMatch(/^55 km from Glasgow · checked /u);
    expect(second(rows[2] ?? card)).toMatch(/^199 km from Glasgow · direct out · checked /u);
    expect(said(rows[1]?.querySelector('.flight-fare'))).toBe('no direct flight that weekend');
    // Glasgow's cheaper self-transfer under its fare, said to be on separate tickets at a reseller's price
    expect(rows.map((r) => said(r.querySelector('.flight-transfer')) ?? null)).toEqual([
      expect.stringMatching(
        /^~1 \d{3} kr · self-transfer, separate tickets · reseller’s price, likely cheaper from Norwegian Air Shuttle and easyJet$/u,
      ),
      null,
      null,
    ]);
    // a link to Google Flights for each airport with a fare, for its own weekend
    const links = rows.map((r) => r.querySelector<HTMLAnchorElement>('.flight-fare a')?.href ?? null);
    expect(links.map((l) => l !== null)).toEqual([true, false, true]);
    expect(decodeURIComponent(links[2] ?? '')).toContain('to ABZ on 2026-11-06 through 2026-11-09');
    // Escape closes it, and the focus goes back to the button
    await userEvent.keyboard('{Escape}');
    expect(dialog?.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  } finally {
    card.remove();
  }
});

test('an airport not searched yet says so, and with none priced the card flies nowhere', async () => {
  const unsearched = glasgow().options.map((o) => ({ ...o, fare: null, checked: null, direct: null }));
  const card = eventCard({ ...glasgow(), options: unsearched, fare: null });
  document.body.append(card);
  try {
    expect(said(card.querySelector('.flight'))).toBe('✈ flight not checked yet · Flights · 3');
    card.querySelector<HTMLButtonElement>('.flights-btn')?.click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.peek[aria-labelledby="flights-title"]');
    expect([...(dialog?.querySelectorAll('.flight-fare') ?? [])].map(said)).toEqual([
      'not checked yet',
      'not checked yet',
      'not checked yet',
    ]);
    expect(dialog?.querySelector('.chosen')).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(dialog?.open).toBe(false);
  } finally {
    card.remove();
  }
});

// what each airport of a festival's Flights says of its fare, its options' fares changed by how
const fareLines = async (how: (o: Option) => Option): Promise<(string | undefined)[]> => {
  const e = glasgow();
  const card = eventCard({ ...e, options: e.options.map(how) });
  document.body.append(card);
  try {
    card.querySelector<HTMLButtonElement>('.flights-btn')?.click();
    return [...document.querySelectorAll('dialog.peek .peek-flights li .flight-fare')].map(said);
  } finally {
    await userEvent.keyboard('{Escape}');
    card.remove();
  }
};

test('an airport with a direct flight Google gives no price for says so, and is not taken for one with none', async () => {
  const fares = await fareLines((o) => (o.airport === 'ABZ' ? { ...o, fare: null } : o));
  expect(fares.slice(1)).toEqual(['no direct flight that weekend', 'direct, no price on Google']);
});

test('a reseller’s price says so, and that it is likely cheaper from the airlines flying it', async () => {
  const fares = await fareLines((o) =>
    o.airport === 'ABZ' && o.fare !== null ? { ...o, fare: { ...o.fare, resold: 'Widerøe' } } : o,
  );
  expect(fares[2]).toMatch(/^~1 \d{3} kr · reseller’s price, likely cheaper from Widerøe · Google Flights ↗$/u);
  expect(fares[0]).not.toContain('reseller');
});
