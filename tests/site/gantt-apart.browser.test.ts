// A trip's roster with Cédric and Christina flying to KUOF apart, both at the Scandic Holberg: Cédric in on Thursday
// 19 November at 17:05, Christina on the Friday at 09:00, both out on Monday at 09:40. Read on a community of its own,
// the fixture's but with Ola and Kari added to KUOF too. A file of its own, since each trip is one row every view
// reads.
import type { Database } from 'sql.js';
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { KUOF } from './community.fixture.ts';
import { APART, community, trips } from './planted.ts';
import { atWidth, collectiveOf, COMM } from './seen.ts';

const OLA_AND_KARI = 'ola-and-kari-kuof';
// the community with Ola and Kari added, and their flights apart (APART)
function plant(db: Database): void {
  community(db, OLA_AND_KARI, {
    added: [
      ['Ola', KUOF],
      ['Kari', KUOF],
    ],
  });
  trips(db, APART);
}
const app = await startSite({ now: '2026-11-01', plant });

test('on a computer the card of names floats by its text, in the trip’s card, over no part of its own line', async () => {
  await atWidth(1200);
  await app.open(COMM(OLA_AND_KARI));
  // Cédric and Christina flying apart, and five people added: "Everyone else", the third line, its card above it
  const seen = await collectiveOf();
  expect(seen.lines).toEqual(['Cédric Scandic Holberg', 'Christina Scandic Holberg', 'Everyone else']);
  expect([seen.floats, seen.inCard, seen.coversItsLine]).toEqual(['absolute', true, false]);
  // five names: two columns of them
  expect(seen.columns).toBe('2');
});
