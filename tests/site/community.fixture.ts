// The community the site's tests read, written into their database over what the build made from pipeline/*.csv: its
// key and name, its people, their plans, the people its manager added, how members travel, and the festivals any of it
// names, each by its title, days, city and country, as the data stood when Glasgow was the next trip. The real rows are
// taken out first, so a test never reads them: deleting them from the CSVs, the build leaving out a trip that ended, or
// a festival moving its days or name, changes no test. Each test pins its own day (onDay). data.setup.ts writes the
// database with it into FIXTURE_DATA, which the tests of the whole site load.
import type { Database } from 'sql.js';
import { KEY } from '../../site/states.ts';

export const FIXTURE_COMMUNITY = 'frost-lantern-river-maple';
export const FIXTURE_NAME = 'Norwegians in festivals';
// where the database with the fixture is written for the tests of the whole site, beside public/data's other files
export const FIXTURE_DATA = '.vitest/fixture-data';
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
// the festivals the tests name, the community's and three others: Paris (on as KUOF is), Albania (in May) and Riga in
// September; each id, title, first and last day, city, country and weekend Friday
const PARIS = 16_904,
  ALBANIA = 18_734,
  RIGA = 16_246;
const FESTIVALS = [
  [KUOF, 'KUOF – Kizomba & Urban Kiz Oslo Festival', '2026-11-20', '2026-11-22', 'Oslo', 'NO', '2026-11-20'],
  [HOT_ICE, 'HOT Ice KIZ Festival 11th edition', '2026-11-26', '2026-12-01', 'Riga', 'LV', '2026-11-27'],
  [GLASGOW, 'Glasgow Kizomba Festival 5.0', '2026-11-06', '2026-11-09', 'Glasgow', 'GB', '2026-11-06'],
  [PRAGUE_GOLD, 'Prague GOLD KIZ Tarraxo Festival', '2027-01-14', '2027-01-18', 'Prague', 'CZ', '2027-01-15'],
  [KWANZA, 'Prague Kwanza Festival – 9.edition', '2027-02-11', '2027-02-15', 'Prague', 'CZ', '2027-02-12'],
  [CLOUDKIZ, 'Cloudkiz Weekender', '2027-02-26', '2027-02-28', 'Enschede', 'NL', '2027-02-26'],
  [PARIS, 'Paris Kizomba Congress', '2026-11-19', '2026-11-23', 'Paris', 'FR', '2026-11-20'],
  [ALBANIA, 'Albania Afrolatin Festival', '2027-05-05', '2027-05-11', 'Durrës', 'AL', '2027-05-07'],
  [RIGA, 'ILKSF Meets HIK Latvia 6th Edition', '2027-09-03', '2027-09-06', 'Riga', 'LV', '2027-09-03'],
] as const;
export const FIXTURE_FESTIVALS = FESTIVALS.map(([id]) => id);

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
  db.run("INSERT INTO communities SELECT 1, ?, ?, id FROM people WHERE key = 'cedric'", [
    FIXTURE_COMMUNITY,
    FIXTURE_NAME,
  ]);
  for (const [key] of PEOPLE) db.run('INSERT INTO community_members SELECT 1, id FROM people WHERE key = ?', [key]);
  for (const [i, [name, event]] of ADDED.entries())
    db.run("INSERT INTO community_seeded VALUES (?, 1, ?, ?, 'going')", [i + 1, name, event]);
  for (const [key, ...trip] of TRAVEL)
    db.run('INSERT INTO travel SELECT id, ?, ?, ?, ?, ? FROM people WHERE key = ?', [...trip, key]);
  for (const [id, title, start, end, city, country, friday] of FESTIVALS)
    db.run(
      `UPDATE events SET title = ?, listed_title = ?, start_date = ?, end_date = ?, city = ?, country_code = ?,
       weekend_friday = ?, cancelled = 0, listing = ? WHERE id = ?`,
      [title, title, start, end, city, country, friday, KEY.listing.LISTED, id],
    );
  db.run('COMMIT');
}
