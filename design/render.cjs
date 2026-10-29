// Renders public/share-card.png from share-card.html, with the cities of the festivals coming up taken from the site
// database, and the icons from public/mark.svg: the favicon public/icon.svg (the mark, in light colours on dark tabs),
// the animated public/loading.svg, and the PNGs.
//   NODE_PATH="$(npm root -g)" node design/render.cjs      (needs Playwright with Chromium, and python3)
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const here = __dirname, site = path.join(here, '..', 'public');
const places = execFileSync('python3', ['-c', `import sqlite3, json, sys
db = sqlite3.connect(sys.argv[1])
print(json.dumps(db.execute('''select round(avg(lat), 3), round(avg(lon), 3), count(*) from event_rows
  where upcoming and lat is not null group by city, country_code''').fetchall()))`, path.join(site, 'data', 'kiz.sqlite')]).toString();

const mark = fs.readFileSync(path.join(site, 'mark.svg'), 'utf8');
fs.writeFileSync(path.join(site, 'icon.svg'), mark.replace('</style>',
  '@media (prefers-color-scheme:dark){.a{fill:#fffbf5;stroke:#fffbf5}.b{fill:#f6a9c6;stroke:#f6a9c6}}</style>'));
// the loading mark: the sweep turns round the ring while the two dancers lean in and out
fs.writeFileSync(path.join(site, 'loading.svg'), mark.replace('</style>', `
.sweep{transform-origin:32px 36px;animation:sweep 1.6s linear infinite}
.lead,.follow{animation:lean 1.6s ease-in-out infinite}.follow{--d:-1px}.lead{--d:1px}
@keyframes sweep{to{transform:rotate(360deg)}}
@keyframes lean{50%{transform:translateX(var(--d))}}
@media (prefers-reduced-motion:reduce){.sweep,.lead,.follow{animation:none}}</style>`));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.addInitScript(`window.PLACES = ${places}`);
  await page.goto('file://' + path.join(here, 'share-card.html'));
  await page.evaluate(() => Promise.all([document.fonts.ready, window.ready]));
  await page.screenshot({ path: path.join(site, 'share-card.png') });

  // the icon on its own, and on the page colour where a platform wants a square without transparency
  for (const [file, size, padded] of [['favicon-32.png', 32, false], ['apple-touch-icon.png', 180, true], ['icon-512.png', 512, true]]) {
    await page.setViewportSize({ width: size, height: size });
    const pad = padded ? Math.round(size * 0.1) : 0;
    await page.setContent(`<body style="margin:0;background:${padded ? '#f6efe4' : 'transparent'}">
      <img src="file://${path.join(site, 'mark.svg')}" style="display:block;width:${size - 2 * pad}px;margin:${pad}px"></body>`);
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: path.join(site, file), omitBackground: !padded });
  }
  await browser.close();
})();
