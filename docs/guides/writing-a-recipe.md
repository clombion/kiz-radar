# Writing a recipe

A recipe says where a ticket site's rows are, so that every later read of its pages is code. One per site:
`pipeline/tickets/sites/<site>.json`, a `PageRecipe` or an `ApiRecipe` of `pipeline/records.py`, whose field
descriptions are the reference. Write one when `mise run tickets -- read ID` says the site has none (the festival waits
for a `recipe`), and fix one when it says `layout_broken` (`recipe_fix`).

## Look at the page

```bash
mise run read-page -- URL --screenshot page.png   # the page's text as a browser shows it, and a screenshot
```

Then its HTML, to find the element that holds one ticket.

## A page recipe

`row` is a CSS selector matching each ticket; each field says where its value is in the row:

| A field says | It reads |
| -- | -- |
| `css` | the first element matching it inside the row (`null`: the row itself) |
| `attr` | that element's attribute (`null`: its text) |
| `match` | the first group of this JavaScript regular expression in it (no group: the whole match) |
| `up` | inside the row's nearest enclosing element matching this selector instead |
| `all` | every match inside the row, joined by " · " |
| `page` | every match on the whole page, joined by line (script data kept apart from the rows) |

A `css` or a `match` may name the row's other fields as `{field}` and the row element's attributes as `{@attr}`, filled
in once those are read and escaped (as CSS in a selector, as a regex in a pattern): Tikoria's ticket ids sit in its
script data next to each name, Kizzbee's prices in a JSON attribute keyed by each option's value. A row is a match
holding no other match. The fields are the ticket's key (its id on the site, the same on every read), name, price as
shown, amount, currency, and optionally a booking fee shown apart ("+ €1.00 fee", added to the amount), a second price,
and a sold-out mark. A free ticket shown as a word ("Free", "Gratuit") costs 0. A currency symbol is read by
`pipeline/currencies.py`.

The recipe also says whether the tickets sit on another address (a widget, built from a pattern in the link or its page:
Eventbrite's event page leads to its checkout), which sections to click open, whether the site needs a visible browser
(FairPlay, behind a browser check), and the reseller, when the site sells other organisers' festivals at its own prices
(used only when the festival sells nowhere else, and said in the passes view).

`pipeline/rows.js` is the function that applies a page recipe in the page; `tests/site/recipes.browser.test.ts` shows
each of these on a small page.

## An API recipe

A site whose tickets come as JSON gets an `api`: from its API (go&dance: the event's id found on its page, then the
API's address) or embedded in its page (Kizzbee's variations). Each field is a path into a ticket's JSON, a pattern on
the page that may name the ticket's values, or a text built from them, so each ticket is read from its own record. It
reads with plain requests, no browser; an empty list is a page that lists nothing.

## Check it

```bash
mise run tickets -- read ID
```

The read prints the rows: every ticket once, each with its key, name, price, amount and currency. Then go on with the
first read ([Prices from ticket pages](ticket-pages.md)). A site no recipe can read (behind a check that a visitor is
human) gets a site claim instead ([Claims](../concepts/claims.md)), and its festivals wait for nothing.
