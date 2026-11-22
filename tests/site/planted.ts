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

// Values the site's reading refuses (a state no state has, words where a number goes), written with the database's
// checks off by statements whose last one must write rows, else an error naming them.
export function unreadable(db: Database, statements: string): void {
  db.exec(`PRAGMA ignore_check_constraints = ON; ${statements}`);
  if (db.getRowsModified() === 0) throw new Error(`${statements}: no row written`);
}

// The number a query counts.
const counted = (db: Database, query: string, params: readonly (string | number)[]): number =>
  Number(db.exec(query, [...params])[0]?.values[0]?.[0] ?? 0);

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
    readonly added?: readonly (readonly [string, number])[];
    readonly maybe?: readonly (readonly [string, number])[];
    readonly members?: readonly string[];
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

// A place, by its name and its country's code, and where it is.
interface Place {
  readonly name: string;
  readonly country: string;
  readonly at: readonly [lat: number, lon: number];
}

// A city of the test's own, by its key, in a country countries has.
export function city(db: Database, key: string, { name, country, at: [lat, lon] }: Place): void {
  db.run(
    'INSERT INTO cities (key, name, country_code, lat, lon) SELECT ?, ?, code, ?, ? FROM countries WHERE code = ?',
    [key, name, lat, lon, country],
  );
  wrote(db, 1, `the city ${key} in ${country}`);
}

// A festival put in a city, by its key, as its listing spells it: its country the city's.
export function inCity(db: Database, event: number, key: string, spelling: string): void {
  db.run(
    `UPDATE events SET city = ?, city_key = c.key, country_code = c.country_code FROM cities c
     WHERE c.key = ? AND events.id = ?`,
    [spelling, key, event],
  );
  wrote(db, 1, `festival ${event} in the city ${key}`);
}

// Every festival but those kept moved to a weekend of 2031, out of every list a test reads.
export function movedAway(db: Database, kept: readonly number[]): void {
  const ids = JSON.stringify(kept);
  const there = counted(db, 'SELECT count(*) FROM events WHERE id IN (SELECT value FROM json_each(?))', [ids]);
  if (there !== kept.length) throw new Error(`festivals ${kept.join(', ')}: ${there} of them in the data`);
  const others = counted(db, 'SELECT count(*) FROM events', []) - kept.length;
  db.run(
    `UPDATE events SET start_date = '2031-01-03', end_date = '2031-01-05', weekend_friday = '2031-01-03'
     WHERE id NOT IN (SELECT value FROM json_each(?))`,
    [ids],
  );
  wrote(db, others, `every festival but ${kept.join(', ')} moved to 2031`);
}

// A festival's price: one full pass, for one person, at the amount given in a currency, on sale with no window (its
// only tier), the pass its card prices.
export function priced(db: Database, event: number, amount: number, currency: string): void {
  db.run('DELETE FROM pass_tiers WHERE event_id = ?', [event]);
  db.run('DELETE FROM event_passes WHERE event_id = ?', [event]);
  db.run(
    `INSERT INTO event_passes (event_id, pass_no, kind, people, includes_hotel, source)
     SELECT id, 1, 'full', 'one', 0, 'description' FROM events WHERE id = ?`,
    [event],
  );
  wrote(db, 1, `festival ${event}'s full pass`);
  db.run(
    `INSERT INTO pass_tiers (event_id, pass_no, tier_no, amount, currency, door, sold_out, current)
     VALUES (?, 1, 1, ?, ?, 0, 0, 1)`,
    [event, amount, currency],
  );
  wrote(db, 1, `festival ${event}'s full pass at ${amount} ${currency}`);
  db.run(
    `INSERT INTO price_status (event_id, price, card_pass) VALUES (?, ?, 1)
     ON CONFLICT (event_id) DO UPDATE SET price = excluded.price, card_pass = 1`,
    [event, KEY.price.PRICED],
  );
  wrote(db, 1, `festival ${event} priced`);
}

// A festival with no price yet: its card says why, and adds no flight to a pass.
export function unpriced(db: Database, event: number): void {
  db.run(
    `INSERT INTO price_status (event_id, price, card_pass) SELECT id, ?, NULL FROM events WHERE id = ?
     ON CONFLICT (event_id) DO UPDATE SET price = excluded.price, card_pass = NULL`,
    [KEY.price.NOT_YET, event],
  );
  wrote(db, 1, `festival ${event} not priced yet`);
}

// An airport the data lacks, by its code, its name and its city's (the place, in a country countries has), not the
// home one.
export function newAirport(
  db: Database,
  code: string,
  airportName: string,
  { name, country, at: [lat, lon] }: Place,
): void {
  db.run(
    `INSERT INTO airports (code, name, city, country_code, lat, lon, home)
     SELECT ?, ?, ?, code, ?, ?, 0 FROM countries WHERE code = ?`,
    [code, airportName, name, lat, lon, country],
  );
  wrote(db, 1, `the airport ${code} in ${country}`);
}

// The airports a festival flies to, in place of its own, each by its code and how far from it, in km; the nearest the
// one it is said to be near.
export function flies(db: Database, event: number, airports: readonly (readonly [code: string, km: number])[]): void {
  const [nearest] = airports.toSorted(([, a], [, b]) => a - b);
  if (nearest === undefined) throw new Error(`festival ${event}: flies to no airport`);
  db.run('UPDATE events SET airport = ?, airport_km = ? WHERE id = ?', [...nearest, event]);
  wrote(db, 1, `festival ${event} near ${nearest[0]}`);
  db.run('DELETE FROM event_airports WHERE event_id = ?', [event]);
  for (const [code, km] of airports) {
    db.run('INSERT INTO event_airports (event_id, airport, km) SELECT ?, code, ? FROM airports WHERE code = ?', [
      event,
      km,
      code,
    ]);
    wrote(db, 1, `festival ${event} flying to ${code}`);
  }
}

// A festival near an airport that flies to none: its city decided not served, or its decided airports none the data
// has.
export function fliesToNone(db: Database, event: number, near: string): void {
  db.run('UPDATE events SET airport = ?, airport_km = 30 WHERE id = ?', [near, event]);
  wrote(db, 1, `festival ${event} near ${near}`);
  db.run('DELETE FROM event_airports WHERE event_id = ?', [event]);
}

// What the searches of an airport say of a weekend, as the build writes it: its standing (pipeline/fare_weekends.py),
// when the search that says it ran (null when none says one: not asked, or asked with no answer), the return fare it
// found (its price in euros, its stops out, and the airlines a reseller's price is theirs), and a cheaper trip on
// separate tickets.
export interface Searched {
  readonly airport: string;
  readonly at: string | null;
  readonly standing: Key<'fare_standing'>;
  readonly fare?: { readonly price: number; readonly stops: number; readonly resold?: string };
  readonly transfer?: { readonly price: number; readonly airlines: string };
}

// A weekend's flights, by its Friday, at the airports named: every fare, search and self-transfer there replaced by
// the searches given, each returning on the Monday. The Friday is a festival's weekend Friday,
// else no page shows the flights.
export function weekend(
  db: Database,
  depart: string,
  airports: readonly string[],
  searched: readonly Searched[],
): void {
  if (
    counted(db, "SELECT strftime('%w', ?) = '5' AND EXISTS (SELECT 1 FROM events WHERE weekend_friday = ?)", [
      depart,
      depart,
    ]) !== 1
  ) {
    throw new Error(`the weekend of ${depart}: no festival's weekend Friday`);
  }
  const codes = JSON.stringify(airports);
  const known = counted(db, 'SELECT count(*) FROM airports WHERE code IN (SELECT value FROM json_each(?))', [codes]);
  if (known !== airports.length) throw new Error(`the airports ${airports.join(', ')}: ${known} of them in the data`);
  for (const table of ['fares', 'fare_searches', 'fare_transfers'])
    db.run(`DELETE FROM ${table} WHERE depart = ? AND airport IN (SELECT value FROM json_each(?))`, [depart, codes]);
  for (const { airport: code, at, standing, fare, transfer } of searched) {
    const what = `the search of ${code} for the weekend of ${depart}`;
    if (!airports.includes(code)) throw new Error(`${what}: ${code} is none of the airports named`);
    if ((fare !== undefined) !== (standing === KEY.fare_standing.PRICED))
      throw new Error(`${what}: a fare exactly when it stands priced`);
    const taught = standing !== KEY.fare_standing.NOT_ASKED && standing !== KEY.fare_standing.UNANSWERED;
    if ((at !== null) !== taught) throw new Error(`${what}: a time exactly when a search said its standing`);
    db.run('INSERT INTO fare_searches (airport, depart, standing, searched_at) VALUES (?, ?, ?, ?)', [
      code,
      depart,
      standing,
      at,
    ]);
    wrote(db, 1, what);
    if (fare !== undefined) {
      db.run(
        `INSERT INTO fares (airport, depart, return, price, fetched_at, stops_out, stops_back, resold)
         VALUES (?, ?, date(?, '+3 days'), ?, ?, ?, NULL, ?)`,
        [code, depart, depart, fare.price, at, fare.stops, fare.resold ?? null],
      );
      wrote(db, 1, `${what}: its fare`);
    }
    if (transfer !== undefined) {
      db.run('INSERT INTO fare_transfers (airport, depart, price, fetched_at, airlines) VALUES (?, ?, ?, ?, ?)', [
        code,
        depart,
        transfer.price,
        at,
        transfer.airlines,
      ]);
      wrote(db, 1, `${what}: its self-transfer`);
    }
  }
}

// The database of another build than the summary's (site.json): the page refuses it, as mid-update.
export function anotherBuild(db: Database): void {
  db.run("UPDATE meta SET value = value || ' (another build)' WHERE key = 'built_at'");
  wrote(db, 1, 'the database built again');
}

// A festival's title, and the title its listing gives, both as given.
export function retitled(db: Database, event: number, title: string): void {
  db.run('UPDATE events SET title = ?, listed_title = ? WHERE id = ?', [title, title, event]);
  wrote(db, 1, `festival ${event}'s title`);
}

// The lowest artist the build counted bookings of in a country, by their id.
export function bookedArtist(db: Database): number {
  const id = counted(db, 'SELECT min(artist_id) FROM artist_countries', []);
  if (id === 0) throw new Error('the build counted no artist’s bookings in a country');
  return id;
}

// An artist's bookings, by their id: every country they were booked in replaced by those given, each by its code and
// how many times, none of them their home.
export function bookings(db: Database, artist: number, rows: readonly (readonly [country: string, n: number])[]): void {
  db.run('DELETE FROM artist_countries WHERE artist_id = ?', [artist]);
  for (const [country, n] of rows) {
    db.run('INSERT INTO artist_countries (artist_id, country_code, bookings, is_home) VALUES (?, ?, ?, 0)', [
      artist,
      country,
      n,
    ]);
    wrote(db, 1, `artist ${artist}'s ${n} bookings in ${country}`);
  }
}
