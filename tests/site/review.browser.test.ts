// The review dashboard, in Chromium: a form writes its claim as the claims repository's file named by its digest, with
// the kept token, and says what came of it; GitHub's answers are stubbed.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { claimText, digest, homeClaim, mergeClaim } from '../../site/claims.ts';
import { keepToken } from '../../site/github.ts';
import type { Review } from '../../site/pending.ts';
import { reviewView } from '../../site/review.ts';

const AT = new Date('2026-10-29T18:01:23Z');
const REVIEW: Review = {
  built_at: '2026-10-29T18:00:00+00:00',
  repository: 'clombion/kiz-radar-claims',
  countries: [
    { code: 'AO', name: 'Angola' },
    { code: 'PT', name: 'Portugal' },
  ],
  homes: [
    {
      key: 'p:ana',
      name: 'Ana',
      kind: 'person',
      bookings: 3,
      basis: 'contested',
      stated: [{ code: 'AO', festivals: 2 }],
    },
  ],
  merges: [{ key_a: 'p:abi', key_b: 'p:abi@dj', name_a: 'Abi', name_b: 'DJ Abi', evidence: 'GB', rationale: 'unsure' }],
  festivals: [],
  orphaned: [],
  steps: [],
  reads: [],
};

let asked: { url: string; init: RequestInit }[] = [];
const answering = (status: number) =>
  vi.fn((url: URL, init: RequestInit) => {
    asked.push({ url: url.href, init });
    return Promise.resolve(new Response('{}', { status }));
  });
const formOf = (root: HTMLElement, n: number): HTMLFormElement => {
  const f = root.querySelectorAll('form')[n];
  if (!f) throw new Error(`no form ${n}`);
  return f;
};
const click = (f: HTMLFormElement, words: string) => {
  const b = [...f.querySelectorAll('button')].find((x) => x.textContent === words);
  if (!b) throw new Error(`no button ${words}`);
  b.click();
};
const sentFile = (init: RequestInit): string => {
  const body: unknown = JSON.parse(String(init.body));
  const content = typeof body === 'object' && body !== null && 'content' in body ? String(body.content) : '';
  return new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)));
};

beforeEach(() => {
  asked = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT);
  keepToken('the-token');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  keepToken(null);
  document.body.replaceChildren();
});

const choose = (f: HTMLFormElement, code: string) => {
  const pick = f.querySelector('select');
  if (!pick) throw new Error('no country');
  pick.value = code;
  pick.dispatchEvent(new Event('change'));
};

function shown(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  reviewView(root, REVIEW);
  return root;
}

test('a home is written as its claim, at the path its digest names, with the token', async () => {
  vi.stubGlobal('fetch', answering(201));
  const root = shown();
  const f = formOf(root, 1); // the token's form comes first
  const why = f.querySelector('input');
  if (!why) throw new Error('no note');
  why.value = 'From Luanda, her site says';
  choose(f, 'AO');
  click(f, 'Write the claim');
  await expect.poll(() => f.querySelector('[role=status]')?.textContent).toMatch(/^Written as [0-9a-f]{16}\.json/u);
  const text = claimText(homeClaim('p:ana', 'AO', 'From Luanda, her site says', AT));
  expect(asked).toHaveLength(1);
  expect(asked[0]?.url).toBe(
    `https://api.github.com/repos/clombion/kiz-radar-claims/contents/${await digest(text)}.json`,
  );
  expect(asked[0]?.init.method).toBe('PUT');
  expect(new Headers(asked[0]?.init.headers).get('Authorization')).toBe('Bearer the-token');
  expect(sentFile(asked[0]?.init ?? {})).toBe(text);
  expect(f.querySelector('button')?.disabled).toBe(true); // written: nothing more to do here
});

test('a claim already written is said so, and nothing changes', async () => {
  vi.stubGlobal('fetch', answering(422));
  const root = shown();
  const f = formOf(root, 2);
  const why = f.querySelector('input');
  if (!why) throw new Error('no note');
  why.value = 'Two people, two cities';
  click(f, 'Two artists');
  await expect.poll(() => f.querySelector('[role=status]')?.textContent).toMatch(/^Already written/u);
  const text = claimText(
    mergeClaim({ keys: ['p:abi', 'p:abi@dj'], decision: 'separate', note: 'Two people, two cities', at: AT }),
  );
  expect(sentFile(asked[0]?.init ?? {})).toBe(text);
});

test('a refused token is said, and the form can be sent again', async () => {
  vi.stubGlobal('fetch', answering(401));
  const root = shown();
  const f = formOf(root, 1);
  const why = f.querySelector('input');
  if (!why) throw new Error('no note');
  why.value = 'From Luanda';
  choose(f, 'AO');
  click(f, 'Write the claim');
  await expect.poll(() => f.querySelector('[role=status]')?.textContent).toMatch(/refused the token/u);
  expect(f.querySelector('button')?.disabled).toBe(false);
});

test('a home with no country, or a claim with no note, is not sent', () => {
  vi.stubGlobal('fetch', answering(201));
  const root = shown();
  const f = formOf(root, 1);
  click(f, 'Write the claim');
  expect(f.querySelector('[role=status]')?.textContent).toBe('a home claim names a country: pick one');
  choose(f, 'PT');
  click(f, 'Write the claim');
  expect(f.querySelector('[role=status]')?.textContent).toBe('a claim says why: its note is empty');
  expect(asked).toEqual([]);
});
