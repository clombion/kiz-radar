// The fixture the site's tests read (community.fixture.ts), planted on the database the build made from the export,
// as data.setup.ts plants it, and in the database data.setup.ts wrote for the pages (FIXTURE_DATA): what it leaves in
// each is its own alone.
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { expect, test } from 'vitest';
import { summaryOf } from '../../site/db.ts';
import { KEY } from '../../site/states.ts';
import { FIXTURE_COMMUNITY, FIXTURE_DATA, FIXTURE_FESTIVALS, plantCommunity } from './community.fixture.ts';

// the build's files, which the tests' setup makes before they run
const built = (file: string) => readFileSync(new URL(`../../public/data/${file}`, import.meta.url));
const SQL = await initSqlJs();
const planted = new SQL.Database(built('kiz.sqlite'));
plantCommunity(planted, summaryOf(JSON.parse(built('site.json').toString('utf8'))).home.city_key);
// the database the pages load, which the tests' setup wrote
const served = new SQL.Database(readFileSync(new URL(`../../${FIXTURE_DATA}/kiz.sqlite`, import.meta.url)));

test('the community the tests read is the fixture alone, whatever the real rows say or the day it was built', () => {
  // as planted here, and in the database the pages load
  for (const db of [planted, served]) {
    const rows = (query: string) => db.exec(query)[0]?.values.map((r) => r.join(' ')) ?? [];
    expect(
      rows('SELECT p.key, t.event_id, t.arrive, t.leave FROM travel t JOIN people p ON p.id = t.person_id'),
    ).toEqual([
      'cedric 18666 2027-01-13T14:30 2027-01-18T15:10',
      'christina 18666 2027-01-13T14:30 2027-01-18T15:10',
      'christina 18964 2026-11-06 2026-11-09T19:10',
      'sian 18964 2026-11-05 ',
    ]);
    expect(rows('SELECT count(*) FROM stays')).toEqual(['0']);
    expect(rows('SELECT name, event_id, status FROM community_seeded ORDER BY id')).toEqual([
      'Tonje 19033 going',
      'Ragnhild 19033 going',
      'Maja 19033 going',
      'Caroline 18964 going',
      'Tonje 18666 maybe',
    ]);
    expect(rows('SELECT key FROM communities')).toEqual([FIXTURE_COMMUNITY]);
    expect(
      rows("SELECT count(*) FROM plans p JOIN people pe ON pe.id = p.person_id WHERE pe.key = 'christina'"),
    ).toEqual(['5']);
    expect(
      rows(
        `SELECT count(*) FROM events WHERE listing = '${KEY.listing.LISTED}' AND NOT cancelled AND id IN (${FIXTURE_FESTIVALS.join(', ')})`,
      ),
    ).toEqual([String(FIXTURE_FESTIVALS.length)]);
  }
});
