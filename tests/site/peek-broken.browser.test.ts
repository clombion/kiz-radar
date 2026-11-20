// A quick view whose part throws as it is drawn (dialog.tsx's boundary around each part): the passes of a festival
// whose ticket page cannot be read, which only their foot reads. The failure is said once, in the console and in a
// line; the dialog opens with its title and passes, nothing in its foot, its × and its history entry working, and opens
// again saying it again, Solid not halted. The page started (app.ts) on every ticket page's count of tickets not read
// yet holding words, in a table rebuilt without its types.
import { expect, test } from 'vitest';
import { festivalsHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { expectConsole } from './console.ts';
import { unreadable } from './planted.ts';
import { entryAt, said, shownDialog } from './seen.ts';

const UNREAD = `CREATE TABLE read AS SELECT * FROM ticket_pages; DROP TABLE ticket_pages;
  CREATE TABLE ticket_pages (event_id integer PRIMARY KEY, page text, reseller text, read_on text, unread);
  INSERT INTO ticket_pages SELECT event_id, page, reseller, read_on, 'planted' FROM read; DROP TABLE read`;
const app = await startSite({ now: '2026-11-01', plant: (db) => unreadable(db, UNREAD) });
const lines = () => [...document.querySelectorAll('[role="alert"]')].map(said);

test('a quick view whose foot cannot be drawn says so once, and opens, closes and opens again', async () => {
  expectConsole('error', /^Kiz Radar: a quick view: TypeError: column unread: "planted" is no number$/u, 2);
  await app.open(festivalsHref());
  const priced = [...document.querySelectorAll<HTMLElement>('main .festival-card .pass-btn')];
  // the card whose prices its ticket page gave, the one whose foot reads the page
  const opener = priced.find((b) => {
    b.click();
    const read = said(document.querySelector('dialog[open] .peek-body')) !== undefined && lines().length > 0;
    document.querySelector<HTMLElement>('dialog[open] .peek-close')?.click();
    return read;
  });
  if (opener === undefined) throw new Error('no card on the Festivals page lists passes read on a ticket page');
  expect(lines()).toEqual([
    'Something went wrong (a quick view: column unread: "planted" is no number). Reloading the page may help. Close',
  ]);
  await expect.poll(() => document.querySelector('dialog[open]')).toBeNull();
  const at = entryAt();
  opener.click();
  const dlg = shownDialog('.peek-close');
  expect([
    said(dlg.querySelector('h2'))?.startsWith('Passes for '),
    dlg.querySelector('.pass-rows li') !== null,
  ]).toEqual([true, true]);
  expect([dlg.querySelector('.peek-foot')?.childElementCount, entryAt()]).toEqual([0, at + 1]);
  expect(lines()).toHaveLength(1);
});
