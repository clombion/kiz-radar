// The roster's lines: who travels alike, a couple as one only when both partners do, and what each line is called.
import { describe, expect, test as it } from 'vitest';
import { type Goes, type Line, roster, type Travel } from '../../site/roster.ts';

// a trip: in on the day, out on the day, at the hotel (none when null)
const trip = (arrive: string, leave = '2026-11-23T09:40', stay: string | null = 'Scandic'): Travel => ({
  arrive,
  arrive_at: 'OSL',
  leave,
  leave_from: 'OSL',
  stay,
});
const THU = trip('2026-11-19T17:05'),
  FRI = trip('2026-11-20T12:00');
const one = (name: string, travel: Travel | null): Goes<string> => ({ person: name, name, couple: null, travel });
// a couple's two partners, each travelling as given
const couple = (names: [string, string], a: Travel | null, b: Travel | null): Goes<string>[] =>
  names.map((name, i) => ({
    person: name,
    name,
    couple: { key: names.join('+'), name: names.join(' & ') },
    travel: i === 0 ? a : b,
  }));
const many = (names: string, travel: Travel | null) => names.split(' ').map((n) => one(n, travel));
// each line as what it shows: its name (a collective one with its units after it), and when it arrives
const shown = (lines: readonly Line<string>[]) =>
  lines.map((l) => ({
    name: `${l.collective === null ? '' : `${l.collective}: `}${l.units.map((u) => u.name).join(', ')}`,
    in: l.travel?.arrive.slice(8, 10) ?? null,
    people: l.people,
  }));

describe('roster', () => {
  it('everyone travelling alike, more than three, is "Everyone"', () => {
    expect(shown(roster(many('A B C D', THU)))).toEqual([{ name: 'Everyone: A, B, C, D', in: '19', people: 4 }]);
  });

  it('one arriving a day after six others is named, the six "Everyone else"', () => {
    expect(shown(roster([...many('A B C', THU), one('Late', FRI), ...many('D E F', THU)]))).toEqual([
      { name: 'Everyone else: A, B, C, D, E, F', in: '19', people: 6 },
      { name: 'Late', in: '20', people: 1 },
    ]);
  });

  it('a couple travelling alike is one unit, named as the couple', () => {
    const lines = roster(couple(['Cédric', 'Christina'], THU, THU));
    expect(lines.map((l) => l.units)).toEqual([[{ name: 'Cédric & Christina', people: ['Cédric', 'Christina'] }]]);
  });

  it('a couple one of whom arrives a day later is two lines, a partner each', () => {
    expect(shown(roster(couple(['Cédric', 'Christina'], THU, FRI)))).toEqual([
      { name: 'Cédric', in: '19', people: 1 },
      { name: 'Christina', in: '20', people: 1 },
    ]);
  });

  it('a couple in different hotels is two lines, though they fly together', () => {
    const lines = roster(couple(['Cédric', 'Christina'], THU, trip('2026-11-19T17:05', undefined, 'Thon')));
    expect(lines.map((l) => [l.units.map((u) => u.name), l.travel?.stay])).toEqual([
      [['Cédric'], 'Scandic'],
      [['Christina'], 'Thon'],
    ]);
  });

  it('a couple who has said nothing is one unit; one partner said and the other not, two', () => {
    expect(shown(roster(couple(['Cédric', 'Christina'], null, null)))).toEqual([
      { name: 'Cédric & Christina', in: null, people: 2 },
    ]);
    expect(shown(roster(couple(['Cédric', 'Christina'], THU, null)))).toEqual([
      { name: 'Cédric', in: '19', people: 1 },
      { name: 'Christina', in: null, people: 1 },
    ]);
  });

  it('travel without a stay is not the same travel with one', () => {
    expect(shown(roster([one('A', THU), one('B', trip('2026-11-19T17:05', undefined, null))]))).toEqual([
      { name: 'B', in: '19', people: 1 },
      { name: 'A', in: '19', people: 1 },
    ]);
  });

  it('three units are all named, however many people they are', () => {
    const lines = roster([...couple(['C', 'D'], THU, THU), ...many('A B', THU)]);
    expect(lines.map((l) => [l.collective, l.people])).toEqual([[null, 4]]);
  });

  it('a biggest line of three people is named, not "Everyone else"', () => {
    const lines = roster([...many('A B C', FRI), one('Early', THU)]);
    expect(lines.map((l) => [l.units.length, l.collective])).toEqual([
      [1, null],
      [3, null],
    ]);
  });

  it('everyone having said nothing is "Everyone", on the line of those who have not said', () => {
    expect(shown(roster(many('A B C D E', null)))).toEqual([{ name: 'Everyone: A, B, C, D, E', in: null, people: 5 }]);
  });

  it('of two lines alike in size the first to arrive is "Everyone else"; those who have not said come last', () => {
    expect(shown(roster([...many('E F G H', FRI), ...many('A B C D', THU)]))).toEqual([
      { name: 'Everyone else: A, B, C, D', in: '19', people: 4 },
      { name: 'E, F, G, H', in: '20', people: 4 },
    ]);
    expect(shown(roster([...many('A B C D', null), ...many('E F G H', FRI)]))).toEqual([
      { name: 'Everyone else: E, F, G, H', in: '20', people: 4 },
      { name: 'A, B, C, D', in: null, people: 4 },
    ]);
  });

  it('the biggest line counts people, so a line of couples beats a line of more single units', () => {
    const lines = roster([
      ...couple(['A', 'B'], FRI, FRI),
      ...couple(['C', 'D'], FRI, FRI),
      ...couple(['E', 'F'], FRI, FRI),
      ...many('G H I', THU),
    ]);
    expect(shown(lines)).toEqual([
      { name: 'G, H, I', in: '19', people: 3 },
      { name: 'Everyone else: A & B, C & D, E & F', in: '20', people: 6 },
    ]);
  });

  it('fifteen people, mixed: lines by arrival, the biggest "Everyone else" in its place, not said last', () => {
    const SAT = trip('2026-11-21T08:00'),
      EARLY = trip('2026-11-18T22:10', '2026-11-24T07:00', null);
    const lines = roster([
      one('Nora', null),
      ...couple(['Cédric', 'Christina'], THU, FRI), // the partners apart
      ...many('Ola Kari Per', FRI),
      ...couple(['Sian', 'Tom'], FRI, FRI), // a couple together, among the Friday ones
      one('Early', EARLY),
      ...many('Liv Siv', SAT),
      ...couple(['Ann', 'Bo'], null, null),
      one('Jo', THU),
      one('Eva', null),
    ]);
    expect(shown(lines)).toEqual([
      { name: 'Early', in: '18', people: 1 },
      { name: 'Cédric, Jo', in: '19', people: 2 },
      { name: 'Everyone else: Christina, Ola, Kari, Per, Sian & Tom', in: '20', people: 6 },
      { name: 'Liv, Siv', in: '21', people: 2 },
      { name: 'Nora, Ann & Bo, Eva', in: null, people: 4 },
    ]);
    expect(lines.reduce((n, l) => n + l.people, 0)).toBe(15);
  });

  it('no one going is no line', () => {
    expect(roster([])).toEqual([]);
  });
});
