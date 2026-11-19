// What a page keeps in its storage across a reload, shared by the test file whose page writes it and those whose page
// starts with it seeded (app.ts's storage), so that both halves name one entry; and the page mid-update they start.
import { onTestFinished, vi } from 'vitest';
import { artistsHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { anotherBuild } from './planted.ts';
import { said } from './seen.ts';

// When the tab first found the site mid-update (updating.ts): its sessionStorage entry, the instant the page that
// wrote it started on, and the value it wrote then, that instant in ms.
const AT = new Date('2026-11-19T10:00:00Z');
export const UPDATING_SINCE = {
  key: 'kiz-radar-updating-since',
  at: AT,
  value: String(AT.getTime()),
} as const;

// The site's page started mid-update for its visitor, on the visit's day and storage: on a database of another build
// than its summary, which it refuses. again() draws the updating page again under vi's timers, an interval or a
// timeout, which stay until the test ends. It opens a view that waits for the data, which draws the updating page in
// its place. The start's own countdown ticks on in a real interval. again() says how many timers the page set as it
// drew.
export async function startMidUpdate(
  visit: Omit<Parameters<typeof startSite>[0], 'plant'>,
): Promise<{ again: () => Promise<number> }> {
  const { open } = await startSite({ ...visit, plant: anotherBuild });
  return {
    again: async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
      onTestFinished(() => {
        vi.useRealTimers();
      });
      await open(artistsHref());
      return vi.getTimerCount();
    },
  };
}

// What the updating page says: its heading, and all its words.
export const updatingSays = (): { heading: string | undefined; words: string | undefined } => ({
  heading: said(document.querySelector('main h1')),
  words: said(document.querySelector('main')),
});
