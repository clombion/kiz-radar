// The built site as GitHub Pages serves it, under /kiz-radar/ (vitest.config.ts serves public/ there), whole in a
// frame: a community's one address, c/<key>/, is its page, an older #community/<key> link moves to it, and the tabs
// from it go to the site's root. The data is the fixture's (community.fixture.ts), and a community's page the site's
// page from its address: what pipeline/generate.py adds, its head tags, tests/test_community_card.py tests.
import { expect, test, vi } from 'vitest';
import { festivalsHref, TABS } from '../../site/routes.ts';
import { FIXTURE_COMMUNITY, FIXTURE_NAME } from './community.fixture.ts';

const ROOT = '/kiz-radar/';
const KEY = FIXTURE_COMMUNITY;
const NAME = FIXTURE_NAME;

// a frame of the site at an address, once its community page or view has drawn
async function framed(address: string, drawn: string): Promise<HTMLIFrameElement> {
  for (const old of document.querySelectorAll('iframe')) old.remove();
  const frame = document.createElement('iframe');
  frame.style.width = '1000px';
  frame.style.height = '800px';
  frame.src = address;
  document.body.append(frame);
  await vi.waitFor(
    () => {
      if (!frame.contentDocument?.querySelector(drawn)) throw new Error(`${address} has drawn no ${drawn} yet`);
    },
    { timeout: 30_000, interval: 100 },
  );
  return frame;
}
const where = (frame: HTMLIFrameElement) => {
  const at = frame.contentWindow?.location;
  return `${at?.pathname ?? ''}${at?.search ?? ''}${at?.hash ?? ''}`;
};
// once the frame shows the Friends tab
const onFriends = (frame: HTMLIFrameElement) =>
  vi.waitFor(
    () => {
      if (!frame.contentDocument?.querySelector('.friends-near')) throw new Error('not on the Friends tab yet');
    },
    { timeout: 30_000, interval: 100 },
  );
const heading = (frame: HTMLIFrameElement) => frame.contentDocument?.querySelector('.profile-head h1')?.textContent;

test('a community’s address is its page: the site, its own title, and the address kept', async () => {
  const frame = await framed(`${ROOT}c/${KEY}/`, '.profile-head h1');
  expect([heading(frame), where(frame), frame.contentDocument?.title]).toEqual([
    NAME,
    `${ROOT}c/${KEY}/`,
    `${NAME} · Kiz Radar`,
  ]);
  // no step elsewhere
  expect(frame.contentDocument?.querySelector('meta[http-equiv="refresh"]')).toBeNull();
});

test('its Share button gives its address', async () => {
  const frame = await framed(`${ROOT}c/${KEY}/`, '.share-row button');
  const shared = vi.fn(() => Promise.resolve());
  Object.defineProperty(frame.contentWindow?.navigator, 'share', { value: shared, configurable: true });
  frame.contentDocument?.querySelector<HTMLButtonElement>('.share-row button')?.click();
  expect(shared).toHaveBeenCalledWith({ title: NAME, url: `${location.origin}${ROOT}c/${KEY}/` });
});

test('an older #community/<key> link moves to the community’s address and shows its page', async () => {
  const frame = await framed(`${ROOT}#community/${KEY}`, '.profile-head h1');
  expect([heading(frame), where(frame)]).toEqual([NAME, `${ROOT}c/${KEY}/`]);
  // its links still the root's, the address moved or not
  expect(frame.contentDocument?.querySelector<HTMLAnchorElement>('a.brand')?.href).toBe(
    `${location.origin}${ROOT}${festivalsHref()}`,
  );
});

test('the tabs and the brand from a community’s page go to the site’s root', async () => {
  const frame = await framed(`${ROOT}c/${KEY}/`, '.profile-head h1');
  const links = [...(frame.contentDocument?.querySelectorAll<HTMLAnchorElement>('nav.tabs a, a.brand') ?? [])];
  expect(links.map((a) => a.href)).toEqual([
    `${location.origin}${ROOT}${festivalsHref()}`, // the brand
    ...TABS.map(([, , href]) => `${location.origin}${ROOT}${href}`),
  ]);
  frame.contentDocument?.querySelector<HTMLAnchorElement>('nav.tabs a[data-nav="friends"]')?.click();
  await onFriends(frame);
  expect(where(frame)).toBe(`${ROOT}${TABS.find(([nav]) => nav === 'friends')?.[2]}`);
});

test('the currency asked for stays through a choice, a tab and a community’s page', async () => {
  // the festivals in, so nothing of the first view is still to draw
  const frame = await framed(`${ROOT}?cur=eur${festivalsHref()}`, '.festival-cards, .sentence-results .empty');
  const months = frame.contentDocument?.querySelector<HTMLSelectElement>('.sentence-hero select');
  if (months) {
    months.selectedIndex = 0;
    months.dispatchEvent(new Event('change'));
  }
  expect(where(frame)).toMatch(new RegExp(`^${ROOT}\\?cur=eur#finder\\?when=weekend`, 'u'));
  frame.contentDocument?.querySelector<HTMLAnchorElement>('nav.tabs a[data-nav="friends"]')?.click();
  await onFriends(frame);
  await vi.waitFor(() => expect(where(frame)).toBe(`${ROOT}?cur=eur${TABS.find(([nav]) => nav === 'friends')?.[2]}`));
  const community = await framed(`${ROOT}c/${KEY}/?cur=eur`, '.profile-head h1');
  expect(community.contentDocument?.querySelector<HTMLAnchorElement>('a.brand')?.href).toBe(
    `${location.origin}${ROOT}?cur=eur${festivalsHref()}`,
  );
});
