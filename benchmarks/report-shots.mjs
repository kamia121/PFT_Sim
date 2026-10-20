#!/usr/bin/env node
/**
 * Visual QA for the lab report: screenshots of the report tab on screen, and a print-emulated PDF
 * (letter) of the same view and of the standalone download, with stand-in figures so the page
 * budget is realistic while the figure threads are unmerged. Prints the page count of each PDF.
 *
 * Usage: node benchmarks/report-shots.mjs <outDir> [seed] [archetype]
 * Set PFT_CHROMIUM to a Chromium executable if Playwright's own download is not installed.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { buildReportModel } from '../src/report/model.js';
import { reportDocument } from '../src/report/export.js';
import { FIGURES } from '../src/ui/figures/index.js';

const out = path.resolve(process.argv[2] ?? 'benchmarks/report-out');
const seed = Number(process.argv[3] ?? 12), archetype = process.argv[4] ?? 'obstruction';
fs.mkdirSync(out, { recursive: true });

// Stand-in figures with the sizes the real ones use (2:1 loops, a wide z-score strip).
const stand = (w, h, label) => (data, { palette }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img"><title>${label}</title><desc>${label}</desc>${palette.background ? `<rect width="${w}" height="${h}" fill="${palette.background}"/>` : ''}<path d="M40 ${h - 30}C${w / 4} ${h / 8} ${w / 2} ${h / 2} ${w - 40} ${h - 30}" stroke="${palette.measured}" stroke-width="3" fill="none"/><path d="M40 ${h - 30}C${w / 4} ${h / 5} ${w / 2} ${h / 2.4} ${w - 40} ${h - 30}" stroke="${palette.predicted}" stroke-width="2" stroke-dasharray="7 5" fill="none"/><text x="50" y="30" fill="${palette.text}" font-size="16" font-family="Arial">${label}</text></svg>`;
for (const [id, w, h] of [['flow-volume', 640, 340], ['volume-time', 640, 340], ['z-strip', 900, 190], ['pleth-shutter', 640, 340], ['pleth-raw', 640, 340], ['dlco-trace', 640, 340]]) {
  FIGURES[id].dataFor = () => ({ id });
  FIGURES[id].render = stand(w, h, `stand-in ${id}`);
}

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
const c = buildCase({ seed, archetype, technique: 'fair' }, ds);
const interp = interpret(c.report, resolveReference, 'GLIglobal');
const model = buildReportModel(c, interp, { resolve: resolveReference, palette: 'white' });
const docPath = path.join(out, 'standalone.html');
fs.writeFileSync(docPath, await reportDocument(model));

const pagesOf = (pdfPath) => (fs.readFileSync(pdfPath, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const executablePath = process.env.PFT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const port = 5198;
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await page.goto(`file://${docPath}`);
  await page.screenshot({ path: path.join(out, 'standalone-screen.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(out, 'standalone-print.pdf'), format: 'Letter', printBackground: true, preferCSSPageSize: true });
  console.log('standalone PDF pages:', pagesOf(path.join(out, 'standalone-print.pdf')));

  const app = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await app.goto(`http://127.0.0.1:${port}/?s=${seed}&a=${archetype}&v=1&t=fair`);
  await app.waitForSelector('#pre-maneuvers');
  await app.click('[data-tab=report]');
  await app.waitForSelector('.pft-report');
  await app.screenshot({ path: path.join(out, 'app-report-screen.png'), fullPage: true });
  await app.emulateMedia({ media: 'print' });
  await app.pdf({ path: path.join(out, 'app-report-print.pdf'), format: 'Letter', printBackground: true, preferCSSPageSize: true });
  console.log('app PDF pages:', pagesOf(path.join(out, 'app-report-print.pdf')));
} finally {
  await browser.close();
  server.kill();
}
