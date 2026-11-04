// The roster's lines: a line a travel, in and out; stays counted on it; a couple one unit only when its partners'
// travel and stays are alike; what each line is called. The cases of twenty people, then the laws any roster keeps,
// over rosters drawn at random (from a fixed seed).
import { describe, expect, it } from 'vitest';
import {
  byPlace,
  type Flights,
  type Goes,
  type Line,
  ownNights,
  type Place,
  roster,
  type Stay,
} from '../../site/roster.ts';

// how someone flies, in and out, each end said or not, from and to one airport
const F = (arrive: string | null, leave: string | null, at = 'OSL'): Flights => ({
  arrive,
  arrive_at: arrive === null ? null : at,
  leave,
  leave_from: leave === null ? null : at,
});
// a stay of every night of KUOF's days, Thursday to Sunday
const all = (place: string): Stay[] => [{ first: '2026-11-19', last: '2026-11-22', place }];
const THU = '2026-11-19T17:05',
  FRI = '2026-11-20T09:00',
  FRI2 = '2026-11-20T16:00',
  MON = '2026-11-23T09:40',
  SUN = '2026-11-22T18:00',
  TUE = '2026-11-24T07:15';
const S = 'Scandic Holberg',
  C = 'Comfort Xpress',
  A = 'Airbnb',
  R = 'Radisson Blu';
// twenty people: four couples' partners, then twelve singles, in this order
const COUPLES = [
  ['Cédric', 'Christina'],
  ['Maja', 'Jonas'],
  ['Ingrid', 'Lars'],
  ['Sofie', 'Henrik'],
] as const;
const SINGLES = ['Tonje', 'Ragnhild', 'Kari', 'Mette', 'Anne', 'Per', 'Ola', 'Nora', 'Emma', 'Erik', 'Lise', 'Hanna'];
const PEOPLE = [
  ...COUPLES.flatMap(([a, b], i) => [
    { name: a, couple: { key: `c${i}`, name: `${a} & ${b}` } },
    { name: b, couple: { key: `c${i}`, name: `${a} & ${b}` } },
  ]),
  ...SINGLES.map((name) => ({ name, couple: null })),
];
type Said = Pick<Goes<string>, 'travel' | 'stays'>;
const NOTHING: Said = { travel: null, stays: [] };
// the twenty, each saying what f says of the i-th
const twenty = (f: (i: number, name: string) => Said): Goes<string>[] =>
  PEOPLE.map((p, i) => ({ person: p.name, name: p.name, couple: p.couple, ...f(i, p.name) }));
// flights in and out, and a stay of every night (none: not said)
const T = (a: string | null, l: string | null, place: string | null, at = 'OSL'): Said => ({
  travel: F(a, l, at),
  stays: place === null ? [] : all(place),
});
// the i-th of xs, round and round
const nth = (xs: readonly string[], i: number): string => xs[i % xs.length] ?? '';

const CASES = {
  '1': twenty(() => T(THU, MON, S)),
  '2': twenty((i) => T(THU, MON, i % 3 === 0 ? null : S)),
  '3': twenty((i) => T(THU, MON, i >= 17 ? A : S)),
  '4': twenty((i) => (i < 10 ? T(THU, MON, S) : T(FRI, SUN, C))),
  '5': twenty((i) => T(i < 12 ? THU : i < 17 ? FRI : FRI2, MON, S)),
  // Tonje in an Airbnb on Thursday night, then at the hotel
  '6': twenty((_, n) =>
    n === 'Tonje'
      ? {
          travel: F(THU, MON),
          stays: [
            { first: '2026-11-19', last: '2026-11-19', place: A },
            { first: '2026-11-20', last: '2026-11-22', place: S },
          ],
        }
      : T(THU, MON, S),
  ),
  '7': twenty((i) => T(THU, MON, i < 8 ? S : i < 14 ? C : i < 18 ? R : A)),
  '8': twenty((i) => T(nth([THU, FRI, FRI2, THU, FRI], i), nth([MON, MON, SUN, SUN, TUE], i), S)),
  '9': twenty((_, n) => T(n === 'Christina' ? FRI : THU, MON, S)),
  '10': twenty((i) => (i >= 16 ? T(THU, null, S) : T(THU, MON, S))),
  '11': twenty((i) => (i >= 17 ? { travel: null, stays: all(C) } : T(THU, MON, S))),
  '12': twenty((i) =>
    T(nth([THU, FRI, FRI2, THU, FRI, THU, FRI2], i), nth([MON, SUN, MON, SUN, TUE, TUE, SUN], i), nth([S, C, R], i)),
  ),
  '13': twenty((i) =>
    i < 7
      ? T(THU, MON, S)
      : i < 13
        ? T(FRI, SUN, C)
        : T(`2026-11-2${i % 2 ? 0 : 1}T1${i - 13}:00`, i % 2 ? MON : SUN, nth([S, C, R, A], i)),
  ),
  '14': twenty(() => NOTHING),
  '15': twenty((i) => (i < 4 ? T(THU, MON, S) : NOTHING)),
  '16': twenty((i) => (i < 8 ? T(THU, MON, S) : i < 16 ? T(FRI, SUN, C) : T(FRI2, TUE, nth([S, C, R, A], i)))),
  '17': twenty((i) => T(THU, MON, i === 19 ? C : S)),
  '18': twenty((i) => (i < 3 ? T(THU, MON, S) : NOTHING)).slice(0, 3),
  '19': twenty((i) => T(THU, MON, i % 2 ? null : S)),
  '20': twenty((i) => T(THU, MON, S, i < 3 ? 'TRF' : 'OSL')),
};
// a line as a sentence: what it is called (its units' names when not otherwise), its people, its travel, its stays
const shown = (lines: readonly Line<string>[]) =>
  lines.map((l) => {
    const t =
      l.travel === null
        ? l.nights === null
          ? 'not said'
          : 'stays only'
        : `${l.travel.arrive?.slice(8) ?? '?'} ${l.travel.arrive_at ?? ''} → ${l.travel.leave?.slice(8) ?? '?'}`;
    return `${l.called ?? l.units.map((u) => u.name).join(', ')} [${l.people}] ${t} | ${l.buckets
      .map((b) => `${b.place ?? 'not said'} ${b.people}`)
      .join(' · ')}`;
  });

describe('a few more', () => {
  const one = (name: string, said: Said): Goes<string> => ({ person: name, name, couple: null, ...said });
  it('of two named lines alike in their times, the first by first name, whatever their size', () => {
    const lines = roster([
      one('Ann', T(THU, MON, S, 'TRF')),
      ...['Ola', 'Per', 'Siv'].map((n) => one(n, T(THU, MON, S))),
    ]);
    expect(shown(lines)).toEqual([
      'Ann [1] 19T17:05 TRF → 23T09:40 | Scandic Holberg 1',
      'Ola, Per, Siv [3] 19T17:05 OSL → 23T09:40 | Scandic Holberg 3',
    ]);
  });
  it('a line of three people is named, though it is more than half of everyone of four units', () => {
    // KUOF: Cédric & Christina on their flight, and the three added, who have said nothing: 3 of 5
    const kuof = [
      ...['Cédric', 'Christina'].map(
        (name): Goes<string> => ({
          person: name,
          name,
          couple: { key: 'cc', name: 'Cédric & Christina' },
          ...T(THU, MON, S),
        }),
      ),
      ...['Tonje', 'Ragnhild', 'Maja'].map((n) => one(n, NOTHING)),
    ];
    expect(shown(roster(kuof))).toEqual([
      'Cédric & Christina [2] 19T17:05 OSL → 23T09:40 | Scandic Holberg 2',
      'Maja, Ragnhild, Tonje [3] not said | not said 3',
    ]);
  });
  it('someone who said only where they stay is not among those who have said nothing', () => {
    const lines = roster([one('Ann', { travel: null, stays: all(C) }), one('Bo', NOTHING), one('Cy', NOTHING)]);
    expect(shown(lines)).toEqual(['Ann [1] stays only | Comfort Xpress 1', 'Bo, Cy [2] not said | not said 2']);
  });
});

describe('twenty people', () => {
  it('1 · everyone alike: one line, "Everyone"', () => {
    expect(shown(roster(CASES['1']))).toEqual(['Everyone [20] 19T17:05 OSL → 23T09:40 | Scandic Holberg 20']);
  });

  it('2 · one flight, 13 at a hotel and 7 saying none: one line, its stays counted, the couples torn apart', () => {
    expect(shown(roster(CASES['2']))).toEqual([
      'Everyone [20] 19T17:05 OSL → 23T09:40 | Scandic Holberg 13 · not said 7',
    ]);
  });

  it('3 · one flight, three in an Airbnb: one line, two stays', () => {
    expect(shown(roster(CASES['3']))).toEqual([
      'Everyone [20] 19T17:05 OSL → 23T09:40 | Scandic Holberg 17 · Airbnb 3',
    ]);
  });

  it('4 · ten and ten: a tie, so both are "10 people"', () => {
    expect(shown(roster(CASES['4']))).toEqual([
      '10 people [10] 19T17:05 OSL → 23T09:40 | Scandic Holberg 10',
      '10 people [10] 20T09:00 OSL → 22T18:00 | Comfort Xpress 10',
    ]);
  });

  it('5 · staggered arrivals, 12, 5 and 3: the three named first, "5 people", then "Everyone else"', () => {
    expect(shown(roster(CASES['5']))).toEqual([
      'Erik, Hanna, Lise [3] 20T16:00 OSL → 23T09:40 | Scandic Holberg 3',
      '5 people [5] 20T09:00 OSL → 23T09:40 | Scandic Holberg 5',
      'Everyone else [12] 19T17:05 OSL → 23T09:40 | Scandic Holberg 12',
    ]);
  });

  it('6 · a stay change: on the one line, counted as "Airbnb → Scandic Holberg"', () => {
    expect(shown(roster(CASES['6']))).toEqual([
      'Everyone [20] 19T17:05 OSL → 23T09:40 | Scandic Holberg 19 · Airbnb → Scandic Holberg 1',
    ]);
  });

  it('7 · one flight, four hotels: one line, four stays, the biggest first', () => {
    expect(shown(roster(CASES['7']))).toEqual([
      'Everyone [20] 19T17:05 OSL → 23T09:40 | Scandic Holberg 8 · Comfort Xpress 6 · Radisson Blu 4 · Airbnb 2',
    ]);
  });

  it('8 · one hotel, five flights: five lines of "4 people", by arrival then departure', () => {
    expect(shown(roster(CASES['8']))).toEqual([
      '4 people [4] 19T17:05 OSL → 22T18:00 | Scandic Holberg 4',
      '4 people [4] 19T17:05 OSL → 23T09:40 | Scandic Holberg 4',
      '4 people [4] 20T09:00 OSL → 23T09:40 | Scandic Holberg 4',
      '4 people [4] 20T09:00 OSL → 24T07:15 | Scandic Holberg 4',
      '4 people [4] 20T16:00 OSL → 22T18:00 | Scandic Holberg 4',
    ]);
  });

  it('9 · a couple apart: Christina on her own line, named, before Cédric on the big one', () => {
    expect(shown(roster(CASES['9']))).toEqual([
      'Christina [1] 20T09:00 OSL → 23T09:40 | Scandic Holberg 1',
      'Everyone else [19] 19T17:05 OSL → 23T09:40 | Scandic Holberg 19',
    ]);
  });

  it('10 · a departure not said: its own line, of four, before "Everyone else"', () => {
    expect(shown(roster(CASES['10']))).toEqual([
      '4 people [4] 19T17:05 OSL → ? | Scandic Holberg 4',
      'Everyone else [16] 19T17:05 OSL → 23T09:40 | Scandic Holberg 16',
    ]);
  });

  it('11 · only a stay, no flights: a line of its own, not with those who have not said', () => {
    expect(shown(roster(CASES['11']))).toEqual([
      'Erik, Hanna, Lise [3] stays only | Comfort Xpress 3',
      'Everyone else [17] 19T17:05 OSL → 23T09:40 | Scandic Holberg 17',
    ]);
  });

  it('12 · many tiny groups, none of more than three: every line named', () => {
    expect(shown(roster(CASES['12']))).toEqual([
      'Erik, Jonas, Kari [3] 19T17:05 OSL → 22T18:00 | Comfort Xpress 1 · Radisson Blu 1 · Scandic Holberg 1',
      'Cédric, Henrik, Ola [3] 19T17:05 OSL → 23T09:40 | Comfort Xpress 1 · Radisson Blu 1 · Scandic Holberg 1',
      'Anne, Hanna, Lars [3] 19T17:05 OSL → 24T07:15 | Comfort Xpress 1 · Radisson Blu 1 · Scandic Holberg 1',
      'Christina, Nora, Tonje [3] 20T09:00 OSL → 22T18:00 | Comfort Xpress 1 · Radisson Blu 1 · Scandic Holberg 1',
      'Ingrid, Lise, Mette [3] 20T09:00 OSL → 24T07:15 | Comfort Xpress 1 · Radisson Blu 1 · Scandic Holberg 1',
      'Per, Sofie [2] 20T16:00 OSL → 22T18:00 | Comfort Xpress 1 · Scandic Holberg 1',
      'Emma, Maja, Ragnhild [3] 20T16:00 OSL → 23T09:40 | Comfort Xpress 1 · Radisson Blu 1 · Scandic Holberg 1',
    ]);
  });

  it('13 · two big groups, neither a majority, called by number after the seven named', () => {
    expect(shown(roster(CASES['13']))).toEqual([
      'Per [1] 20T10:00 OSL → 23T09:40 | Comfort Xpress 1',
      'Nora [1] 20T12:00 OSL → 23T09:40 | Airbnb 1',
      'Erik [1] 20T14:00 OSL → 23T09:40 | Comfort Xpress 1',
      'Hanna [1] 20T16:00 OSL → 23T09:40 | Airbnb 1',
      'Ola [1] 21T11:00 OSL → 22T18:00 | Radisson Blu 1',
      'Emma [1] 21T13:00 OSL → 22T18:00 | Scandic Holberg 1',
      'Lise [1] 21T15:00 OSL → 22T18:00 | Radisson Blu 1',
      '7 people [7] 19T17:05 OSL → 23T09:40 | Scandic Holberg 7',
      '6 people [6] 20T09:00 OSL → 22T18:00 | Comfort Xpress 6',
    ]);
  });

  it('14 · nobody said anything: "Everyone", on the line of those who have not said', () => {
    expect(shown(roster(CASES['14']))).toEqual(['Everyone [20] not said | not said 20']);
  });

  it('15 · four said, sixteen nothing: those who have not said last, "Everyone else"', () => {
    expect(shown(roster(CASES['15']))).toEqual([
      '4 people [4] 19T17:05 OSL → 23T09:40 | Scandic Holberg 4',
      'Everyone else [16] not said | not said 16',
    ]);
  });

  it('16 · a tie of eight and eight, and four on their own flight', () => {
    expect(shown(roster(CASES['16']))).toEqual([
      '8 people [8] 19T17:05 OSL → 23T09:40 | Scandic Holberg 8',
      '8 people [8] 20T09:00 OSL → 22T18:00 | Comfort Xpress 8',
      '4 people [4] 20T16:00 OSL → 24T07:15 | Airbnb 1 · Comfort Xpress 1 · Radisson Blu 1 · Scandic Holberg 1',
    ]);
  });

  it('17 · one flight, 19 at a hotel, 1 at another', () => {
    expect(shown(roster(CASES['17']))).toEqual([
      'Everyone [20] 19T17:05 OSL → 23T09:40 | Scandic Holberg 19 · Comfort Xpress 1',
    ]);
  });

  it('18 · three people only: named', () => {
    expect(shown(roster(CASES['18']))).toEqual([
      'Cédric & Christina, Maja [3] 19T17:05 OSL → 23T09:40 | Scandic Holberg 3',
    ]);
  });

  it('19 · one flight, half at a hotel, half saying none', () => {
    expect(shown(roster(CASES['19']))).toEqual([
      'Everyone [20] 19T17:05 OSL → 23T09:40 | Scandic Holberg 10 · not said 10',
    ]);
  });

  it('20 · same days, another airport for three: named, before "Everyone else"', () => {
    expect(shown(roster(CASES['20']))).toEqual([
      'Cédric & Christina, Maja [3] 19T17:05 TRF → 23T09:40 | Scandic Holberg 3',
      'Everyone else [17] 19T17:05 OSL → 23T09:40 | Scandic Holberg 17',
    ]);
  });
});

// ----- the laws, over rosters drawn at random -----
// a generator of numbers in [0, 1), the same for a seed (mulberry32)
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const ARRIVALS = [null, THU, FRI];
const DEPARTURES = [null, SUN, MON];
const STAYS: readonly Stay[][] = [
  [],
  all(S),
  all(C),
  [
    { first: '2026-11-19', last: '2026-11-19', place: A },
    { first: '2026-11-20', last: '2026-11-22', place: S },
  ],
];
// a roster of one to twenty-four people, some in couples (an odd one with the even one before it), each saying a
// little, much or nothing
function drawn(seed: number): Goes<string>[] {
  const r = random(seed);
  const pick = <X>(xs: readonly X[]): X | undefined => xs[Math.floor(r() * xs.length)];
  const n = 1 + Math.floor(r() * 24);
  const paired = new Set(Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 1 && r() < 0.5));
  return Array.from({ length: n }, (_, i): Goes<string> => {
    const mate = paired.has(i) ? i - 1 : paired.has(i + 1) ? i : null;
    const said = r();
    const travel =
      said < 0.15
        ? null
        : {
            arrive: pick(ARRIVALS) ?? null,
            arrive_at: pick(['OSL', 'TRF']) ?? null,
            leave: pick(DEPARTURES) ?? null,
            leave_from: 'OSL',
          };
    return {
      person: `p${i}`,
      name: `p${i}`,
      couple: mate === null ? null : { key: `c${mate}`, name: `p${mate} & p${mate + 1}` },
      travel,
      stays: said < 0.1 ? [] : (pick(STAYS) ?? []),
    };
  });
}
const sorted = (xs: readonly string[]) => xs.toSorted((a, b) => a.localeCompare(b));
// a roster in full: its lines, each called, its units and their people, its travel and its stays
const full = (lines: readonly Line<string>[]) => JSON.stringify(lines);
// each person's line, by its index
const lineOf = (lines: readonly Line<string>[]) =>
  new Map(lines.flatMap((l, i) => l.units.flatMap((u) => u.people.map((p) => [p, i] as const))));
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('the laws of any roster', () => {
  it('each person is on exactly one line; the lines’ people are everyone; a line’s stays count its people', () => {
    for (const seed of SEEDS) {
      const goers = drawn(seed);
      const lines = roster(goers);
      const on = lines.flatMap((l) => l.units.flatMap((u) => u.people));
      expect(sorted(on)).toEqual(sorted(goers.map((g) => g.person)));
      expect(lines.reduce((n, l) => n + l.people, 0)).toBe(goers.length);
      for (const l of lines) {
        expect(l.buckets.reduce((n, b) => n + b.people, 0)).toBe(l.people);
        expect(sorted(l.buckets.flatMap((b) => b.units.map((u) => u.name)))).toEqual(
          sorted(l.units.map((u) => u.name)),
        );
      }
    }
  });

  it('the same people in any order make the same roster, and the same each time', () => {
    for (const seed of SEEDS) {
      const goers = drawn(seed);
      const r = random(seed * 7);
      const shuffled = goers
        .map((g) => [r(), g] as const)
        .toSorted(([a], [b]) => a - b)
        .map(([, g]) => g);
      expect(full(roster(shuffled))).toBe(full(roster(goers)));
      expect(full(roster(goers))).toBe(full(roster(goers)));
    }
  });

  it('someone flying in at another time moves alone: everyone else keeps the same company', () => {
    for (const seed of SEEDS) {
      const goers = drawn(seed);
      const moved = goers.find((g) => g.couple === null);
      if (moved === undefined) continue;
      const after = goers.map((g) =>
        g === moved ? { ...g, travel: { ...F('2026-11-18T06:00', null), leave: g.travel?.leave ?? null } } : g,
      );
      const [was, now] = [lineOf(roster(goers)), lineOf(roster(after))];
      const others = goers.filter((g) => g !== moved).map((g) => g.person);
      for (const a of others) for (const b of others) expect(was.get(a) === was.get(b)).toBe(now.get(a) === now.get(b));
    }
  });

  it('the named lines come first, by arrival, departure and name; then those by number; "Everyone else"; the silent', () => {
    const rank = (l: Line<string>) =>
      l.travel === null && l.nights === null
        ? 3
        : l.called === null || l.called === 'Everyone'
          ? 0
          : l.called === 'Everyone else'
            ? 2
            : 1;
    const at = (l: Line<string>) => [l.travel?.arrive ?? '~', l.travel?.leave ?? '~', l.units[0]?.name ?? ''];
    for (const seed of SEEDS) {
      const lines = roster(drawn(seed));
      const ranks = lines.map(rank);
      expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
      const named = lines.filter((l) => rank(l) === 0).map(at);
      expect(named).toEqual(
        named.toSorted((a, b) => (a.join(' ') < b.join(' ') ? -1 : a.join(' ') > b.join(' ') ? 1 : 0)),
      );
    }
  });

  it('saying more of where one stays never puts two people of different lines on one', () => {
    for (const seed of SEEDS) {
      const goers = drawn(seed);
      const before = lineOf(roster(goers));
      // of those who said something: someone who said nothing and says a stay leaves the line of those who have not
      // said for the line of those who said a stay alone, which is the one way a person joins another line
      for (const g of goers.filter((o) => o.travel !== null || o.stays.length > 0).slice(0, 3)) {
        const after = lineOf(roster(goers.map((o) => (o === g ? { ...o, stays: all(R) } : o))));
        const joined = goers.flatMap((a) =>
          goers.filter(
            (b) => before.get(a.person) !== before.get(b.person) && after.get(a.person) === after.get(b.person),
          ),
        );
        expect(joined).toEqual([]);
      }
    }
  });
});

// ----- the same people by where they stay -----
// a place line as a sentence: the place, its people (or what they are called), its nights and those all share
const placed = (places: readonly Place<string>[]) =>
  places.map(
    (p) =>
      `${p.place ?? 'no place'} [${p.people}] ${p.called ?? p.units.map((u) => u.name).join(', ')}${
        p.nights === null ? '' : ` ${p.nights.first.slice(8)}–${p.nights.last.slice(8)}`
      }${p.shared === null ? '' : ` all ${p.shared.first.slice(8)}–${p.shared.last.slice(8)}`}`,
  );
// each person's nights, as person|night
const nightsOf = (person: string, first: string, last: string) => {
  const out: string[] = [];
  for (let d = first; d <= last; d = `2026-11-${String(Number(d.slice(8)) + 1).padStart(2, '0')}`)
    out.push(`${person}|${d}`);
  return out;
};

describe('by where they stay', () => {
  it('a line a place, the most people first; someone moving on each, for their nights; no place said last', () => {
    expect(placed(byPlace(CASES['6']))).toEqual([
      'Scandic Holberg [20] 20 people 19–22 all 20–22',
      'Airbnb [1] Tonje 19–19 all 19–19',
    ]);
    expect(placed(byPlace(CASES['7']))).toEqual([
      'Scandic Holberg [8] 8 people 19–22 all 19–22',
      'Comfort Xpress [6] 6 people 19–22 all 19–22',
      'Radisson Blu [4] 4 people 19–22 all 19–22',
      'Airbnb [2] Hanna, Lise 19–22 all 19–22',
    ]);
    // a couple at one place on the same nights is one unit; three or fewer named, more by number
    expect(placed(byPlace(CASES['15']))).toEqual([
      'Scandic Holberg [4] 4 people 19–22 all 19–22',
      'no place [16] 16 people',
    ]);
  });

  it('each one’s own nights at a place, when not all of its nights: Tonje at the Airbnb all its nights, Nora not', () => {
    const [scandic, airbnb] = byPlace(CASES['6']);
    const at = (p: Place<string> | undefined, name: string) => {
      const u = p?.units.find((x) => x.name === name);
      return p && u ? ownNights(p, u) : undefined;
    };
    expect(at(scandic, 'Tonje')).toEqual({ first: '2026-11-20', last: '2026-11-22' });
    expect(at(scandic, 'Anne')).toBeNull();
    expect(at(airbnb, 'Tonje')).toBeNull();
  });

  it('every night of everyone is on the line of its place, once; everyone with none on the last', () => {
    for (const seed of SEEDS) {
      const goers = drawn(seed);
      const places = byPlace(goers);
      const said = goers.flatMap((g) => g.stays.flatMap((s) => nightsOf(g.person, s.first, s.last)));
      const drawnNights = places.flatMap((p) => p.stays.flatMap((s) => nightsOf(s.person, s.first, s.last)));
      expect(sorted(drawnNights)).toEqual(sorted(said));
      // each line's people are those with nights there, its count theirs
      for (const p of places) expect(p.people).toBe(p.units.reduce((n, u) => n + u.people.length, 0));
      for (const p of places.filter((x) => x.place !== null))
        expect(new Set(p.stays.map((s) => s.person)).size).toBe(p.people);
      const none = places.find((p) => p.place === null);
      expect(sorted(none?.units.flatMap((u) => u.people) ?? [])).toEqual(
        sorted(goers.filter((g) => g.stays.length === 0).map((g) => g.person)),
      );
      expect(places.findIndex((p) => p.place === null)).toBe(none === undefined ? -1 : places.length - 1);
    }
  });
});
