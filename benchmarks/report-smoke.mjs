#!/usr/bin/env node
/**
 * Browser smoke test for the report page (report.html). Starts the static server, loads six cases (normal, obstruction with a
 * post-bronchodilator study, restriction, mixed, spirometry only, a full panel with a heavy scenario) at desktop and 390 px width,
 * and checks that:
 *   - the page renders without console or page errors (a missing optional module, z-inline.js or a panel, is not an error);
 *   - the report is the summary sheet (one fixed Letter page; the earlier page 1, plus a sheet of tables when volumes or DLCO exist, until
 *     src/sheets/summary.js is present), then the flowing details sheet and the blank interpretation block; every fixed page fits its
 *     content and the pages scale to the window with no horizontal page scroll at 390 px;
 *   - the student copy prints to a Letter PDF, holds no answer-key text, shows grades by default, and with the quality challenge on
 *     (qc=1) holds no grade, acceptability or quality text at all; the toolbar switches both settings and keeps them in the address;
 *   - the instructor copy is gated by a confirm box, shows no key text before it, and adds the appendix after;
 *   - a damaged link gives a readable message; the equation switch changes the page; the practice page links here.
 * Screenshots (and the printed PDFs) are written to the directory given as the first argument.
 *
 * Usage: node benchmarks/report-smoke.mjs [screenshotDir]
 * Set PFT_CHROMIUM to a Chromium executable if Playwright's own download is not installed.
 */
import { startServer, launchBrowser, ENGINE } from './lib/harness.mjs';
import fs from 'node:fs';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { parseDescriptor } from '../src/core/descriptor.js';
import { interpret, compareEquations, PATTERNS } from '../src/interpret/interpret.js';
import { interpretationFor } from '../src/report/statement.js';

const port = 5198;
const SUMMARY = fs.existsSync(new URL('../src/sheets/summary.js', import.meta.url));
const shotDir = process.argv[2];
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const CASES = [
  ['normal', 'v=2&s=5&a=normal'],
  ['obstruction-post-bd', 'v=2&s=12&a=obstruction&t=fair'],
  ['restriction', 'v=2&s=31&a=restriction-parenchymal'],
  ['mixed', 'v=2&s=44&a=mixed'],
  ['spirometry-only', 'v=2&s=44&a=mixed&p=spirometry'],
  ['full-heavy', 'v=2&s=90&a=bd-discordant&t=poor&sc=heavy'],
];

const server = await startServer(port);
const browser = await launchBrowser();
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };
const base = `http://127.0.0.1:${port}`;
const datasets = await loadDatasets();
const { resolveReference } = createReference(datasets);

/** Wording of the key and the interpretation statement for a case, as the student copy must not contain it. */
function keyPhrases(query) {
  const c = buildCase(parseDescriptor(query), datasets);
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  const stmt = interpretationFor(c, interp, compareEquations(c.report, resolveReference, 'GLI2012', 'GLIglobal'));
  return { statement: stmt.text.slice(0, 60), pattern: PATTERNS[c.anchorKey.pattern], hasPost: Boolean(c.spirometry.post), hasVolumes: Boolean(c.volumes) };
}

/** Errors that are expected while optional modules (z-inline.js, panels) are not in the build. */
const ignorable = (t) => /Failed to load resource: the server responded with a status of 404/.test(t);
const pdfPages = (file) => {
  const pdf = fs.readFileSync(file, 'latin1');
  return { pages: (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length, letter: /\/MediaBox\s*\[\s*0\s+0\s+612(\.0+)?\s+792(\.0+)?\s*\]/.test(pdf) };
};
const ready = (page, v = '1') => page.waitForFunction((x) => document.body.dataset.ready === x, v, { timeout: 30000 });

try {
  const problems = [];
  const open = async (viewport) => {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) problems.push(`console: ${m.text()}`); });
    return page;
  };

  for (const [name, query] of CASES) {
    const info = keyPhrases(query);
    for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
      const page = await open(viewport);
      await page.goto(`${base}/report.html?${query}`);
      await ready(page);
      const expected = SUMMARY || !info.hasVolumes ? 2 : 3;
      const boxes = await page.locator('.rp-box').count();
      check(boxes === expected, `${name} ${label}: ${expected} pages (${boxes})`);
      const fit = await page.evaluate(() => window.__rpFit);
      check(fit.every((f) => f.fits), `${name} ${label}: every page fits its content (${fit.map((f) => `${f.page}:${f.fs}/${f.ts}`).join(' ')})`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(overflow <= 1, `${name} ${label}: no horizontal page overflow (${overflow})`);
      const box = await page.locator('.rp-box').first().boundingBox();
      check(box.width <= viewport.width - 8 && box.width >= 0.4 * Math.min(viewport.width, 816), `${name} ${label}: page scaled to the window (${Math.round(box.width)} px)`);
      const text = await page.locator('#rp-stage').innerText();
      check(!text.includes(info.pattern) || info.pattern === 'Normal', `${name} ${label}: student copy has no pattern wording`);
      check(!text.includes(info.statement) && !/Answer key|Instructor appendix|Interpretation statement/i.test(text), `${name} ${label}: student copy has no statement or key section`);
      check(/\b(FEV1|FVC) - [A-FU]\b/.test(text) && /accept\./i.test(text), `${name} ${label}: grades and acceptability show with the quality challenge off`);
      check((await page.locator('[data-sheet=details]').count()) === 1 && (await page.locator('.rp-box').last().locator('[data-sheet=details]').count()) === 1, `${name} ${label}: the details sheet is in the flowing page`);
      check((await page.locator('.rp-box').last().locator('[data-section=interpretation] .rp-blank').count()) === 1 && /Date/.test(text), `${name} ${label}: blank interpretation block with signature and date lines`);
      check(info.hasVolumes ? /sRaw/.test(text) && /Raw/.test(text) : !/sRaw/.test(text), `${name} ${label}: airway-resistance rows ${info.hasVolumes ? 'present' : 'absent'}`);
      if (shotDir) await page.screenshot({ path: `${shotDir}/${name}-${label}.png`, fullPage: true });
      if (label === 'desktop') {
        if (shotDir) for (let i = 0; i < boxes; i++) await page.locator('.rp-box').nth(i).screenshot({ path: `${shotDir}/${name}-page${i + 1}.png` });
        const file = `${shotDir ?? '/tmp'}/${name}-student.pdf`;
        await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
        const { pages, letter } = pdfPages(file);
        check(pages >= expected && pages <= expected + 6, `${name}: student PDF has ${expected} boxes and prints to ${expected} to ${expected + 6} sheets (${pages})`);
        check(letter, `${name}: PDF page size is Letter`);
        if (!shotDir) fs.unlinkSync(file);
      }
      await page.close();
    }
  }

  // Quality challenge (qc=1, outside the descriptor): no grade, acceptability or quality text in the page source, and no sentence
  // that says it is withheld; the toolbar switch and the flag setting are kept in the address.
  {
    const GRADE = /\b(FEV1|FVC) - [A-FU]\b|[Gg]rade [A-F]\b|Accept\.|[Aa]cceptab|Test quality|withheld|Criteria not met/;
    const stripStyle = (h) => h.replace(/<style>[\s\S]*?<\/style>/g, '');
    for (const [name, query] of [CASES[1], CASES[4], CASES[5]]) {
      for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
        const page = await open(viewport);
        await page.goto(`${base}/report.html?${query}&qc=1`);
        await ready(page);
        check(await page.locator('#rp-qc').isChecked(), `${name} ${label}: the quality challenge switch is on for qc=1`);
        check(!GRADE.test(stripStyle(await page.locator('#rp-stage').innerHTML())), `${name} ${label}: qc=1 page source has no grade, acceptability or quality text`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(overflow <= 1, `${name} ${label}: qc=1 has no horizontal page overflow (${overflow})`);
        if (label === 'desktop' && shotDir) for (let i = 0; i < (await page.locator('.rp-box').count()); i++) await page.locator('.rp-box').nth(i).screenshot({ path: `${shotDir}/${name}-qc-page${i + 1}.png` });
        await page.close();
      }
    }
    const page = await open({ width: 1280, height: 900 });
    await page.goto(`${base}/report.html?${CASES[1][1]}`);
    await ready(page);
    check(/\b(FEV1|FVC) - [A-FU]\b/.test(await page.locator('#rp-stage').innerText()), 'grades show by default');
    await page.check('#rp-qc');
    await page.waitForFunction(() => !/\b(FEV1|FVC) - [A-FU]\b/.test(document.querySelector('#rp-stage').innerText));
    check(new URL(page.url()).searchParams.get('qc') === '1' && new URL(page.url()).searchParams.has('c'), 'the quality challenge switch is kept in the address');
    check(!GRADE.test(stripStyle(await page.locator('#rp-stage').innerHTML())), 'switching the quality challenge on removes every grade from the page source');
    check(/qc=1/.test(await page.locator('#rp-back').getAttribute('href')), 'the link back to the practice page keeps qc');
    await page.selectOption('#rp-flags', 'none');
    check(new URL(page.url()).searchParams.get('flags') === 'none', 'the flag setting is kept in the address');
    await page.uncheck('#rp-qc');
    await page.waitForFunction(() => /\b(FEV1|FVC) - [A-FU]\b/.test(document.querySelector('#rp-stage').innerText));
    check(!new URL(page.url()).searchParams.has('qc'), 'switching it off removes qc from the address');
    await page.close();
  }

  // Instructor copy: gate, then appendix.
  {
    const page = await open({ width: 1280, height: 900 });
    const [, query] = CASES[1];
    const info = keyPhrases(query);
    await page.goto(`${base}/report.html?${query}&copy=instructor`);
    await ready(page, 'gate');
    const gated = await page.locator('#rp-stage').innerText();
    check(/Instructor copy/.test(gated) && !gated.includes(info.statement) && !/Test quality grades/i.test(gated) && (await page.locator('.rp-box').count()) === 0, 'instructor link opens a confirm gate with no report and no key');
    check(await page.locator('#rp-show-instructor').isDisabled(), 'the instructor copy stays closed until the box is checked');
    await page.check('#rp-confirm');
    await page.click('#rp-show-instructor');
    await ready(page);
    const text = await page.locator('#rp-stage').innerText();
    check(text.includes(info.statement) && /Instructor appendix/i.test(text) && /Answer key/i.test(text) && /Test quality grades/i.test(text) && /Notes on this simulation/i.test(text), 'instructor copy shows the statement, key, grades and notes');
    check((await page.locator('.rp-box').count()) === (SUMMARY ? 3 : 4), 'instructor copy has the pages and the appendix');
    const file = `${shotDir ?? '/tmp'}/obstruction-instructor.pdf`;
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const { pages } = pdfPages(file);
    check(pages >= 4 && pages <= 12, `instructor PDF is the student pages plus a short appendix (${pages})`);
    if (shotDir) { await page.locator('.rp-box').last().screenshot({ path: `${shotDir}/obstruction-instructor-appendix.png` }); } else fs.unlinkSync(file);
    await page.selectOption('#rp-copy', 'student');
    await ready(page);
    check(!/Instructor appendix/i.test(await page.locator('#rp-stage').innerText()), 'switching back to the student copy removes the appendix');
    check(/copy=/.test(new URL(page.url()).search) === false, 'the student copy address carries no copy parameter');
    await page.close();
  }

  // Equation switch and descriptor encodings.
  {
    const page = await open({ width: 1280, height: 900 });
    await page.goto(`${base}/report.html?${CASES[1][1]}`);
    await ready(page);
    check(/Spirometry: GLI Global 2022/.test(await page.locator('#rp-stage').innerText()), 'default spirometry equation is GLI Global');
    await page.selectOption('#rp-eq', 'GLI2012');
    await page.waitForFunction(() => /Spirometry: GLI-2012/.test(document.querySelector('#rp-stage').innerText));
    check(new URL(page.url()).searchParams.get('eq') === 'GLI2012' && new URL(page.url()).searchParams.has('c'), 'equation choice is kept in the address with the opaque case code');
    const back = await page.locator('#rp-back').getAttribute('href');
    check(/^\.\/\?c=/.test(back), `link back to the practice page for the same case (${back.slice(0, 30)}...)`);
    // Dark screen theme keeps white paper.
    await page.click('#theme-toggle');
    const paper = await page.locator('.rp-page').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    check(paper === 'rgb(255, 255, 255)', 'paper stays white in the dark theme');
    if (shotDir) await page.screenshot({ path: `${shotDir}/theme-dark.png`, fullPage: false });
    await page.click('#theme-toggle');
    await page.emulateMedia({ media: 'print' });
    check(!(await page.locator('.rp-toolbar').isVisible()) && !(await page.locator('.masthead').isVisible()), 'print view hides the toolbar and page chrome');
    await page.emulateMedia({ media: 'screen' });
    // Damaged and incomplete links.
    for (const bad of ['', '?c=!!!', '?v=2&s=12&a=nonsense', '?v=2&s=12&a=normal&eq=XYZ']) {
      await page.goto(`${base}/report.html${bad}`);
      await ready(page, 'error');
      const msg = await page.locator('#rp-stage').innerText();
      check(/cannot be opened/.test(msg) && msg.length > 60 && !/undefined|\[object|\n\s+at /.test(msg), `readable message for link "${bad}"`);
    }
    await page.close();
  }

  // Practice page: the Lab report tab keeps its preview and links to the full report for the same case.
  {
    const page = await open({ width: 1280, height: 900 });
    await page.goto(`${base}/?${CASES[1][1]}`);
    await page.waitForSelector('#summary-slot .sheet, #pre-maneuvers');
    await page.click('[data-tab=report]');
    await page.waitForSelector('#report-root a[href^="report.html"], .rpt-open a');
    check((await page.locator('.sheet table, .pft-report table.rpt-table').count()) >= 2, 'practice report tab keeps its preview tables');
    const href = await page.locator('#report-root a[href^="report.html"], .rpt-open a').first().getAttribute('href');
    check(/^report\.html\?c=[\w-]+&eq=GLIglobal$/.test(href), `"Open full report" link on the practice page (${href})`);
    await page.click('#report-root a[href^="report.html"], .rpt-open a');
    await ready(page);
    check((await page.locator('.rp-box').count()) === (SUMMARY ? 2 : 3), 'the link opens the same case as a report');
    await page.close();
  }
  check(problems.length === 0, `no console or page errors${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
