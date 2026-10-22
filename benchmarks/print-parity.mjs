/**
 * Print parity of the practice page (Ctrl+P on the Practice tab). The interpretation workspace changes the screen layout only, so
 * what prints must be what printed before it, including the existing scaling of the printed sheet on a phone (the frame keeps the
 * screen's --sheet-s in print). Two checks, for a bounded set of cases, learner states and window widths:
 *
 *   1. In-run invariant (every engine): the print-media layout of the practice page, and in Chromium the text and raster of the printed
 *      PDF, are the same before and after the workspace additions are stripped from the live page (its stylesheet disabled, its controls
 *      and excerpts removed, the print-transparent wrapper unwrapped, its view attributes cleared). The stripped page is the baseline
 *      markup and styles (tests/workspace.test.mjs pins that markup to the ec5f6cd hashes).
 *   2. Baseline fixture (Chromium): the same signatures recorded from the ec5f6cd build (benchmarks/fixtures/print-baseline.json,
 *      written with --write). Compared when the fixture was recorded with the same Chromium version; otherwise reported as skipped.
 *      The runs listed under `amended` were re-recorded on 9822a77 for the deliberate page-1 change of the bronchodilator column
 *      (Change (% predicted) and its footnote instead of %Chng); each is a case with a bronchodilator study, and the rest are ec5f6cd's.
 *
 * Usage: node benchmarks/print-parity.mjs [--write benchmarks/fixtures/print-baseline.json]
 * PFT_SERVE_DIR names the build to serve (dist/ in CI). PFT_RASTER=0 leaves out the raster comparison.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launchBrowser, artifactDir, ENGINE } from './lib/harness.mjs';

const WRITE = process.argv.includes('--write') ? process.argv[process.argv.indexOf('--write') + 1] : null;
const FIXTURE = path.resolve('benchmarks/fixtures/print-baseline.json');
const port = 5460;
const base = `http://127.0.0.1:${port}/`;
const server = await startServer(port);
const browser = await launchBrowser();
const tmp = artifactDir('print-parity');
const pdfOk = ENGINE === 'chromium' && spawnSync('pdftotext', ['-v']).error === undefined;
const rasterOk = pdfOk && process.env.PFT_RASTER !== '0' && spawnSync('pdftoppm', ['-v']).error === undefined;
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };
const skip = (msg) => console.log('skip', msg);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

export const CASES = {
  normal: 'v=2&s=5&a=normal',
  obstruction: 'v=2&s=12&a=obstruction&t=fair',
  poorQc: 'v=2&s=8&a=bd-discordant&t=poor&qc=1',
  spiroOnly: 'v=2&s=44&a=mixed&t=poor&p=spirometry&qc=1&qd=adv',
  notes: 'v=2&s=31&a=restriction-parenchymal&sc=heavy',
};

/** Learner states, each reached through the page's own controls. `details` opens page 2 with whichever control the layout shows. */
const STATES = {
  load: [],
  answered: ['answer'],
  details: ['answer', 'details'],
  statement: ['answer', 'study', 'statement'],
  checked: ['answer', 'details', 'check'],
};
const RUNS = [
  ...Object.keys(CASES).flatMap((c) => Object.keys(STATES).filter((s) => s !== 'statement' || /qc=1/.test(CASES[c])).map((s) => [c, s, 1280, 900])),
  ...['normal', 'poorQc', 'spiroOnly'].flatMap((c) => [[c, 'details', 1440, 900], [c, 'answered', 1024, 800], [c, 'answered', 820, 1000], [c, 'answered', 390, 844], [c, 'details', 390, 844]]),
];

async function act(page, step) {
  if (step === 'answer') {
    await page.evaluate(() => {
      for (const name of ['pattern', 'severity', 'bronchodilator', 'dlco']) {
        const r = document.querySelector(`#answer-form input[type=radio][name="${name}"]:not(:disabled)`);
        if (r) r.click();
      }
    });
    await page.fill('#impression', 'Print parity impression: line one.');
  } else if (step === 'details') {
    const ws = page.locator('[data-ws-view="details"]');
    if (await ws.count() && await ws.isVisible()) await ws.click(); else await page.click('#toggle-details');
    await page.waitForSelector('#details-slot .dt-sheet, #details-slot section');
  } else if (step === 'study') {
    await page.evaluate(() => document.querySelector('#answer-form input[type=radio][name="ch:studyInterpretable"]')?.click());
  } else if (step === 'statement') {
    if (await page.locator('#show-statement').count()) { await page.click('#show-statement'); await page.waitForSelector('#statement-note'); }
  } else if (step === 'check') {
    if (await page.locator('#check-answers:not([disabled])').count()) await page.click('#check-answers'); else await page.click('#show-key');
    await page.waitForSelector('#reveal');
  }
  await page.waitForTimeout(150);
}

/** Print-media layout of the practice panel: every box outside the workspace additions, with the scale the printed sheet takes. */
async function printGeometry(page) {
  await page.emulateMedia({ media: 'print' });
  const g = await page.evaluate(() => {
    const r2 = (x) => Math.round(x * 4) / 4;
    const skip = (e) => e.closest('[data-ws-ui]') || (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') || e.classList.contains('sheet-data');
    const rows = [];
    for (const e of document.querySelectorAll('main *')) {
      if (skip(e)) continue;
      const b = e.getBoundingClientRect();
      rows.push(`${e.tagName}.${e.getAttribute('class') ?? ''}#${e.id}|${r2(b.x + scrollX)},${r2(b.y + scrollY)},${r2(b.width)},${r2(b.height)}`);
    }
    const frame = document.querySelector('#summary-slot .sheet-frame');
    const cs = frame ? getComputedStyle(frame) : null;
    return { rows, frame: cs ? { w: cs.width, h: cs.height, zoom: cs.zoom } : null, sheetS: getComputedStyle(document.querySelector('#summary-slot') ?? document.body).getPropertyValue('--sheet-s').trim() };
  });
  await page.emulateMedia({ media: 'screen' });
  return { hash: sha(g.rows.join('\n')), boxes: g.rows.length, frame: g.frame, sheetS: g.sheetS, rows: g.rows };
}

async function printPdf(page, label) {
  if (!pdfOk) return null;
  const file = path.join(tmp, `${label}.pdf`);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const text = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).stdout.replaceAll(base, 'ORIGIN/').replace(/[ \t]+/g, ' ');
  const pages = text.split('\f').filter((p, i, a) => i < a.length - 1 || p.trim());
  let raster = null;
  if (rasterOk) {
    const prefix = path.join(tmp, `${label}-r`);
    spawnSync('pdftoppm', ['-r', '30', '-png', file, prefix]);
    raster = fs.readdirSync(tmp).filter((f) => f.startsWith(`${label}-r`)).sort().map((f) => sha(fs.readFileSync(path.join(tmp, f))));
  }
  return { pages: pages.length, text: pages.map((p) => sha(p.trim())), raster, head: pages.map((p) => p.trim().slice(0, 60)) };
}

/** Remove the workspace additions from the live page, leaving the baseline markup and styles. A no-op on the baseline build. */
async function stripWorkspace(page) {
  return page.evaluate(() => {
    let n = 0;
    for (const l of document.querySelectorAll('link[data-ws-css]')) { l.disabled = true; n++; }
    for (const e of document.querySelectorAll('[data-ws-ui]')) { e.remove(); n++; }
    for (const w of document.querySelectorAll('.sheet-data')) { w.replaceWith(...w.childNodes); n++; }
    const c = document.querySelector('#case');
    for (const a of [...c.attributes]) if (a.name.startsWith('data-ws')) { c.removeAttribute(a.name); n++; }
    return n;
  });
}

const fixture = !WRITE && fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : null;
const version = browser.version();
const record = { commit: process.env.PFT_COMMIT ?? 'unknown', engine: ENGINE, browserVersion: version, runs: {} };
if (fixture && fixture.browserVersion !== version) skip(`baseline fixture: recorded with ${fixture.engine} ${fixture.browserVersion}, running ${ENGINE} ${version}; the in-run invariant still runs`);

try {
  for (const [name, state, w, h] of RUNS) {
    const label = `${name}-${state}-${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${base}?${CASES[name]}`);
    await page.waitForSelector('#answer-form');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    for (const step of STATES[state]) await act(page, step);
    // Focus, the pointer (a hovered control is drawn darker) and the window scroll are not part of the printed state; they are reset
    // so that the capture depends on the learner state alone.
    await page.mouse.move(0, 0);
    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
    await page.waitForTimeout(100);
    const geo = await printGeometry(page);
    const pdf = await printPdf(page, label);
    record.runs[label] = { geo: { hash: geo.hash, boxes: geo.boxes, frame: geo.frame, sheetS: geo.sheetS }, pdf };
    if (!WRITE) {
      const stripped = await stripWorkspace(page);
      const geo2 = await printGeometry(page);
      const diff = geo.rows.filter((r, i) => r !== geo2.rows[i]).slice(0, 3);
      check(geo.hash === geo2.hash, `${ENGINE} ${label}: print layout unchanged by the workspace additions (${geo.boxes} boxes, ${stripped} additions stripped)${diff.length ? `; first differences: ${diff.join(' / ')}` : ''}`);
      if (pdf) {
        const pdf2 = await printPdf(page, `${label}-stripped`);
        check(pdf.pages === pdf2.pages && pdf.text.join() === pdf2.text.join(), `${label}: printed PDF text unchanged by the workspace additions (${pdf.pages} pages)`);
        if (pdf.raster && pdf2.raster) check(pdf.raster.join() === pdf2.raster.join(), `${label}: printed PDF raster unchanged by the workspace additions`);
      }
      const ref = fixture?.browserVersion === version ? fixture.runs[label] : null;
      if (ref) {
        check(ref.geo.hash === geo.hash && ref.geo.boxes === geo.boxes, `${label}: print layout equals the ec5f6cd baseline (frame ${geo.frame?.w} x ${geo.frame?.h}, zoom ${geo.frame?.zoom}; --sheet-s ${geo.sheetS || 'unset'})`);
        if (pdf && ref.pdf) {
          check(ref.pdf.pages === pdf.pages && ref.pdf.text.join() === pdf.text.join(), `${label}: printed PDF text equals the ec5f6cd baseline (${pdf.pages} pages)`);
          if (pdf.raster && ref.pdf.raster) check(ref.pdf.raster.join() === pdf.raster.join(), `${label}: printed PDF raster equals the ec5f6cd baseline`);
        }
      } else if (fixture && fixture.browserVersion === version) check(false, `${label}: no baseline record`);
    }
    await ctx.close();
  }
  if (WRITE) { fs.mkdirSync(path.dirname(WRITE), { recursive: true }); fs.writeFileSync(WRITE, `${JSON.stringify(record, null, 1)}\n`); console.log(`wrote ${Object.keys(record.runs).length} runs to ${WRITE}`); }
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log(WRITE ? 'baseline recorded' : 'print parity holds');
