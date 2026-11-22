// A festival's flights, its card and its Flights opened on the map (or the Festivals page), on 1 November 2026. Six
// of the fixture's festivals fly to the same three airports, none of them priced so that each card has a flight line
// of its own, with fares planted for each one's weekend (never real ones). Glasgow's is the base: at Glasgow's own
// airport (11 km away) 210 € with a stop out and 150 € on separate tickets from a reseller, at Edinburgh (55 km)
// searched and with no flight, and at Aberdeen (199 km) 160 € direct, which saves more than WORTH_EUR, so the card
// flies there. KUOF's weekend is never searched. HOT Ice's has Glasgow not asked, Edinburgh with no flight, and
// Aberdeen's flights with no price. Cloudkiz's has Glasgow's as Glasgow's weekend has it, and Aberdeen's 160 € a
// reseller's, flown by Widerøe. Prague GOLD's has no flight at any of the three. Prague Kwanza's has Glasgow asked with
// no answer, Edinburgh's flights with no price, and no flight to Aberdeen. Every search that said one ran on 30
// October; the build writes a weekend to come never searched as not asked, with no time. Albania's is near Glasgow's
// airport, and flies to none.
import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { eventOnMapHref, festivalsHref } from '../../site/routes.ts';
import { KEY } from '../../site/states.ts';
import { startSite } from './app.ts';
import { ALBANIA, CLOUDKIZ, GLASGOW, HOT_ICE, KUOF, KWANZA, PRAGUE_GOLD, titleOf } from './community.fixture.ts';
import { flies, fliesToNone, homeOf, newAirport, type Searched, unpriced, weekend } from './planted.ts';
import { cardTitled, mapCardOf, said, shownDialog } from './seen.ts';

const AIRPORTS = ['GLA', 'EDI', 'ABZ'];
const AT = '2026-10-30T06:00:00+00:00';
const { PRICED, LISTED, NO_FLIGHT, NOT_ASKED, UNANSWERED } = KEY.fare_standing;
// an airport of a weekend to come never searched, as the build writes it
const notAsked = (airport: string): Searched => ({ airport, at: null, standing: NOT_ASKED });
const glasgows: Searched = {
  airport: 'GLA',
  at: AT,
  standing: PRICED,
  fare: { price: 210, stops: 1 },
  transfer: { price: 150, airlines: 'Norwegian Air Shuttle and easyJet' },
};
let home = ''; // the home city's name, read as the data is planted
const app = await startSite({
  now: '2026-11-01',
  plant: (db) => {
    home = homeOf(db).name;
    newAirport(db, 'EDI', 'Edinburgh', { name: 'Edinburgh', country: 'GB', at: [55.95, -3.373] });
    newAirport(db, 'ABZ', 'Aberdeen', { name: 'Aberdeen', country: 'GB', at: [57.202, -2.198] });
    for (const id of [GLASGOW, KUOF, HOT_ICE, CLOUDKIZ, PRAGUE_GOLD, KWANZA]) {
      unpriced(db, id);
      flies(db, id, [
        ['GLA', 11],
        ['EDI', 55],
        ['ABZ', 199],
      ]);
    }
    weekend(db, '2026-11-06', AIRPORTS, [
      glasgows,
      { airport: 'EDI', at: AT, standing: NO_FLIGHT },
      { airport: 'ABZ', at: AT, standing: PRICED, fare: { price: 160, stops: 0 } },
    ]);
    weekend(db, '2026-11-20', AIRPORTS, AIRPORTS.map(notAsked));
    weekend(db, '2026-11-27', AIRPORTS, [
      notAsked('GLA'),
      { airport: 'EDI', at: AT, standing: NO_FLIGHT },
      { airport: 'ABZ', at: AT, standing: LISTED },
    ]);
    weekend(db, '2027-02-26', AIRPORTS, [
      glasgows,
      { airport: 'ABZ', at: AT, standing: PRICED, fare: { price: 160, stops: 0, resold: 'Widerøe' } },
    ]);
    weekend(db, '2027-01-15', AIRPORTS, [
      { airport: 'GLA', at: AT, standing: NO_FLIGHT },
      { airport: 'EDI', at: AT, standing: NO_FLIGHT },
      { airport: 'ABZ', at: AT, standing: NO_FLIGHT },
    ]);
    weekend(db, '2027-02-12', AIRPORTS, [
      { airport: 'GLA', at: null, standing: UNANSWERED },
      { airport: 'EDI', at: AT, standing: LISTED },
      { airport: 'ABZ', at: AT, standing: NO_FLIGHT },
    ]);
    unpriced(db, ALBANIA);
    fliesToNone(db, ALBANIA, 'GLA');
  },
});

// a festival's card, opened on the map
const cardOf = async (id: number) => await mapCardOf(app, id);
// a card's Flights button; a card without one is an error
function flightsButton(card: Element): HTMLButtonElement {
  const button = card.querySelector<HTMLButtonElement>('.flights-btn');
  if (button === null) throw new Error(`no Flights button on the card of ${said(card.querySelector('h3'))}`);
  return button;
}
// a festival's Flights, opened from its card on the map, and shut when the test ends
async function flightsOf(id: number): Promise<HTMLDialogElement> {
  flightsButton(await cardOf(id)).click();
  return shownDialog('.peek-close');
}
// what each airport of a Flights dialog says of its fare
const fares = (dialog: HTMLDialogElement) =>
  [...dialog.querySelectorAll('.peek-flights li .flight-fare')].map((f) => said(f));
// what each airport of a Flights dialog says under its name: how far it is, its stops and its last check
const linesUnder = (dialog: HTMLDialogElement) =>
  [...dialog.querySelectorAll('.peek-flights li .flight-where + p')].map((p) => said(p));
// the airport a Flights dialog says is on the card, by its words; none when no airport says it
const onTheCard = (dialog: HTMLDialogElement) =>
  [...dialog.querySelectorAll('.peek-flights li .flight-where')]
    .map((w) => said(w))
    .filter((w) => w?.endsWith(' on the card') === true);
// Escape pressed where the focus is, awaited until the dialog's history entry is gone with it
async function escaped(): Promise<void> {
  const gone = new Promise((done) => addEventListener('popstate', done, { once: true }));
  await userEvent.keyboard('{Escape}');
  await gone;
}

test('a festival’s card flies to the airport near it with the best fare, not the nearest, and counts them all', async () => {
  expect(said((await cardOf(GLASGOW)).querySelector('.flight'))).toMatch(
    /^✈ ~1 \d{3} kr to Aberdeen, then 199 km · Flights · 3$/u,
  );
});

test('Flights lists every airport with its distance, fare, stops and last check, the card’s marked, as a dialog', async () => {
  // on the Festivals page, as the dialog is the same wherever its card is; Escape over the map is the next test's
  await app.open(festivalsHref({ country: 'GB', reach: 'any' }));
  const opener = flightsButton(cardTitled(titleOf(GLASGOW)));
  expect([opener.getAttribute('aria-haspopup'), opener.ariaLabel]).toEqual([
    'dialog',
    `Flights to ${titleOf(GLASGOW)}: 3 airports`,
  ]);
  opener.focus();
  opener.click();
  const dialog = shownDialog('.peek-close');
  expect(said(dialog.querySelector('#flights-title'))).toBe(`Flights to ${titleOf(GLASGOW)}`);
  expect(dialog.contains(document.activeElement)).toBe(true); // the focus is in the dialog
  const rows = [...dialog.querySelectorAll('.peek-flights li')];
  expect(rows.map((r) => said(r.querySelector('.flight-where')))).toEqual([
    'Glasgow (GLA)',
    'Edinburgh (EDI)',
    'Aberdeen (ABZ) on the card',
  ]);
  expect(onTheCard(dialog)).toEqual(['Aberdeen (ABZ) on the card']);
  expect(linesUnder(dialog)).toEqual([
    '11 km from Glasgow · 1 stop out · checked 2 days ago',
    '55 km from Glasgow · checked 2 days ago',
    '199 km from Glasgow · direct out · checked 2 days ago',
  ]);
  expect(fares(dialog)[1]).toBe('no flight that weekend');
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
  // Escape closes it, its history entry with it, and the focus goes back to the button
  await escaped();
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(opener);
});

test('Escape closes Flights over the map and leaves its festival picked, the focus back on its button', async () => {
  const opener = flightsButton(await cardOf(GLASGOW));
  opener.focus();
  opener.click();
  const dialog = shownDialog('.peek-close');
  await escaped();
  expect(dialog.open).toBe(false);
  // the festival still picked: the address its, its card in the panel, with the button the focus went back to
  expect(location.hash.startsWith(eventOnMapHref(GLASGOW))).toBe(true);
  expect(said(document.querySelector('main .festival-card h3'))).toBe(titleOf(GLASGOW));
  expect(document.activeElement).toBe(opener);
  expect(opener.isConnected).toBe(true);
});

test('an airport not searched yet has no flight price yet, and with none priced the card flies nowhere', async () => {
  expect(said((await cardOf(KUOF)).querySelector('.flight'))).toBe('✈ no flight price yet · Flights · 3');
  const dialog = await flightsOf(KUOF);
  expect(fares(dialog)).toEqual(['no flight price yet', 'no flight price yet', 'no flight price yet']);
  expect(linesUnder(dialog)).toEqual(['11 km from Oslo', '55 km from Oslo', '199 km from Oslo']); // no check
  expect(onTheCard(dialog)).toEqual([]);
});

test('an airport whose flights Google gives no price for says so, and is not taken for one with none', async () => {
  expect(fares(await flightsOf(HOT_ICE))).toEqual(['no flight price yet', 'no flight that weekend', 'no price found']);
});

test('a card says there is no flight only when none of its airports has one that weekend', async () => {
  expect(said((await cardOf(PRAGUE_GOLD)).querySelector('.flight'))).toBe('✈ no flight that weekend · Flights · 3');
  expect(fares(await flightsOf(PRAGUE_GOLD))).toEqual([
    'no flight that weekend',
    'no flight that weekend',
    'no flight that weekend',
  ]);
});

test('a card of a festival near an airport that flies to none says it is too far, with no Flights', async () => {
  const card = await cardOf(ALBANIA);
  expect(said(card.querySelector('.flight'))).toBe(`✈ too far from ${home} for our flight prices`);
  expect(card.querySelector('.flights-btn')).toBeNull();
});

test('an airport asked with no answer has no flight price yet, as does a card with one', async () => {
  expect(said((await cardOf(KWANZA)).querySelector('.flight'))).toBe('✈ no flight price yet · Flights · 3');
  const dialog = await flightsOf(KWANZA);
  expect(fares(dialog)).toEqual(['no flight price yet', 'no price found', 'no flight that weekend']);
  // checked by no search: none said a standing
  expect(linesUnder(dialog)).toEqual([
    '11 km from Prague',
    '55 km from Prague · checked 2 days ago',
    '199 km from Prague · checked 2 days ago',
  ]);
});

test('a reseller’s price says so, and that it is likely cheaper from the airlines flying it', async () => {
  const [gla, , abz] = fares(await flightsOf(CLOUDKIZ));
  expect(abz).toMatch(/^~1 \d{3} kr · reseller’s price, likely cheaper from Widerøe · Google Flights ↗$/u);
  expect(gla).toMatch(/^~2 \d{3} kr · Google Flights ↗$/u);
  expect(gla).not.toContain('reseller');
});
