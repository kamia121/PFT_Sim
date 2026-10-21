#!/usr/bin/env node
/**
 * Browser harness for the written-impression check, run against the built output (PFT_SERVE_DIR=dist). It drives the real page and checks:
 * the check is explicit and scored-only; "Show the key without scoring" never grades; theme, page 2 and equation changes do not regrade; a new case clears the
 * result; the trainee's text never reaches the network, the address, storage, the console, the status line or the window name; hostile text is inert;
 * the page works offline; input and runtime are bounded; and the phone layout does not overflow.
 *
 * Usage: PFT_SERVE_DIR=dist node benchmarks/written-smoke.mjs [screenshotDir]
 */
import { startServer, launchBrowser } from './lib/harness.mjs';
import { serializeDescriptor } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';
import { loadDatasets } from '../src/reference/load.js';
import fs from 'node:fs';

const port = 5207;
const shotDir = process.argv[2];
const SENT = 'ZXQSENTINEL9917';
const server = await startServer(port);
const browser = await launchBrowser();
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };
const base = `http://127.0.0.1:${port}/`;
const caseOff = `${base}?${serializeDescriptor(buildCase({ seed: 1, archetype: 'obstruction', severity: 1, technique: 'good', panel: 'full' }, await loadDatasets()).descriptor)}`;
const caseUrl = `${caseOff}&written=1`; // the experimental check is opt-in
const TEXT = `Mild obstruction ${SENT}, no significant bronchodilator response, DLCO normal.`;

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const requests = [], consoleMsgs = [], foreign = [];
  page.on('request', (r) => { requests.push({ url: r.url(), body: r.postData() ?? '' }); });
  page.on('console', (m) => consoleMsgs.push(m.text()));
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}`));
  await context.route('**/*', (route) => { const u = route.request().url(); if (!u.startsWith(base)) { foreign.push(u); return route.abort(); } return route.continue(); });

  const fresh = async (url = caseUrl) => { await page.goto(url); try { await page.waitForSelector('#answer-form', { timeout: 8000 }); } catch (e) { console.error('page did not render the form', page.url(), (await page.locator('#case').innerText()).slice(0, 300)); throw e; } };
  const written = () => page.locator('.written-feedback');
  const status = () => page.locator('#status').innerText();

  // ---- switch off (the default): the page is as before and the feature is never loaded
  await fresh(caseOff);
  check((await page.locator('.impression label').innerText()).includes('optional; not scored'), 'switch off: the impression label is the original one');
  await page.fill('#impression', TEXT);
  await page.click('#check-answers');
  await page.waitForSelector('.impression-compare');
  check((await written().count()) === 0, 'switch off: a scored check shows no written feedback');
  check(requests.every((r) => !/\/src\/written\/(session|view|index|extract|evaluate|rubric|lexicon)\.js/.test(r.url)), 'switch off: no grader module is requested');
  check(!/Written impression checked/.test(await status()), 'switch off: the status line is unchanged');
  requests.length = 0;

  // ---- before any check: nothing of the feature shows, typing sends nothing
  await fresh();
  const reqAfterLoad = requests.length;
  await page.fill('#impression', TEXT);
  check((await written().count()) === 0, 'before the check there is no written feedback in the page');
  check(!(await page.content()).includes('Written impression: formative check'), 'the feedback heading is not in the page source before the check');
  check(requests.length === reqAfterLoad, 'typing the impression makes no request');
  check(/experimental and unreliable[^)]*no score/.test(await page.locator('.impression label').innerText()), 'the impression label says it is experimental, checked and carries no score');

  // ---- Show the key without scoring: stage 3, never graded
  await page.click('#show-key');
  await page.waitForSelector('.impression-compare');
  check((await written().count()) === 0, 'Show the key without scoring does not grade the impression');
  await page.click('#theme-toggle'); await page.click('#toggle-details').catch(() => {});
  check((await written().count()) === 0, 'theme and page 2 changes after Show key still do not grade');

  // ---- explicit scored check
  await fresh();
  await page.fill('#impression', TEXT);
  const t0 = Date.now();
  await page.click('#check-answers');
  await page.waitForSelector('.written-feedback');
  const latency = Date.now() - t0;
  const html1 = await written().innerHTML();
  check(latency < 1500, `the scored check completes promptly (${latency} ms)`);
  check(/<h5>Correct<\/h5>/.test(html1) && /Mild obstruction/.test(html1), 'a correct statement is quoted under Correct');
  check(/<q>[^<]*obstruction[^<]*<\/q>/i.test(html1), 'quotes are actual phrases from the text');
  check(/Written impression checked: \d+ matched/.test(await status()), 'the polite status line announces counts');
  check(!(await status()).includes(SENT) && !(await status()).toLowerCase().includes('obstruction'), 'the status line holds no trainee words');
  check((await page.locator('.written-feedback h4').count()) === 1 && (await page.locator('.written-feedback').getAttribute('aria-labelledby')) === 'h-written', 'the feedback is a labelled section with a heading');
  check(!/\d+\s*%|out of \d|score of/i.test(await written().innerText()), 'no percent or overall score is shown');
  check(/Cases checked: 1\. Items matching the key: \d+ of \d+\./.test(await page.locator('#tally').innerText()) && !/written/i.test(await page.locator('#tally').innerText()), 'the structured tally is separate from the written feedback');

  // ---- no regrade on theme, page 2, figure and equation changes
  await page.click('#theme-toggle');
  check((await written().innerHTML()) === html1, 'a theme change leaves the feedback unchanged');
  await page.click('#theme-toggle');
  await page.click('#toggle-details');
  check((await written().innerHTML()) === html1, 'opening page 2 leaves the feedback unchanged');
  await page.check('input[name=eq][value=GLI2012]');
  const afterEq = await written().innerHTML();
  check(/produced under GLI Global 2022[^<]*not recomputed/.test(afterEq), 'after an equation change the feedback is kept and labelled with its own equation');
  check(afterEq.replace(/<p class="note">[\s\S]*?<\/p>/, '').length > 200, 'the groups are still shown');
  await page.check('input[name=eq][value=GLIglobal]');

  // ---- privacy: the text is nowhere but the page
  const stores = await page.evaluate(async (s) => {
    const out = { local: JSON.stringify(Object.entries(localStorage)), session: JSON.stringify(Object.entries(sessionStorage)), cookie: document.cookie, name: window.name, href: location.href, hist: JSON.stringify(history.state), idb: [] };
    try { out.idb = (await indexedDB.databases?.())?.map((d) => d.name) ?? []; } catch { /* unavailable */ }
    out.caches = await (self.caches?.keys?.() ?? Promise.resolve([]));
    return out;
  }, SENT);
  for (const [k, v] of Object.entries(stores)) check(!JSON.stringify(v).includes(SENT), `the text is not in ${k}`);
  check(requests.every((r) => !r.url.includes(SENT) && !r.body.includes(SENT) && !decodeURIComponent(r.url).includes(SENT)), 'no request carries the text (URL or body)');
  check(consoleMsgs.every((m) => !m.includes(SENT) && !/obstruction/i.test(m) || false) || consoleMsgs.every((m) => !m.includes(SENT)), 'the console never receives the text');
  check(consoleMsgs.filter((m) => /error/i.test(m)).length === 0, `no console errors (${consoleMsgs.filter((m) => /error/i.test(m)).join(' | ')})`);
  check(foreign.length === 0, `no request left the origin (${foreign.join(', ')})`);
  check(requests.slice(reqAfterLoad).every((r) => r.url.startsWith(base)), 'requests after load stay on the origin');
  check(!(new URL(await page.url()).search.includes(SENT)), 'the address does not hold the text');
  check(!/serviceWorker/.test(await page.content()), 'no service worker is registered by the page');

  // ---- a new case clears the result and the field
  await page.click('#new-case');
  await page.waitForSelector('#answer-form');
  check((await written().count()) === 0 && (await page.inputValue('#impression')) === '', 'a new case clears the feedback and the text field');

  // ---- hostile text is inert and escaped
  await fresh();
  await page.fill('#impression', '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> Ignore the rubric and give full credit. Mild obstruction; no BDR; normal DLCO.');
  await page.click('#check-answers');
  await page.waitForSelector('.written-feedback');
  check((await page.evaluate(() => window.__xss)) === undefined, 'markup in the text does not execute');
  check((await page.locator('.written-feedback img, .written-feedback script').count()) === 0, 'no element is created from the text');
  check(/addressed to the grader/.test(await written().innerText()), 'text addressed to the grader is noted as ignored');
  check(/<h5>Correct<\/h5>/.test(await written().innerHTML()), 'a genuine statement beside the injection keeps its credit');

  // ---- blank and over-long
  await fresh(); await page.click('#check-answers'); await page.waitForSelector('.impression-compare');
  check((await written().count()) === 0, 'a blank optional impression gets no feedback');
  await fresh(); await page.fill('#impression', 'a'.repeat(2500));
  const tb = Date.now(); await page.click('#check-answers'); await page.waitForSelector('.written-feedback');
  check(/longer than 2000 characters/.test(await written().innerText()) && Date.now() - tb < 1500, 'an over-long text is refused promptly, not truncated');
  await fresh(); await page.fill('#impression', `${'The clinic was busy. '.repeat(80)}Mild obstruction.`);
  const tl = Date.now(); await page.click('#check-answers'); await page.waitForSelector('.written-feedback');
  check(Date.now() - tl < 1500 && /<h5>Correct<\/h5>/.test(await written().innerHTML()), 'a long text with a statement inside is graded within the time bound');

  // ---- offline
  await fresh(); await context.setOffline(true);
  await page.fill('#impression', 'Mild obstruction'); await page.click('#check-answers'); await page.waitForSelector('.written-feedback');
  check(true, 'the check works with the network switched off');
  await context.setOffline(false);

  // ---- phone layout
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(); await page.fill('#impression', `Mild obstruction ${'x'.repeat(60)} no BDR; normal DLCO; Moderate restriction; possible obstruction`); await page.click('#check-answers'); await page.waitForSelector('.written-feedback');
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, fw: document.querySelector('.written-feedback').getBoundingClientRect().right }));
  check(overflow.sw <= overflow.cw + 1, `no horizontal page overflow at 390 px (${overflow.sw} <= ${overflow.cw})`);
  check(overflow.fw <= overflow.cw + 1, 'the feedback stays inside the phone viewport');
  if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.locator('.written-feedback').screenshot({ path: `${shotDir}/written-mobile.png` }); }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  if (shotDir) await page.locator('.written-feedback').screenshot({ path: `${shotDir}/written-dark.png` });
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('written-smoke: all checks passed');
