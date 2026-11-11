// One-off: capture full-page screenshots of every page. Not part of the site.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const base = process.env.BASE_URL || 'http://localhost:3000';
const outDir = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(outDir, { recursive: true });

const pages = [
  ['home', '/'], ['about', '/about'], ['rsvp', '/rsvp'], ['schedule', '/schedule'],
  ['travel', '/travel'], ['details', '/details'], ['wedding-party', '/wedding-party'],
  ['gallery', '/gallery'], ['faq', '/faq'], ['registry', '/registry'], ['songs', '/songs'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
for (const [name, path] of pages) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outDir + name + '.png', fullPage: true });
  console.log(name + '.png');
}
await browser.close();
console.log('DONE');
