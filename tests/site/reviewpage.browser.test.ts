// The review page started by the helper (app.ts): on the review given, at the route given, the storage seeded, the
// instant pinned and GitHub's answers given before it starts, which it asks at once to check the token it finds; an
// item opened by its address, drawn once open() resolves, in place of the entry shown, the item shown drawn again as a
// new page, and refused when the address does not hold it as given (a route that is no #link is a type error) or the
// page fails to draw it; and the answers' own rules: one test's, given up on abort, and none for a host the page's
// Content-Security-Policy refuses.
import { expect, onTestFinished, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { get } from '../../site/net.ts';
import { startReview } from './app.ts';
import { expectConsole } from './console.ts';
import { AT, KEPT, LOGIN, REVIEW, WRITING } from './reviewed.ts';
import { entries, said, theItem, unhidden } from './seen.ts';

// GitHub naming its owner whatever the token, rather than reviewed.ts's github(), which refuses a request without the
// one it knows: the tests of the answers' own rules ask /user with none
const github = (url: URL) => Response.json({ login: LOGIN }, { status: url.pathname === '/user' ? 200 : 404 });
const app = await startReview({
  now: AT,
  route: '#contested/2',
  review: REVIEW,
  storage: {
    session: { [KEPT.token]: 'a token' },
    local: { [KEPT.expires]: '2026-11-05' },
  },
  elsewhere: github,
});
// the item the page arrived at, before any test opens another
const arrived = { hash: location.hash, name: said(theItem().querySelector('h2')) };
const heading = () => said(theItem().querySelector('h2'));

test('the page starts at the route given, as a visitor who reloads the page at its address arrives', () => {
  expect(arrived).toEqual({ hash: '#contested/2', name: REVIEW.homes[1]?.name });
});

test('the page shows the token it found as checked, its expiry from the pinned day', async () => {
  await expect.element(page.getByRole('button', { name: WRITING })).toBeVisible();
  expect(app.asked.map(({ url }) => url.href)).toContain('https://api.github.com/user');
});

test('every drawing is hidden on the page as a writer sees it, on two queues’ items', async () => {
  await expect.element(page.getByRole('button', { name: WRITING })).toBeVisible();
  // the item's arrows, and its choices' drawings
  const drawn = async (route: '#contested/1' | '#merges/1') => {
    await app.open(route);
    return [theItem().querySelectorAll('svg').length > 0, unhidden()];
  };
  expect(await drawn('#contested/1')).toEqual([true, []]);
  expect(await drawn('#merges/1')).toEqual([true, []]);
});

test('an item opened by its address is drawn as open() resolves, in place of the entry shown', async () => {
  const before = entries();
  await app.open('#contested/1');
  // read at once, with no polling: the page's handler drew it before open() resolved
  expect([location.hash, heading()]).toEqual(['#contested/1', REVIEW.homes[0]?.name]);
  expect(entries()).toBe(before);
});

test('the item shown, opened again by its address, is drawn as a new page each time', async () => {
  await app.open('#contested/1');
  const first = theItem();
  await app.open('#contested/1');
  const second = theItem();
  await app.open('#contested/1');
  expect([second === first, theItem() === second, heading()]).toEqual([false, false, REVIEW.homes[0]?.name]);
});

test('open() refuses a route the address does not hold as given', async () => {
  // the address encodes it, so the page would read another
  await expect(app.open('#merges/ü')).rejects.toThrow('the address holds #merges/%C3%BC');
});

test('open() refuses a page that fails to draw the item', async () => {
  // the item's arrows are drawn by icons.ts, their markup put in their buttons: without it, the queue's view throws as
  // it builds, and says so in its place (report.ts's guarded) and in the console, naming the view
  const svg = vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(() => {
    throw new Error('no markup in this test');
  });
  onTestFinished(() => svg.mockRestore());
  // the review's view, each of the two times open() draws it, and not the page around it (console.ts fails any other
  // line)
  expectConsole('error', /^Kiz Radar: the review: Error: no markup in this test$/u, 2);
  await expect(app.open('#merges/1')).rejects.toThrow(
    'the page says it failed: This page could not be shown: no markup',
  );
  // its queues' tabs are drawn
  expect(document.querySelectorAll('#queues a').length).toBeGreaterThan(0);
});

test('an answer given in a test lasts that test', async () => {
  app.answer(() => new Response('{}', { status: 401 }));
  await expect(get(new URL('https://api.github.com/user'))).rejects.toThrow('401');
});

test("and the start's answer is back in the next", async () => {
  expect((await get(new URL('https://api.github.com/user'))).status).toBe(200);
});

test('an answer is given up, as a request is, once its signal aborts', async () => {
  app.answer(async () => await new Promise<Response>(() => undefined)); // a host that never answers
  const leave = new AbortController();
  const asking = get(new URL('https://api.github.com/user'), { signal: leave.signal });
  leave.abort();
  await expect(asking).rejects.toHaveProperty('name', 'AbortError');
});

test("a host the page's policy refuses is never answered, even with an answer given", async () => {
  await expect(get(new URL('https://example.org/'))).rejects.toThrow('Content-Security-Policy');
});
