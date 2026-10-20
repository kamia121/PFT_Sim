#!/usr/bin/env node
/**
 * Browser smoke test for the learner site. Starts the static server, drives Chromium, and checks
 * that cases render without console errors, figures and their SVG download controls are present and the
 * downloaded variants parse as SVG, answers can be scored, links reproduce a case, both themes render, and
 * no page overflows horizontally at phone width.
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
  const nFig = await page.locator('svg.fig').count();
  check(nFig >= 3, `at least three figures render (${nFig}): loop, volume-time, z-score strip`);
  check((await page.locator('details.fig-dl').count()) === nFig, 'every figure has a Download SVG control');
  check((await page.locator('details.fig-dl button[data-act=download]').count()) === 4 * nFig, 'each control offers four SVG variants');
  check((await page.locator('details.fig-dl button[data-act=copy]').count()) === 4 * nFig, 'each control offers Copy SVG');
  const firstSvg = await page.locator('figure[data-figure=flow-volume] svg.fig').first().evaluate((el) => el.outerHTML);
  check(!firstSvg.includes('#6A7572') && !/Not acceptable/.test(firstSvg), 'before checking, no maneuver is drawn as rejected');

  // A downloaded variant parses as SVG.
  const variantIds = ['transparent-dark-ink', 'transparent-light-ink', 'dark', 'white'];
  await page.locator('figure[data-figure=flow-volume] details.fig-dl summary').click();
  for (const pal of variantIds) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`figure[data-figure=flow-volume] button[data-act=download][data-pal=${pal}]`).click()]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    const parsed = await page.evaluate((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
      return { error: !!doc.querySelector('parsererror'), root: doc.documentElement.nodeName, paths: doc.querySelectorAll('path').length, rects: doc.querySelectorAll('rect').length, w: doc.documentElement.getAttribute('width') };
    }, text);
    check(!parsed.error && parsed.root === 'svg' && parsed.paths > 0 && !!parsed.w, `variant ${pal} downloads and parses as SVG (${dl.suggestedFilename()})`);
    check(!/var\(/.test(text) && text.startsWith('<?xml'), `variant ${pal} has no CSS variables and starts with the XML declaration`);
    check(pal.startsWith('transparent') ? parsed.rects === 0 : parsed.rects === 1, `variant ${pal} ${pal.startsWith('transparent') ? 'has no background rectangle' : 'has a background rectangle'}`);
  }
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.locator('figure[data-figure=z-strip] details.fig-dl summary').click();
  await page.locator('figure[data-figure=z-strip] button[data-act=copy][data-pal=white]').click();
  await page.waitForFunction(() => /copied|blocked/i.test(document.querySelector('figure[data-figure=z-strip] .fig-dl-status')?.textContent ?? ''));
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
  if (clip !== null) check(/^<\?xml/.test(clip) && /<svg /.test(clip), 'Copy SVG puts a standalone SVG on the clipboard');
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
