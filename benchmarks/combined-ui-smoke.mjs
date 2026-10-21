#!/usr/bin/env node
/** Cross-feature regression checks, against dist/ or the deployed Pages URL. No clinical key is changed or inferred here. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { request } from 'playwright';
import { startServer, launchBrowser, ENGINE } from './lib/harness.mjs';

const external = process.env.PFT_BASE_URL;
const server = external ? null : await startServer(5203);
const base = external || 'http://127.0.0.1:5203/';
const browser = await launchBrowser();
let combinations = 0;
try {
  // Pages can briefly serve the prior asset set. Require exact deployed bytes before checking behavior.
  if (external) {
    const paths = ['index.html', 'src/ui/theme-boot.js', 'src/app/stage.js', 'src/app/main.js', 'src/sheets/sheets.css', 'styles.css', 'src/report/concise.js'];
    for (let attempt = 0; ; attempt++) {
      const stale = [];
      for (const path of paths) {
        const expected = await fs.readFile(path, 'utf8');
        const response = await request.newContext();
        try {
          const actual = await response.get(new URL(path + '?verify=' + Date.now(), base).href);
          if (!actual.ok() || await actual.text() !== expected) stale.push(path);
        } finally { await response.dispose(); }
      }
      if (!stale.length) { console.log('Live asset bytes match this commit, including concise summaries.'); break; }
      assert(attempt < 23, 'Live assets did not match this commit: ' + stale.join(', '));
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  for (const theme of ['light', 'dark']) for (const mode of ['basic', 'advanced']) {
    const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = new URL('?v=2&s=485924449&a=obstruction&t=poor&sc=heavy&qc=1' + (mode === 'advanced' ? '&qd=adv' : ''), base).href;
    await page.goto(url);
    await page.waitForSelector('#answer-form');
    await page.click('#theme-toggle');
    if (theme === 'light') await page.click('#theme-toggle');
    await page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
    // A new page and a reload use the toggle's stored choice, without an initialization script.
    const other = theme === 'dark' ? 'light' : 'dark';
    await page.click('#theme-toggle');
    assert.equal(await page.evaluate(() => localStorage.getItem('pft-theme')), other);
    await page.click('#theme-toggle');
    assert.equal(await page.evaluate(() => localStorage.getItem('pft-theme')), theme);
    const reloaded = await ctx.newPage();
    await reloaded.goto(url);
    await reloaded.waitForSelector('#answer-form');
    assert.equal(await reloaded.evaluate(() => document.documentElement.dataset.theme), theme);
    await reloaded.close();
    await page.reload();
    await page.waitForSelector('#answer-form');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    assert.equal(await page.locator('#qd').inputValue(), mode);
    if (mode === 'basic') {
      const groups = await page.locator('#answer-form input[name^="ch:"]').evaluateAll(inputs => [...new Set(inputs.map(input => input.name))]);
      assert.deepEqual(groups, ['ch:studyInterpretable']);
      assert.equal(await page.locator('#check-answers').isEnabled(), true, 'Basic can submit before maneuver or statement review');
      assert.equal(await page.locator('#toggle-details').getAttribute('aria-expanded'), 'false');
      await page.locator('input[name="ch:studyInterpretable"]').first().check();
    } else {
      assert.equal(await page.locator('#check-answers').isDisabled(), true, 'Advanced retains its statement step');
      assert(await page.locator('#answer-form input[name^="ch:"]').count() > 3);
      await page.click('#show-statement');
      assert.equal(await page.locator('#check-answers').isEnabled(), true);
    }
    await page.fill('#impression', 'x'.repeat(550));
    await page.click('#check-answers');
    await page.waitForSelector('#reveal');
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => {
        const frame = document.querySelector('.sheet-live .sheet-frame') || document.querySelector('.sheet-frame');
        const grid = document.querySelector('.compare-grid');
        const narrow = document.querySelector('[data-figure-id="z-strip-ats-narrow"]');
        const sheet = document.querySelector('#summary-slot .sheet');
        return {
          doc: document.documentElement.scrollWidth <= innerWidth + 1,
          grid: !!grid && grid.scrollWidth <= grid.clientWidth + 1,
          narrow: !!narrow && narrow.getBoundingClientRect().width > 0,
          sheet: !!sheet && sheet.getBoundingClientRect().width <= innerWidth + 1,
          frame: !frame || frame.getBoundingClientRect().width <= innerWidth + 1,
        };
      });
      assert(Object.values(layout).every(Boolean), `${ENGINE}/${theme}/${mode}/${width}: ${JSON.stringify(layout)}`);
      console.log(`ok ${ENGINE}/${theme}/${mode}/${width}: submission and responsive report with long text`);
    }
    assert.deepEqual(errors, []);
    combinations++;
    await ctx.close();
  }
  console.log(`${combinations}/4 theme/mode combinations passed on ${ENGINE}${external ? ' at ' + base : ' against dist/'}.`);
} finally {
  await browser.close();
  server?.kill();
}
