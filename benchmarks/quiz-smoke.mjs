#!/usr/bin/env node
/**
 * Browser smoke test for the quiz page (quiz.html). Starts the static server, drives Chromium and checks:
 * the practice flow with feedback, an exam from a code that is identical across two page loads, the
 * instructor tool (code, link, student sheet, answer key sheet, CSV), a results code round trip into the
 * class summary, phone width without horizontal overflow, both themes, and no console errors over 40
 * random cases. The 404 for optional modules that are not installed yet is expected and ignored.
 *
 * Usage: node benchmarks/quiz-smoke.mjs [screenshotDir]
 * Set PFT_CHROMIUM to a Chromium executable if Playwright's own download is not installed.
 */
import { startServer, launchBrowser, ENGINE } from './lib/harness.mjs';
import fs from 'node:fs';
import { encodeExam, decodeExam } from '../src/quiz/codes.js';
import { ARCHETYPES } from '../src/core/descriptor.js';

const port = 5201;
const base = `http://127.0.0.1:${port}`;
const shotDir = process.argv[2];
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const server = await startServer(port);
const browser = await launchBrowser();
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };

const OPTIONAL = /\/src\/scenarios\/|\/src\/interpret\/narrative\.js/;
const problems = [];
function watch(page) {
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (OPTIONAL.test(m.location()?.url ?? '')) return;
    problems.push(`console: ${m.text()}`);
  });
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const shot = async (page, name) => { if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true }); };

const def = { n: 3, seed: 424242, archetypes: ARCHETYPES, scenario: 'moderate', technique: [60, 30, 10], panel: [80, 20], timeLimit: 0, shuffleSeed: 99, equation: 'GLIglobal', skills: ['pattern', 'severity', 'quality', 'bronchodilator', 'dlco', 'limitations', 'equation', 'synthesis'] };
const code = encodeExam(def);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page);

  // ---- Practice flow
  await page.goto(`${base}/quiz.html`);
  await page.waitForSelector('#pr-pre-maneuvers');
  const chart = await page.locator('#p-case').innerText();
  for (const label of ['Age', 'Sex used for the reference', 'Height used', 'Weight', 'Group on requisition', 'Smoking', 'Reference equation for each index', 'Pre-bronchodilator forced maneuvers', 'Reported spirometry']) check(chart.toLowerCase().includes(label.toLowerCase()), `chart shows "${label}"`);
  check((await page.locator('#p-case .notes li').count()) >= 2, 'intake notes are listed');
  check((await page.locator('#p-case svg').count()) >= 2, 'figures render');
  check((await page.locator('#p-case fieldset.qitem').count()) >= 6, 'at least six questions per case');
  check(!(await page.locator('#p-case .feedback').count()), 'no feedback before checking');
  const first = page.locator('#p-case fieldset.qitem').first();
  await first.locator('input').first().check();
  await first.locator('button.check-item').click();
  check((await first.locator('.feedback').count()) === 1 && /Key:/.test(await first.locator('.feedback').innerText()), 'checking one question shows the key and an explanation');
  check(await first.locator('input').first().isDisabled(), 'a checked question is locked');
  const href = page.url();
  check(/\?c=/.test(href) && !/obstruction|restriction|mixed|normal/.test(decodeURIComponent(href.split('?c=')[1])), 'practice link carries an opaque case code');
  const before = await page.locator('#pr-pre-maneuvers tbody').innerText();
  await page.goto(href);
  await page.waitForSelector('#pr-pre-maneuvers');
  check(before === (await page.locator('#pr-pre-maneuvers tbody').innerText()), 'a practice link reproduces the same maneuvers');
  // Answer everything in the case to see the summary.
  const n = await page.locator('#p-case fieldset.qitem').count();
  for (let i = 0; i < n; i++) {
    const fs_ = page.locator('#p-case fieldset.qitem').nth(i);
    await fs_.locator('input').first().check();
    await fs_.locator('button.check-item').click();
  }
  check((await page.locator('#p-summary .rubric').count()) >= 1, 'a rubric table appears when every question is checked');
  await shot(page, 'practice-desktop-dark');

  // ---- Exam from a code, identical across two page loads
  const examUrl = `${base}/quiz.html?x=${code}&l=777`;
  const grab = async () => {
    await page.goto(examUrl);
    await page.waitForSelector('#e-start:not([disabled])');
    await page.click('#e-start');
    await page.waitForSelector('#ex-pre-maneuvers');
    return page.locator('#e-case').innerText();
  };
  const run1 = await grab();
  check(!(await page.locator('.feedback').count()) && !/Key:/.test(run1), 'no key or feedback in the exam DOM before submission');
  const html1 = await page.locator('#exam-root').innerHTML();
  check(!/correct|data-key|data-answer/i.test(html1.replace(/Pre-bronchodilator|incorrect/gi, '')), 'exam markup carries no key attributes');
  await shot(page, 'exam-desktop-dark');
  const run2 = await grab();
  check(run1 === run2, 'the same exam code and learner seed give an identical first case across two page loads');
  // A different learner seed: same chart, different option order somewhere in the exam.
  await page.goto(`${base}/quiz.html?x=${code}&l=778`);
  await page.waitForSelector('#e-start:not([disabled])');
  await page.click('#e-start');
  await page.waitForSelector('#ex-pre-maneuvers');
  const chartOnly = (s) => s.split('Questions')[0];
  check(chartOnly(run1) === chartOnly(await page.locator('#e-case').innerText()), 'a different learner seed shows the same case data');
  const order = async (url) => {
    await page.goto(url);
    await page.waitForSelector('#e-start:not([disabled])');
    await page.click('#e-start');
    await page.waitForSelector('#ex-pre-maneuvers');
    const out = [];
    for (let i = 0; i < 3; i++) {
      await page.click(`.casenav button[data-goto="${i}"]`);
      out.push(await page.locator('#e-case fieldset.qitem').evaluateAll((els) => els.map((e) => [...e.querySelectorAll('label span')].map((s) => s.textContent).join('|')).join('##')));
    }
    return out.join('@@');
  };
  const orderA = await order(`${base}/quiz.html?x=${code}&l=777`);
  const orderB = await order(`${base}/quiz.html?x=${code}&l=778`);
  check(orderA !== orderB && orderA.length === orderB.length, 'option order differs between learner seeds');
  check(orderA === (await order(`${base}/quiz.html?x=${code}&l=777`)), 'option order is reproducible for one learner seed');

  // Answer every question (first option, plus one multi-select), then submit.
  await page.goto(`${base}/quiz.html?x=${code}&l=777`);
  await page.waitForSelector('#e-start:not([disabled])');
  await page.fill('#e-name', 'Test, "Learner"');
  await page.click('#e-start');
  await page.waitForSelector('#ex-pre-maneuvers');
  for (let i = 0; i < 3; i++) {
    await page.click(`.casenav button[data-goto="${i}"]`);
    const cnt = await page.locator('#e-case fieldset.qitem').count();
    for (let k = 0; k < cnt; k++) await page.locator('#e-case fieldset.qitem').nth(k).locator('input').first().check();
  }
  check(/36 of 36|\d+ of \d+ questions answered/.test(await page.locator('#e-answered').innerText()), 'answered count is shown');
  await page.click('#e-submit');
  await page.waitForSelector('#e-total');
  const total = await page.locator('#e-total').innerText();
  check(/of \d+ \(\d+%\)/.test(total), `a score is shown after submission (${total})`);
  check((await page.locator('.rubric tbody tr').count()) >= 5, 'rubric table by skill is shown');
  const resultsCode = await page.inputValue('#e-results-code');
  check(resultsCode.length > 20, 'a results code is produced');
  const dl = page.waitForEvent('download');
  await page.click('#e-csv');
  const csvPath = await (await dl).path();
  const csv = fs.readFileSync(csvPath, 'utf8');
  check(csv.startsWith('case,item,skill,response,key,score,max,status') && csv.split('\r\n').length > 10, 'learner CSV downloads with a header and rows');
  await shot(page, 'exam-results-dark');
  await page.click('button[data-review="0"]');
  await page.waitForSelector('.feedback');
  check((await page.locator('.feedback').count()) >= 5, 'review shows feedback for each question');
  await shot(page, 'exam-review-dark');
  await page.click('#e-back-results');

  // ---- Instructor
  await page.goto(`${base}/quiz.html`);
  await page.waitForSelector('#pr-pre-maneuvers');
  await page.click('[data-tab=instructor]');
  check(/not tamper-proof/i.test(await page.locator('#instructor-root').innerText()) && /server/i.test(await page.locator('#instructor-root').innerText()), 'instructor page states plainly that the exam is not tamper-proof and a server would be needed');
  await page.fill('#i-n', '3');
  await page.fill('#i-seed', '424242');
  await page.fill('#i-shuffle', '99');
  await page.selectOption('#i-technique', 'mostly');
  await page.selectOption('#i-panel', 'mixed');
  await page.selectOption('#i-scenario', 'moderate');
  await page.click('#i-build');
  const built = await page.inputValue('#i-code');
  check(built === code, 'instructor builds the same code the test computed');
  check(decodeExam(built).n === 3 && (await page.inputValue('#i-link')).includes(`?x=${built}`), 'exam link carries the code');
  await page.click('#i-show-student');
  // The sheet is built in a timer; an exception there leaves no sheet, so a timeout reports the page errors collected, not just the timeout.
  await page.waitForSelector('#sheet-body[data-kind=student]').catch((e) => { throw new Error(`${e.message}\npage errors: ${problems.join(' | ') || 'none'}`); });
  const student = await page.locator('#sheet-body').innerText();
  check(/Case 3 of 3/.test(student) && /Questions/.test(student) && /Name:/.test(student), 'student question sheet lists the cases and questions');
  check(!/answer key|Key:/i.test(student), 'student sheet carries no answer key');
  await shot(page, 'instructor-student-sheet');
  await page.click('#i-show-key');
  await page.waitForSelector('#sheet-body[data-kind=key]');
  check(/answer key/i.test(await page.locator('#sheet-body').innerText()) && (await page.locator('#sheet-body table').count()) === 3, 'answer key sheet has one table per case');
  const kdl = page.waitForEvent('download');
  await page.click('#i-key-csv');
  const kcsv = fs.readFileSync(await (await kdl).path(), 'utf8');
  check(kcsv.startsWith('case,archetype,technique,panel,item,skill,key letters,key'), 'answer key CSV downloads');
  await shot(page, 'instructor-key-sheet');

  // ---- Results code round trip
  await page.fill('#i-results', `${resultsCode}\n${resultsCode}\nnot-a-code`);
  await page.click('#i-summarize');
  await page.waitForSelector('#i-class-mean');
  const cls = await page.locator('#i-summary').innerText();
  check(/2 learners/.test(cls) && /Accuracy by skill/.test(cls) && /Most common wrong answers/.test(cls), 'class summary shows learners, skills and common wrong answers');
  check(/Code 3/.test(cls), 'a malformed code is reported without stopping the summary');
  const clsPct = /mean score (\d+)%/.exec(cls)?.[1];
  const examPct = /\((\d+)%\)/.exec(total)?.[1];
  check(clsPct === examPct, `class summary reproduces the learner score (${clsPct}% vs ${examPct}%)`);
  await shot(page, 'instructor-summary-dark');

  // ---- Timer
  const timed = encodeExam({ ...def, timeLimit: 5 });
  await page.goto(`${base}/quiz.html?x=${timed}`);
  await page.waitForSelector('#e-start:not([disabled])');
  await page.click('#e-start');
  await page.waitForSelector('#e-timer');
  check(/Time left 0[45]:\d\d/.test(await page.locator('#e-timer').innerText()), 'a timed exam shows a countdown');

  // ---- Themes and phone width
  await page.goto(`${base}/quiz.html`);
  await page.waitForSelector('#pr-pre-maneuvers');
  const bgs = [];
  for (let i = 0; i < 2; i++) {
    await page.click('#theme-toggle');
    const t = await page.evaluate(() => document.documentElement.dataset.theme);
    bgs.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    check(t === 'light' || t === 'dark', `theme toggled (${t})`);
    await shot(page, `practice-desktop-${t}`);
  }
  check(bgs[0] !== bgs[1], 'the two themes use different backgrounds');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload();
  await page.waitForSelector('#pr-pre-maneuvers');
  const f0 = page.locator('#p-case fieldset.qitem').nth(0);
  await f0.locator('input').first().check();
  await f0.locator('button.check-item').click();
  const last = page.locator('#p-case fieldset.qitem').last();
  await last.locator('input').first().check();
  await last.locator('button.check-item').click();
  check((await overflow(page)) <= 1, `no horizontal overflow at 390 px, practice (${await overflow(page)})`);
  await shot(page, 'practice-phone');
  await page.goto(`${base}/quiz.html?x=${code}&l=777`);
  await page.waitForSelector('#e-start:not([disabled])');
  await page.click('#e-start');
  await page.waitForSelector('#ex-pre-maneuvers');
  check((await overflow(page)) <= 1, `no horizontal overflow at 390 px, exam (${await overflow(page)})`);
  await shot(page, 'exam-phone');
  await page.goto(`${base}/quiz.html`);
  await page.waitForSelector('#pr-pre-maneuvers');
  await page.click('[data-tab=instructor]');
  await page.click('#i-build');
  await page.click('#i-show-student');
  // The sheet is built in a timer; an exception there leaves no sheet, so a timeout reports the page errors collected, not just the timeout.
  await page.waitForSelector('#sheet-body[data-kind=student]').catch((e) => { throw new Error(`${e.message}\npage errors: ${problems.join(' | ') || 'none'}`); });
  check((await overflow(page)) <= 1, `no horizontal overflow at 390 px, instructor sheet (${await overflow(page)})`);
  await shot(page, 'instructor-phone');

  // ---- Forty random cases
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/quiz.html`);
  await page.waitForSelector('#pr-pre-maneuvers');
  let withSens = 0;
  for (let i = 0; i < 40; i++) {
    await page.click('#p-new');
    await page.waitForSelector('#pr-pre-maneuvers');
    const items = page.locator('#p-case fieldset.qitem');
    if ((await items.count()) < 6) check(false, `case ${i} has too few questions`);
    if (i % 4 === 0) {
      const cnt = await items.count();
      for (let k = 0; k < cnt; k++) {
        const it = items.nth(k);
        await it.locator('input').nth(k % 2).check();
        await it.locator('button.check-item').click();
      }
    }
    if (await page.locator('#p-case [data-item=sensitivity]').count()) withSens++;
  }
  check(problems.length === 0, `no console or page errors over 40 random cases${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);
  console.log(`info: ${withSens} of 40 cases asked the equation sensitivity question`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
