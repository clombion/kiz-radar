// The search dialog, opened from its button in the header, on the fixture's data and the build's festivals.
import { expect, test, vi } from 'vitest';
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
      .filter(([, sub]) => sub?.startsWith('City'));
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
