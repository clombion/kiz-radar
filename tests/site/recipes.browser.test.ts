// The function every page recipe reads its tickets with (pipeline/rows.js, which read_page.py runs in the ticket
// page), in Chromium on pages made for each thing a recipe's field can say (records.Find): the row, its css, attr and
// match, up, all and page, and the {field} and {@attr} a css or a match names.
import { afterEach, expect, test } from 'vitest';
import rows, { type Find } from '../../pipeline/rows.js';

const page = (html: string) => {
  document.body.innerHTML = html;
};
afterEach(() => {
  document.body.replaceChildren();
});
const find = (f: Partial<Find>): Find => ({ css: null, attr: null, match: null, ...f });
const NAME = find({ css: 'b' }); // a ticket's name, in bold
// the rows of the page's .t elements, by these fields
const ticketRows = (fields: Record<string, Find | null>) => rows(['.t', fields]);

test('a row is each match that holds no other, and a field reads the first of its css inside it', () => {
  page(`<div class="t"><div class="t"><b>Full pass</b><i>€90</i></div></div>
        <div class="t"><b>Party pass</b><i>€40</i><i>€45</i></div>`);
  expect(ticketRows({ name: NAME, price: find({ css: 'i' }), none: null })).toEqual([
    { name: 'Full pass', price: '€90', none: null },
    { name: 'Party pass', price: '€40', none: null },
  ]);
});

test('a field reads the row itself, an attribute, and the first group of its match, or all of it', () => {
  page('<p class="t" data-id="t-7">Full pass, 90,00 EUR</p>');
  expect(
    ticketRows({
      key: find({ attr: 'data-id', match: 't-(\\d+)' }),
      whole: find({ match: '\\d+,\\d+ EUR' }),
      amount: find({ match: '(\\d+),\\d+' }),
      missing: find({ css: 'span' }),
      unmatched: find({ match: 'USD' }),
    }),
  ).toEqual([{ key: '7', whole: '90,00 EUR', amount: '90', missing: null, unmatched: null }]);
});

test('up reads inside the row’s enclosing element; all joins every match; page reads the whole page', () => {
  page(`<section data-day="Sat"><h3>Saturday</h3>
          <ul><li class="t">Party<em>DJ A</em><em>DJ B</em></li></ul></section>
        <script type="application/json" class="data">{"fee": 2}</script><span class="data">{"fee": 3}</span>`);
  expect(
    ticketRows({
      day: find({ css: 'h3', up: 'section' }),
      djs: find({ css: 'em', all: true }),
      data: find({ css: '.data', page: true }),
    }),
  ).toEqual([{ day: 'Saturday', djs: 'DJ A · DJ B', data: '{"fee": 2}\n{"fee": 3}' }]);
});

test('a css or a match names the row’s other fields and attributes, filled in and escaped', () => {
  page(`<div class="t" data-ref="a.b"><b>Full (early)</b></div>
        <p id="price-a.b">€90</p>
        <script class="prices">{"Full (early)": "80"}</script>`);
  expect(
    ticketRows({
      name: NAME,
      price: find({ css: '#price-{@data-ref}', page: true }), // a dot in the id, escaped as CSS
      amount: find({ css: '.prices', page: true, match: '"{name}": "(\\d+)"' }), // parentheses, escaped as a regex
      none: find({ css: '#price-{@data-none}', page: true }), // an attribute the row hasn't: nothing matches
    }),
  ).toEqual([{ name: 'Full (early)', price: '€90', amount: '80', none: null }]);
});

test('a regex count is no field', () => {
  page('<p class="t">2026-11-06</p>');
  expect(ticketRows({ year: find({ match: '(\\d{4})' }) })).toEqual([{ year: '2026' }]);
});
