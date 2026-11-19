// The page's helpers called on elements a test builds, for what no page shows: each test goes with its helper (h() and
// paged with task 4.10, pill and modal with 4.5, dismissable with 4.6, which ports the community page's cards). What a
// visitor sees of each is read on the page: the oval and the slide in tabs.browser.test.ts and
// tabs.calm.browser.test.ts, the rest in elements.browser.test.ts.

import { afterEach, expect, test } from 'vitest';
import { dismissable } from '../../site/dismiss.ts';
import { button, h, paged, toggle } from '../../site/dom.ts';
import { modal } from '../../site/modal.ts';
import { pill } from '../../site/tabs.ts';
import { entries, ovalsOf } from './seen.ts';

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
    ['One', 'Two', 'Three'].map((t, i) => h('a', { href: '#', class: i === current && 'active' }, t)),
  );
  document.body.append(nav);
  return nav;
}

test('with no current tab, or the row hidden, there is no oval', () => {
  const nav = tabs(-1);
  pill(nav);
  expect(ovalsOf(nav).map((p) => p.hidden)).toEqual([true]);
  nav.querySelector('a')?.classList.add('active');
  nav.hidden = true;
  pill(nav);
  expect(ovalsOf(nav).map((p) => p.hidden)).toEqual([true]);
});

test('a dialog has a history entry of its own: the back button closes it, and closing it removes the entry', async () => {
  const before = entries();
  const opener = button({}, 'Open');
  document.body.append(opener);
  const dlg = h('dialog', {}, h('p', {}, 'Hello'));
  const m = modal(dlg);
  expect(m.open(opener)).toBe(true);
  expect(m.open(opener)).toBe(false); // already open
  expect(entries()).toBe(before + 1);
  await new Promise((done) => {
    addEventListener('popstate', done, { once: true });
    history.back();
  });
  expect(dlg.open).toBe(false);

  const state: unknown = history.state;
  m.open(opener);
  expect(history.state).toEqual({ modal: true });
  dlg.close(); // as Escape does
  await expect.poll(() => document.activeElement).toBe(opener);
  expect(dlg.open).toBe(false);
  await expect.poll((): unknown => history.state).toEqual(state); // back on the entry before the dialog's
});

test('a class list leaves out what is false, a style object sets each property, toggle sets one class', () => {
  const el = h('p', { class: ['status', false, 'error', null], style: { '--w': '40%', color: 'red' } });
  expect(el.getAttribute('class')).toBe('status error');
  expect(el.style.getPropertyValue('--w')).toBe('40%');
  expect(el.style.color).toBe('red');
  toggle(el, 'muted', true);
  toggle(el, 'error', false);
  expect(el.getAttribute('class')).toBe('status muted');
});

test('a paged list adds the next page to the rows shown, and showing it again starts over', () => {
  const list = h('ul', {}),
    more = button({});
  document.body.append(list, more);
  const row = (n: number) => h('li', {}, String(n));
  paged({ list, more }, [1, 2, 3, 4, 5], 2, row);
  const first = list.firstElementChild;
  expect([...list.children].map((li) => li.textContent)).toEqual(['1', '2']);
  expect(more.textContent).toBe('Show 2 more');
  more.click();
  more.click();
  expect([...list.children].map((li) => li.textContent)).toEqual(['1', '2', '3', '4', '5']);
  expect(list.firstElementChild).toBe(first); // the rows shown stay as they are
  expect(more.hidden).toBe(true);
  paged({ list, more }, [9], 2, row);
  more.click(); // the old list's listener is gone: nothing more to add
  expect([...list.children].map((li) => li.textContent)).toEqual(['9']);
});

test('a card over the page is the only one open, and goes on Escape, on the focus leaving and on a tap outside', () => {
  const made = () => {
    const opener = button({}, 'open'),
      card = h('div', {}, button({}, 'in the card'));
    const state = { open: false, placed: 0 };
    const shown = dismissable({
      within: () => [opener, card],
      close: () => {
        state.open = false;
        shown.closed();
      },
      place: () => {
        state.placed += 1;
      },
    });
    document.body.append(opener, card);
    const open = () => {
      state.open = true;
      shown.opened();
    };
    return { opener, card, state, open };
  };
  const [a, b] = [made(), made()];
  const elsewhere = button({}, 'elsewhere');
  document.body.append(elsewhere);
  try {
    // one at a time: opening b closes a
    a.open();
    b.open();
    expect([a.state.open, b.state.open]).toEqual([false, true]);
    // Escape wherever the focus is
    elsewhere.focus();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(b.state.open).toBe(false);
    // the focus leaving for elsewhere on the page, not within the card
    a.open();
    a.opener.focus();
    const inside = a.card.querySelector('button');
    expect(inside).not.toBeNull();
    inside?.focus();
    expect(a.state.open).toBe(true);
    elsewhere.focus();
    expect(a.state.open).toBe(false);
    // a tap outside, not inside
    a.open();
    a.card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(a.state.open).toBe(true);
    elsewhere.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(a.state.open).toBe(false);
    // placed again when the window changes size, while it is open only
    a.open();
    dispatchEvent(new Event('resize'));
    a.state.open = false;
    a.opener.focus();
    expect([a.state.placed, b.state.placed]).toEqual([1, 0]);
  } finally {
    for (const el of [a.opener, a.card, b.opener, b.card, elsewhere]) el.remove();
  }
});
