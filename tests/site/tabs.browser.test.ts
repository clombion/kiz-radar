// The tabs with motion as most visitors have it (the browser project, vitest.config.ts): the oval's slime as it moves
// between the header's tabs, a move begun before the last one ends, and the page's slide and its direction, on the
// fixture's data alone.
import { expect, test, vi } from 'vitest';
import { MEDIA } from '../../site/media.ts';
import { EXPLORE, festivalsHref, friendsHref, sourcesHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { atWidth, header, layerOf, mostOvals, offBy, ovalsOf, shownOnChange, subnav, tabOf } from './seen.ts';

const app = await startSite({ now: '2026-11-01' });
const [WEEK = '', MAP = ''] = EXPLORE.map(([, , href]) => href);
const main = () => document.querySelector<HTMLElement>('#main');
const root = document.documentElement;
const MS = 5000; // the longest a wait here takes: the oval's move is 760 ms, a slide shorter
// The animations of a row's ovals (tabs.tsx's goo layer: the oval, and a move's arm and drop), none of the row's other
// transitions.
const slime = (row: Element | null) => ovalsOf(row).flatMap((oval) => oval.getAnimations());
// A row, the header's unless named, once its oval rests: its ovals' animations over within 5 s (one cancelled by the
// next move counts as over), and one oval left.
async function rested(row = header()): Promise<void> {
  let late: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, refuse) => {
    late = setTimeout(() => refuse(new Error(`the row's oval still moved after ${MS} ms`)), MS);
  });
  try {
    await Promise.race([Promise.all(slime(row).map(async (a) => await a.finished.catch(() => a))), timeout]);
  } finally {
    clearTimeout(late);
  }
  await vi.waitUntil(() => ovalsOf(row).length === 1, { timeout: MS });
}
// How far the oval is from the header's tab of those words, once it rests.
async function restsOffBy(words: string): Promise<number> {
  await rested();
  return offBy(ovalsOf(header())[0], tabOf(header(), words));
}
// The direction a slide marks on the page (data-vt) as the page opened at href first appears in <main>. open() first
// puts the page's own address back with history.replaceState, which sends no hashchange and so starts no route and no
// slide: the first page drawn is href's.
async function markedOpening(href: string): Promise<string | undefined> {
  const marks: (string | undefined)[] = [];
  const seen = new MutationObserver(() => {
    marks.push(root.dataset['vt']);
  });
  const at = main();
  if (at === null) throw new Error('the page has no #main');
  seen.observe(at, { childList: true });
  try {
    await app.open(href);
  } finally {
    seen.disconnect();
  }
  return marks[0];
}
// Until the slide is over: no mark left, and <main> no longer named for it.
const slid = async () =>
  await vi.waitUntil(() => root.dataset['vt'] === undefined && main()?.style.viewTransitionName === '', {
    timeout: MS,
  });
// The animations of the slide under way (its view transition's, on their pseudo-elements), none once it ends.
const sliding = () =>
  document
    .getAnimations()
    .filter(
      (a) => a.effect instanceof KeyframeEffect && a.effect.pseudoElement?.startsWith('::view-transition') === true,
    );
const frames = async (n: number) => {
  for (const _ of Array.from({ length: n }))
    await new Promise((frame) => {
      requestAnimationFrame(frame);
    });
};

test('moving to another tab, the slime reaches out an arm and a drop, which are gone once it rests', async () => {
  expect(matchMedia(MEDIA.REDUCED_MOTION).matches).toBe(false);
  await app.open(sourcesHref());
  // from no tab, it has nowhere to move from
  expect(await mostOvals(header(), async () => await app.open(WEEK))).toBe(1);
  // the old oval, the arm, the drop and the new oval
  expect(await mostOvals(header(), async () => await app.open(festivalsHref()))).toBe(4);
  expect(await restsOffBy('Festivals')).toBeLessThanOrEqual(1);
});

test('a move begun before the last one ends leaves the oval behind the tab it went to', async () => {
  await app.open(festivalsHref());
  await rested();
  // the move to Friends held at its start, its four shapes there, until the next move
  let held = false;
  const hold = new MutationObserver(() => {
    if (ovalsOf(header()).length < 4) return;
    for (const a of slime(header())) a.pause();
    held = true;
    hold.disconnect();
  });
  hold.observe(layerOf(header()), { childList: true });
  try {
    await app.open(friendsHref());
  } finally {
    hold.disconnect();
  }
  expect(held).toBe(true);
  await app.open(festivalsHref());
  // the first move's cancel event, sent with the next frame's animation updates, leaves this move's shapes
  await frames(2);
  expect(ovalsOf(header())).toHaveLength(4);
  expect(await restsOffBy('Festivals')).toBeLessThanOrEqual(1);
});

test('a slide marks its direction while the page changes, and changes it at once with no direction', async () => {
  await app.open(festivalsHref());
  await slid();
  expect(await markedOpening(friendsHref())).toBe('ahead');
  await slid();
  expect(await markedOpening(festivalsHref())).toBe('back');
  await slid();
  // the sources page is no section: drawn by the time the address change is handled (the page's handler runs first)
  expect(await shownOnChange(async () => await app.open(sourcesHref()))).toEqual(['Sources · Kiz Radar', undefined]);
});

test('a slide held mid-way keeps its mark, and the slide begun over it marks its own direction until its own end', async () => {
  await app.open(festivalsHref());
  await slid();
  // the slide to Friends held mid-way, once its transition's animations run, as the next slide begins. Chromium 141
  // has no document.activeViewTransition whose ready could be awaited: its animations appearing are that moment (ready
  // resolves as they start), looked for every 5 ms, well inside the slide's 350 ms
  await app.open(friendsHref());
  await vi.waitUntil(() => sliding().length > 0, { timeout: MS, interval: 5 });
  const paused = sliding();
  for (const a of paused) a.pause();
  expect(paused.length).toBeGreaterThan(0);
  expect(root.dataset['vt']).toBe('ahead');
  expect(await markedOpening(festivalsHref())).toBe('back');
  await slid();
});

test('a slide cut short by the next, before its own animations start, says nothing went wrong', async () => {
  await app.open(festivalsHref());
  await slid();
  // two address changes in a row: the second slide begins before the first one's transition is ready, which skips it
  // (its ready rejects with an AbortError, which current Chromium reports as unhandled); the console guard and the
  // page's alerts say whether that was taken for a fault
  const alerts = () => document.querySelectorAll('[role="alert"]').length;
  const before = alerts();
  location.hash = friendsHref();
  await new Promise((later) => {
    setTimeout(later, 0);
  });
  location.hash = festivalsHref();
  await slid();
  await frames(2);
  expect(alerts()).toBe(before);
});

test('a slide the browser skips for any reason, as when the window changes size, says nothing went wrong', async () => {
  await app.open(festivalsHref());
  await slid();
  // the browser skipped it before it animated: its ready rejected as Chromium rejects it when the window changes size
  // as the slide begins (one run in three of a real resize there does it), its finished settled once the page changed
  const start = document.startViewTransition.bind(document);
  const skip = vi.spyOn(document, 'startViewTransition').mockImplementationOnce((change) => {
    const t = start(change);
    const ready = Promise.reject(
      new DOMException('Transition was aborted because of invalid state. Viewport size changed', 'InvalidStateError'),
    );
    return {
      finished: t.finished,
      updateCallbackDone: t.updateCallbackDone,
      ready,
      skipTransition: () => t.skipTransition(),
      types: t.types,
    };
  });
  const alerts = () => document.querySelectorAll('[role="alert"]').length;
  const before = alerts();
  await app.open(friendsHref());
  await slid();
  await frames(2);
  expect(skip).toHaveBeenCalledOnce();
  expect(alerts()).toBe(before);
  expect(tabOf(header(), 'Friends')?.getAttribute('aria-current')).toBe('page');
});

test('the oval stays under its tab, still, when the window changes size', async () => {
  await app.open(friendsHref());
  await rested();
  const tab = tabOf(header(), 'Friends');
  const before = [tab?.offsetLeft, tab?.offsetWidth];
  // the oval under the tab once the window is wider, never with an arm or a drop on the way
  const most = await mostOvals(header(), async () => {
    await atWidth(1200);
    await expect.poll(() => offBy(ovalsOf(header())[0], tab), { timeout: MS }).toBeLessThanOrEqual(1);
  });
  expect(most).toBe(1);
  // the tab did move in its row, so the oval had to follow it
  expect([tab?.offsetLeft, tab?.offsetWidth]).not.toEqual(before);
});

test('a row given other tabs puts its oval under its current one, still', async () => {
  await app.open(MAP);
  await rested(subnav());
  // the Explore row becomes the Friends tab's places: its oval starts there, not from where Map was
  expect(await mostOvals(subnav(), async () => await app.open(friendsHref()))).toBe(1);
  expect(offBy(ovalsOf(subnav())[0], subnav()?.querySelector('a[aria-current="page"]'))).toBeLessThanOrEqual(1);
});
