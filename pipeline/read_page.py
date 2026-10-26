# /// script
# requires-python = ">=3.11"
# dependencies = ["patchright==1.55.2"]
# ///
"""Read one web page the way a person's browser shows it, for a one-off check: its text on stdout, and a screenshot
if asked. For pages a plain request can't read (a browser check such as Vercel's Security Checkpoint turns it away)
but a person can open in any browser, like a festival's ticket page.

It opens a visible Chromium (Patchright, a Playwright build that doesn't announce automation) on a virtual display,
since checkpoints refuse headless browsers. Without a display it restarts itself under xvfb-run.

    uv run pipeline/read_page.py URL                         # the page's text
    uv run pipeline/read_page.py URL --screenshot page.png   # and a full-page screenshot
    uv run pipeline/read_page.py URL --wait 20               # wait longer for the page to settle

One page per run, for a person's one-off question. Not for scheduled jobs or many pages: those use the site's
API or plain requests (pipeline/scrape.py). Finding the Chromium: --browser, else the Playwright browsers in
/opt/pw-browsers, else Patchright's own (`uvx patchright install chromium`).
"""
import argparse, glob, os, shutil, sys

def chromium():
    found = sorted(glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome'))
    return found[-1] if found else None

def main():
    ap = argparse.ArgumentParser(description='Read one web page as a browser shows it: text on stdout.')
    ap.add_argument('url')
    ap.add_argument('--screenshot', help='also save a full-page screenshot here (PNG)')
    ap.add_argument('--wait', type=int, default=10, help='seconds to let the page settle after loading (default 10)')
    ap.add_argument('--browser', help='the Chromium to run (default: see above)')
    a = ap.parse_args()

    if not os.environ.get('DISPLAY'):
        if not shutil.which('xvfb-run'):
            sys.exit('no display and no xvfb-run: install xvfb, or run where a display is available')
        os.execvp('xvfb-run', ['xvfb-run', '-a', sys.executable, *sys.argv])

    from patchright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=a.browser or chromium(), headless=False)
        page = browser.new_page(locale='en-GB')
        response = page.goto(a.url, wait_until='domcontentloaded', timeout=60000)
        page.wait_for_timeout(a.wait * 1000)
        print(f'# {page.title()} ({response.status if response else "no response"})', file=sys.stderr)
        print(page.inner_text('body'))
        if a.screenshot:
            page.screenshot(path=a.screenshot, full_page=True)
        browser.close()

if __name__ == '__main__':
    main()
