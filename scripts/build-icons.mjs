// Rasterizes brand/answeronce-icon.svg into the extension and landing icons.
// Run with `pnpm icons` after changing the SVG.
import { chromium } from '@playwright/test';
import { copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const svg = readFileSync(path.join(root, 'brand/answeronce-icon.svg'), 'utf8');

const outputs = [
  ...[16, 32, 48, 128, 512].map((size) => ({ size, file: `public/icon/${size}.png` })),
  { size: 32, file: 'landing/public/favicon-32.png' },
  { size: 180, file: 'landing/public/apple-touch-icon.png' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg id="icon" ')}</body>`);
for (const { size, file } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.$eval('#icon', (el, s) => el.setAttribute('style', `display:block;width:${s}px;height:${s}px`), size);
  await page.locator('#icon').screenshot({ path: path.join(root, file), omitBackground: true });
  console.log(`${file} (${size}px)`);
}
await browser.close();
copyFileSync(path.join(root, 'brand/answeronce-icon.svg'), path.join(root, 'landing/public/favicon.svg'));
console.log('landing/public/favicon.svg');
