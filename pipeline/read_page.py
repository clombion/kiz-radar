"""Read one web page the way a person's browser shows it, for a one-off check: its text on stdout, and a screenshot
if asked. For pages a plain request can't read: pages built by JavaScript (a ticket widget), and pages behind a
browser check such as Vercel's Security Checkpoint that a person can open in any browser.

It opens Chromium through Patchright, a Playwright build that doesn't announce automation. Headless is enough for
JavaScript pages; --visible opens it on a virtual display instead, since browser checks refuse headless browsers.
On Linux without a display, --visible restarts itself under xvfb-run.

    mise run read-page -- URL                         # the page's text
    mise run read-page -- URL --visible               # for a page behind a browser check
    mise run read-page -- URL --screenshot page.png   # and a full-page screenshot

One page per run, for a person's one-off question; never in a scheduled job or a loop of one's own. The one
scheduled reader is pipeline/tickets.py, which reads ticket pages through rows() below, by a site recipe.
Finding the Chromium: --browser, else the Playwright browsers in /opt/pw-browsers, else Patchright's own
(`uv run --group browser patchright install chromium`).
"""

import argparse
import contextlib
import os
import shutil
import sys
from collections.abc import Generator
from pathlib import Path
from typing import TYPE_CHECKING, cast

from pydantic import TypeAdapter

from pipeline.records import PageRecipe

if TYPE_CHECKING:
    from patchright.sync_api import Browser, Page, Playwright

RAW: TypeAdapter[list[dict[str, str | None]]] = TypeAdapter(list[dict[str, str | None]])


def chromium() -> str | None:
    found = sorted(Path('/opt/pw-browsers').glob('chromium-*/chrome-linux*/chrome'))
    return str(found[-1]) if found else None


class RecipeError(Exception):
    """A site recipe's selectors or patterns fail on the page that loaded."""


class UnreachableError(Exception):
    """The page could not be reached or would not load: the connection was reset or timed out, the host is unknown."""


class NoBrowserError(Exception):
    """Chromium would not start: no read can be made here (see the module's notes on finding it)."""


class Browsers(contextlib.AbstractContextManager['Browsers']):
    """The Chromiums one run reads its pages with: a headless one and a visible one at most, each started at the first
    page that needs it and closed with the run, every page in a context of its own (no cookies shared between pages).
    NoBrowserError when one would not start; path is the Chromium to run (default: see the module's notes)."""

    def __init__(self, path: str | None = None) -> None:
        self.path = path
        self.started: dict[bool, Browser] = {}
        self.driver: Playwright | None = None

    def __exit__(self, *_: object) -> None:
        for b in self.started.values():
            b.close()
        if self.driver:
            self.driver.stop()

    def get(self, *, visible: bool) -> 'Browser':
        from patchright.sync_api import Error, sync_playwright

        if visible not in self.started:
            self.driver = self.driver or sync_playwright().start()
            try:
                self.started[visible] = self.driver.chromium.launch(
                    executable_path=self.path or chromium(), headless=not visible
                )
            except Error as e:
                raise NoBrowserError(str(e).splitlines()[0]) from e
        return self.started[visible]


@contextlib.contextmanager
def opened(
    url: str, browsers: Browsers, wait: int = 10, *, visible: bool = False
) -> Generator[tuple['Page', int | None, str]]:
    """(the page, its HTTP status, its title) once loaded and settled: UnreachableError when it would not load,
    NoBrowserError when no browser would start. visible needs a display (see on_display)."""
    from patchright.sync_api import Error

    context = browsers.get(visible=visible).new_context(locale='en-GB')
    try:
        page = context.new_page()
        try:
            response = page.goto(url, wait_until='domcontentloaded', timeout=60000)
            page.wait_for_timeout(wait * 1000)
            title = page.title()
        except Error as e:  # a timeout among them
            raise UnreachableError(str(e).splitlines()[0]) from e
        yield page, response.status if response else None, title
    finally:
        context.close()


def click_all(page: 'Page', selector: str) -> None:
    """Click every match of a CSS selector that can be clicked when its turn comes, to open sections a page shows
    collapsed: a page may keep hidden copies of a button for other screen sizes, and a dialog the first click opens
    covers the others. What stays shut leaves its rows unread, which a recipe's read reports."""
    from patchright.sync_api import TimeoutError as Unclickable

    for el in page.query_selector_all(selector):
        try:
            el.click(trial=True, timeout=2000)
        except Unclickable:
            continue
        el.click()
    page.wait_for_timeout(1500)


def page_text(
    url: str, wait: int = 10, *, visible: bool = False, browser: str | None = None, screenshot: str | None = None
) -> tuple[str, int | None, str]:
    """(title, HTTP status, the page's text as shown)."""
    with Browsers(browser) as browsers, opened(url, browsers, wait, visible=visible) as (page, status, title):
        out = title, status, page.inner_text('body')
        if screenshot:
            _ = page.screenshot(path=screenshot, full_page=True)
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
    const base = f.up ? el.closest(f.up) : el;
    const targets = f.page ? [...document.querySelectorAll(css)] : !base ? [] :
      f.all ? [...base.querySelectorAll(css)] : [css ? base.querySelector(css) : base];
    const vs = targets.filter(Boolean).map(t => f.attr ? t.getAttribute(f.attr) : t.innerText).filter(v => v != null);
    if (!vs.length) return null;
    if (f.all) return vs.map(v => v.trim()).join(' · ');
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


def rows(
    url: str, recipe: PageRecipe, browsers: Browsers, *, visible: bool | None = None
) -> tuple[int | None, str, list[dict[str, str | None]]]:
    """(HTTP status, title, the page's ticket rows) read by a site recipe (pipeline/records.py, PageRecipe): each
    row maps the recipe's fields to the string found, or None. RecipeError is the recipe's failing on the page that
    loaded; UnreachableError and NoBrowserError as opened() raises them."""
    from patchright.sync_api import Error

    shown = recipe.visible if visible is None else visible
    with opened(url, browsers, recipe.wait, visible=shown) as (page, status, title):
        try:
            if recipe.open:
                click_all(page, recipe.open)
            found = cast(
                'object', page.evaluate(ROWS_JS, [recipe.row, recipe.fields.model_dump(mode='json', by_alias=True)])
            )
        except Error as e:
            raise RecipeError(str(e).splitlines()[0]) from e
        return status, title, RAW.validate_python(found)


def on_display() -> None:
    """Run this process again under a virtual display (xvfb-run) when on Linux without one, so a visible browser
    can open; elsewhere a visible browser needs none."""
    if sys.platform != 'linux' or os.environ.get('DISPLAY'):
        return
    if not shutil.which('xvfb-run'):
        sys.exit('no display and no xvfb-run: install xvfb, or run where a display is available')
    os.execvp('xvfb-run', ['xvfb-run', '-a', *sys.orig_argv])  # the same interpreter, flags and -m module  # noqa: S606, S607 (this process again, under xvfb-run from PATH)


class Args(argparse.Namespace):
    url: str = ''
    visible: bool = False
    screenshot: str | None = None
    wait: int = 10
    browser: str | None = None


def main() -> None:
    ap = argparse.ArgumentParser(description='Read one web page as a browser shows it: text on stdout.')
    _ = ap.add_argument('url')
    _ = ap.add_argument(
        '--visible', action='store_true', help='a visible browser on a virtual display, for browser checks'
    )
    _ = ap.add_argument('--screenshot', help='also save a full-page screenshot here (PNG)')
    _ = ap.add_argument(
        '--wait', type=int, default=10, help='seconds to let the page settle after loading (default 10)'
    )
    _ = ap.add_argument('--browser', help='the Chromium to run (default: see above)')
    a = ap.parse_args(namespace=Args())
    if a.visible:
        on_display()
    title, status, text = page_text(a.url, a.wait, visible=a.visible, browser=a.browser, screenshot=a.screenshot)
    print(f'# {title} ({status or "no response"})', file=sys.stderr)
    print(text)


if __name__ == '__main__':
    main()
