// Rows a test file writes into the fixture's database inside `plant` (app.ts), before the page reads it, and what it
// reads there first. Each row changes what the build made; none adds a festival, which the page would not show
// (event_rows joins the build's event_stats). Each writer checks that it wrote the rows it meant, and throws naming
// what it did not write: a key no one has, or a festival the data lacks, would otherwise plant nothing and leave a test
// reading the fixture alone.
import type { Database } from 'sql.js';
import { KEY } from '../../site/states.ts';
import type { Key } from '../../site/wording.ts';
import { KUOF } from './community.fixture.ts';

// The rows the last statement wrote, checked: as many as meant, else an error naming what was to be written.
function wrote(db: Database, rows: number, what: string): void {
  const changed = db.getRowsModified();
  if (changed !== rows) throw new Error(`${what}: ${changed} rows written, not ${rows}`);
}

// The number a query counts.
const counted = (db: Database, query: string, params: (string | number)[]): number =>
  Number(db.exec(query, params)[0]?.values[0]?.[0] ?? 0);

// The site's home city, its key and name, read where the fixture's people live (plantCommunity puts them all there).
export function homeOf(db: Database): { key: string; name: string } {
  const [key, name] =
    db.exec("SELECT c.key, c.name FROM cities c JOIN people p ON p.home = c.key WHERE p.key = 'cedric'")[0]
      ?.values[0] ?? [];
  if (typeof key !== 'string' || typeof name !== 'string') throw new Error('the fixture’s people live in no city');
  return { key, name };
}

// Someone's plan for a festival, by their key: added, or its status changed.
export function planned(db: Database, person: string, event: number, status: Key<'plan'>): void {
  db.run(
    `INSERT INTO plans SELECT id, ?, ? FROM people WHERE key = ?
     ON CONFLICT (person_id, event_id) DO UPDATE SET status = excluded.status`,
    [event, status, person],
  );
  wrote(db, 1, `${person}'s plan for festival ${event}`);
}

// A festival the only one of its country on its days: any other there on one of them is no longer listed.
export function aloneInItsCountry(db: Database, event: number): void {
  db.run(
    `UPDATE events SET listing = ? WHERE id != ? AND id IN (SELECT o.id FROM events o JOIN events e ON e.id = ?
     WHERE o.country_code = e.country_code AND o.start_date <= e.end_date AND o.end_date >= e.start_date)`,
    [KEY.listing.GONE, event, event],
  );
}

// Someone sharing their plans, featured, by their key and name, living in the city of the key home (null when not
// said).
export function sharer(db: Database, key: string, name: string, home: string | null): void {
  db.run('INSERT INTO people (key, name, featured, home) VALUES (?, ?, 1, ?)', [key, name, home]);
  wrote(db, 1, `the sharer ${key}`);
}

// Another community beside the fixture's, by its key: a copy of community 1, its name, manager and members (those of
// `members`, by their keys, when given), and the people its manager added, but those named in `maybe` (each a name and
// a festival) only maybe going, and with `added` added, each a name and a festival, going. Its added people show on its
// own page alone, so community 1 stays the fixture's.
export function community(
  db: Database,
  key: string,
  {
    added = [],
    maybe = [],
    members,
  }: {
    added?: readonly (readonly [string, number])[];
    maybe?: readonly (readonly [string, number])[];
    members?: readonly string[];
  },
): void {
  db.run(
    'INSERT INTO communities SELECT (SELECT max(id) + 1 FROM communities), ?, name, manager_id FROM communities WHERE id = 1',
    [key],
  );
  wrote(db, 1, `the community ${key}`);
  const id = '(SELECT id FROM communities WHERE key = ?)';
  if (members === undefined) {
    const copied = counted(db, 'SELECT count(*) FROM community_members WHERE community_id = 1', []);
    db.run(`INSERT INTO community_members SELECT ${id}, person_id FROM community_members WHERE community_id = 1`, [
      key,
    ]);
    wrote(db, copied, `the members of ${key}, community 1's`);
  } else {
    db.run(`INSERT INTO community_members SELECT ${id}, id FROM people WHERE key IN (SELECT value FROM json_each(?))`, [
      key,
      JSON.stringify(members),
    ]);
    wrote(db, members.length, `the members of ${key}, ${members.join(', ')}`);
  }
  const seeded = counted(db, 'SELECT count(*) FROM community_seeded WHERE community_id = 1', []);
  const maybes = JSON.stringify(maybe);
  const isMaybe = `EXISTS (SELECT 1 FROM json_each(?) m WHERE json_extract(m.value, '$[0]') = name
     AND json_extract(m.value, '$[1]') = event_id)`;
  db.run(
    `INSERT INTO community_seeded SELECT (SELECT max(id) FROM community_seeded) + row_number() OVER (ORDER BY id), ${id},
     name, event_id, iif(${isMaybe}, ?, status) FROM community_seeded WHERE community_id = 1`,
    [key, maybes, KEY.plan.MAYBE],
  );
  wrote(db, seeded, `the people added to ${key}, community 1's`);
  const madeMaybe = counted(
    db,
    `SELECT count(*) FROM community_seeded WHERE community_id = ${id} AND status = ? AND ${isMaybe}`,
    [key, KEY.plan.MAYBE, maybes],
  );
  if (madeMaybe !== maybe.length)
    throw new Error(`${key}: ${madeMaybe} of ${maybes} only maybe going: community 1 added no such name there`);
  for (const [name, event] of added) {
    db.run(`INSERT INTO community_seeded SELECT (SELECT max(id) + 1 FROM community_seeded), ${id}, ?, ?, ?`, [
      key,
      name,
      event,
      KEY.plan.GOING,
    ]);
    wrote(db, 1, `${name} added to ${key} for festival ${event}`);
  }
}

// A trip someone takes to a festival, by their key: when they arrive and leave (a day, or a day and time; null when
// not said, but one of them said), the airport they land at and leave from, written for each end said (null for none
// said), and where they stay, every night from the day they arrive to the day before they leave (null for nowhere
// said; said only with both ends).
export type Trip = readonly [
  person: string,
  event: number,
  arrive: string | null,
  leave: string | null,
  airport: string | null,
  stay: string | null,
];

// Someone's flight to KUOF, landing in Oslo at the time given and leaving on Monday 23 November at 09:40, staying at
// the Scandic Holberg.
const toKuof = (person: string, arrive: string): Trip => [
  person,
  KUOF,
  arrive,
  '2026-11-23T09:40',
  'OSL',
  'Scandic Holberg',
];
// Thursday 19 November, 17:05: when Cédric lands for KUOF.
const THURSDAY = '2026-11-19T17:05';

// Cédric and Christina to KUOF together, from Thursday to Monday: in to Oslo on 19 November at 17:05, out on the 23rd
// at 09:40, both at the Scandic Holberg.
export const TO_KUOF: readonly Trip[] = [toKuof('cedric', THURSDAY), toKuof('christina', THURSDAY)];
// Cédric and Christina to KUOF apart: Cédric in on the Thursday at 17:05, Christina on the Friday at 09:00, both out on
// Monday at 09:40, both at the Scandic Holberg.
export const APART: readonly Trip[] = [toKuof('cedric', THURSDAY), toKuof('christina', '2026-11-20T09:00')];

// Trips as given, their stays not said.
export const unstayed = (rows: readonly Trip[]): readonly Trip[] =>
  rows.map(([person, event, arrive, leave, airport]) => [person, event, arrive, leave, airport, null]);
// Cédric's and Christina's flights together to KUOF (TO_KUOF), without their stay.
export const FLOWN = unstayed(TO_KUOF);

// The trips written, each with its stay.
export function trips(db: Database, rows: readonly Trip[]): void {
  for (const [key, event, arrive, leave, airport, stay] of rows) {
    const what = `${key}'s trip to festival ${event}`;
    if (arrive === null && leave === null) throw new Error(`${what}: neither its arrival nor its departure said`);
    db.run('INSERT INTO travel SELECT id, ?, ?, ?, ?, ? FROM people WHERE key = ?', [
      event,
      arrive,
      arrive === null ? null : airport,
      leave,
      leave === null ? null : airport,
      key,
    ]);
    wrote(db, 1, what);
    if (stay === null) continue;
    if (arrive === null || leave === null) throw new Error(`${what}: a stay, without both its ends`);
    db.run("INSERT INTO stays SELECT id, ?, ?, date(?, '-1 day'), ? FROM people WHERE key = ?", [
      event,
      arrive.slice(0, 10),
      leave.slice(0, 10),
      stay,
      key,
    ]);
    wrote(db, 1, `${what}: its stay`);
  }
}

// Where someone stays for a festival, by their key: from a night to a night, at a place.
export type Stay = readonly [person: string, event: number, first: string, last: string, place: string];

// The stays written, with no travel of their own.
export function stays(db: Database, rows: readonly Stay[]): void {
  for (const [key, event, first, last, place] of rows) {
    db.run('INSERT INTO stays SELECT id, ?, ?, ?, ? FROM people WHERE key = ?', [event, first, last, place, key]);
    wrote(db, 1, `${key}'s stay at ${place} for festival ${event}`);
  }
}
