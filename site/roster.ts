// A trip's roster, on its people alone: who travels together, and what each line of it is called. A couple is one unit
// when both partners arrive, leave and stay alike (or both have said nothing), else each partner is one; anyone else is a
// unit of one. Units that arrive, leave and stay alike are one line, and having said nothing is a line of its own. With
// more than three units, the line of the most people (more than three of them) is "Everyone", or "Everyone else" beside
// others; every other line names its units.

// how someone travels: arrive and leave as local times (YYYY-MM-DDTHH:MM), the airports when they fly, where they stay
export interface Travel {
  arrive: string;
  arrive_at: string | null;
  leave: string;
  leave_from: string | null;
  stay: string | null;
}
// someone going: who they are, the couple they are in when both partners go, and how they travel (null: not said)
export interface Goes<P> {
  person: P;
  name: string;
  couple: { key: string; name: string } | null;
  travel: Travel | null;
}
// a unit: one person, or a couple that travels alike, by its name
export interface Unit<P> {
  name: string;
  people: P[];
}
// a line of the roster: its units, how many people, how they travel (null: not said), and what it is called, a
// collective name ("Everyone", "Everyone else") when it is one
export interface Line<P> {
  units: Unit<P>[];
  people: number;
  travel: Travel | null;
  collective: 'Everyone' | 'Everyone else' | null;
}

const MANY = 3; // a roster of more units than this calls its biggest line collectively, when it is more people than this

// how a unit travels, as one key (an unknown airport or stay as empty): alike travel, alike key; nothing said, the
// empty key
const keyOf = (t: Travel | null): string =>
  t === null ? '' : [t.arrive, t.arrive_at, t.leave, t.leave_from, t.stay].join('|');

// the units: each couple as one when its partners travel alike, else each partner, and everyone else alone
function units<P>(goers: readonly Goes<P>[]): { unit: Unit<P>; travel: Travel | null }[] {
  const out: { unit: Unit<P>; travel: Travel | null }[] = [];
  const done = new Set<Goes<P>>();
  for (const g of goers) {
    if (done.has(g)) continue;
    const c = g.couple;
    const partners = c === null ? [g] : goers.filter((o) => o.couple?.key === c.key);
    if (c !== null && partners.length > 1 && partners.every((o) => keyOf(o.travel) === keyOf(g.travel))) {
      out.push({ unit: { name: c.name, people: partners.map((o) => o.person) }, travel: g.travel });
      for (const o of partners) done.add(o);
    } else {
      out.push({ unit: { name: g.name, people: [g.person] }, travel: g.travel });
      done.add(g);
    }
  }
  return out;
}

// The lines of a roster, first to arrive first and those who have said nothing last, each named.
export function roster<P>(goers: readonly Goes<P>[]): Line<P>[] {
  const all = units(goers);
  const byKey = new Map<string, Line<P>>();
  for (const { unit, travel } of all) {
    const key = keyOf(travel);
    const line = byKey.get(key) ?? { units: [], people: 0, travel, collective: null };
    line.units.push(unit);
    line.people += unit.people.length;
    byKey.set(key, line);
  }
  // first to arrive first; alike arrivals by when they leave and where they stay; nothing said last
  const lines = [...byKey.entries()]
    .sort(([a, x], [b, y]) => (x.travel === null ? 1 : y.travel === null ? -1 : a.localeCompare(b)))
    .map(([, line]) => line);
  if (all.length <= MANY) return lines;
  // the biggest line, by people: of two alike, the one that arrives first (as the lines are sorted)
  const biggest = lines.reduce((best, l) => (l.people > best.people ? l : best));
  if (biggest.people > MANY) biggest.collective = lines.length === 1 ? 'Everyone' : 'Everyone else';
  return lines;
}
