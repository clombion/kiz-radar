// Renders docs/share-card.png from share-card.html, and the PNG icons from docs/icon.svg:
//   NODE_PATH="$(npm root -g)" node design/render.cjs      (needs Playwright with Chromium)
const { chromium } = require('playwright');
const path = require('path');
const here = __dirname, docs = path.join(here, '..', 'docs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto('file://' + path.join(here, 'share-card.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(docs, 'share-card.png') });

  // the icon on its own, and on the page colour where a platform wants a square without transparency
  for (const [file, size, padded] of [['favicon-32.png', 32, false], ['apple-touch-icon.png', 180, true], ['icon-512.png', 512, true]]) {
    await page.setViewportSize({ width: size, height: size });
    const pad = padded ? Math.round(size * 0.1) : 0;
    await page.setContent(`<body style="margin:0;background:${padded ? '#f6efe4' : 'transparent'}">
      <img src="file://${path.join(docs, 'icon.svg')}" style="display:block;width:${size - 2 * pad}px;margin:${pad}px"></body>`);
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: path.join(docs, file), omitBackground: !padded });
  }
  await browser.close();
})();
