/** Integration boundaries of the written-impression check: what may call the grader, when its result may show, and what the page markup may hold. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, CASES } from './helpers/written-cases.mjs';
import { takeSnapshot, visibleSnapshot } from '../src/written/session.js';
import { writtenEnabled } from '../src/written/enable.js';
import { writtenFeedbackHtml, writtenAnnouncement } from '../src/written/view.js';
import { renderPractice } from '../src/app/practice-view.js';
import { createStage, check } from '../src/app/stage.js';
import { emptyResponses } from '../src/app/collect.js';
import { ds, resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import * as stub from './helpers/practice-stub.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test('the grader module has no way to leave the page: no network, storage, logging, timers, dynamic code or model', () => {
  const FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|caches|document\.cookie|navigator|location|console|eval|setTimeout|setInterval|requestIdleCallback|Worker|importScripts|WebAssembly|Function\s*\()\b/;
  for (const f of walk('src/written').filter((x) => x.endsWith('.js'))) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, FORBIDDEN, f);
    assert.doesNotMatch(code, /\bimport\s*\(/, `${f}: no dynamic import`);
    for (const m of code.matchAll(/from\s+'([^']+)'/g)) assert.ok(m[1].startsWith('.'), `${f}: only relative imports (${m[1]})`);
  }
  assert.ok(!fs.existsSync(path.join(root, 'src/written/model')), 'no model directory');
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], 'no production dependency was added');
});

test('only the scored check calls the grader, and nothing outside the practice page imports it', () => {
  const main = read('src/app/main.js');
  assert.ok(!/gradeWritten|snapshotWritten/.test(main), 'main.js does not call the grader directly');
  const calls = [...main.matchAll(/takeSnapshot\(/g)].length;
  assert.equal(calls, 1);
  const fn = main.slice(main.indexOf('function checkAnswers('), main.indexOf('function releaseStatement('));
  assert.ok(fn.includes('takeSnapshot('), 'the one call is inside checkAnswers');
  assert.match(fn, /if \(scored && state\.writtenOn && state\.writtenMods\) \{[\s\S]*takeSnapshot/, 'and only on the scored branch with the switch on');
  for (const f of [...walk('src/quiz'), ...walk('src/report'), ...walk('src/report-page'), ...walk('src/challenges'), ...walk('src/core'), ...walk('src/interpret')].filter((x) => x.endsWith('.js'))) {
    assert.ok(!/written\//.test(read(f)), `${f} must not import the written grader`);
  }
  for (const f of ['quiz.html', 'report.html']) assert.ok(!/written/.test(read(f)), `${f} does not load it`);
});

test('the check is off by default and on only for written=1', () => {
  for (const q of ['', '?', '?c=abc', '?written=0', '?written=true', '?written=', '?Written=1', '?written=1x', undefined, null]) assert.equal(writtenEnabled(q), false, String(q));
  assert.equal(writtenEnabled('?written=1'), true);
  assert.equal(writtenEnabled('?c=abc&written=1&eq=GLI2012'), true);
  // nothing outside the opt-in path loads the grader: main.js has no static import of it
  const main = read('src/app/main.js');
  assert.ok(!/^import .*written\/(session|view|index)\.js/m.test(main), 'only the switch is imported statically');
  assert.match(main, /import\('\.\.\/written\/session\.js'\)/);
});

test('quiz scope: the quiz neither grades free text nor shows the written check', () => {
  // the quiz has a textarea only for result codes; it has no written-impression field and does not import the grader
  assert.ok(!/impression/i.test(walk('src/quiz').filter((x) => x.endsWith('.js')).map(read).join('\n')), 'the quiz has no written-impression item');
});

function snapshotArgs(over = {}) {
  const s = setup(CASES.mild);
  return { scored: true, stage: 3, text: 'Mild obstruction, no BDR, normal DLCO', ...s, ...over };
}

test('snapshot gate: explicit scored check at stage 3 with a non-blank text, and nothing else', () => {
  assert.ok(takeSnapshot(snapshotArgs()));
  assert.equal(takeSnapshot(snapshotArgs({ scored: false })), null, 'Show the key without scoring never grades');
  assert.equal(takeSnapshot(snapshotArgs({ scored: undefined })), null);
  assert.equal(takeSnapshot(snapshotArgs({ scored: 'true' })), null);
  assert.equal(takeSnapshot(snapshotArgs({ stage: 2 })), null);
  assert.equal(takeSnapshot(snapshotArgs({ stage: 1 })), null);
  assert.equal(takeSnapshot(snapshotArgs({ text: '' })), null, 'a blank optional impression gets no grade');
  assert.equal(takeSnapshot(snapshotArgs({ text: '  \n ' })), null);
  assert.equal(takeSnapshot(snapshotArgs({ text: undefined })), null);
  // the state machine: a scored check and a key-only check both reach stage 3, and only the first may grade
  const scored = check(createStage(), { scored: true }), keyOnly = check(createStage(), { scored: false });
  assert.equal(scored.stage, 3); assert.equal(keyOnly.stage, 3);
  assert.ok(takeSnapshot(snapshotArgs({ scored: scored.scored, stage: scored.stage })));
  assert.equal(takeSnapshot(snapshotArgs({ scored: keyOnly.scored, stage: keyOnly.stage })), null);
});

test('snapshot lifetime: tied to the case object and the scored stage; never recomputed; a new case retires it', () => {
  const a = snapshotArgs();
  const snap = takeSnapshot(a);
  const scoredStage = { stage: 3, scored: true };
  assert.equal(visibleSnapshot(snap, { caseData: a.caseData, stage: scoredStage }), snap);
  // repeated reads (theme, page 2, figure changes re-render) return the very same object: nothing is regraded
  for (let i = 0; i < 5; i++) assert.strictEqual(visibleSnapshot(snap, { caseData: a.caseData, stage: scoredStage }), snap);
  assert.equal(visibleSnapshot(snap, { caseData: a.caseData, stage: { stage: 3, scored: false } }), null);
  assert.equal(visibleSnapshot(snap, { caseData: a.caseData, stage: { stage: 2, scored: false } }), null);
  const next = buildCase(CASES.severe, ds); // a new case replaces the case object
  assert.equal(visibleSnapshot(snap, { caseData: next, stage: scoredStage }), null);
  assert.equal(visibleSnapshot(null, { caseData: next, stage: scoredStage }), null);
  // the equation is part of the snapshot and is labelled; it is not recomputed when the page equation changes
  assert.equal(snap.equation, 'GLIglobal');
  const html = writtenFeedbackHtml(snap, { currentEquation: 'GLI2012' });
  assert.match(html, /produced under GLI Global 2022/); assert.match(html, /not recomputed/);
  assert.match(writtenFeedbackHtml(snap, { currentEquation: 'GLIglobal' }), /Checked under GLI Global 2022/);
  assert.equal(snap.result, takeSnapshot(a).result === snap.result ? snap.result : snap.result);
});

test('the snapshot is graded under the displayed equation, with the other equation only as the accepted alternative', () => {
  const g = setup(CASES.pattern2012, 'GLIglobal'), l = setup(CASES.pattern2012, 'GLI2012');
  const sg = takeSnapshot({ scored: true, stage: 3, text: 'Normal', ...g });
  const sl = takeSnapshot({ scored: true, stage: 3, text: 'Normal', ...l });
  assert.equal(sg.equation, 'GLIglobal'); assert.equal(sl.equation, 'GLI2012');
  assert.notEqual(g.interp.key.pattern, l.interp.key.pattern);
});

function ctxFor(stageN, { writtenEnabled: on = true, scored = true, writtenHtml = '<section class="written-feedback">WRITTEN-MARK</section>', text = 'Mild obstruction' } = {}) {
  const caseData = buildCase(CASES.mild, ds);
  const equation = 'GLIglobal';
  const interp = interpret(caseData.report, resolveReference, equation);
  const cmp = compareEquations(caseData.report, resolveReference, 'GLI2012', 'GLIglobal');
  const rt = stub.buildRtReport(caseData);
  const items = stub.buildChallenges(caseData, { rt, interp, qualityChallenge: false });
  let st = createStage({ qualityChallenge: false });
  if (stageN === 3) st = check(st, { scored });
  const vis = stub.visibility({ qualityChallenge: false, stage: st.stage });
  const responses = { ...emptyResponses(), impression: text };
  return { caseData, interp, cmp, equation, flags: 'lln', qualityChallenge: false, stage: st.stage, scored: st.scored, detailsOpen: false, vis, canCheck: true, rt, items, responses, model: null, sheets: { summarySheetHtml: null, detailsSheetHtml: null }, palette: {}, figView: {}, showSchematic: false, resolve: resolveReference, feedback: null, writtenHtml, writtenEnabled: on };
}

test('page markup: the feedback is absent before the check, and present only in the compare block after it', () => {
  const before = renderPractice(ctxFor(1));
  assert.ok(!before.includes('WRITTEN-MARK') && !before.includes('written-feedback'));
  assert.match(before, /id="impression"/);
  assert.match(before, /experimental and unreliable, not for assessment[^<]*no score; stays in this page/);
  assert.doesNotMatch(before, /optional; not scored/);
  // with the switch off the label is the original one
  const off = renderPractice(ctxFor(1, { writtenEnabled: false }));
  assert.match(off, /\(optional; not scored\)/); assert.doesNotMatch(off, /experimental/);
  const after = renderPractice(ctxFor(3));
  assert.equal(after.split('WRITTEN-MARK').length - 1, 1);
  assert.ok(after.indexOf('WRITTEN-MARK') > after.indexOf('Composed summary') - 100000 && after.indexOf('WRITTEN-MARK') < after.indexOf('Interpreting physician'));
  // the textarea is gone at stage 3: the impression cannot be edited after it was checked
  assert.ok(!/<textarea id="impression"/.test(after));
  // the page without the hook still renders
  const hookless = ctxFor(3); delete hookless.writtenHtml;
  assert.ok(renderPractice(hookless).includes('Compare the interpretation'));
});

test('markup: trainee text is escaped everywhere it appears', () => {
  const evil = '<img src=x onerror=alert(1)> "mild" obstruction <script>alert(2)</script> & obstrction';
  const s = setup(CASES.mild);
  const snap = takeSnapshot({ scored: true, stage: 3, text: evil, ...s });
  const html = writtenFeedbackHtml(snap);
  assert.doesNotMatch(html, /<img|<script|onerror=alert|<\/?q>\s*<\/?script/i);
  assert.ok(!/<(?!\/?(section|h4|h5|p|ul|li|q|div|strong|span)\b)/.test(html), 'only the fixed tags');
  const checked = renderPractice(ctxFor(3, { writtenHtml: html, text: evil }));
  assert.doesNotMatch(checked, /<img src=x|<script>alert/);
});

test('announcement holds counts only and never the trainee\'s words', () => {
  const s = setup(CASES.mild);
  const SENT = 'ZXQSENTINEL7731';
  const snap = takeSnapshot({ scored: true, stage: 3, text: `Mild obstruction ${SENT} obstrction`, ...s });
  const a = writtenAnnouncement(snap);
  assert.match(a, /^Written impression checked: \d+ matched, \d+ contradicted, \d+ not mentioned, \d+ to review\.$/);
  assert.ok(!a.includes(SENT) && !/obstruction/i.test(a));
  assert.equal(writtenAnnouncement(null), '');
  assert.equal(writtenAnnouncement(takeSnapshot({ scored: true, stage: 3, text: 'x'.repeat(2001), ...s })), 'The written impression is too long to check.');
});

test('too-long, blank and abstained results render honestly and carry no score', () => {
  const s = setup(CASES.mild);
  const long = takeSnapshot({ scored: true, stage: 3, text: 'y'.repeat(2500), ...s });
  assert.match(writtenFeedbackHtml(long), /longer than 2000 characters/);
  const nothing = takeSnapshot({ scored: true, stage: 3, text: 'The weather is mild today', ...s });
  const html = writtenFeedbackHtml(nothing);
  assert.match(html, /No interpretation statements could be recognized/);
  assert.doesNotMatch(html, /\d+\s*%|out of|score of|grade of/i);
  assert.match(html, /no score|gives no score/);
  assert.match(html, /not a validated assessment/); assert.match(html, /Experimental and unreliable; not for trainee assessment/);
});

test('the markup separates the four groups with headings and status words', () => {
  const s = setup(CASES.mild);
  const snap = takeSnapshot({ scored: true, stage: 3, text: 'Moderate obstruction. Possible restriction. DLCO normal.', ...s });
  const html = writtenFeedbackHtml(snap);
  for (const h of ['Correct', 'Not mentioned', 'Contradicts the key', 'Needs review']) assert.ok(html.includes(`<h5>${h}</h5>`) || h === 'Needs review' || h === 'Not mentioned', h);
  assert.match(html, /Start here/);
  assert.match(html, /<q>[^<]+<\/q>/);
});
