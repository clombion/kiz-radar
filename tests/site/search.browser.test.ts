// The search dialog, opened from its button in the header, on the fixture's data and the build's festivals.
import { expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { plural } from '../../site/wording.ts';
import { startSite } from './app.ts';
import { shownDialog } from './seen.ts';

const NOW = '2026-11-01';
// Munich's festivals coming up on the page's day, in the database it is served: one of them spelt München in its
// listing (the build's two that are ahead are both spelt Munich), and then how many there are, and how many ways
// their listings spell the city
const AHEAD = "FROM event_rows WHERE city_key = 'munich-de' AND upcoming";
let munich = { upcoming: 0, spellings: 0 };
await startSite({
  now: NOW,
  plant: (db) => {
    db.run('UPDATE today SET day = ?', [NOW]); // the page sets its day again as it loads (db.ts)
    db.run(`UPDATE events SET city = 'München' WHERE id = (SELECT max(id) ${AHEAD})`);
    const [upcoming, spellings] =
      db.exec(`SELECT count(*), count(DISTINCT e.city) FROM events e WHERE e.id IN (SELECT id ${AHEAD})`)[0]
        ?.values[0] ?? [];
    munich = { upcoming: Number(upcoming), spellings: Number(spellings) };
    if (munich.upcoming < 2)
      throw new Error(
        `the build lists ${munich.upcoming} Munich festival(s) ahead on ${NOW}, not the two this file reads`,
      );
  },
});

// the search opened from its button, and shut through its Cancel button once the test ends (seen.ts)
function opened(): HTMLInputElement {
  document.querySelector<HTMLElement>('#search-btn')?.click();
  const input = shownDialog('.search-cancel').querySelector<HTMLInputElement>('input[role="combobox"]');
  if (input == null) throw new Error('the search button opened no search');
  return input;
}
// the city rows the search lists for what is typed: each its name and what it says under it
async function cities(input: HTMLInputElement, typed: string): Promise<string[][]> {
  input.value = typed;
  input.dispatchEvent(new Event('input'));
  const rows = () =>
    [...document.querySelectorAll('dialog[open] [role="option"]')]
      .map((o) => [o.querySelector('.name')?.textContent ?? '', o.querySelector('.sub')?.textContent ?? ''])
      .filter(([, sub]) => sub?.startsWith('City') === true);
  // the search's index is built once the page's data is in, after the dialog opens
  await vi.waitUntil(() => rows().length > 0, { timeout: 5000 });
  return rows();
}

test('search lists a city once, with every festival its listings spell two ways', async () => {
  expect(munich.spellings).toBe(2); // Munich and München
  expect(await cities(opened(), 'Munich')).toEqual([
    ['Munich', `City · ${plural(munich.upcoming, 'festival')} coming up`],
  ]);
});

// the search's options, as drawn, and those of them marked selected
const options = () => [...document.querySelectorAll<HTMLElement>('dialog[open] [role="option"]')];
const selected = () => options().filter((o) => o.getAttribute('aria-selected') === 'true');
const highlighted = (input: HTMLInputElement) => input.getAttribute('aria-activedescendant');
// what is typed, as a visitor types it
const typed = (input: HTMLInputElement, words: string) => {
  input.value = words;
  input.dispatchEvent(new Event('input'));
};
// whether the list shows things to tap, as it does with nothing typed
const suggested = () => document.querySelector('dialog[open] .search-list > p.search-note') !== null;
// the festivals' group, once the index is in, and its "Show all"
const festivalsGroup = () => document.querySelector('dialog[open] [role="group"][aria-labelledby="search-g-festival"]');
// whether an option shows whole in the list, which scrolls
const inView = (option: Element | undefined) => {
  const list = document.querySelector('dialog[open] [role="listbox"]')?.getBoundingClientRect();
  const at = option?.getBoundingClientRect();
  return list !== undefined && at !== undefined && at.top >= list.top - 1 && at.bottom <= list.bottom + 1;
};

test('the search is a combobox: its best match highlighted, the arrows moving it round, Enter going there', async () => {
  const input = opened();
  // with nothing typed (the last query stays, and this file's first test typed one): things to tap, none highlighted
  typed(input, '');
  await vi.waitUntil(() => suggested() && options().length > 0, { timeout: 5000 });
  expect([highlighted(input), selected()]).toEqual([null, []]);
  // more festivals than the group shows: its "Show all", numbered before its rows, as the list always numbered them
  typed(input, 'kizomba');
  await vi.waitUntil(() => festivalsGroup()?.querySelector('.search-more') != null, { timeout: 5000 });
  const group = festivalsGroup();
  const rows = [...(group?.querySelectorAll('.search-row:not(.search-more)') ?? [])];
  const n = (el: Element | null | undefined) => Number(el?.id.replace('search-o', ''));
  expect(rows).toHaveLength(5);
  expect(n(group?.querySelector('.search-more'))).toBeLessThan(n(rows[0]));
  // the best match highlighted, alone, and the list open
  const all = options();
  expect(input.getAttribute('aria-expanded')).toBe('true');
  expect(highlighted(input)).toBe(all[0]?.id);
  expect(selected()).toEqual([all[0]]);
  // up from the first, round to the last; down from there, back to the first
  await userEvent.keyboard('{ArrowUp}');
  await expect.poll(() => highlighted(input)).toBe(all.at(-1)?.id);
  expect(selected()).toEqual([all.at(-1)]);
  await userEvent.keyboard('{ArrowDown}');
  await expect.poll(() => highlighted(input)).toBe(all[0]?.id);
  // Enter on a row goes where it lives, the dialog closed
  const before = location.hash;
  await userEvent.keyboard('{Enter}');
  await expect.poll(() => location.hash).not.toBe(before);
  expect(document.querySelector('dialog[open]')).toBeNull();
});

test('a typo is met with a name it may be, which fills the field; a suggestion is never highlighted', async () => {
  const input = opened();
  typed(input, 'Munixh');
  const offered = await vi.waitUntil(
    () => [...document.querySelectorAll<HTMLButtonElement>('dialog[open] .search-none button')][0],
    { timeout: 5000 },
  );
  expect(offered.closest('p')?.textContent).toBe('Did you mean Munich?');
  expect([highlighted(input), input.getAttribute('aria-expanded')]).toEqual([null, 'false']);
  offered.click();
  expect(input.value).toBe('Munich');
  await vi.waitUntil(() => options().length > 0, { timeout: 5000 });
  expect(highlighted(input)).toBe(options()[0]?.id);
  // emptied: things to tap again, with no highlight
  typed(input, '');
  await vi.waitUntil(suggested);
  expect([highlighted(input), selected()]).toEqual([null, []]);
});

test('the list scrolled away shows its best match again once retyped, and once opened again', async () => {
  // a short window, where the list scrolls
  onTestFinished(async () => {
    await page.viewport(414, 896);
  });
  // once the slide of the last test's Enter is over (it changed section): a resize would cut it short
  await vi.waitUntil(() => document.documentElement.dataset['vt'] === undefined, { timeout: 2000 });
  await page.viewport(414, 480);
  const input = opened();
  const list = () => document.querySelector('dialog[open] [role="listbox"]');
  typed(input, 'kizomba');
  await vi.waitUntil(() => festivalsGroup() !== null, { timeout: 5000 });
  const away = () => {
    const shown = list();
    if (shown === null) throw new Error('no list');
    shown.scrollTop = shown.scrollHeight;
    expect(inView(options()[0])).toBe(false);
  };
  away();
  typed(input, 'kizomb');
  await expect.poll(() => inView(document.querySelector(`#${highlighted(input) ?? ''}`) ?? undefined)).toBe(true);
  away();
  // closed by its Cancel button, its entry gone, then opened again
  const gone = new Promise((done) => addEventListener('popstate', done, { once: true }));
  document.querySelector<HTMLButtonElement>('dialog[open] .search-cancel')?.click();
  await gone;
  const again = opened();
  await expect.poll(() => inView(document.querySelector(`#${highlighted(again) ?? ''}`) ?? undefined)).toBe(true);
  expect(highlighted(again)).toBe(options()[0]?.id);
});
