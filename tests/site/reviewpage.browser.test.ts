// The review page started by the helper (app.ts): on the review given, the storage seeded, the instant pinned and
// GitHub's answers given before it starts, which it asks at once to check the token it finds; and the answers' own
// rules: one test's, given up on abort, and none for a host the page's Content-Security-Policy refuses.
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { get } from '../../site/net.ts';
import { startReview } from './app.ts';
import { REVIEW } from './reviewed.ts';

const LOGIN = 'clombion';
const github = (url: URL) =>
  new Response(JSON.stringify({ login: LOGIN }), { status: url.pathname === '/user' ? 200 : 404 });
const app = await startReview({
  now: new Date('2026-10-29T18:01:23Z'),
  review: REVIEW,
  storage: {
    session: { 'kiz-radar-claims-token': 'a token' },
    local: { 'kiz-radar-claims-token-expires': '2026-11-05' },
  },
  elsewhere: github,
});

test('the page shows the review given, and the token it found as checked, its expiry from the pinned day', async () => {
  // the review's one unsure pair, the first queue's
  await expect.element(page.getByText(REVIEW.merges[0]?.b.name ?? '', { exact: true }).first()).toBeVisible();
  await expect
    .element(page.getByRole('button', { name: `Writing as ${LOGIN} · 7 days left: make a new one soon` }))
    .toBeVisible();
  expect(app.asked.map(({ url }) => url.href)).toContain('https://api.github.com/user');
});

test('an answer given in a test lasts that test', async () => {
  app.answer(() => new Response('{}', { status: 401 }));
  await expect(get(new URL('https://api.github.com/user'))).rejects.toThrow('401');
});

test("and the start's answer is back in the next", async () => {
  expect((await get(new URL('https://api.github.com/user'))).status).toBe(200);
});

test('an answer is given up, as a request is, once its signal aborts', async () => {
  app.answer(() => new Promise<Response>(() => undefined)); // a host that never answers
  const leave = new AbortController();
  const asking = get(new URL('https://api.github.com/user'), { signal: leave.signal });
  leave.abort();
  await expect(asking).rejects.toHaveProperty('name', 'AbortError');
});

test("a host the page's policy refuses is never answered, even with an answer given", async () => {
  await expect(get(new URL('https://example.org/'))).rejects.toThrow('Content-Security-Policy');
});
