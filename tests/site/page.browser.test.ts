// What the page does, in Chromium: elements as h() builds them, the tab's oval as it moves, the page's slide, and a
// dialog's history entry.
import { afterEach, expect, test } from 'vitest';
import { h } from '../../site/dom.ts';
import { modal } from '../../site/modal.ts';
import { pill, slide } from '../../site/tabs.ts';

afterEach(() => {
  document.body.replaceChildren();
});

test('h() sets attributes, classes, data and listeners, and leaves out what holds nothing', () => {
  let clicks = 0;
  const el = h(
    'button',
    {
      type: 'button',
      class: 'link',
      hidden: false,
      title: null,
      'aria-pressed': true,
      dataset: { nav: 'map' },
      onclick: () => {
        clicks++;
      },
    },
    'Map ',
    [h('span', {}, 2), null, false, undefined, ['!']],
  );
  expect(el.outerHTML).toBe(
    '<button type="button" class="link" aria-pressed="" data-nav="map">Map <span>2</span>!</button>',
  );
  el.click();
  expect(clicks).toBe(1);
});

test('h() puts text in as text, never as HTML', () => {
  expect(h('p', {}, '<b>bold</b>').innerHTML).toBe('&lt;b&gt;bold&lt;/b&gt;');
});

// a row of three tabs, the given one current
function tabs(current: number): HTMLElement {
  const nav = h(
    'nav',
    { style: 'position: relative; display: flex; gap: 8px' },
    ['One', 'Two', 'Three'].map((t, i) => h('a', { href: '#', class: i === current ? 'active' : '' }, t)),
  );
  document.body.append(nav);
  return nav;
}
const pills = (nav: HTMLElement) => [...nav.querySelectorAll<HTMLElement>('.goo .pill')];
const settled = () => Promise.all(document.getAnimations().map((a) => a.finished));

test('the oval sits behind the current tab, in the goo layer that reaches past the row', () => {
  const nav = tabs(1);
  pill(nav, { still: true });
  const [oval] = pills(nav);
  const tab = nav.querySelector<HTMLElement>('a.active');
  expect(oval?.hidden).toBe(false);
  expect(oval?.style.left).toBe(`${(tab?.offsetLeft ?? 0) + 12}px`);
  expect(oval?.style.width).toBe(`${tab?.offsetWidth ?? 0}px`);
});

test('with no current tab, or the row hidden, there is no oval', () => {
  const nav = tabs(-1);
  pill(nav);
  expect(pills(nav).map((p) => p.hidden)).toEqual([true]);
  nav.querySelector('a')?.classList.add('active');
  nav.hidden = true;
  pill(nav);
  expect(pills(nav).map((p) => p.hidden)).toEqual([true]);
});

test('moving to another tab, the slime reaches out an arm and a drop, which are gone once it rests', async () => {
  const nav = tabs(0);
  pill(nav);
  expect(pills(nav)).toHaveLength(1); // the first time it has nowhere to move from
  nav.querySelector('a.active')?.classList.remove('active');
  nav.querySelectorAll('a')[2]?.classList.add('active');
  pill(nav);
  expect(pills(nav)).toHaveLength(4); // the old oval, the arm, the drop and the new oval
  await settled();
  const [oval] = pills(nav);
  expect(pills(nav)).toHaveLength(1);
  expect(oval?.style.left).toBe(`${(nav.querySelectorAll('a')[2]?.offsetLeft ?? 0) + 12}px`);
});

test('a slide changes the page at once with no direction, and marks its direction while it runs', async () => {
  document.body.append(h('main', { id: 'main' }));
  let changed = 0;
  slide(0, () => {
    changed++;
  });
  expect(changed).toBe(1);
  slide(1, () => {
    changed++;
  });
  expect(document.documentElement.dataset['vt']).toBe('ahead');
  await settled();
  await new Promise((done) => requestAnimationFrame(done));
  await expect.poll(() => document.documentElement.dataset['vt']).toBeUndefined();
  expect(changed).toBe(2);
});

test('a dialog has a history entry of its own: the back button closes it, and closing it removes the entry', async () => {
  const before = history.length;
  const opener = h('button', { type: 'button' }, 'Open');
  document.body.append(opener);
  const dlg = h('dialog', {}, h('p', {}, 'Hello'));
  const m = modal(dlg);
  expect(m.open(opener)).toBe(true);
  expect(m.open(opener)).toBe(false); // already open
  expect(history.length).toBe(before + 1);
  await new Promise((done) => {
    addEventListener('popstate', done, { once: true });
    history.back();
  });
  expect(dlg.open).toBe(false);

  m.open(opener);
  dlg.close(); // as Escape does
  await expect.poll(() => document.activeElement).toBe(opener);
  expect(dlg.open).toBe(false);
});
