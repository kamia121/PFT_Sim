#!/usr/bin/env node
/**
 * Browser smoke test for the learner site. Starts the static server, drives Chromium, and checks
 * that cases render without console errors, answers can be scored, links reproduce a case, both
 * themes render, and no page overflows horizontally at phone width.
 *
 * Usage: node benchmarks/ui-smoke.mjs [screenshotDir]
 * Set PFT_CHROMIUM to a Chromium executable if Playwright's own download is not installed.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const port = 5199;
const shotDir = process.argv[2];
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 800));
const executablePath = process.env.PFT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('#pre-maneuvers');
  check((await page.locator('svg.fig').count()) === 2, 'two figures render');
  check((await page.locator('#spiro-table tbody tr').count()) === 3, 'spirometry report has three rows');
  check(!(await page.locator('#reveal').count()), 'no key is shown before checking');
  const href = await page.url();
  check(href.includes('?c=') && !/obstruction|restriction|mixed|normal/.test(decodeURIComponent(href.split('?c=')[1])), 'link carries an opaque code, not the archetype');

  const before = await page.locator('#pre-maneuvers tbody').innerText();
  // Answer and score.
  await page.check('input[name=pattern][value=normal]');
  await page.click('#check-answers');
  await page.waitForSelector('#reveal');
  check(/matched the key/.test(await page.locator('#reveal h2').innerText()), 'checking answers shows a score');
  check((await page.locator('#pre-maneuvers thead th').count()) === 12, 'verdict columns appear only after checking');

  // Link reproduces the case.
  await page.goto(page.url());
  await page.waitForSelector('#pre-maneuvers');
  check(before === (await page.locator('#pre-maneuvers tbody').innerText()), 'reloading the link reproduces the same maneuvers');

  // Equation selector.
  await page.check('input[name=eq][value=GLI2012]');
  check(/GLI-2012/.test(await page.locator('#spiro-table').innerText()), 'switching to GLI-2012 changes the reference column');

  // Many random cases without errors.
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    await page.click('#new-case');
    await page.waitForSelector('#pre-maneuvers');
    seen.add(await page.locator('#h-patient').count());
    if (i % 3 === 0) { await page.click('#show-key'); await page.waitForSelector('#reveal'); }
  }
  check(problems.length === 0, `no console or page errors over 60 cases${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);

  // Method tab.
  await page.click('[data-tab=method]');
  check(await page.locator('#panel-method').isVisible(), 'method tab opens');
  await page.click('[data-tab=practice]');

  // Lab report tab: opens, tables render, nothing from the key before answers are checked, exports are non-empty.
  await page.click('#new-case');
  await page.waitForSelector('#pre-maneuvers');
  await page.click('[data-tab=report]');
  await page.waitForSelector('.pft-report');
  check(await page.locator('#panel-report').isVisible(), 'report tab opens');
  check((await page.locator('.pft-report table.rpt-table').count()) >= 2, 'report tables render');
  check((await page.locator('.pft-report [data-copy-table]').count()) === (await page.locator('.pft-report table.rpt-table').count()), 'each report table has a copy button');
  const reportBefore = await page.locator('.pft-report').innerText();
  check(!/FEV1\s*-\s*[A-FU]\b|ATS\/ERS repeatability|Accept\./.test(reportBefore) && /grades are shown after the answers are checked/.test(reportBefore), 'report withholds grades and acceptability before answers are checked');
  check(await page.locator('#report-interp').isDisabled(), 'interpretation toggle is disabled before checking');
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.click('#report-csv')]);
  const csvText = await new Promise((res, rej) => { let t = ''; csvDownload.createReadStream().then((st) => { st.on('data', (d) => (t += d)); st.on('end', () => res(t)); st.on('error', rej); }, rej); });
  check(csvText.startsWith('\uFEFFsection,table,row,column,value,unit') && csvText.split('\n').length > 40, 'CSV export is non-empty and tidy');
  check(/^pft-report-[0-9a-z]{7}\.csv$/.test(csvDownload.suggestedFilename()), `CSV file name carries the case code (${csvDownload.suggestedFilename()})`);
  const [htmlDownload] = await Promise.all([page.waitForEvent('download'), page.click('#report-html')]);
  check(/\.html$/.test(htmlDownload.suggestedFilename()), 'report HTML downloads');
  await page.click('.pft-report [data-copy-table="spirometry"]');
  await page.waitForFunction(() => /Copied|Copy failed/.test(document.querySelector('.pft-report [data-copy-table="spirometry"]').textContent));
  check((await page.locator('.pft-report [data-copy-table="spirometry"]').innerText()) === 'Copied', 'Copy table reports success');
  await page.click('[data-tab=practice]');
  await page.click('#show-key');
  await page.waitForSelector('#reveal');
  await page.click('[data-tab=report]');
  check(/FEV1\s*-\s*[A-FU]\b/.test(await page.locator('.pft-report').innerText()), 'grades appear after answers are checked');
  await page.check('#report-interp');
  check(!/to be entered by the reader/.test(await page.locator('.pft-report .rpt-interp').innerText()), 'interpretation statement can be added after checking');
  await page.emulateMedia({ media: 'print' });
  check(!(await page.locator('.masthead').isVisible()) && (await page.locator('.pft-report').isVisible()), 'print view hides the page chrome and keeps the report');
  await page.emulateMedia({ media: 'screen' });
  check(problems.length === 0, `no console or page errors in the report view${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);
  await page.click('[data-tab=practice]');

  // Themes and phone width.
  for (const theme of ['light', 'dark']) {
    await page.click('#theme-toggle');
    const t = await page.evaluate(() => document.documentElement.dataset.theme);
    check(t === 'light' || t === 'dark', `theme toggled (${t})`);
    if (shotDir) await page.screenshot({ path: `${shotDir}/desktop-${t}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('#new-case');
  await page.click('#show-key');
  await page.waitForSelector('#reveal');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `no horizontal page overflow at 390 px (${overflow})`);
  if (shotDir) await page.screenshot({ path: `${shotDir}/phone.png`, fullPage: true });
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
