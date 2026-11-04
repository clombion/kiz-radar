// The community the views' tests read, written into their database over what the build made from pipeline/*.csv: its
// people, their plans, the people its manager added, and how members travel, as the data stood when Glasgow was the
// next trip. The real rows are taken out first, so a test never reads them: deleting them from the CSVs, or the build
// leaving out a trip that ended, changes no test. Each test pins its own day (onDay).
import type { Database } from 'sql.js';
import { KEY } from '../../site/states.ts';

export const FIXTURE_COMMUNITY = 'frost-lantern-river-maple';
// the festivals it goes to: KUOF (Oslo, 20–22 Nov 2026), HOT Ice (Riga, 26 Nov – 1 Dec), Glasgow (6–9 Nov), Prague
// GOLD (14–18 Jan 2027), Prague Kwanza (11–15 Feb) and Cloudkiz (Enschede, 26–28 Feb)
const KUOF = 19_033,
  HOT_ICE = 17_493,
  GLASGOW = 18_964,
  PRAGUE_GOLD = 18_666,
  KWANZA = 18_660,
  CLOUDKIZ = 18_760;
const PEOPLE = [
  ['cedric', 'Cédric'],
  ['christina', 'Christina'],
  ['sian', 'Siân'],
] as const;
// each member's plans; all three live in the site's home city
const PLANS: Record<string, readonly number[]> = {
  cedric: [KUOF, HOT_ICE, PRAGUE_GOLD, CLOUDKIZ],
  christina: [KUOF, HOT_ICE, GLASGOW, PRAGUE_GOLD, CLOUDKIZ],
  sian: [GLASGOW, KWANZA],
};
// the people the manager added: name and festival
const ADDED = [
  ['Tonje', KUOF],
  ['Ragnhild', KUOF],
  ['Maja', KUOF],
  ['Caroline', GLASGOW],
] as const;
// how members travel: person, festival, arrive, arrive_at, leave, leave_from
const TRAVEL = [
  ['cedric', PRAGUE_GOLD, '2027-01-13T14:30', 'PRG', '2027-01-18T15:10', 'PRG'],
  ['christina', PRAGUE_GOLD, '2027-01-13T14:30', 'PRG', '2027-01-18T15:10', 'PRG'],
  ['christina', GLASGOW, '2026-11-06', null, '2026-11-09T19:10', 'ABZ'],
  ['sian', GLASGOW, '2026-11-05', null, null, null],
] as const;
export const FIXTURE_FESTIVALS = [KUOF, HOT_ICE, GLASGOW, PRAGUE_GOLD, KWANZA, CLOUDKIZ];

// The fixture written into db: every community, member, added person, travel and stay replaced by its own; its people
// there (added when the data has them no more), their plans its own, and its festivals listed and not cancelled.
export function plantCommunity(db: Database): void {
  db.run('PRAGMA defer_foreign_keys = ON');
  db.run('BEGIN');
  for (const table of ['travel', 'stays', 'seeded_artists', 'community_seeded', 'community_members', 'communities'])
    db.run(`DELETE FROM ${table}`);
  const home = db.exec('SELECT city FROM airports WHERE home = 1')[0]?.values[0]?.[0] ?? null;
  for (const [key, name] of PEOPLE) {
    db.run('INSERT OR IGNORE INTO people (key, name, featured) VALUES (?, ?, 1)', [key, name]);
    db.run('UPDATE people SET home = ? WHERE key = ?', [home, key]);
    db.run('DELETE FROM plans WHERE person_id = (SELECT id FROM people WHERE key = ?)', [key]);
    for (const event of PLANS[key] ?? [])
      db.run(`INSERT INTO plans SELECT id, ?, 'going' FROM people WHERE key = ?`, [event, key]);
  }
  db.run("INSERT INTO communities SELECT 1, ?, 'Norwegians in festivals', id FROM people WHERE key = 'cedric'", [
    FIXTURE_COMMUNITY,
  ]);
  for (const [key] of PEOPLE) db.run('INSERT INTO community_members SELECT 1, id FROM people WHERE key = ?', [key]);
  for (const [i, [name, event]] of ADDED.entries())
    db.run("INSERT INTO community_seeded VALUES (?, 1, ?, ?, 'going')", [i + 1, name, event]);
  for (const [key, ...trip] of TRAVEL)
    db.run('INSERT INTO travel SELECT id, ?, ?, ?, ?, ? FROM people WHERE key = ?', [...trip, key]);
  db.run('UPDATE events SET cancelled = 0, listing = ? WHERE id IN (SELECT value FROM json_each(?))', [
    KEY.listing.LISTED,
    JSON.stringify(FIXTURE_FESTIVALS),
  ]);
  db.run('COMMIT');
}
