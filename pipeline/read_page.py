# /// script
# requires-python = ">=3.11"
# dependencies = ["patchright==1.55.2"]
# ///
"""Read one web page the way a person's browser shows it, for a one-off check: its text on stdout, and a screenshot
if asked. For pages a plain request can't read: pages built by JavaScript (a ticket widget), and pages behind a
browser check such as Vercel's Security Checkpoint that a person can open in any browser.

It opens Chromium through Patchright, a Playwright build that doesn't announce automation. Headless is enough for
JavaScript pages; --visible opens it on a virtual display instead, since browser checks refuse headless browsers.
Without a display, --visible restarts itself under xvfb-run.

    uv run pipeline/read_page.py URL                         # the page's text
    uv run pipeline/read_page.py URL --visible               # for a page behind a browser check
    uv run pipeline/read_page.py URL --screenshot page.png   # and a full-page screenshot

One page per run, for a person's one-off question; never in a scheduled job or a loop of one's own. The one
scheduled reader is pipeline/tickets.py, which reads ticket pages through rows() below, by a site recipe.
Finding the Chromium: --browser, else the Playwright browsers in /opt/pw-browsers, else Patchright's own
(`uvx patchright install chromium`).
"""
import argparse, contextlib, glob, os, shutil, sys

def chromium():
    found = sorted(glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome'))
    return found[-1] if found else None

@contextlib.contextmanager
def opened(url, wait=10, visible=False, browser=None, click=None):
    """(the page, its HTTP status) once loaded and settled. visible needs a display (see main). click: a CSS
    selector whose every match is clicked first, to open sections a page shows collapsed."""
    from patchright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=browser or chromium(), headless=not visible)
        try:
            page = b.new_page(locale='en-GB')
            response = page.goto(url, wait_until='domcontentloaded', timeout=60000)
            page.wait_for_timeout(wait * 1000)
            if click:
                for el in page.query_selector_all(click):
                    el.click()
                page.wait_for_timeout(1500)
            yield page, response.status if response else None
        finally:
            b.close()

def page_text(url, wait=10, visible=False, browser=None, screenshot=None, click=None):
    """(title, HTTP status, the page's text as shown)."""
    with opened(url, wait, visible, browser, click) as (page, status):
        out = page.title(), status, page.inner_text('body')
        if screenshot:
            page.screenshot(path=screenshot, full_page=True)
    return out

# every element matching the row selector that holds no other match, as {field: string or null}
ROWS_JS = """([row, fields]) => {
  const all = [...document.querySelectorAll(row)];
  const get = (el, f) => {
    if (!f) return null;
    const t = f.css ? el.querySelector(f.css) : el;
    const v = t && (f.attr ? t.getAttribute(f.attr) : t.innerText);
    if (v == null) return null;
    const m = f.match ? v.match(new RegExp(f.match)) : [v];
    return m ? (m[1] ?? m[0]) : null;
  };
  return all.filter(el => !all.some(o => o !== el && el.contains(o)))
    .map(el => Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, get(el, f)])));
}"""

def rows(url, recipe, visible=None, browser=None):
    """(HTTP status, title, the page's ticket rows) read by a site recipe (pipeline/tickets/schemas/site.json): each
    row maps the recipe's fields to the string found, or None."""
    with opened(url, recipe['wait'], recipe['visible'] if visible is None else visible, browser, recipe['open']) as (page, status):
        return status, page.title(), page.evaluate(ROWS_JS, [recipe['row'], recipe['fields']])

def main():
    ap = argparse.ArgumentParser(description='Read one web page as a browser shows it: text on stdout.')
    ap.add_argument('url')
    ap.add_argument('--visible', action='store_true', help='a visible browser on a virtual display, for browser checks')
    ap.add_argument('--screenshot', help='also save a full-page screenshot here (PNG)')
    ap.add_argument('--wait', type=int, default=10, help='seconds to let the page settle after loading (default 10)')
    ap.add_argument('--browser', help='the Chromium to run (default: see above)')
    a = ap.parse_args()
    if a.visible and not os.environ.get('DISPLAY'):
        if not shutil.which('xvfb-run'):
            sys.exit('no display and no xvfb-run: install xvfb, or run where a display is available')
        os.execvp('xvfb-run', ['xvfb-run', '-a', sys.executable, *sys.argv])
    title, status, text = page_text(a.url, a.wait, a.visible, a.browser, a.screenshot)
    print(f'# {title} ({status or "no response"})', file=sys.stderr)
    print(text)

if __name__ == '__main__':
    main()
