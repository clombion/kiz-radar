// The artists' list, opened at its address with what a visitor typed in its search (q=), on the build's artists; and
// its More button, kept as a filter is chosen.
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

test('the More button stays as a filter of its panel is chosen, saying how many are on', async () => {
  await app.open(artistsHref());
  const button = () => document.querySelector<HTMLButtonElement>('main .filters-wrap .more-btn');
  const first = button();
  first?.click();
  const kind = document.querySelector<HTMLSelectElement>('main #artist-filters select');
  if (kind === null) throw new Error('the artists have no choice of kind');
  kind.selectedIndex = 1;
  kind.dispatchEvent(new Event('change'));
  expect([button() === first, first?.textContent, first?.ariaExpanded]).toEqual([true, 'More (1) ▾', 'true']);
});
