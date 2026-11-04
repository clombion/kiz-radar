// A trip's roster, on its people alone: who travels together, where they stay, and what each line is called.
//
// Someone's signature is how they travel in (A: when and where they arrive), out (D: when and from where they leave)
// and where they stay (S: their nights, each place from a night to a night). A couple is one unit when its partners'
// signatures are alike, else each partner is one; anyone else is a unit of one. A line is the units that travel alike,
// in and out (A and D): a bar is a travel, and where they stay never splits it; in a line, its stays are counted, those
// who stay alike together ("Scandic Holberg 13 · Airbnb 3 · 4 not said"). Someone who has said nothing at all is on
// the last line, of those who have not said; someone who has said only where they stay has said something.
//
// What a line is called: a line of three people or fewer always names them, and with three units or fewer every line
// does. Otherwise a line of more than three people is "Everyone" when it is the only line, "Everyone else" when it is
// more than half of everyone (no other line is then as big), else called by its number ("5 people").
// The lines named come first, by arrival, then departure, then by their first name; then those called by number, by
// arrival; then "Everyone else"; and those who have not said at the very bottom, whatever they are called.
//
// The same people by where they stay (byPlace): a line a place, the most people first, those who said none last.

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
// someone going: who they are, by a key no one else going has (two people may share a name), the couple they are in
// when both partners go, how they travel (null: not said) and where they stay, in the order of their nights
export interface Goes<P> {
  person: P;
  key: string;
  name: string;
  couple: { key: string; name: string } | null;
  travel: Flights | null;
  stays: readonly Stay[];
}
// a unit: one person, or a couple whose partners travel and stay alike, by its name, and its people's keys
export interface Unit<P> {
  name: string;
  key: string;
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
// times and keys by their characters, so that an end not said ("~") sorts after every time
const byText = (a: string, b: string): number => Number(a > b) - Number(a < b);
// by name, and of two of one name by key: the same people make the same order, whatever order they come in
const byName = (a: { name: string; key: string }, b: { name: string; key: string }): number =>
  a.name.localeCompare(b.name, 'en') || byText(a.key, b.key);
const unitOf = <P>(name: string, of: readonly Goes<P>[]): Unit<P> => ({
  name,
  key: of.map((o) => o.key).join('+'),
  people: of.map((o) => o.person),
});

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
        unit: unitOf(alike && c !== null ? c.name : g.name, one),
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
  // more than half of everyone is a line no other is as big as: of two alike in size, neither is more than half
  for (const l of lines.filter((x) => x.people > MANY))
    l.called = lines.length === 1 ? 'Everyone' : 2 * l.people > total ? 'Everyone else' : `${l.people} people`;
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
      byName(a.line.units[0] ?? { name: '', key: '' }, b.line.units[0] ?? { name: '', key: '' }) ||
      byText(travelKey(a.line.travel), travelKey(b.line.travel)),
  );
  const out = lines.map((l) => l.line);
  call(out, goers.length, all.length);
  // named lines, then those called by number, then "Everyone else", in their order; those who have not said last
  const rank = (l: Line<P>, i: number) =>
    lines[i]?.none ? 3 : l.called === null || l.called === 'Everyone' ? 0 : l.called === 'Everyone else' ? 2 : 1;
  return out
    .map((l, i) => ({ l, r: rank(l, i), i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ l }) => l);
}
// ----- by where they stay -----
// a place of a roster seen by where its people stay: the place (null: those who said none), who stays there and on
// which nights, the nights anyone stays there and those everyone there does (null when they share none), and how many
// people, its names called by number when more than three
export interface Place<P> {
  place: string | null;
  units: Unit<P>[];
  people: number;
  nights: { first: string; last: string } | null;
  shared: { first: string; last: string } | null;
  stays: { person: P; key: string; first: string; last: string }[];
  called: string | null;
}

// The places of a roster: a line a place, the most people first and those who said none last; someone who changes
// place is on each place's line for their nights there. A couple is one unit at a place when both partners stay there
// on the same nights.
export function byPlace<P>(goers: readonly Goes<P>[]): Place<P>[] {
  type Here = { stays: Place<P>['stays']; who: Map<Goes<P>, string> };
  const at = new Map<string | null, Here>();
  const of = (place: string | null): Here => {
    const p: Here = at.get(place) ?? { stays: [], who: new Map() };
    at.set(place, p);
    return p;
  };
  for (const g of goers) {
    if (g.stays.length === 0) of(null).who.set(g, '');
    for (const s of g.stays) {
      const p = of(s.place);
      p.stays.push({ person: g.person, key: g.key, first: s.first, last: s.last });
      p.who.set(g, `${p.who.get(g) ?? ''};${s.first}..${s.last}`);
    }
  }
  const places = [...at].map(([place, { stays, who }]): Place<P> => {
    const here = [...who.keys()];
    const named: Unit<P>[] = [];
    const done = new Set<Goes<P>>();
    for (const g of here.toSorted(byName)) {
      if (done.has(g)) continue;
      const c = g.couple;
      const partners = c === null ? [] : here.filter((o) => o.couple?.key === c.key);
      const alike = c !== null && partners.length > 1 && partners.every((o) => who.get(o) === who.get(g));
      const one = alike ? partners.toSorted(byName) : [g];
      named.push(unitOf(alike && c !== null ? c.name : g.name, one));
      for (const o of one) done.add(o);
    }
    const firsts = stays.map((s) => s.first).toSorted(byText),
      lasts = stays.map((s) => s.last).toSorted(byText);
    // the nights all of them stay: from the latest of each one's first night to the earliest of each one's last
    const spans = here.map((g) => {
      const mine = stays.filter((s) => s.person === g.person);
      return {
        first: mine.map((s) => s.first).toSorted(byText)[0] ?? '',
        last:
          mine
            .map((s) => s.last)
            .toSorted(byText)
            .at(-1) ?? '',
      };
    });
    const from =
        spans
          .map((s) => s.first)
          .toSorted(byText)
          .at(-1) ?? '',
      to = spans.map((s) => s.last).toSorted(byText)[0] ?? '';
    return {
      place,
      units: named.toSorted(byName),
      people: here.length,
      nights: place === null ? null : { first: firsts[0] ?? '', last: lasts.at(-1) ?? '' },
      shared: place === null || from > to ? null : { first: from, last: to },
      stays: stays.toSorted((a, b) => byText(a.first, b.first) || byText(a.key, b.key)),
      called: here.length > MANY ? `${here.length} people` : null,
    };
  });
  return places.sort(
    (a, b) =>
      Number(a.place === null) - Number(b.place === null) ||
      b.people - a.people ||
      (a.place ?? '').localeCompare(b.place ?? '', 'en'),
  );
}

// A unit's own nights at a place, when they are not all of the place's nights; else null.
export function ownNights<P>(p: Place<P>, u: Unit<P>): { first: string; last: string } | null {
  const mine = p.stays.filter((s) => u.people.includes(s.person));
  const first = mine.map((s) => s.first).toSorted(byText)[0],
    last = mine
      .map((s) => s.last)
      .toSorted(byText)
      .at(-1);
  if (p.nights === null || first === undefined || last === undefined) return null;
  return first === p.nights.first && last === p.nights.last ? null : { first, last };
}
