// A community's page with two of its festivals no longer what they were: KUOF cancelled, and HOT Ice no longer listed,
// on KUOF's second day. A file of its own, since a festival's state is one row every view reads.
import { expect, test } from 'vitest';
import { KEY } from '../../site/states.ts';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, HOT_ICE, KUOF } from './community.fixture.ts';
import { agendaRow, COMM, said } from './seen.ts';

const app = await startSite({
  now: '2026-11-21',
  plant: (db) => {
    db.run('UPDATE events SET cancelled = 1 WHERE id = ?', [KUOF]);
    db.run('UPDATE events SET listing = ? WHERE id = ?', [KEY.listing.GONE, HOT_ICE]);
  },
});

test('a festival cancelled or no longer listed stays on the community’s page, said so, never on now', async () => {
  await app.open(COMM(FIXTURE_COMMUNITY));
  const kuof = agendaRow('KUOF');
  expect(said(kuof?.querySelector('.trip-off'))).toBe('This festival was cancelled.');
  expect(kuof?.querySelector('.now-tag')).toBeNull();
  expect(said(agendaRow('HOT Ice')?.querySelector('.trip-off'))).toBe('This festival is no longer listed.');
});
