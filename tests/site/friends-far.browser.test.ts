// The Friends tab near the site's home city and everywhere, with Siân moved 2.07° of latitude north of it (about 230
// km), and seven people sharing their plans 1.62° north (about 180 km), all going to the Albania Afrolatin Festival;
// and Cédric going to Riga in September, without Christina. On 4 November 2026, before Glasgow.
import { expect, test } from 'vitest';
import { friendsHref, type Params } from '../../site/routes.ts';
import { KEY } from '../../site/states.ts';
import { startSite } from './app.ts';
import { ALBANIA, RIGA } from './community.fixture.ts';
import { homeOf, planned, sharer } from './planted.ts';
import { goer, listOf, rowOf, shownDialog } from './seen.ts';

const NEAR = ['Ola', 'Kari', 'Per', 'Nils', 'Eva', 'Liv', 'Siri'];
let home = ''; // the site's home city, by its name
const app = await startSite({
  now: '2026-11-04',
  plant: (db) => {
    const city = homeOf(db);
    home = city.name;
    // a city this many degrees north of the home city, by its key and name
    const north = (key: string, name: string, degrees: number) =>
      db.run(
        'INSERT INTO cities (key, name, country_code, lat, lon) SELECT ?, ?, country_code, lat + ?, lon FROM cities WHERE key = ?',
        [key, name, degrees, city.key],
      );
    north('elsewhere-no', 'Elsewhere', 2.07);
    north('nearby-no', 'Nearby', 1.62);
    db.run("UPDATE people SET home = 'elsewhere-no' WHERE key = 'sian'");
    for (const name of NEAR) {
      sharer(db, name.toLowerCase(), name, 'nearby-no');
      planned(db, name.toLowerCase(), ALBANIA, KEY.plan.GOING);
    }
    planned(db, 'cedric', RIGA, KEY.plan.GOING);
  },
});
// the list at an address's choices: who shares plans, and each festival's lines, by the start of its name
async function listed(params?: Params) {
  await app.open(friendsHref(params));
  return { who: listOf().who, linesOf: (name: string) => rowOf(name)?.lines };
}

test('the Friends tab lists only the people living within 200 km of the home city, and Everywhere everyone', async () => {
  expect(home).not.toBe('');
  // near: Cédric, Christina and the seven about 180 km away, not Siân, about 230 km away
  const near = await listed();
  expect(near.who).toBe(`${NEAR.length + 2} people within 200 km of ${home} share their plans.`);
  expect(near.linesOf('Albania')?.[0]).toMatch(/^going: /u);
  // and the festivals name only the people near: Glasgow, Christina without Siân; Prague Kwanza, where only Siân may
  // go, not at all
  expect(near.linesOf('Glasgow')).toEqual(['teaching: Christina']);
  expect(near.linesOf('Prague Kwanza')).toBeUndefined();
  // everywhere: everyone, Siân with them
  const everywhere = await listed({ in: 'everywhere' });
  expect(everywhere.who).toBe(`${NEAR.length + 3} people share their plans.`);
  expect(everywhere.linesOf('Glasgow')).toEqual(['teaching: Christina and Siân']);
  expect(everywhere.linesOf('Prague Kwanza')).toEqual(['maybe: Siân']);
  // someone's festivals with others, from their plans: near home while they live there, else everywhere, whichever
  // list the name was on
  goer('Siân')?.click();
  const peek = shownDialog('.peek-close');
  const together = () => peek.querySelector('.peek-foot a:last-child')?.getAttribute('href');
  expect(together()).toBe(friendsHref({ in: 'everywhere', with: 'sian' }));
  goer('Cédric')?.click();
  expect(together()).toBe(friendsHref({ with: 'cedric' }));
});
