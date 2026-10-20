#!/usr/bin/env node
/**
 * Browser smoke test for the report page (report.html). Starts the static server, loads six cases (normal, obstruction with a
 * post-bronchodilator study, restriction, mixed, spirometry only, a full panel with a heavy scenario) at desktop and 390 px width,
 * and checks that:
 *   - the page renders without console or page errors (a missing optional module, z-inline.js or a panel, is not an error);
 *   - every Letter page fits its content, the page count is two (spirometry only) or three, and the pages scale to the window with no
 *     horizontal page scroll at 390 px;
 *   - the student copy prints to a PDF of at most three Letter pages, and holds no answer-key text;
 *   - the instructor copy is gated by a confirm box, shows no key text before it, and adds the appendix after;
 *   - a damaged link gives a readable message; the equation switch changes the page; the practice page links here.
 * Screenshots (and the printed PDFs) are written to the directory given as the first argument.
 *
 * Usage: node benchmarks/report-smoke.mjs [screenshotDir]
 * Set PFT_CHROMIUM to a Chromium executable if Playwright's own download is not installed.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { parseDescriptor } from '../src/core/descriptor.js';
import { interpret, compareEquations, PATTERNS } from '../src/interpret/interpret.js';
import { interpretationFor } from '../src/report/statement.js';

const port = 5198;
const shotDir = process.argv[2];
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const CASES = [
  ['normal', 'v=1&s=5&a=normal'],
  ['obstruction-post-bd', 'v=1&s=12&a=obstruction&t=fair'],
  ['restriction', 'v=1&s=31&a=restriction-parenchymal'],
  ['mixed', 'v=1&s=44&a=mixed'],
  ['spirometry-only', 'v=1&s=44&a=mixed&p=spirometry'],
  ['full-heavy', 'v=1&s=90&a=bd-discordant&t=poor&sc=heavy'],
];

const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 800));
const executablePath = process.env.PFT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
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
      const expected = info.hasVolumes ? 3 : 2;
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
      check(!/\b(FEV1|FVC) - [A-FU]\b|Accept\./.test(text), `${name} ${label}: student copy has no grades`);
      check(info.hasVolumes ? /sRaw/.test(text) && /Raw/.test(text) : !/sRaw/.test(text), `${name} ${label}: airway-resistance rows ${info.hasVolumes ? 'present' : 'absent'}`);
      if (shotDir) await page.screenshot({ path: `${shotDir}/${name}-${label}.png`, fullPage: true });
      if (label === 'desktop') {
        if (shotDir) for (let i = 0; i < boxes; i++) await page.locator('.rp-box').nth(i).screenshot({ path: `${shotDir}/${name}-page${i + 1}.png` });
        const file = `${shotDir ?? '/tmp'}/${name}-student.pdf`;
        await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
        const { pages, letter } = pdfPages(file);
        check(pages >= expected && pages <= expected + 3, `${name}: student PDF has ${expected} boxes and prints to ${expected} to ${expected + 3} sheets (${pages})`);
        check(letter, `${name}: PDF page size is Letter`);
        if (!shotDir) fs.unlinkSync(file);
      }
      await page.close();
    }
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
    check((await page.locator('.rp-box').count()) === 4, 'instructor copy has the pages and the appendix');
    const file = `${shotDir ?? '/tmp'}/obstruction-instructor.pdf`;
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const { pages } = pdfPages(file);
    check(pages >= 4 && pages <= 8, `instructor PDF is the student pages plus a short appendix (${pages})`);
    if (shotDir) { await page.locator('.rp-box').nth(3).screenshot({ path: `${shotDir}/obstruction-instructor-appendix.png` }); } else fs.unlinkSync(file);
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
    for (const bad of ['', '?c=!!!', '?v=1&s=12&a=nonsense', '?v=1&s=12&a=normal&eq=XYZ']) {
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
    await page.waitForSelector('#pre-maneuvers');
    await page.click('[data-tab=report]');
    await page.waitForSelector('.pft-report');
    check((await page.locator('.pft-report table.rpt-table').count()) >= 2, 'practice report tab keeps its preview tables');
    const href = await page.locator('.pft-report .rpt-open a').getAttribute('href');
    check(/^report\.html\?c=[\w-]+&eq=GLIglobal$/.test(href), `"Open full report" link on the practice page (${href})`);
    await page.click('.pft-report .rpt-open a');
    await ready(page);
    check((await page.locator('.rp-box').count()) === 3, 'the link opens the same case as a report');
    await page.close();
  }
  check(problems.length === 0, `no console or page errors${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
