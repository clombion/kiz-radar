"""Read one web page the way a person's browser shows it, for a one-off check: its text on stdout, and a screenshot
if asked. For pages a plain request can't read: pages built by JavaScript (a ticket widget), and pages behind a
browser check such as Vercel's Security Checkpoint that a person can open in any browser.

It opens Chromium through Patchright, a Playwright build that doesn't announce automation. Headless is enough for
JavaScript pages; --visible opens it on a virtual display instead, since browser checks refuse headless browsers.
On Linux without a display, --visible restarts itself under xvfb-run.

    uv run --group browser -m pipeline.read_page URL                         # the page's text
    uv run --group browser -m pipeline.read_page URL --visible               # for a page behind a browser check
    uv run --group browser -m pipeline.read_page URL --screenshot page.png   # and a full-page screenshot

One page per run, for a person's one-off question; never in a scheduled job or a loop of one's own. The one
scheduled reader is pipeline/tickets.py, which reads ticket pages through rows() below, by a site recipe.
Finding the Chromium: --browser, else the Playwright browsers in /opt/pw-browsers, else Patchright's own
(`uv run --group browser patchright install chromium`).
"""
import argparse, contextlib, glob, os, shutil, sys

def chromium():
    found = sorted(glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome'))
    return found[-1] if found else None

class RecipeError(Exception):
    """A site recipe's selectors or patterns fail on the page that loaded."""


@contextlib.contextmanager
def opened(url, wait=10, visible=False, browser=None):
    """(the page, its HTTP status) once loaded and settled. visible needs a display (see on_display)."""
    from patchright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=browser or chromium(), headless=not visible)
        try:
            page = b.new_page(locale='en-GB')
            response = page.goto(url, wait_until='domcontentloaded', timeout=60000)
            page.wait_for_timeout(wait * 1000)
            yield page, response.status if response else None
        finally:
            b.close()

def click_all(page, selector):
    """Click every match of a CSS selector, to open sections a page shows collapsed."""
    for el in page.query_selector_all(selector):
        el.click()
    page.wait_for_timeout(1500)

def page_text(url, wait=10, visible=False, browser=None, screenshot=None):
    """(title, HTTP status, the page's text as shown)."""
    with opened(url, wait, visible, browser) as (page, status):
        out = page.title(), status, page.inner_text('body')
        if screenshot:
            page.screenshot(path=screenshot, full_page=True)
    return out

# every element matching the row selector that holds no other match, as {field: string or null}. A field reads the
# first match of its css inside the row (the row itself when css is null), or with page set every match on the page,
# joined by line; css and match may name the row's other fields as {field} and the row element's attributes as
# {@attr} (a name starting with a letter, so {3} stays a regex count), filled in, escaped, once those are read.
ROWS_JS = """([row, fields]) => {
  const all = [...document.querySelectorAll(row)];
  const escRe = s => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  const fill = (t, el, vals, re) => t.replace(/\\{(@?)([A-Za-z_][\\w-]*)\\}/g, (_, at, k) => {
    const v = at ? el.getAttribute(k) : vals[k];
    return v == null ? '\\u0000' : (re ? escRe(v) : CSS.escape(v));
  });
  const templated = f => f && /\\{@?[A-Za-z_][\\w-]*\\}/.test((f.css || '') + (f.match || ''));
  const get = (el, f, vals) => {
    if (!f) return null;
    const css = f.css && fill(f.css, el, vals, false);
    const targets = f.page ? [...document.querySelectorAll(css)] : [css ? el.querySelector(css) : el];
    const vs = targets.filter(Boolean).map(t => f.attr ? t.getAttribute(f.attr) : t.innerText).filter(v => v != null);
    if (!vs.length) return null;
    const m = f.match ? vs.join('\\n').match(new RegExp(fill(f.match, el, vals, true))) : [vs.join('\\n')];
    return m ? (m[1] ?? m[0]) : null;
  };
  return all.filter(el => !all.some(o => o !== el && el.contains(o))).map(el => {
    const vals = {};
    for (const [k, f] of Object.entries(fields)) if (!templated(f)) vals[k] = get(el, f, vals);
    for (const [k, f] of Object.entries(fields)) if (templated(f)) vals[k] = get(el, f, vals);
    return Object.fromEntries(Object.keys(fields).map(k => [k, vals[k] ?? null]));
  });
}"""

def rows(url, recipe, visible=None, browser=None):
    """(HTTP status, title, the page's ticket rows) read by a site recipe (pipeline/tickets/schemas/site.json): each
    row maps the recipe's fields to the string found, or None. Patchright's errors are the page's (it would not
    load); RecipeError is the recipe's."""
    from patchright.sync_api import Error
    with opened(url, recipe['wait'], recipe['visible'] if visible is None else visible, browser) as (page, status):
        title = page.title()
        try:
            if recipe['open']:
                click_all(page, recipe['open'])
            return status, title, page.evaluate(ROWS_JS, [recipe['row'], recipe['fields']])
        except Error as e:
            raise RecipeError(str(e).splitlines()[0]) from e

def on_display():
    """Run this process again under a virtual display (xvfb-run) when on Linux without one, so a visible browser
    can open; elsewhere a visible browser needs none."""
    if sys.platform != 'linux' or os.environ.get('DISPLAY'):
        return
    if not shutil.which('xvfb-run'):
        sys.exit('no display and no xvfb-run: install xvfb, or run where a display is available')
    os.execvp('xvfb-run', ['xvfb-run', '-a', *sys.orig_argv])      # the same interpreter, flags and -m module

def main():
    ap = argparse.ArgumentParser(description='Read one web page as a browser shows it: text on stdout.')
    ap.add_argument('url')
    ap.add_argument('--visible', action='store_true', help='a visible browser on a virtual display, for browser checks')
    ap.add_argument('--screenshot', help='also save a full-page screenshot here (PNG)')
    ap.add_argument('--wait', type=int, default=10, help='seconds to let the page settle after loading (default 10)')
    ap.add_argument('--browser', help='the Chromium to run (default: see above)')
    a = ap.parse_args()
    if a.visible:
        on_display()
    title, status, text = page_text(a.url, a.wait, a.visible, a.browser, a.screenshot)
    print(f'# {title} ({status or "no response"})', file=sys.stderr)
    print(text)

if __name__ == '__main__':
    main()
