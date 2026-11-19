// The Friends tab's lines of who goes, with five more people living in the site's home city: P1 to P4 going to KUOF,
// where Cédric and Christina teach, and P1 to P5 to the Paris Kizomba Congress. On 4 November 2026, before Glasgow.
import { expect, test } from 'vitest';
import { friendsHref } from '../../site/routes.ts';
import { KEY } from '../../site/states.ts';
import { startSite } from './app.ts';
import { KUOF, PARIS } from './community.fixture.ts';
import { homeOf, planned, sharer } from './planted.ts';
import { rowOf } from './seen.ts';

const PEOPLE = ['P1', 'P2', 'P3', 'P4', 'P5'];
const app = await startSite({
  now: '2026-11-04',
  plant: (db) => {
    const home = homeOf(db).key;
    for (const name of PEOPLE) {
      const key = name.toLowerCase();
      sharer(db, key, name, home);
      if (name !== 'P5') planned(db, key, KUOF, KEY.plan.GOING);
      planned(db, key, PARIS, KEY.plan.GOING);
    }
  },
});
// a festival's lines on the list, by the start of its name
const linesOf = (name: string) => rowOf(name)?.lines;

test('a line names up to four people or couples, then three and how many more, the ticked always named', async () => {
  await app.open(friendsHref());
  // four going: all four named, after the line of those teaching
  expect(linesOf('KUOF')).toEqual(['teaching: Cédric & Christina', 'going: P1, P2, P3 and P4']);
  // five going: some named, and how many more of those planted
  const [paris] = linesOf('Paris') ?? [];
  const named = /^going: (?<names>.+) and (?<more>\d+) more$/u.exec(paris ?? '')?.groups;
  const shown = named?.['names']?.split(', ') ?? [];
  expect(shown).toEqual(['P1', 'P2', 'P3']);
  expect(Number(named?.['more'])).toBe(PEOPLE.length - shown.length);
  // the ticked named first, whoever else is
  await app.open(friendsHref({ with: 'p5' }));
  expect(linesOf('Paris')).toEqual([`going: P5, P1, P2 and ${PEOPLE.length - shown.length} more`]);
});
