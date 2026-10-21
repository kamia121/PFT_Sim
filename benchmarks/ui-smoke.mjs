#!/usr/bin/env node
/**
 * Browser smoke test for the report-first learner site. Starts the static server, drives Chromium, and checks that cases render
 * without console errors, the interpretation box sits on the report, page 2 opens from its control (and the opening is recorded
 * for the feedback, never scored), the staged reveal of the quality challenge releases nothing early, answers can be scored, links
 * reproduce a case with its quality-challenge, flag and equation settings, the Lab report view prints and downloads, both themes
 * render, and no page overflows horizontally at phone width.
 *
 * The sheets (src/sheets), the technologist's report (src/core/rt-report.js) and the challenges (src/challenges) are written
 * by other threads and may be missing from a build; the page then runs on its card view and the checks that need them are skipped
 * (and said to be skipped). A 404 for exactly those modules is not counted as a console error.
 *
 * Usage: node benchmarks/ui-smoke.mjs [screenshotDir]
 * Set PFT_CHROMIUM to a Chromium executable if Playwright's own download is not installed.
 */
import { startServer, launchBrowser, ENGINE } from './lib/harness.mjs';
import fs from 'node:fs';

const port = 5199;
const shotDir = process.argv[2];
const server = await startServer(port);
const browser = await launchBrowser();
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };
const skip = (msg) => console.log('skip', msg);
const OPTIONAL = /\/src\/(sheets\/|challenges\/|core\/rt-report\.js)/;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !(m.text().includes('404') && OPTIONAL.test(m.location().url))) problems.push(`console: ${m.text()}`); });
  const base = `http://127.0.0.1:${port}/`;
  const probe = async (url) => (await page.request.get(url)).ok();
  const haveSheets = (await probe(`${base}src/sheets/summary.js`)) && (await probe(`${base}src/sheets/details.js`));
  const haveRt = (await probe(`${base}src/core/rt-report.js`)) && (await probe(`${base}src/challenges/index.js`));
  console.log(`modules: sheets ${haveSheets ? 'present' : 'absent'}, technologist report and challenges ${haveRt ? 'present' : 'absent'}`);
  const caseText = () => page.locator('#summary-slot').innerText();

  await page.goto(base);
  await page.waitForSelector('#answer-form');

  // Layout: toolbar, report first, interpretation on the report, page 2 behind its control.
  check((await page.locator('.toolbar #qc option').allInnerTexts()).join() === 'Off,On,Varies', 'toolbar has the Quality challenge select (Off, On, Varies)');
  check((await page.locator('.toolbar #flags option').allInnerTexts()).length === 2, 'toolbar has the flag setting (two values)');
  check((await page.locator('#summary-slot #answer-form').count()) === 1, 'the interpretation box is inside the summary area');
  check((await page.locator('#sheet-interpretation #answer-form').count()) === 1, 'the interpretation box is moved into the sheet element sheet-interpretation');
  check((await page.locator('#toggle-details').innerText()) === 'Page 2: detailed report' && (await page.locator('#toggle-details').getAttribute('aria-expanded')) === 'false', 'page 2 has a labelled control, closed at first');
  check(!(await page.locator('#details-slot').isVisible()), 'page 2 is not shown before it is opened');
  const order = await page.evaluate(() => {
    const y = (s) => document.querySelector(s).getBoundingClientRect().top;
    return y('#summary-slot') < y('#answer-form') && y('#answer-form') < y('#toggle-details');
  });
  check(order, 'order on the page: summary, interpretation box, page 2 control');
  check((await page.locator('#answer-form fieldset legend').allInnerTexts()).slice(0, 4).join('|').match(/Pattern.*Severity.*Bronchodilator.*Diffusing/s) !== null, 'structured questions: pattern, severity, bronchodilator, DLCO');
  check(!/FEV.? grade|FVC grade/.test(await page.locator('#answer-form').innerText()), 'the grade questions are not among the structured questions');
  check((await page.locator('#impression').count()) === 1 && /not scored/.test(await page.locator('label[for=impression]').innerText()), 'optional free-text impression, labelled as not scored');
  check(!(await page.locator('#reveal').count()), 'no key is shown before checking');
  const href = page.url();
  check(href.includes('?c=') && !/obstruction|restriction|mixed|normal/.test(decodeURIComponent(href.split('?c=')[1])), 'link carries an opaque code, not the archetype');

  // Keyboard: Enter on the page 2 control opens it and focus stays on the control.
  const before = await caseText();
  await page.focus('#toggle-details');
  await page.keyboard.press('Enter');
  check((await page.locator('#toggle-details').getAttribute('aria-expanded')) === 'true' && (await page.locator('#details-slot').isVisible()), 'page 2 opens from the keyboard');
  check(await page.evaluate(() => document.activeElement?.id === 'toggle-details'), 'focus stays on the page 2 control after it opens');
  const nSvg = await page.locator('#details-slot svg').count();
  check(nSvg >= 2, `page 2 holds the figures (${nSvg} drawings; a spirometry-only case has the panel and the z-score graphic)`);
  const fallbackFigs = (await page.locator('figure[data-figure]').count()) > 0;
  if (fallbackFigs) {
    const nFig = await page.locator('figure[data-figure]').count();
    check((await page.locator('details.fig-dl').count()) === nFig, 'every figure has a Download SVG control');
    check((await page.locator('details.fig-dl button[data-act=download]').count()) === 4 * nFig, 'each control offers four SVG variants');
    const firstSvg = await page.locator('figure[data-figure=panel-spirometry] svg.fig').first().evaluate((el) => el.outerHTML);
    check(!firstSvg.includes('#6A7572') && !/Not acceptable/.test(firstSvg), 'before checking, no maneuver is drawn as rejected');
    const variantIds = ['transparent-dark-ink', 'transparent-light-ink', 'dark', 'white'];
    await page.locator('figure[data-figure=panel-spirometry] details.fig-dl summary').click();
    for (const pal of variantIds) {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`figure[data-figure=panel-spirometry] button[data-act=download][data-pal=${pal}]`).click()]);
      const text = fs.readFileSync(await dl.path(), 'utf8');
      const parsed = await page.evaluate((xml) => {
        const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
        return { error: !!doc.querySelector('parsererror'), root: doc.documentElement.nodeName, paths: doc.querySelectorAll('path').length, rects: doc.querySelectorAll('rect').length, w: doc.documentElement.getAttribute('width') };
      }, text);
      check(!parsed.error && parsed.root === 'svg' && parsed.paths > 0 && !!parsed.w, `variant ${pal} downloads and parses as SVG (${dl.suggestedFilename()})`);
      check(!/var\(/.test(text) && text.startsWith('<?xml'), `variant ${pal} has no CSS variables and starts with the XML declaration`);
      check(pal.startsWith('transparent') ? parsed.rects === 0 : parsed.rects === 1, `variant ${pal} ${pal.startsWith('transparent') ? 'has no background rectangle' : 'has a background rectangle'}`);
    }
  } else skip('figure download controls (the details sheet draws its own figures)');
  await page.click('#toggle-details');
  check(!(await page.locator('#details-slot').isVisible()), 'the control closes page 2 again');

  // Answer and score.
  await page.check('input[name=pattern][value=normal]');
  await page.fill('#impression', 'Interpretation written by the learner.');
  await page.click('#check-answers');
  await page.waitForSelector('#reveal');
  check(/matched the key/.test(await page.locator('#reveal h2').innerText()), 'checking answers shows a score');
  check((await page.locator('#reveal .result-row').count()) >= 4, 'feedback lists every item');
  check(/Interpretation written by the learner/.test(await page.locator('.impression-compare').innerText()) && /Composed summary/.test(await page.locator('.impression-compare').innerText()), 'the impression is shown beside the composed statement');
  check(/Cases checked: 1/.test(await page.locator('#tally').innerText()), 'the tally counts the checked case');
  check((await page.locator('#reveal').innerText()).includes('GLI-2012') && /Same values under the other reference equations/.test(await page.locator('#reveal').innerText()), 'the reveal compares GLI-2012 with GLI Global');

  // Link reproduces the case.
  await page.goto(page.url());
  await page.waitForSelector('#answer-form');
  check(before === (await caseText()), 'reloading the link reproduces the same report');

  // Equation selector and its address parameter.
  await page.check('input[name=eq][value=GLI2012]');
  check(page.url().includes('eq=GLI2012'), 'the equation is kept in the address');
  if (await page.locator('#spiro-table').count()) check(/GLI-2012/.test(await page.locator('#spiro-table').innerText()), 'switching to GLI-2012 changes the reference column');
  check(await page.locator('input[name=eq][value=GLI2012]').isChecked(), 'the equation choice survives the redraw');
  await page.goto(page.url());
  await page.waitForSelector('#answer-form');
  check(await page.locator('input[name=eq][value=GLI2012]').isChecked(), 'a link with eq=GLI2012 opens with that equation');
  await page.check('input[name=eq][value=GLIglobal]');

  // Flag setting.
  await page.selectOption('#flags', 'none');
  check(page.url().includes('flags=none'), 'the flag setting is kept in the address');
  if (await page.locator('#spiro-table').count()) check(!/Flag/.test(await page.locator('#spiro-table thead').innerText()), 'with flags off the tables carry no flag column');
  await page.selectOption('#flags', 'lln');
  check(!page.url().includes('flags='), 'the default flag setting leaves the address short');

  // Many random cases without errors.
  for (let i = 0; i < 60; i++) {
    await page.click('#new-case');
    await page.waitForSelector('#answer-form');
    if (i % 3 === 0) { await page.click('#show-key'); await page.waitForSelector('#reveal'); }
    if (i % 5 === 0) { await page.click('#toggle-details'); }
  }
  check(problems.length === 0, `no console or page errors over 60 cases${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);

  // Method tab.
  await page.click('[data-tab=method]');
  check(await page.locator('#panel-method').isVisible(), 'method tab opens');
  await page.click('[data-tab=practice]');

  // Quality challenge: staged reveal.
  const poor = 'v=2&s=8&a=bd-discordant&t=poor';
  if (haveRt) {
    await page.selectOption('#qc', 'on');
    await page.goto(`${base}?${poor}&qc=1`);
    await page.waitForSelector('#answer-form');
    check((await page.locator('#qc').inputValue()) === 'on', 'a link with qc=1 opens with the challenge on');
    check((await page.locator('#show-statement').count()) === 1 && (await page.locator('#check-answers').isDisabled()), 'stage 1: the statement is requested by a button, and a scored check waits');
    const stage1 = await page.content();
    check(!/FEV(?:1|₁)\s*-\s*[A-FU]\b|FVC\s*-\s*[A-FU]\b/.test(stage1), 'stage 1: no grade statement in the page source');
    await page.click('#toggle-details');
    const stage1Open = await page.content();
    check(!/FEV(?:1|₁)\s*-\s*[A-FU]\b|FVC\s*-\s*[A-FU]\b/.test(stage1Open) && !/<(?:td|li|b|strong|span)\b[^>]*>\s*(?:not )?acceptable\s*</i.test(stage1Open) && !/not usable/.test(stage1Open), 'stage 1 with page 2 open: no grade or acceptability text in the page source');
    await page.click('#show-statement');
    check(await page.evaluate(() => document.activeElement?.id === 'statement-note'), 'stage 2: focus moves to the note that announces the statement');
    check((await page.locator('#show-statement').count()) === 0 && !(await page.locator('#check-answers').isDisabled()), 'stage 2: a scored check is now possible');
    check((await page.locator('#answer-form fieldset:has(input:disabled)').count()) >= 1, 'stage 2: the test-quality answers are fixed');
    await page.click('#check-answers');
    await page.waitForSelector('#reveal');
    check((await page.locator('#h-quality').count()) === 1, 'stage 3: the quality section appears');
    // The same link, page 2 opened or not: the line about the details differs and no status does.
    const line = async (open) => {
      await page.goto(`${base}?${poor}&qc=1`);
      await page.waitForSelector('#answer-form');
      if (open) await page.click('#toggle-details');
      await page.click('#show-statement');
      await page.click('#check-answers');
      await page.waitForSelector('#reveal');
      return { text: (await page.locator('.details-line').allInnerTexts())[0] ?? '', rows: await page.locator('#reveal .result-row .miss, #reveal .result-row .ok').allInnerTexts() };
    };
    const opened = await line(true), closed = await line(false);
    if (opened.text && closed.text) {
      check(/^Here the details held/.test(opened.text) && /not opened/.test(closed.text), 'the details line says what page 2 held, and notes when it was not opened');
      check(!/unnecessary|did not need|no need/i.test(opened.text + closed.text), 'the details line never calls opening page 2 unnecessary');
    } else skip('details line (this case has none)');
    check(JSON.stringify(opened.rows) === JSON.stringify(closed.rows), 'opening page 2 changes no item status (it is not scored)');
    // Challenge off: the statement is printed from the start.
    await page.goto(`${base}?${poor}&qc=1`);
    await page.waitForSelector('#answer-form');
    await page.selectOption('#qc', 'off');
    check((await page.locator('#show-statement').count()) === 0 && !page.url().includes('qc=1'), 'challenge off: no statement step, and the address drops qc');
  } else skip('quality challenge stages (the technologist report and challenges are not in this build)');

  // Lab report tab: the print and download view of the same sheets.
  await page.goto(`${base}?${poor}${haveRt ? '&qc=1' : ''}`);
  await page.waitForSelector('#answer-form');
  await page.click('[data-tab=report]');
  await page.waitForSelector('#report-root > *');
  check(await page.locator('#panel-report').isVisible(), 'report tab opens');
  check((await page.locator('#case').innerHTML()).trim() === '', 'the practice sheets leave the page while the report view is open');
  const reportBefore = await page.locator('#report-root').innerText();
  check(!/FEV1\s*-\s*[A-FU]\b|ATS\/ERS repeatability|Accept\./.test(reportBefore), 'report withholds grades and acceptability before answers are checked');
  check(await page.locator('#report-interp').isDisabled(), 'interpretation toggle is disabled before checking');
  if (!haveSheets) {
    check((await page.locator('.pft-report table.rpt-table').count()) >= 2, 'report tables render');
    check((await page.locator('.pft-report [data-copy-table]').count()) === (await page.locator('.pft-report table.rpt-table').count()), 'each report table has a copy button');
  }
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.click('#report-csv')]);
  const csvText = await new Promise((res, rej) => { let t = ''; csvDownload.createReadStream().then((st) => { st.on('data', (d) => (t += d)); st.on('end', () => res(t)); st.on('error', rej); }, rej); });
  check(csvText.startsWith('﻿section,table,row,column,value,unit') && csvText.split('\n').length > 40, 'CSV export is non-empty and tidy');
  check(/^pft-report-[0-9a-z]{7}\.csv$/.test(csvDownload.suggestedFilename()), `CSV file name carries the case code (${csvDownload.suggestedFilename()})`);
  const [wide] = await Promise.all([page.waitForEvent('download'), page.click('#report-csv-wide')]);
  check(/-wide\.csv$/.test(wide.suggestedFilename()), 'wide CSV downloads');
  const [htmlDownload] = await Promise.all([page.waitForEvent('download'), page.click('#report-html')]);
  check(/\.html$/.test(htmlDownload.suggestedFilename()), 'report HTML downloads');
  if (!haveSheets) {
    await page.click('.pft-report [data-copy-table="spirometry"]');
    await page.waitForFunction(() => /Copied|Copy failed/.test(document.querySelector('.pft-report [data-copy-table="spirometry"]').textContent));
    check((await page.locator('.pft-report [data-copy-table="spirometry"]').innerText()) === 'Copied', 'Copy table reports success');
  }
  await page.click('[data-tab=practice]');
  await page.waitForSelector('#answer-form');
  await page.click('#show-key');
  await page.waitForSelector('#reveal');
  await page.click('[data-tab=report]');
  await page.waitForSelector('#report-root > *');
  check(/FEV1\s*-\s*[A-FU]\b|Grade|grade/.test(await page.locator('#report-root').innerText()), 'grades appear in the report view once the answers are checked');
  await page.check('#report-interp');
  check(!/to be entered by the reader/.test(await page.locator('#report-root').innerText()) || haveSheets, 'interpretation statement can be added after checking');
  await page.emulateMedia({ media: 'print' });
  check(!(await page.locator('.masthead').isVisible()) && (await page.locator('#report-root').isVisible()), 'print view hides the page chrome and keeps the report');
  await page.emulateMedia({ media: 'screen' });
  check(problems.length === 0, `no console or page errors in the report view${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);
  await page.click('[data-tab=practice]');
  await page.waitForSelector('#answer-form');
  check((await page.locator('#reveal').count()) === 1, 'returning to Practice restores the checked state');

  // Themes and phone width.
  for (const theme of ['light', 'dark']) {
    await page.click('#theme-toggle');
    const t = await page.evaluate(() => document.documentElement.dataset.theme);
    check(t === 'light' || t === 'dark', `theme toggled (${t})`);
    if (shotDir) await page.screenshot({ path: `${shotDir}/desktop-${t}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${base}?${poor}${haveRt ? '&qc=1' : ''}`);
  await page.waitForSelector('#answer-form');
  await page.click('#toggle-details');
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `no horizontal page overflow at 390 px, stage 1 with page 2 open (${overflow})`);
  if (shotDir) await page.screenshot({ path: `${shotDir}/phone-1.png`, fullPage: true });
  await page.click('#show-key');
  await page.waitForSelector('#reveal');
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `no horizontal page overflow at 390 px after the key (${overflow})`);
  if (shotDir) await page.screenshot({ path: `${shotDir}/phone.png`, fullPage: true });
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
