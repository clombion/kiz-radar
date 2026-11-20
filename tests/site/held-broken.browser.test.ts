// A festival's card whose reactive part throws as its view is drawn: the throw reaches the view's boundary, which says
// it in its place, as guarded said an h() view's (and held a card an h() view held, mount.tsx), and Solid is not
// halted, so the page goes on following its address. The page started (app.ts) on KUOF ending on a day no month has,
// which its card's date box reads as the card is drawn, and opened on an artist booked there, whose page holds KUOF's
// card.
import { expect, test } from 'vitest';
import { artistHref, sourcesHref } from '../../site/routes.ts';
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
