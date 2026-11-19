// The artists' list, opened at its address with what a visitor typed in its search (q=), on the build's artists.
import { expect, test } from 'vitest';
import { artistsHref } from '../../site/routes.ts';
import { startSite } from './app.ts';

const app = await startSite({ now: '2026-11-01' });

// the names the list shows for what was typed
async function found(q: string): Promise<(string | null)[]> {
  await app.open(artistsHref({ q }));
  return [...document.querySelectorAll('main .artist-row .name')].map((n) => n.textContent);
}

test('the artist list finds a name whatever its accents and case, and what is typed is never a pattern', async () => {
  const elodie = await found('elodie');
  expect(elodie).toContain('Boki & Élodie');
  expect(await found('ÉLODIE')).toEqual(elodie);
  expect(await found('%')).toEqual([]);
  expect(await found('o_a')).toEqual([]); // LIKE '%o_a%' would find Rosa
});
