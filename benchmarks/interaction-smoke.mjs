#!/usr/bin/env node
/**
 * Interaction harness for the report-first practice page: the paths that unit tests cannot reach because they need a browser, a
 * layout engine or a printer. Each check drives the real page with real pointer and keyboard input and reads the result from the
 * DOM or from a printed PDF.
 *
 *   R1  every row of the multi-row challenge items can be answered from the form; the answers reach the scorer through the
 *       collector; the quality answers lock at stage 2 with the map intact; one wrong row is named in the feedback.
 *   R2  the link from the Lab report view to the printable report page keeps the case, the equation, the quality challenge and
 *       the flags; the newly opened page withholds grades and acceptability at stage 1.
 *   R3  at phone width the live answer controls are read at their natural size, can be operated by keyboard and pointer, and
 *       keep their answers across a resize, a theme change and opening page 2.
 *   R5  the interpretation statement appears in the Lab report view and in its PDF when it is authorized, and never before.
 *   R6  the page-2 figure controls separate and select maneuvers, redraw only page 2, and keep answers, focus and scroll position.
 *   R7  the Lab report view and the report page print the summary identity, tables, last comment and "Page 1" footer on one sheet.
 *   R8  the z-score graphic does not name the area above the ULN "within limits".
 *   R9  the details z-score graphic carries the post-bronchodilator rows.
 *
 * PDF text is read with pdftotext when it is installed; the print checks are skipped, and said to be skipped, when it is not.
 *
 * Usage: node benchmarks/interaction-smoke.mjs
 * Set PFT_CHROMIUM to a Chromium executable if Playwright's own download is not installed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { parseDescriptor } from '../src/core/descriptor.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { buildChallenges } from '../src/challenges/index.js';
import { buildRtReport } from '../src/core/rt-report.js';
import { interpretationFor } from '../src/report/statement.js';

const port = 5198;
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 800));
const executablePath = process.env.PFT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pft-interaction-'));
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };
const skip = (msg) => console.log('skip', msg);

const base = `http://127.0.0.1:${port}/`;
const POOR = 'v=2&s=8&a=bd-discordant&t=poor';
const haveText = spawnSync('pdftotext', ['-v']).error === undefined;

// The key is computed here, in Node, from the same modules; it is never read from the page.
const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
function keyFor(query, equation = 'GLIglobal') {
  const caseData = buildCase(parseDescriptor(query), ds);
  const interp = interpret(caseData.report, resolveReference, equation);
  const other = interpret(caseData.report, resolveReference, equation === 'GLIglobal' ? 'GLI2012' : 'GLIglobal');
  const rt = buildRtReport(caseData);
  const items = buildChallenges(caseData, { rt, interp, interpOther: other, qualityChallenge: true });
  const cmp = compareEquations(caseData.report, resolveReference, 'GLI2012', 'GLIglobal');
  return { caseData, interp, items, statement: interpretationFor(caseData, interp, cmp) };
}

/** Text of the printed pages, one string per physical page, in content order (the diagonal watermark does not break a line). */
function pdfPages(file) {
  const info = spawnSync('pdfinfo', [file]).stdout.toString();
  const n = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  return Array.from({ length: n }, (_, i) => spawnSync('pdftotext', ['-raw', '-f', String(i + 1), '-l', String(i + 1), file, '-']).stdout.toString());
}
/** Words of one printed page with their boxes (pdftotext -bbox). */
function pdfWords(file, n) {
  const html = spawnSync('pdftotext', ['-bbox', '-f', String(n), '-l', String(n), file, '-']).stdout.toString();
  return [...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] }));
}
/** Nothing but the footer line itself lies in the footer band of the first printed sheet; returns the offending words. */
function footerIntrusions(file) {
  const words = pdfWords(file, 1).filter((w) => w.y1 - w.y0 < 12);
  const mark = words.filter((w) => w.t === 'record.').sort((a, b) => b.y0 - a.y0)[0];
  if (!mark) return ['no footer line'];
  const band = words.filter((w) => w.y1 > mark.y0 + 0.5 && w.y0 < mark.y1 - 0.5);
  const footerWords = new Set('SIMULATED REPORT - educational use only. PFT Sim, generator version 2. Case Not a patient record. Page 1'.split(' '));
  return band.filter((w) => !footerWords.has(w.t) && !/^[0-9A-Z]{7}\.?$/.test(w.t)).map((w) => w.t);
}
const squash = (t) => t.replace(/\s+/g, '');
const sel = (name, value) => `input[name="${name}"][value="${value}"]`;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

  /* ------------------------------------------------------------------------------- R1: row items, end to end */
  {
    const { items } = keyFor(POOR);
    const rowItems = items.filter((i) => Array.isArray(i.rows));
    await page.goto(`${base}?${POOR}&qc=1`);
    await page.waitForSelector('#answer-form');
    for (const item of rowItems) {
      check((await page.locator(`[data-item="${item.id}"] fieldset.row-q`).count()) === item.rows.length, `R1: ${item.id} renders a group for each of its ${item.rows.length} rows`);
    }
    // Answer every row through the controls; the acceptability of Pre maneuver 4, FVC is answered wrongly on purpose.
    const pre = rowItems.find((i) => i.id === 'acceptableManeuversPre');
    const wrongRow = pre.rows.find((r) => r.id === 'fvc:3');
    for (const item of rowItems) {
      for (const row of item.rows) {
        const name = `ch:${item.id}#${row.id}`;
        const options = (item.rowOptions?.[row.id] ?? item.options).map(([v]) => v);
        let value = item.key[row.id];
        if (item.id === pre.id && row.id === wrongRow.id) value = options.find((v) => v !== item.key[row.id]);
        await page.locator(sel(name, value)).check();
      }
    }
    // The structured questions and the remaining scalar items are answered with the first option.
    for (const fs_ of await page.locator('#answer-form fieldset').all()) {
      if (await fs_.locator('fieldset').count()) continue;
      if (await fs_.locator('input:checked').count() === 0 && await fs_.locator('input[type=radio]').count()) await fs_.locator('input[type=radio]').first().check();
    }
    const checkedBefore = await page.locator('fieldset.row-item input:checked').count();
    check(checkedBefore === rowItems.reduce((s, i) => s + i.rows.length, 0), 'R1: one answer per row is held by the form');
    await page.click('#show-statement');
    check(await page.locator('fieldset.row-item input:disabled').count() > 0 && await page.locator('fieldset.row-item input:disabled').count() === await page.locator('fieldset.row-item input').count(), 'R1: stage 2 fixes every row control');
    check(await page.locator('fieldset.row-item input:checked').count() === checkedBefore, 'R1: stage 2 keeps every row answer');
    const last = await page.locator('#answer-form fieldset:not(.row-item):not(.row-q) input[type=radio]:not(:disabled)').count();
    for (const fs_ of await page.locator('#answer-form fieldset:not(.row-item):not(.row-q)').all()) {
      if (await fs_.locator('input:checked').count() === 0 && await fs_.locator('input[type=radio]:not(:disabled)').count()) await fs_.locator('input[type=radio]:not(:disabled)').first().check();
    }
    void last;
    await page.click('#check-answers');
    await page.waitForSelector('#reveal');
    const rows = await page.locator('#reveal .result-row').allInnerTexts();
    const preRow = rows.find((t) => t.startsWith('Acceptable maneuvers before the bronchodilator'));
    check(/11 of 12 answers match the key/.test(preRow) && /Maneuver 4, FVC/.test(preRow.split('Not matching')[1] ?? ''), 'R1: the feedback names the one wrong maneuver row and nothing else');
    const postRow = rows.find((t) => t.startsWith('Acceptable maneuvers after the bronchodilator'));
    check(/All 16 answers match the key/.test(postRow), 'R1: a fully correct map of 16 rows earns full credit');
    check(!rows.some((t) => /^(Flow-volume loop|Bronchodilator response)/.test(t) && /no answer/.test(t.split('Key:')[0])), 'R1: the loop and bronchodilator pair carry the learner\'s answers');
  }

  /* ------------------------------------------------------------- R2: link to the printable report page */
  {
    await page.goto(`${base}?${POOR}&qc=1&flags=none&eq=GLI2012`);
    await page.waitForSelector('#answer-form');
    await page.click('[data-tab=report]');
    await page.waitForSelector('#report-root .sheet');
    const href = await page.locator('#report-root a', { hasText: 'Open the printable report page' }).getAttribute('href');
    const q = new URL(href, base).searchParams;
    check(q.get('qc') === '1' && q.get('flags') === 'none' && q.get('eq') === 'GLI2012' && !q.get('copy'), `R2: the link carries qc, flags and the equation (${href.slice(href.indexOf('&'))})`);
    await page.locator('#report-root a', { hasText: 'Open the printable report page' }).click();
    await page.waitForSelector('body[data-ready="1"]');
    check(await page.locator('#rp-qc').isChecked() && (await page.locator('#rp-flags').inputValue()) === 'none' && (await page.locator('#rp-eq').inputValue()) === 'GLI2012', 'R2: the opened page shows the quality challenge on, flags none and GLI-2012');
    const text = await page.locator('#rp-stage').innerText();
    check(!/Test quality: FEV1|FEV1 - [A-FU]|FVC - [A-FU]|Accept\.:|criteria for the variable/.test(text), 'R2: the opened page withholds grades and acceptability');
    check(await page.locator('#rp-stage [data-flag]').count() === 0, 'R2: flags none: no value is flagged');
    const back = await page.locator('#rp-back').getAttribute('href');
    const bq = new URL(back, base).searchParams;
    check(bq.get('qc') === '1' && bq.get('flags') === 'none', 'R2: the way back to the practice page keeps qc and flags');
  }

  /* ---------------------------------------------------- R5: the statement in the Lab report view, and its PDF */
  {
    const { statement } = keyFor(POOR);
    await page.goto(`${base}?${POOR}`);
    await page.waitForSelector('#answer-form');
    await page.click('[data-tab=report]');
    await page.waitForSelector('#report-root .sheet');
    check(await page.locator('#report-interp').isDisabled() && await page.locator('.sheet-interp-full').count() === 0, 'R5: before the key is released the statement is not offered and not in the page');
    await page.click('[data-tab=practice]');
    await page.click('#show-key');
    await page.click('[data-tab=report]');
    await page.waitForSelector('#report-root .sheet');
    check(await page.locator('.sheet-interp-full').count() === 0, 'R5: key released, toggle off: no statement');
    await page.check('#report-interp');
    const shown = await page.locator('.sheet-interp-full').innerText();
    check(shown.replace(/\s+/g, ' ').includes(statement.text.replace(/\s+/g, ' ')), 'R5: with the toggle on, the full composed statement is in the report');
    check(/follows the detailed report/.test(await page.locator('.sheet-interp-body').innerText()), 'R5: the sheet\'s interpretation box points to it');
    if (haveText) {
      const file = path.join(tmp, 'lab-interp.pdf');
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
      await page.emulateMedia({ media: 'screen' });
      const pages = pdfPages(file);
      const after = pages.slice(1).join(' ').replace(/\s+/g, ' ');
      check(after.includes(statement.text.slice(0, 80)) && after.includes(statement.text.slice(-60)), 'R5: the statement is in the printed PDF, whole, after the summary sheet');
      check(!pages[0].includes(statement.text.slice(0, 40)), 'R5: and not cut into the summary sheet');
    } else skip('R5: PDF text (pdftotext is not installed)');
    await page.uncheck('#report-interp');
    check(await page.locator('.sheet-interp-full').count() === 0, 'R5: toggling off removes the statement');
  }

  /* ----------------------------------------- R6 and R9: page 2 controls and the post-bronchodilator z-score rows */
  {
    await page.goto(`${base}?${POOR}&qc=1`);
    await page.waitForSelector('#answer-form');
    await page.locator('input[name=pattern]').first().check();
    await page.click('#toggle-details');
    await page.waitForSelector('#details-slot .dt-sheet');
    const nPre = await page.evaluate(() => document.querySelectorAll('#details-slot table[id$="d-maneuvers-pre"] tbody tr').length);
    check(nPre >= 6 && await page.locator('#details-slot input[data-fig-view="panel-spirometry"]').count() === 3, 'R6: page 2 offers Best, Overlay and Separate for the spirometry panel');
    const figOf = () => page.locator('#details-slot figure[data-figure-id="panel-spirometry"] svg').evaluate((e) => ({ d: e.querySelector('desc')?.textContent ?? '', n: e.outerHTML.length }));
    const startView = await figOf();
    check(/all view/.test(startView.d), 'R6: more than eight maneuvers are overlaid at first');
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#toggle-details').getBoundingClientRect().top + scrollY));
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.locator('#details-slot input[data-fig-view="panel-spirometry"][value="separate"]').click();
    const sep = await figOf();
    check(/separate view/.test(sep.d) && sep.n !== startView.n, 'R6: Separate redraws the panel');
    check(await page.evaluate(() => document.activeElement?.matches('input[data-fig-view="panel-spirometry"][value="separate"]')), 'R6: the control used keeps focus');
    check(await page.locator('input[name=pattern]:checked').count() === 1, 'R6: the answers survive the redraw');
    check(await page.evaluate(() => scrollY) === scrollBefore, 'R6: the scroll position survives');
    // The chip checkboxes are drawn as labels, so the pointer goes to the label.
    const chips = page.locator('#details-slot .fig-view:has(input[data-fig-view="panel-spirometry"]) label.chip');
    const nChips = await chips.count();
    for (let i = 1; i < nChips; i++) await chips.nth(i).click();
    const one = await figOf();
    check(one.n < sep.n && await page.locator('#details-slot input[data-fig-chip="panel-spirometry"]:checked').count() === 1, 'R6: selecting a single maneuver draws just that one');
    await page.locator('#details-slot input[data-fig-view="panel-spirometry"][value="best"]').click();
    check(/best view/.test((await figOf()).d), 'R6: Best shows the best maneuver');
    check(!/FEV(?:1|₁)\s*-\s*[A-FU]\b|criteria not met|not acceptable/i.test(await page.locator('#details-slot').innerText()), 'R6: quality stays withheld through the view changes (challenge stage 1)');
    const z = await page.locator('#details-slot figure[data-figure-id="z-strip"] svg').evaluate((e) => e.textContent);
    check((z.match(/postz [−-]?\d+\.\d\d/g) ?? []).length === 3 && (z.match(/prez [−-]?\d+\.\d\d/g) ?? []).length === 3, 'R9: the details z-score graphic has pre and post rows for FVC, FEV1 and FEV1/FVC');
    // The Lab report view has the controls too, and stays compact by default.
    await page.click('[data-tab=report]');
    await page.waitForSelector('#report-root .sheet');
    check(await page.locator('#report-root input[data-fig-view="panel-spirometry"]').count() === 3, 'R6: the Lab report view offers the same controls on screen');
    await page.locator('#report-root input[data-fig-view="panel-spirometry"][value="separate"]').click();
    check(/separate view/.test(await page.locator('#report-root figure[data-figure-id="panel-spirometry"] svg desc').textContent()), 'R6: and they act there');
  }

  /* ------------------------------------------------------------------------- R8: the z-score graphic wording */
  {
    await page.goto(`${base}?${POOR}`);
    await page.waitForSelector('#answer-form');
    const labels = await page.locator('.sheet-z svg text').allTextContents();
    check(labels.includes('not reduced') && labels.includes('above ULN') && !labels.some((t) => t === 'within limits' && false), 'R8: the green area is "not reduced" and the area beyond the ULN is named');
    const caption = labels.join(' ');
    check(/within limits means between the LLN and the ULN/.test(caption) && !/within limits above the LLN/.test(caption), 'R8: the caption says what within limits means');
  }

  /* ------------------------------------------------------ R7: both print paths, one sheet for the summary */
  if (haveText) {
    const closing = /Official interpretation to follow|Interpretation to follow/;
    for (const [name, query] of [['heavy notes, poor session (floor overflow)', 'v=2&s=5&a=obstruction&t=poor&sc=heavy'], ['long reference note', 'v=2&s=20&a=normal&t=poor'], ['post-bronchodilator, poor session', POOR], ['obstruction', 'v=2&s=1&a=obstruction&t=fair'], ['spirometry only', 'v=2&s=44&a=mixed&t=fair&p=spirometry']]) {
      // The Lab report view.
      await page.goto(`${base}?${query}`);
      await page.waitForSelector('#answer-form');
      await page.click('#show-key');
      await page.click('[data-tab=report]');
      await page.waitForSelector('#report-root .sheet');
      await page.waitForTimeout(150);
      const labFile = path.join(tmp, `lab-${name.replace(/\W+/g, '-')}.pdf`);
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: labFile, preferCSSPageSize: true, printBackground: true });
      await page.emulateMedia({ media: 'screen' });
      const lab = pdfPages(labFile);
      const first = lab[0];
      const fit = await page.locator('.sheet-summary').evaluate((e) => ({ over: Number(e.dataset.overflow), fit: Number(e.dataset.fit) }));
      check(/PFT Sim Pulmonary Function Laboratory/.test(first) && /SPIROMETRY/.test(first) && /TECHNOLOGIST COMMENTS/i.test(first) && /Page 1\b/.test(first), `R7: Lab report, ${name}: identity, tables, comments, closing line and "Page 1" on the first sheet`);
      check(!/TECHNOLOGIST COMMENTS\n/i.test(lab[1] ?? '') && !/Page 1\b/.test(lab[1] ?? ''), `R7: Lab report, ${name}: no second copy of the summary on the second sheet`);
      check(fit.over === 0 && fit.fit >= 0.95, `R7: Lab report, ${name}: the content fits its sheet (scale ${fit.fit})`);
      const comments = await page.evaluate(() => [...document.querySelectorAll('.sheet-comments li:not(.sheet-cont-ref), .sheet-continuation li')].map((l) => l.textContent));
      check(footerIntrusions(labFile).length === 0 && comments.every((t) => squash(lab.join(' ')).includes(squash(t))), `R7: Lab report, ${name}: every comment is printed and none touches the footer (${footerIntrusions(labFile).join(',')})`);
      check(!/Quality grades, per-maneuver acceptability/.test(first), `R7: Lab report, ${name}: the screen hint is not printed`);
      // The report page.
      await page.goto(`${base}report.html?${query}`);
      await page.waitForSelector('body[data-ready="1"]');
      const repFile = path.join(tmp, `rep-${name.replace(/\W+/g, '-')}.pdf`);
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: repFile, preferCSSPageSize: true, printBackground: true });
      await page.emulateMedia({ media: 'screen' });
      const rep = pdfPages(repFile);
      const repComments = await page.evaluate(() => [...document.querySelectorAll('.sheet-comments li:not(.sheet-cont-ref), .sheet-continuation li')].map((l) => l.textContent));
      check(/TECHNOLOGIST COMMENTS/i.test(rep[0]) && /Page 1\b/.test(rep[0]) && footerIntrusions(repFile).length === 0 && repComments.every((t) => squash(rep.join(' ')).includes(squash(t))), `R7: report page, ${name}: first sheet clear of the footer, every comment printed (${footerIntrusions(repFile).join(',')})`);
      check(lab[0].replace(/\s+/g, ' ').includes('SPIROMETRY') === rep[0].replace(/\s+/g, ' ').includes('SPIROMETRY'), `R7: ${name}: both paths carry the same summary content`);
    }
  } else skip('R7: printed pages (pdftotext is not installed)');
  {
    // The fit leaves nothing over, whatever the case: heavy technologist notes, poor sessions, both equations.
    const arch = ['normal', 'obstruction', 'restriction-parenchymal', 'mixed', 'nonspecific', 'low-dlco', 'anemia', 'obesity-low-erv', 'bd-discordant', 'restriction-extraparenchymal'];
    const bad = [];
    for (let seed = 1; seed <= 40; seed++) {
      await page.goto(`${base}report.html?v=2&s=${seed}&a=${arch[seed % 10]}&t=poor&sc=heavy&eq=${seed % 2 ? 'GLIglobal' : 'GLI2012'}`);
      await page.waitForSelector('body[data-ready="1"]');
      const o = await page.locator('.sheet-summary').evaluate((e) => ({ over: Number(e.dataset.overflow), fit: Number(e.dataset.fit) }));
      if (o.over !== 0 || o.fit < 0.95) bad.push(`${seed}:${o.over}/${o.fit}`);
    }
    check(bad.length === 0, `R7: 40 heavy-note cases leave no overflow and never zoom below 0.95${bad.length ? ` (${bad.join(' ')})` : ''}`);
  }

  /* --------------------------------------------------- R3: phone width, size, keyboard and pointer, persistence */
  {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}?${POOR}&qc=1`);
    await page.waitForSelector('#answer-form');
    await page.waitForTimeout(400);
    const geometry = () => page.evaluate(() => {
      const rect = (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; };
      const label = document.querySelector('fieldset.row-q label');
      const scalar = document.querySelector('#answer-form .answers > fieldset:not(.row-item) label');
      const text = (l) => { const z = parseFloat(getComputedStyle(l).fontSize); let k = 1; for (let e = l; e && e !== document.documentElement; e = e.parentElement) { const zoom = parseFloat(getComputedStyle(e).zoom || '1'); if (zoom && zoom !== 1) k *= zoom; } return z * k; };
      return { rowFont: text(label), scalarFont: text(scalar), rowRadio: rect(label.querySelector('input')), rowLabel: rect(label), scalarRadio: rect(scalar.querySelector('input')), scalarLabel: rect(scalar), overflow: document.documentElement.scrollWidth - innerWidth, formWidth: rect(document.querySelector('#answer-form')).w };
    });
    const g = await geometry();
    check(g.rowFont >= 14 && g.scalarFont >= 14, `R3: answer text is rendered at ${g.rowFont.toFixed(1)} and ${g.scalarFont.toFixed(1)} px (at least 14)`);
    check(g.rowRadio.w >= 20 && g.rowRadio.h >= 20 && g.scalarRadio.w >= 20, `R3: radio controls are ${g.rowRadio.w.toFixed(0)} px square (at least 20)`);
    check(g.rowLabel.h >= 40 && g.scalarLabel.h >= 40, `R3: each option is a target of ${g.rowLabel.h.toFixed(0)} px height (at least 40)`);
    check(g.overflow <= 0 && g.formWidth > 250, `R3: no horizontal overflow, form ${g.formWidth.toFixed(0)} px wide`);
    // Pointer on a row control and on a scalar control; keyboard on another row.
    const first = page.locator('input[name="ch:acceptableManeuversPre#fev1:0"][value="yes"]');
    await first.scrollIntoViewIfNeeded();
    await first.click();
    await page.locator('input[name=pattern]').first().click();
    const second = page.locator('input[name="ch:acceptableManeuversPre#fvc:0"][value="yes"]');
    await second.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    check(await page.locator('input[name="ch:acceptableManeuversPre#fvc:0"][value="no"]').isChecked(), 'R3: a row group is operable by keyboard (Space, then the arrow key)');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement?.name === 'ch:acceptableManeuversPre#fev1:1'), 'R3: Tab moves to the next row group');
    const snapshot = () => page.evaluate(() => [...document.querySelectorAll('#answer-form input:checked')].map((i) => `${i.name}=${i.value}`).sort().join('|'));
    const held = await snapshot();
    check(held.includes('ch:acceptableManeuversPre#fev1:0=yes') && held.includes('ch:acceptableManeuversPre#fvc:0=no') && /pattern=/.test(held), 'R3: pointer and keyboard answers are held');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    check(await snapshot() === held, 'R3: the answers survive a resize');
    await page.click('#theme-toggle');
    check(await snapshot() === held, 'R3: the answers survive a theme change');
    await page.click('#toggle-details');
    await page.click('#toggle-details');
    check(await snapshot() === held, 'R3: the answers survive opening and closing page 2');
    const g2 = await geometry();
    check(g2.rowFont >= 14 && g2.rowRadio.w >= 20, 'R3: sizes hold after the redraws');
    await page.click('#theme-toggle');
    // A phone-width screenshot is left beside the PDFs for inspection.
    await page.locator('input[name="ch:acceptableManeuversPre#fev1:0"][value="yes"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(tmp, 'phone-rows.png') });
    await page.setViewportSize({ width: 1280, height: 900 });
  }

  check(problems.length === 0, `no console or page errors${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);
  console.log(`artifacts: ${tmp}`);
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('all interaction checks passed');
