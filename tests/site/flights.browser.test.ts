// A festival's flights, in Chromium on the database the build ships: the Glasgow festival of the fixture made able to
// fly to three airports, with illustrative fares planted for its weekend (never real ones, nor a real day): Glasgow's
// own, 11 km away, at 210 with a stop; Edinburgh, 55 km, searched and with no direct flight; Aberdeen, 199 km, at 160
// direct. Aberdeen saves 50, more than WORTH_EUR, so the card flies there; its Flights list every airport.
import type { Database } from 'sql.js';
import { beforeAll, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { q, sql } from '../../site/db.ts';
import { eventCard } from '../../site/eventcard.ts';
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
  db.run('DELETE FROM fare_jobs WHERE depart = ?', [FRIDAY]);
  const searched = '2026-10-30T06:00:00+00:00';
  db.run("INSERT INTO fares VALUES ('GLA', ?, '2026-11-09', 210, ?, 1)", [FRIDAY, searched]);
  db.run("INSERT INTO fares VALUES ('ABZ', ?, '2026-11-09', 160, ?, 0)", [FRIDAY, searched]);
  db.run("INSERT INTO fare_jobs VALUES ('GLA', ?, ?, NULL)", [FRIDAY, searched]);
  db.run("INSERT INTO fare_jobs VALUES ('EDI', ?, ?, 0)", [FRIDAY, searched]);
  db.run("INSERT INTO fare_jobs VALUES ('ABZ', ?, ?, 1)", [FRIDAY, searched]);
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
  expect(e.options.map((o) => [o.airport, o.km, o.fare?.price ?? null, o.fare?.stops ?? null, o.direct])).toEqual([
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
    expect(second(rows[0] ?? card)).toMatch(/^11 km from Glasgow · 1 stop · checked (today|yesterday|\d+ days ago)$/u);
    expect(second(rows[1] ?? card)).toMatch(/^55 km from Glasgow · checked /u);
    expect(second(rows[2] ?? card)).toMatch(/^199 km from Glasgow · direct · checked /u);
    expect(said(rows[1]?.querySelector('.flight-fare'))).toBe('no direct flight that weekend');
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
