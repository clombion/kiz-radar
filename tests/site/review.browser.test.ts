// The review page of a writer, their token kept on this device: it says whose token it is and when it expires, its
// dialog's fields marked in its markup with the day and the box as kept, and an item's controls as the h() page marked
// them; a merge
// is chosen by its keys and written, its own note kept, and said written already when GitHub has it; a token refused
// on a write makes the page read-only, saying why; a pair is compared side by side; and two artists found by name are
// joined by a merge claim; an item another tab settled, written again, is kept as settled once. Each claim is read as
// the file the page put, where and with the header it sent.
import { expect, onTestFinished, test, vi } from 'vitest';
import { claimText, digest, mergeClaim } from '../../site/claims.ts';
import { startReview } from './app.ts';
import { AS_WRITER, AT, claimed, github, KEPT, REVIEW, WRITER, writes, WRITING } from './reviewed.ts';
import { accessSays, buttonOf, choicesOf, keyed, onDeviceBox, reviewed, said, theItem, tokenDialog } from './seen.ts';

const app = await startReview(AS_WRITER);
const noteOf = (el: Element): HTMLInputElement => {
  const n = el.querySelector('input[aria-label="Why"]');
  if (!(n instanceof HTMLInputElement)) throw new Error(`no note in ${said(el)}`);
  return n;
};

test('the expiry its maker entered is shown, and warned of when near', async () => {
  await expect.poll(accessSays).toBe(WRITING);
});

test("the token dialog's fields are marked in its markup as kept: the day it expires, and the box ticked", () => {
  const dlg = tokenDialog();
  const day = dlg.querySelector('input[aria-label="Expires on"]');
  // the attributes, which a page drawn with the properties alone would leave out
  expect([day?.getAttribute('value'), onDeviceBox(dlg).hasAttribute('checked')]).toEqual([
    WRITER.storage.local[KEPT.expires],
    true,
  ]);
});

test("an item's controls are marked in its markup: the rail's search, the picker's first country, the write button off", async () => {
  await app.open('#contested/1');
  const find = () => document.querySelector('aside[aria-label="Every item"] input[aria-label="Find"]');
  const search = (words: string) => {
    const field = find();
    if (!(field instanceof HTMLInputElement)) throw new Error('the rail has no search');
    field.value = words;
    field.dispatchEvent(new Event('input'));
  };
  // emptied however the test ends, as the page keeps the search while the tab stays
  onTestFinished(() => {
    search('');
  });
  search('Ana');
  const picker = theItem().querySelector('select[aria-label="Country"]');
  // the attributes, which a page drawn with the properties alone would leave out
  expect([
    find()?.getAttribute('value'),
    [...(picker?.querySelectorAll('option') ?? [])].map((o) => o.hasAttribute('selected')),
    buttonOf(theItem(), 'Write the claim').hasAttribute('disabled'),
  ]).toEqual(['ana', [true, false, false], true]);
});

test('a merge is chosen and written by its keys, its own note kept, and said written already when GitHub has it', async () => {
  await app.open('#merges/1');
  await expect.poll(accessSays).toBe(WRITING);
  app.answer(github({ token: WRITER.token, write: 422 }));
  const text = claimText(
    mergeClaim({ keys: ['p:abi', 'p:abi@dj'], decision: 'separate', note: 'Two people: different cities', at: AT }),
  );
  const from = app.asked.length;
  const note = noteOf(theItem());
  note.value = 'Two people: different cities';
  note.dispatchEvent(new Event('input'));
  keyed('2');
  expect(note.value).toBe('Two people: different cities'); // a choice never replaces a note its maker wrote
  // the redraw after the beat held, so the line the write leaves is read
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  note.form?.requestSubmit();
  await expect
    .poll(() => said(theItem().querySelector('form [role="status"]')))
    .toBe(`Already written (${await digest(text)}.json): nothing changed.`);
  expect(writes(app.asked, from)).toEqual([await claimed(text)]);
  vi.advanceTimersByTime(5000);
  vi.useRealTimers();
  await expect.poll(() => said(theItem())).toContain('✓ Settled since this build');
});

test('a token refused on a write makes the page read-only, saying why', async () => {
  await app.open('#contested/1');
  await expect.poll(accessSays).toBe(WRITING);
  app.answer(github({ token: WRITER.token, write: 403 }));
  // the access refused is the page's for the file: put back through its dialog, which checks the kept token again
  onTestFinished(async () => {
    const dlg = tokenDialog();
    buttonOf(dlg, 'Check and keep').click();
    await expect.poll(accessSays).toBe(WRITING);
    buttonOf(dlg, 'Close').click();
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
  const before = localStorage.getItem(KEPT.settled);
  buttonOf(theItem(), 'Angola').click();
  buttonOf(theItem(), 'Write the claim').click();
  await expect.poll(accessSays).toBe('Read-only · token refused');
  expect(said(theItem())).toContain('Contents, Read and write');
  expect(choicesOf(theItem())).toEqual([]);
  expect(localStorage.getItem(KEPT.settled)).toBe(before);
});

test('a pair is compared side by side, the row whose sides share nothing marked', async () => {
  await app.open('#merges/1');
  const differing = [...theItem().querySelectorAll('table tbody tr')]
    .filter((r) => r.getAttribute('class') === 'differs')
    .map((r) => said(r.querySelector('th')));
  expect(differing).toEqual(['Line-ups state', 'Roles']);
  expect(said(theItem())).toContain('Both named in 1 line-up');
});

test('two artists found by name are joined by a merge claim of their keys', async () => {
  await app.open('#join/1');
  await expect.poll(accessSays).toBe(WRITING);
  const find = (words: string, name: string) => {
    const box = reviewed().querySelector('input[type="search"]');
    if (!(box instanceof HTMLInputElement)) throw new Error(`no search in ${said(reviewed())}`);
    box.value = words;
    box.dispatchEvent(new Event('input'));
    buttonOf(reviewed(), name).click();
  };
  const from = app.asked.length;
  find('kwenda', 'Kwenda Lima');
  find('kl', 'DJ KL'); // the first side is chosen: the next search is the other's
  buttonOf(reviewed(), 'One artist').click();
  buttonOf(reviewed(), 'Write the claim').click();
  await expect.poll(() => writes(app.asked, from).length).toBe(1);
  const text = claimText(
    mergeClaim({
      keys: ['p:kwenda', 'p:kl@dj'],
      decision: 'merge',
      note: 'Kwenda Lima / DJ KL: one artist, under two names',
      at: AT,
    }),
  );
  expect(writes(app.asked, from)).toEqual([await claimed(text)]);
  await expect
    .poll(() => said(reviewed().querySelector('form [role="status"]')))
    .toBe(`Written as ${await digest(text)}.json: on the site after the next run.`);
});

test('an item another tab settled, written again here, is kept as settled once', async () => {
  await app.open('#contested/2');
  await expect.poll(accessSays).toBe(WRITING);
  // another tab of this device wrote Bo's home since this page read what is settled
  localStorage.setItem(KEPT.settled, `${localStorage.getItem(KEPT.settled) ?? REVIEW.built_at}\nhome p:bo`);
  app.answer(github({ token: WRITER.token, write: 422 }));
  buttonOf(theItem(), 'Portugal').click();
  buttonOf(theItem(), 'Write the claim').click();
  await expect.poll(() => said(theItem().querySelector('form [role="status"]'))).toContain('Already written');
  const ids = localStorage.getItem(KEPT.settled)?.split('\n') ?? [];
  expect(ids.filter((id) => id === 'home p:bo')).toEqual(['home p:bo']);
  // the next open item, after the beat
  await expect.poll(() => said(theItem().querySelector('h2'))).toBe('Ana');
});
