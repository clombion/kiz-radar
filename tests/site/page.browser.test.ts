// The page's helpers called on elements a test builds, for what no page shows: each test goes with its helper (h(),
// toggle and paged with task 4.10). What a visitor sees of each is read on the page, in elements.browser.test.ts.

import { afterEach, expect, test } from 'vitest';
import { button, h, paged, toggle } from '../../site/dom.ts';

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
