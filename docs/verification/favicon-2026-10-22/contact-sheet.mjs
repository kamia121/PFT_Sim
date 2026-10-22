/**
 * Favicon contact sheet: the previous icon, the three candidates and the shipped ICO frames at true 16, 32 and 48 CSS px
 * (device scale 1) on light and dark browser tab-strip colors, each beside a mock tab, with nearest-neighbour magnifications of the
 * 16 and 32 px rasters. Light backgrounds are rendered under prefers-color-scheme: light and dark under dark, so the tileless
 * candidate shows both of its colors. Run from the repository root: node docs/verification/favicon-2026-10-22/contact-sheet.mjs
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const DIR = 'docs/verification/favicon-2026-10-22';
const svgUri = (f) => `data:image/svg+xml;base64,${fs.readFileSync(f).toString('base64')}`;
const icoFrames = (f) => {
  const ico = fs.readFileSync(f); const out = {};
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const e = 6 + 16 * i;
    out[ico.readUInt8(e)] = `data:image/png;base64,${ico.subarray(ico.readUInt32LE(e + 12), ico.readUInt32LE(e + 12) + ico.readUInt32LE(e + 8)).toString('base64')}`;
  }
  return out;
};
const one = (uri) => ({ 16: uri, 32: uri, 48: uri });
const ICONS = [
  ['Previous (main a275126)', one(svgUri(`${DIR}/previous.svg`))],
  ['1. Outline loop', one(svgUri(`${DIR}/candidate-1-outline.svg`))],
  ['2. Two-tone loop (selected)', one(svgUri('assets/icons/favicon.svg'))],
  ['3. Tileless adaptive outline', one(svgUri(`${DIR}/candidate-3-tileless.svg`))],
  ['2. Shipped favicon.ico frames', icoFrames('assets/icons/favicon.ico')],
];
const BG = {
  light: [['White', '#FFFFFF'], ['Chrome light tab strip', '#DEE1E6'], ['Firefox light', '#F0F0F4']],
  dark: [['Chrome dark tab strip', '#202124'], ['Chrome dark tab', '#35363A'], ['Firefox dark', '#1C1B22']],
};

const section = (scheme) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:10px 4px;font:13px/1.3 system-ui,sans-serif;background:${scheme === 'light' ? '#fff' : '#111'};color:${scheme === 'light' ? '#222' : '#ddd'}}
h2{font-size:15px;margin:0 10px 4px}table{border-collapse:collapse}td,th{padding:6px 8px;text-align:left;vertical-align:middle}th{font-weight:600}
.sw{display:flex;gap:14px;align-items:center;padding:8px 12px;border-radius:6px}
.tab{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px 8px 0 0;font:12px system-ui;white-space:nowrap;color:${scheme === 'light' ? '#202124' : '#e8eaed'}}
canvas{image-rendering:pixelated;display:block}</style>
<h2>${scheme === 'light' ? 'Light browser theme' : 'Dark browser theme'}</h2><table><tr><th></th>${BG[scheme].map(([n, c]) => `<th>${n} ${c}<br>16, 32, 48 px</th>`).join('')}<th>16 px, 8x</th><th>32 px, 4x</th></tr>
${ICONS.map(([name, u], i) => `<tr><th>${name}</th>${BG[scheme].map(([, c]) => `<td><div class="sw" style="background:${c}">${[16, 32, 48].map((s) => `<img src="${u[s]}" width="${s}" height="${s}">`).join('')}<span class="tab" style="background:${c}"><img src="${u[16]}" width="16" height="16">PFT Sim</span></div></td>`).join('')}
<td><canvas data-i="${i}" data-s="16" data-k="8" style="background:${BG[scheme][1][1]}"></canvas></td><td><canvas data-i="${i}" data-s="32" data-k="4" style="background:${BG[scheme][1][1]}"></canvas></td></tr>`).join('')}</table>
<script>const U=${JSON.stringify(ICONS.map(([, u]) => u))};
Promise.all([...document.querySelectorAll('canvas')].map((c) => new Promise((r) => { const s = +c.dataset.s, k = +c.dataset.k, im = new Image();
  im.onload = () => { const t = document.createElement('canvas'); t.width = t.height = s; t.getContext('2d').drawImage(im, 0, 0, s, s);
    c.width = c.height = s * k; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, s * k, s * k); r(); };
  im.src = U[+c.dataset.i][s]; }))).then(() => { document.body.dataset.ready = '1'; });</script>`;

const browser = await chromium.launch({ executablePath: process.env.PFT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const shots = [];
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ deviceScaleFactor: 1, colorScheme: scheme, viewport: { width: 1240, height: 400 } });
  await page.setContent(section(scheme));
  await page.waitForSelector('body[data-ready]');
  shots.push((await page.screenshot({ fullPage: true })).toString('base64'));
  await page.close();
}
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1240, height: 400 } });
await page.setContent(`<style>body{margin:0}img{display:block}</style>${shots.map((b) => `<img src="data:image/png;base64,${b}">`).join('')}`);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
await page.screenshot({ path: `${DIR}/contact-sheet.png`, fullPage: true });
await browser.close();
console.log(`Wrote ${DIR}/contact-sheet.png`);
