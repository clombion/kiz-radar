// The Friends tab, the quick view of someone's plans it opens, and a person's page, on the fixture's community (Cédric,
// Christina and Siân, all living in the site's home city) as it stood on 4 November 2026, before Glasgow.
import { expect, test } from 'vitest';
import { friendsHref, type Params, personHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { homeOf } from './planted.ts';
import { goer, listOf, rowOf, said, shownDialog } from './seen.ts';

const main = () => document.querySelector('main');
// the site's home city, by its name
let home = '';
const app = await startSite({
  now: '2026-11-04',
  plant: (db) => {
    home = homeOf(db).name;
  },
});

// the festivals the list shows for an address's choices, by name
async function listed(params?: Params): Promise<(string | undefined)[]> {
  await app.open(friendsHref(params));
  return listOf().rows.map((r) => r.name);
}
const glasgowOf = () => rowOf('Glasgow');

test('the Friends tab lists the festivals of the people near the home city by month, a line for what they do', async () => {
  await app.open(friendsHref());
  const list = listOf();
  // under the title: who shares plans, named while they are few, and who goes next, by city
  expect(list.who).toBe('Christina, Cédric and Siân share their plans.');
  expect(list.when).toMatch(/Next: Glasgow, 6 Nov$/u);
  expect(list.months[0]).toBe('November 2026 · 3 festivals');
  expect(glasgowOf()?.lines).toEqual(['teaching: Christina and Siân']);
  expect(list.rows.map((r) => r.lines[0]?.split(':')[0])).toContain('going');
  // a short list: no bar to narrow it
  expect(list.bar).toBe(false);
  // its places, the tabs under the header: near the home city, the one shown, and everywhere
  expect(home).not.toBe('');
  expect([...document.querySelectorAll('#subnav a')].map((a) => [said(a), a.ariaCurrent])).toEqual([
    [`Near ${home}`, 'page'],
    ['Everywhere', null],
  ]);
});

test('a festival on now says so in the Friends tab, as on its card, and in its Now line', async () => {
  await app.open(friendsHref(), '2026-11-06'); // Glasgow's first day
  expect(listOf().rows.find((r) => r.now)?.name).toContain('Glasgow');
  expect(listOf().when).toMatch(/^Now: Glasgow \(2\) · Next: /u);
  await app.open(friendsHref());
  expect(main()?.querySelector('.now-tag')).toBeNull();
});

test('the Friends tab keeps the festivals all the friends ticked go to, or any of them, and says when none is', async () => {
  const all = await listed();
  const glasgow = all.filter((n) => n?.includes('Glasgow') === true);
  expect(await listed({ with: 'christina,sian' })).toEqual(glasgow); // both teach in Glasgow
  await app.open(friendsHref({ with: 'cedric,sian' }));
  expect(said(main()?.querySelector('.who-list'))).toBe(
    'Cédric and Siân have no festival in common. Show those any of them goes to',
  );
  expect(listOf().count).toBe('0 of 6 festivals in common');
  main()?.querySelector<HTMLButtonElement>('.who-list .link')?.click();
  expect(listOf().rows.length).toBe(all.length); // between them, every one
  expect(await listed({ with: 'cedric,sian', any: 1 })).toHaveLength(all.length);
  // a filter in the address shows the bar, however short the list
  await app.open(friendsHref({ with: 'sian' }));
  expect(listOf().bar).toBe(true);
});

test('a name in the Friends tab opens their plans, with their page and their festivals in common with others', async () => {
  await app.open(friendsHref());
  goer('Siân')?.click();
  const peek = shownDialog('.peek-close');
  const foot = () =>
    [...peek.querySelectorAll<HTMLAnchorElement>('.peek-foot a')].map((a) => [said(a), a.getAttribute('href')]);
  expect(foot()).toEqual([
    ['See their page →', personHref('sian')],
    ['Festivals in common with others →', friendsHref({ with: 'sian' })],
  ]);
  // a couple: both partners ticked
  goer('Cédric & Christina')?.click();
  expect(foot().at(-1)?.[1]).toBe(friendsHref({ with: 'cedric,christina' }));
});

test('the Friends tab narrows the festivals by a festival’s name or city, and by the time ahead', async () => {
  const prague = await listed({ q: 'prague' });
  expect(prague).toHaveLength(2);
  expect(prague.every((n) => n?.includes('Prague') === true)).toBe(true);
  expect(await listed({ q: 'PRÁGUE' })).toEqual(prague);
  const weekend = await listed({ when: 'weekend' }); // 6–8 Nov, the coming weekend
  expect(weekend.length).toBeGreaterThan(0);
  expect(weekend.every((n) => n?.includes('Glasgow') === true)).toBe(true);
  expect((await listed({ when: 'months' })).length).toBeLessThan((await listed()).length);
});

test('a person’s page lists the festivals they said they’re going to', async () => {
  await app.open(personHref('sian'));
  expect(said(main()?.querySelector('h1'))).toBe('Siân’s festival plans');
  expect(main()?.querySelectorAll('.festival-card').length).toBeGreaterThan(0);
  await app.open(personHref('nobody'));
  expect(said(main())).toBe('No one by that name has shared plans.');
});
