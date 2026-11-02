// The review dashboard, in Chromium, with GitHub's answers stubbed: read-only it shows no choice to make; a token GitHub
// names its owner for unlocks the choices; a claim is written as the claims repository's file named by its digest, said
// on the button pressed, kept as settled across a reload, and the page moves to the next open item; a token refused on
// a write makes the page read-only again; and the keys choose and move.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { claimText, digest, homeClaim, mergeClaim } from '../../site/claims.ts';
import { forgetToken, keepToken, settled } from '../../site/kept.ts';
import { reviewView } from '../../site/review.ts';
import { REVIEW } from './reviewed.ts';

const AT = new Date('2026-10-29T18:01:23Z');

let asked: { url: string; init: RequestInit }[] = [];
// GitHub: /user names the token's owner (or refuses it), and a write answers with status
const github = ({ user = 200, write = 201 }: { user?: number; write?: number } = {}) =>
  vi.fn((url: URL, init: RequestInit) => {
    asked.push({ url: url.href, init });
    const status = url.pathname === '/user' ? user : write;
    return Promise.resolve(new Response(JSON.stringify({ login: 'clombion' }), { status }));
  });
const writes = () => asked.filter((a) => a.init.method === 'PUT');
const sentFile = (init: RequestInit): string => {
  const body: unknown = JSON.parse(String(init.body));
  const content = typeof body === 'object' && body !== null && 'content' in body ? String(body.content) : '';
  return new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)));
};
const button = (root: HTMLElement, words: string): HTMLButtonElement => {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.includes(words));
  if (!b) throw new Error(`no button ${words}`);
  return b;
};
const note = (root: HTMLElement): HTMLInputElement => {
  const n = root.querySelector<HTMLInputElement>('.review-note');
  if (!n) throw new Error('no note');
  return n;
};

beforeEach(() => {
  asked = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  forgetToken();
  document.body.replaceChildren();
  history.replaceState(null, '', location.pathname);
});

// the page as review.html has it: the token's button and the queues in the header, the review below
function shown(hash: string): HTMLElement {
  history.replaceState(null, '', hash);
  const access = document.createElement('button');
  access.id = 'access';
  const queues = document.createElement('nav');
  queues.id = 'queues';
  const root = document.createElement('div');
  document.body.append(access, queues, root);
  reviewView(root, REVIEW);
  return root;
}
// the page with a token GitHub names its owner for, once checked, and GitHub answering as given
async function writing(hash: string, answers: { user?: number; write?: number } = {}): Promise<HTMLElement> {
  vi.stubGlobal('fetch', github(answers));
  keepToken('good', false);
  const root = shown(hash);
  await ready();
  return root;
}
const accessText = () => document.querySelector('#access')?.textContent ?? '';
// the token checked: GitHub has named its owner
const ready = () =>
  vi.waitFor(() => {
    if (!accessText().startsWith('Writing as clombion')) throw new Error(`not checked yet: ${accessText()}`);
  });

test('without a token the page is read-only: no choice, no note, no write button', () => {
  vi.stubGlobal('fetch', github());
  const root = shown('#contested/1');
  expect(accessText()).toBe('Read-only · add a token');
  expect(root.querySelectorAll('.review-choice, .review-note')).toHaveLength(0);
  expect(root.textContent).toContain('add a token');
  expect(asked).toEqual([]);
});

test('a token GitHub names its owner for unlocks the choices; one it refuses leaves the page read-only', async () => {
  const root = await writing('#contested/1');
  expect(new Headers(asked[0]?.init.headers).get('Authorization')).toBe('Bearer good');
  expect(root.querySelectorAll('.review-choice')).toHaveLength(2);
  document.body.replaceChildren();
  vi.stubGlobal('fetch', github({ user: 401 }));
  keepToken('bad', false);
  const again = shown('#contested/1');
  await expect.poll(accessText).toBe('Read-only · token refused');
  expect(again.querySelectorAll('.review-choice')).toHaveLength(0);
});

test('the expiry its maker entered is shown, and warned of when near', async () => {
  vi.stubGlobal('fetch', github());
  keepToken('good', true);
  localStorage.setItem('kiz-radar-claims-token-expires', '2026-11-05');
  shown('#merges/1');
  await expect.poll(accessText).toBe('Writing as clombion · 7 days left: make a new one soon');
});

test('a home is written at its digest, said on its button, kept as settled, and the next open item follows', async () => {
  const root = await writing('#contested/1');
  button(root, 'Angola').click();
  expect(note(root).value).toBe('Ana: from Angola, as 2 line-ups state');
  button(root, 'Write the claim').click();
  await expect.poll(() => root.querySelector('.review-place')?.textContent).toBe('2 of 2');
  expect(root.querySelector('.list-summary')?.textContent).toContain('1 open, 1 settled since the build');
  const text = claimText(homeClaim('p:ana', 'AO', 'Ana: from Angola, as 2 line-ups state', AT));
  expect(writes()).toHaveLength(1);
  expect(writes()[0]?.url).toBe(
    `https://api.github.com/repos/clombion/kiz-radar-claims/contents/${await digest(text)}.json`,
  );
  expect(sentFile(writes()[0]?.init ?? {})).toBe(text);
  expect(location.hash).toBe('#contested/2');
  expect(settled(REVIEW.built_at)).toEqual(new Set(['home p:ana']));
  // the settled item shows so after a reload, with nothing to write
  document.body.replaceChildren();
  const again = shown('#contested/1');
  await ready();
  expect(again.textContent).toContain('✓ Settled since this build');
  expect(again.querySelectorAll('.review-choice')).toHaveLength(0);
});

test('a merge is chosen and written by its keys, and its own note kept', async () => {
  const root = await writing('#merges/1', { write: 422 });
  note(root).value = 'Two people: different cities';
  note(root).dispatchEvent(new Event('input'));
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
  expect(note(root).value).toBe('Two people: different cities'); // a choice never replaces a note its maker wrote
  note(root).form?.requestSubmit();
  await expect.poll(() => writes().length).toBe(1);
  const text = claimText(
    mergeClaim({ keys: ['p:abi', 'p:abi@dj'], decision: 'separate', note: 'Two people: different cities', at: AT }),
  );
  expect(sentFile(writes()[0]?.init ?? {})).toBe(text);
});

test('a token refused on a write makes the page read-only, saying why', async () => {
  const root = await writing('#contested/1', { write: 403 });
  button(root, 'Angola').click();
  button(root, 'Write the claim').click();
  await expect.poll(accessText).toBe('Read-only · token refused');
  expect(root.textContent).toContain('Contents, Read and write');
  expect(settled(REVIEW.built_at).size).toBe(0);
});

test('the arrow keys move between items, and the address follows', () => {
  vi.stubGlobal('fetch', github());
  const root = shown('#contested/1');
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  expect(location.hash).toBe('#contested/2');
  expect(root.querySelector('.review-card h2')?.textContent).toBe('Bo');
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  expect(location.hash).toBe('#contested/1');
});

test('a pair is compared side by side, the row whose sides share nothing marked', async () => {
  const root = await writing('#merges/1');
  const rows = [...root.querySelectorAll('.review-compare tbody tr')];
  const differing = rows
    .filter((r) => r.getAttribute('class') === 'differs')
    .map((r) => r.querySelector('th')?.textContent);
  expect(differing).toEqual(['Line-ups state', 'Roles']);
  expect(root.textContent).toContain('Both named in 1 line-up');
});

test('two artists found by name are joined by a merge claim of their keys', async () => {
  const root = await writing('#join/1');
  const find = (n: number, words: string) => {
    const box = root.querySelectorAll<HTMLInputElement>('input[type="search"]')[n];
    if (!box) throw new Error(`no search ${n}`);
    box.value = words;
    box.dispatchEvent(new Event('input'));
    button(root, words === 'kwenda' ? 'Kwenda Lima' : 'DJ KL').click();
  };
  find(0, 'kwenda');
  find(0, 'kl'); // the first side is chosen: the next search is the other's
  button(root, 'One artist').click();
  button(root, 'Write the claim').click();
  await expect.poll(() => writes().length).toBe(1);
  expect(sentFile(writes()[0]?.init ?? {})).toBe(
    claimText(
      mergeClaim({
        keys: ['p:kwenda', 'p:kl@dj'],
        decision: 'merge',
        note: 'Kwenda Lima / DJ KL: one artist, under two names',
        at: AT,
      }),
    ),
  );
});
