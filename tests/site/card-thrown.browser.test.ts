// A festival's card whose reactive part throws as its view is drawn: the throw reaches the view's boundary, which says
// it in its place, and Solid is not halted, so the page goes on following its address.
// On the Festivals page, whose cards are drawn once the festivals are in, the throw is said in its live line as they
// come in, the loading mark kept; on a later choice, once as the page's, the page going on.
// The page started (app.ts) on KUOF ending on a day no month has, which its card's date box reads as the card is
// drawn, and opened on an artist booked there, whose page holds KUOF's card, and on the Festivals page.
import { expect, test } from 'vitest';
import { artistHref, festivalsHref, sourcesHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { KUOF } from './community.fixture.ts';
import { expectConsole } from './console.ts';

let artist = 0;
const app = await startSite({
  now: '2026-11-01',
  route: sourcesHref(),
  plant: (db) => {
    artist = Number(db.exec('SELECT min(artist_id) FROM event_artists WHERE event_id = ?', [KUOF])[0]?.values[0]?.[0]);
    db.exec(`PRAGMA ignore_check_constraints = ON; UPDATE events SET end_date = '2026-13-01' WHERE id = ${KUOF}`);
  },
});
// what the page shows once it opens href, or the words its opening was refused with
async function shownAt(href: string): Promise<string | undefined> {
  try {
    await app.open(href);
    return document.querySelector('main')?.textContent;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

test('a card whose reactive part throws says so in its view, and the page goes on', async () => {
  // the artists view's boundary, once a showing; Solid's own REACTIVITY_HALTED, or the page's line, would be undeclared
  expectConsole('error', /^Kiz Radar: artists: RangeError/u, 2);
  // the artist's page, Sources, and the artist's page again: the address still moves the page
  const shown = [await shownAt(artistHref(artist)), await shownAt(sourcesHref()), await shownAt(artistHref(artist))];
  expect(shown.map((words) => words?.includes('This page could not be shown'))).toEqual([true, false, true]);
  expect(shown[1]).toContain('Sources and acknowledgements');
});

test('a card that throws as the festivals come in is said in the live line, and on a later choice as the page', async () => {
  expectConsole('error', /^Kiz Radar: the page: RangeError/u);
  const main = () => document.querySelector('main');
  const live = () => main()?.querySelector('.live')?.textContent;
  const cards = () => main()?.querySelectorAll('.festival-card').length;
  const alerts = () => document.querySelectorAll('[role="alert"]').length;
  // KUOF, in Norway, left out: the cards drawn
  await app.open(festivalsHref({ when: 'year', reach: 'any', country: 'GB' }));
  expect(cards()).toBeGreaterThan(0);
  // a later choice keeping KUOF: said once as the page's, the page going on, the cards drawn again on the next choice
  const where = main()?.querySelector<HTMLSelectElement>('.sticky-bar select[aria-label="Where to"]');
  if (where == null) throw new Error('the Festivals page has no choice of where in its bar');
  const chosen = (country: string) => {
    where.selectedIndex = [...where.options].findIndex((o) => o.value === country);
    where.dispatchEvent(new Event('change'));
  };
  chosen('NO');
  await expect.poll(cards).toBe(0);
  expect([alerts(), live()]).toEqual([1, expect.stringMatching(/^\d+ festivals? like that\. Show them ↓/u)]);
  chosen('GB');
  await expect.poll(cards).toBeGreaterThan(0);
  // opened keeping KUOF: said in the live line as the festivals come in, the loading mark kept (which the opening
  // waits on in vain), no line of the page's
  await app.open(sourcesHref());
  await expect(app.open(festivalsHref({ when: 'year', reach: 'any', country: 'NO' }))).rejects.toThrow(
    /still waiting for /u,
  );
  expect([live(), cards(), alerts()]).toEqual([expect.stringMatching(/^Could not load the festivals: /u), 0, 1]);
  expect(main()?.querySelector('.sentence-results [role="status"]')).not.toBeNull();
});
