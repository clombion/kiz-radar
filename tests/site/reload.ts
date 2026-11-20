// What a page keeps across a reload, in its storage or its address, shared by the test file whose page writes it and
// those whose page starts with it (app.ts's storage and route), so that both halves name one entry: the site's page
// mid-update, which they start, and the review page's token, its items settled and the item it shows.
import { onTestFinished, vi } from 'vitest';
import { artistsHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { anotherBuild } from './planted.ts';
import { KEPT, REVIEW } from './reviewed.ts';
import { said } from './seen.ts';

// When the tab first found the site mid-update (updating.tsx): its sessionStorage entry, the instant the page that
// wrote it started on, and the value it wrote then, that instant in ms.
const AT = new Date('2026-11-19T10:00:00Z');
export const UPDATING_SINCE = {
  key: 'kiz-radar-updating-since',
  at: AT,
  value: String(AT.getTime()),
} as const;

// The review page's token kept for the tab (sessionStorage), as its dialog keeps one pasted with "Keep it on this
// device" left unticked.
export const CLAIMS_TOKEN = { key: KEPT.token, value: 'github_pat_kept_for_the_tab' } as const;
// The items the review page settled since the review's build (localStorage): the build, then each item's id, Ana's home
// alone, spelled as it is stored, so that a change to the stored text fails the half that writes it.
export const REVIEW_SETTLED = { key: KEPT.settled, value: `${REVIEW.built_at}\nhome p:ana` } as const;
// The item the review page shows, in its address: the second contested home, Bo.
export const REVIEW_ROUTE = '#contested/2';

// The site's page started mid-update for its visitor, on the visit's day and storage: on a database of another build
// than its summary, which it refuses. again() draws the updating page again under vi's timers, an interval or a
// timeout, which stay until the test ends. It opens a view that waits for the data, which draws the updating page in
// its place, the start's page and its countdown, a real interval, disposed. again() says how many timers the page set
// as it drew. at() opens that view on another instant, under the page's own clock, and under vi's timers while they
// stand.
export async function startMidUpdate(
  visit: Omit<Parameters<typeof startSite>[0], 'plant'>,
): Promise<{ again: () => Promise<number>; at: (on: Date) => Promise<void> }> {
  const { open } = await startSite({ ...visit, plant: anotherBuild });
  return {
    at: async (on) => {
      await open(artistsHref(), on);
    },
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
