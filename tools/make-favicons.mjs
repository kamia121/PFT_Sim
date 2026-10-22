/**
 * Rasterizes assets/icons/favicon.svg (the source) into the fallback icons: favicon.ico (PNG-encoded 16, 32 and 48 px images, for
 * browsers without SVG favicons) and apple-touch-icon.png (180 px, opaque, the corners filled with the tile navy because iOS applies
 * its own mask). Uses the pinned Playwright Chromium. Run with `node tools/make-favicons.mjs` after editing the SVG.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const DIR = 'assets/icons';
const NAVY = '#0E2B73';
const svg = fs.readFileSync(`${DIR}/favicon.svg`);
const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
const browser = await chromium.launch({ executablePath: process.env.PFT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });

/** @returns {Promise<Buffer>} a PNG of the icon at `size` device pixels, transparent unless `background` is given */
async function render(size, background) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:${background || 'transparent'}}img{display:block}</style><img src="${uri}" width="${size}" height="${size}">`);
  await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
  const png = await page.screenshot({ omitBackground: !background });
  await page.close();
  return png;
}

const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) pngs.push(await render(s));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(`${DIR}/favicon.ico`, Buffer.concat([head, ...pngs]));
fs.writeFileSync(`${DIR}/apple-touch-icon.png`, await render(180, NAVY));
await browser.close();
console.log(`Wrote ${DIR}/favicon.ico (${sizes.join(', ')} px) and ${DIR}/apple-touch-icon.png (180 px)`);
