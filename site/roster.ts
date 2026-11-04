// A trip's roster, on its people alone: who travels together, where they stay, and what each line is called.
//
// Someone's signature is how they travel in (A: when and where they arrive), out (D: when and from where they leave)
// and where they stay (S: their nights, each place from a night to a night). A couple is one unit when its partners'
// signatures are alike, else each partner is one; anyone else is a unit of one. A line is the units that travel alike,
// in and out (A and D): a bar is a travel, and where they stay never splits it; in a line, its stays are counted, those
// who stay alike together ("Scandic Holberg 13 · Airbnb 3 · 4 not said"). Someone who has said nothing at all is on
// the last line, of those who have not said; someone who has said only where they stay has said something.
//
// What a line is called: with three units or fewer, every line names them. With more, the one line is "Everyone"; of
// several, the line of the most people, when no other is as big and it is more than half of everyone, is "Everyone
// else"; any other line of more than three people is called by its number ("5 people"); the rest name their units.
// The lines go by arrival, then departure, the bigger first, then by their first name; those who have not said last.

// how someone travels, each end when they said it: arrive and leave as local times (YYYY-MM-DDTHH:MM), the airports
export interface Flights {
  arrive: string | null;
  arrive_at: string | null;
  leave: string | null;
  leave_from: string | null;
}
// a stay: where, from a night to a night, each by its evening's date (YYYY-MM-DD)
export interface Stay {
  first: string;
  last: string;
  place: string;
}
// someone going: who they are, the couple they are in when both partners go, how they travel (null: not said) and
// where they stay, in the order of their nights
export interface Goes<P> {
  person: P;
  name: string;
  couple: { key: string; name: string } | null;
  travel: Flights | null;
  stays: readonly Stay[];
}
// a unit: one person, or a couple whose partners travel and stay alike, by its name
export interface Unit<P> {
  name: string;
  people: P[];
}
// the people of a line who stay alike: their stays (none: not said), by name ("Airbnb → Scandic Holberg"), and who
export interface Bucket<P> {
  stays: readonly Stay[];
  place: string | null;
  people: number;
  units: Unit<P>[];
}
// a line of the roster: its units, how many people, how they travel (null: those who have not said), their stays
// counted, the nights any of them stays (null: none), and what it is called when not by its units' names
export interface Line<P> {
  units: Unit<P>[];
  people: number;
  travel: Flights | null;
  buckets: Bucket<P>[];
  nights: { first: string; last: string } | null;
  called: string | null;
}

const MANY = 3; // a roster of more units than this calls lines by number; a line of more people than this is called so

const travelKey = (t: Flights | null): string =>
  t === null ? '' : ['in', t.arrive, t.arrive_at, 'out', t.leave, t.leave_from].join('|');
const staysKey = (stays: readonly Stay[]): string => stays.map((s) => `${s.first}..${s.last}:${s.place}`).join(';');
// whether someone has said nothing at all
const silent = (g: Goes<unknown>): boolean => g.travel === null && g.stays.length === 0;
const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, 'en');
// times and keys by their characters, so that an end not said ("~") sorts after every time
const byText = (a: string, b: string): number => Number(a > b) - Number(a < b);

interface Placed<P> {
  unit: Unit<P>;
  travel: Flights | null;
  stays: readonly Stay[];
  silent: boolean;
}
// the units: each couple as one when its partners' signatures are alike, else each partner, and everyone else alone
function units<P>(goers: readonly Goes<P>[]): Placed<P>[] {
  const sign = (g: Goes<P>) => `${travelKey(g.travel)}#${staysKey(g.stays)}`;
  const out: Placed<P>[] = [];
  const done = new Set<Goes<P>>();
  for (const g of goers) {
    if (done.has(g)) continue;
    const c = g.couple;
    const partners = c === null ? [g] : goers.filter((o) => o.couple?.key === c.key).toSorted(byName);
    const alike = c !== null && partners.length > 1 && partners.every((o) => sign(o) === sign(g));
    for (const one of alike ? [partners] : [[g]]) {
      out.push({
        unit: { name: alike && c !== null ? c.name : g.name, people: one.map((o) => o.person) },
        travel: g.travel,
        stays: g.stays,
        silent: silent(g),
      });
      for (const o of one) done.add(o);
    }
  }
  return out;
}

// what a line is called, of all the lines and everyone going
function call<P>(lines: readonly Line<P>[], total: number, unitCount: number): void {
  if (unitCount <= MANY) return;
  const [only] = lines;
  if (lines.length === 1 && only) {
    only.called = 'Everyone';
    return;
  }
  // more than half of everyone is a line no other is as big as: of two alike in size, neither is more than half
  for (const l of lines)
    if (2 * l.people > total) l.called = 'Everyone else';
    else if (l.people > MANY) l.called = `${l.people} people`;
}

// The lines of a roster, each with its stays counted and what it is called, in their order.
export function roster<P>(goers: readonly Goes<P>[]): Line<P>[] {
  const all = units(goers);
  type Building = Line<P> & { silent: boolean; byStay: Map<string, Bucket<P>> };
  const byTravel = new Map<string, Building>();
  for (const { unit, travel, stays, silent: none } of all) {
    const key = none ? '' : `#${travelKey(travel)}`;
    const line: Building = byTravel.get(key) ?? {
      units: [],
      people: 0,
      travel: none ? null : travel,
      buckets: [],
      nights: null,
      called: null,
      silent: none,
      byStay: new Map(),
    };
    line.units.push(unit);
    line.people += unit.people.length;
    const s = staysKey(stays);
    const bucket = line.byStay.get(s) ?? {
      stays,
      place: stays.length === 0 ? null : stays.map((x) => x.place).join(' → '),
      people: 0,
      units: [],
    };
    bucket.people += unit.people.length;
    bucket.units.push(unit);
    line.byStay.set(s, bucket);
    for (const x of stays)
      line.nights = {
        first: line.nights === null || x.first < line.nights.first ? x.first : line.nights.first,
        last: line.nights === null || x.last > line.nights.last ? x.last : line.nights.last,
      };
    byTravel.set(key, line);
  }
  const lines = [...byTravel.values()].map(({ silent: none, byStay, ...line }) => {
    line.units.sort(byName);
    line.buckets = [...byStay.values()]
      .map((b) => ({ ...b, units: b.units.toSorted(byName) }))
      .sort(
        (a, b) =>
          Number(a.place === null) - Number(b.place === null) ||
          b.people - a.people ||
          (a.place ?? '').localeCompare(b.place ?? '', 'en') ||
          byText(staysKey(a.stays), staysKey(b.stays)),
      );
    return { line, none };
  });
  const unknown = '~'; // an end not said sorts after every time
  lines.sort(
    (a, b) =>
      Number(a.none) - Number(b.none) ||
      byText(a.line.travel?.arrive ?? unknown, b.line.travel?.arrive ?? unknown) ||
      byText(a.line.travel?.leave ?? unknown, b.line.travel?.leave ?? unknown) ||
      b.line.people - a.line.people ||
      byName(a.line.units[0] ?? { name: '' }, b.line.units[0] ?? { name: '' }) ||
      byText(travelKey(a.line.travel), travelKey(b.line.travel)),
  );
  const out = lines.map((l) => l.line);
  call(out, goers.length, all.length);
  return out;
}
