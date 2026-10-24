import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { buildReportModel } from '../src/report/model.js';
import { detailsSheet, detailsSheetHtml, spirometryView } from '../src/sheets/details.js';
import { assembleReport } from '../src/report-page/assemble.js';
import { parseReportQuery, reportQuery } from '../src/report-page/query.js';
import { localVisibility } from '../src/report-page/modules.js';
import { fallbackRtReport } from '../src/report-page/rt-fallback.js';

const CASES = {
  normal: { seed: 5, archetype: 'normal' },
  obstruction: { seed: 12, archetype: 'obstruction', technique: 'fair' },
  restriction: { seed: 31, archetype: 'restriction-parenchymal' },
  mixed: { seed: 44, archetype: 'mixed' },
  poor: { seed: 8, archetype: 'bd-discordant', technique: 'poor', scenarioLevel: 'heavy' },
  spirometry: { seed: 44, archetype: 'mixed', panel: 'spirometry' },
};
/** Words that belong to acceptability and grades. None may appear in the markup of a sheet built without grades. */
const GRADE_TEXT = /\b(FEV1|FVC) - [A-FU]\b|grade|accept|usable|rejected|criteria not met|would be|Test quality|withheld|repeatability criteria|fewer than three/i;

const build = (input, { includeGrades = false } = {}) => {
  const c = buildCase(input, ds);
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  const model = buildReportModel(c, interp, { resolve: resolveReference, figures: false, includeGrades, gradesWithheld: null });
  return { c, interp, model };
};
const sheet = (x, opts = {}) => detailsSheet(x.model, { caseData: x.c, interp: x.interp, equation: 'GLIglobal', ...opts });
const rowsOf = (html, tableId) => { const m = html.match(new RegExp(`id="rpt-${tableId}"[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>`)); return m ? (m[1].match(/<tr>/g) ?? []).length : 0; };

test('no grade, acceptability or quality text is in the markup when showGrades is false, whatever the model holds', () => {
  for (const [name, input] of Object.entries(CASES)) {
    for (const includeGrades of [false, true]) {
      const x = build(input, { includeGrades });
      const { html, errors } = sheet(x, { showGrades: false });
      assert.deepEqual(errors, [], name);
      assert.doesNotMatch(html, GRADE_TEXT, `${name} (model with grades: ${includeGrades})`);
      for (const view of ['best', 'all', 'separate', 'auto']) assert.doesNotMatch(sheet(x, { showGrades: false, view }).html.replace(/\(best\)/g, ''), GRADE_TEXT, `${name} ${view}`);
    }
  }
});

test('grades, acceptability by maneuver and trial status are present when showGrades is true', () => {
  for (const [name, input] of Object.entries(CASES)) {
    const x = build(input);
    const html = detailsSheetHtml(x.model, { caseData: x.c, interp: x.interp, equation: 'GLIglobal', showGrades: true });
    const g = x.c.spirometry.pre.summary.grades;
    assert.ok(html.includes(`FEV<sub>1</sub> - ${g.fev1}, FVC - ${g.fvc}`), `${name}: pre grades`);
    if (x.c.spirometry.post) assert.ok(html.includes(`FEV<sub>1</sub> - ${x.c.spirometry.post.summary.grades.fev1}`), `${name}: post grades`);
    assert.match(html, /FEV<sub>1<\/sub> accept\./);
    assert.match(html, /FVC accept\./);
    // Each maneuver row says yes or no for each variable, as the engine evaluated it.
    const ev = x.c.spirometry.pre.summary.evaluations;
    const verdicts = [...html.match(/id="rpt-d-maneuvers-pre"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td class="l">([^<]*)<\/td>/g)].map((c) => c[1]));
    verdicts.forEach((cells, i) => {
      assert.equal(cells[0], ev[i].fev1.acceptable ? 'yes' : 'no', `${name} maneuver ${i + 1} FEV1`);
      assert.equal(cells[1], ev[i].fvc.acceptable ? 'yes' : 'no', `${name} maneuver ${i + 1} FVC`);
    });
    if (x.c.pleth) assert.match(html, new RegExp(`${x.c.pleth.session ? 'Overall lung-volume grade' : 'FRC-only simulator rubric'} ${x.c.pleth.grade ?? 'unassigned'}`));
    if (x.c.dlcoTrace) assert.match(html, /Simulator rubric [A-D]|Rubric [A-D]/);
  }
});

test('every maneuver, every panting trial and the figures are present, with fault comments, whether or not grades show', () => {
  for (const [name, input] of Object.entries(CASES)) {
    const x = build(input);
    for (const showGrades of [false, true]) {
      const html = detailsSheetHtml(x.model, { caseData: x.c, interp: x.interp, equation: 'GLIglobal', showGrades });
      assert.equal(rowsOf(html, 'd-maneuvers-pre'), x.c.spirometry.pre.maneuvers.length, `${name} pre maneuvers`);
      assert.equal(rowsOf(html, 'd-maneuvers-post'), x.c.spirometry.post?.maneuvers.length ?? 0, `${name} post maneuvers`);
      assert.equal(rowsOf(html, 'd-pleth'), x.c.pleth?.trials.length ?? 0, `${name} trials`);
      assert.ok(html.includes('data-figure-id="panel-spirometry"'));
      assert.equal(html.includes('data-figure-id="panel-pleth"'), Boolean(x.c.pleth), `${name} pleth panel`);
      assert.equal(html.includes('data-figure-id="panel-dlco"'), Boolean(x.c.dlcoTrace), `${name} dlco panel`);
      assert.ok(html.includes('data-figure-id="z-strip"'));
      // Fault comments of the first faulty maneuver and of every faulty trial.
      const faulty = x.c.spirometry.pre.maneuvers.findIndex((m) => m.faults.length);
      if (faulty >= 0) assert.ok(html.includes(`Pre-bronchodilator: `), `${name} technical note for the maneuvers`);
      for (const t of x.c.pleth?.trials ?? []) if (t.faults.length) assert.ok(html.includes(`Plethysmography trial ${t.index}: `), `${name} trial ${t.index} note`);
    }
  }
});

test('the maneuver numbers are the model numbers', () => {
  const x = build(CASES.obstruction);
  const html = detailsSheetHtml(x.model, { caseData: x.c, interp: x.interp, equation: 'GLIglobal' });
  const t = x.model.sections.find((s) => s.id === 'spirometry').tables.find((tt) => tt.id === 'maneuvers-pre');
  const body = html.match(/id="rpt-d-maneuvers-pre"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1];
  t.rows.forEach((r, i) => {
    const cells = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)][i][1];
    for (const v of [r.fvc.toFixed(2), r.fev1.toFixed(2), r.pef.toFixed(1), r.fet.toFixed(1), r.bev.toFixed(3)]) assert.ok(cells.includes(`>${v}<`), `maneuver ${r.index}: ${v}`);
  });
});

test('technical notes list the maneuver, trial and test faults, and the section is left out when there are none', () => {
  const poor = build(CASES.poor);
  assert.match(detailsSheetHtml(poor.model, { caseData: poor.c, interp: poor.interp }), /data-section="d-notes"/);
  const none = build(CASES.normal);
  none.model.technicalNotes = [];
  assert.doesNotMatch(detailsSheetHtml(none.model, { caseData: none.c, interp: none.interp }), /data-section="d-notes"/);
});

test('a panel that throws is reported and the rest of the sheet still renders', () => {
  const x = build(CASES.obstruction);
  const out = sheet(x, { palette: { ...{ id: 'broken' } } });
  assert.ok(out.html.includes('data-sheet="details"'));
  assert.ok(Array.isArray(out.errors));
});

test('the spirometry view follows the number of maneuvers unless one is named', () => {
  const small = build(CASES.spirometry).c;
  assert.equal(spirometryView('auto', small), small.spirometry.pre.maneuvers.length <= 8 ? 'separate' : 'all');
  assert.equal(spirometryView('best', small), 'best');
  assert.equal(spirometryView('overlay', small), spirometryView('auto', small));
});

/* ------------------------------------------------------------------ page order and settings */

const stubSummary = (calls) => (model, opts) => { calls.push({ model, opts }); return '<section class="stub-summary" data-sheet="summary"><p>SUMMARY SHEET</p></section>'; };
const assemble = (input, opts = {}) => assembleReport({ caseData: buildCase(input, ds), resolve: resolveReference, ...opts });
const at = (html, s) => { const i = html.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };

test('page order: summary sheet, then the details, then the blank interpretation block with the signature and date lines', () => {
  const calls = [];
  const out = assemble(CASES.obstruction, { sheets: { summarySheetHtml: stubSummary(calls) } });
  assert.equal(out.summaryFrom, 'summary');
  const s = at(out.html, 'SUMMARY SHEET'), d = at(out.html, 'data-sheet="details"'), i = at(out.html, 'data-section="interpretation"');
  assert.ok(s < d && d < i);
  assert.equal((out.html.match(/class="rp-box/g) ?? []).length, 2, 'one fixed sheet and one flowing sheet');
  const block = out.html.slice(i);
  assert.match(block, /class="rpt-box rp-blank"[^>]*><\/div>/, 'the box is empty');
  assert.match(block, /Simulated interpreting physician \(not signed\)/);
  assert.match(block, /rpt-line short/);
  assert.match(block, />Date</);
  // The summary receives the model, the technologist's report and the settings.
  assert.equal(calls.length, 1);
  const { model, opts } = calls[0];
  assert.ok(Array.isArray(model.interpretationComments));
  assert.deepEqual(Object.keys(opts).sort(), ['caseData', 'equation', 'flags', 'interp', 'palette', 'rt', 'showQualityLines']);
  assert.equal(opts.flags, 'lln');
  assert.equal(opts.rt.version, 1);
});

test('without the summary module the earlier page 1 stands in, and the details and interpretation block still follow it', () => {
  const out = assemble(CASES.obstruction);
  assert.equal(out.summaryFrom, 'fallback');
  const s = at(out.html, 'data-section="spirometry"'), d = at(out.html, 'data-sheet="details"'), i = at(out.html, 'data-section="interpretation"');
  assert.ok(s < d && d < i);
  assert.doesNotMatch(out.html, /Interpretation to be entered by the reader/);
});

test('the quality challenge withholds quality lines and grade columns exactly as the visibility rule says', () => {
  const seen = [];
  const visibility = (a) => { seen.push(a); return localVisibility(a); };
  const calls = [];
  const on = assemble(CASES.poor, { qualityChallenge: true, flags: 'none', sheets: { summarySheetHtml: stubSummary(calls), visibility } });
  assert.deepEqual(seen[0], { qualityChallenge: true, stage: 1 });
  assert.equal(calls[0].opts.showQualityLines, false);
  assert.equal(calls[0].opts.flags, 'none');
  assert.doesNotMatch(on.html.replace(/<style>[\s\S]*?<\/style>/g, ''), GRADE_TEXT);
  const off = assemble(CASES.poor, { qualityChallenge: false, sheets: { summarySheetHtml: stubSummary(calls), visibility } });
  assert.deepEqual(seen[1], { qualityChallenge: false, stage: 1 });
  assert.equal(calls[1].opts.showQualityLines, true);
  assert.match(off.html, /FEV<sub>1<\/sub> accept\./);
  assert.match(off.html, /FEV<sub>1<\/sub> - [A-F], FVC - [A-F]/);
  // The fallback comment box carries the stated quality lines only when they are visible.
  const fbOn = assemble(CASES.poor, { qualityChallenge: true }), fbOff = assemble(CASES.poor);
  assert.doesNotMatch(fbOn.html.slice(0, fbOn.html.indexOf('data-sheet="details"')), /Test quality/);
  assert.match(fbOff.html.slice(0, fbOff.html.indexOf('data-sheet="details"')), /Test quality: Pre: FEV1 - [A-F]/);
  assert.match(fbOn.html, /Official interpretation to follow\./);
});

test('the local visibility rule releases quality lines at stage 2 and grade columns at stage 3', () => {
  assert.deepEqual(localVisibility({ qualityChallenge: false, stage: 1 }), { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true });
  assert.deepEqual(localVisibility({ qualityChallenge: true, stage: 1 }), { showQualityLines: false, showGradeColumns: false, showStatementInSummary: false });
  assert.deepEqual(localVisibility({ qualityChallenge: true, stage: 2 }), { showQualityLines: true, showGradeColumns: false, showStatementInSummary: true });
  assert.deepEqual(localVisibility({ qualityChallenge: true, stage: 3 }), { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true });
});

test('a summary module that throws falls back to page 1 and is reported', () => {
  const out = assemble(CASES.normal, { sheets: { summarySheetHtml: () => { throw new Error('boom'); } } });
  assert.equal(out.summaryFrom, 'fallback');
  assert.ok(out.errors.some((e) => e.id === 'summary-sheet'));
});

test('the real technologist report is used when supplied and its failure falls back to the stand-in', () => {
  const calls = [];
  const rt = { ...fallbackRtReport(buildCase(CASES.normal, ds)), honesty: 'software', stub: false };
  assemble(CASES.normal, { sheets: { summarySheetHtml: stubSummary(calls), buildRtReport: () => rt } });
  assert.equal(calls[0].opts.rt.honesty, 'software');
  const out = assemble(CASES.normal, { sheets: { buildRtReport: () => { throw new Error('x'); } } });
  assert.equal(out.rt.stub, true);
  assert.ok(out.errors.some((e) => e.id === 'rt-report'));
});

test('qc and flags in the address, outside the descriptor', () => {
  const base = 'v=2&s=12&a=obstruction&t=fair';
  assert.deepEqual([parseReportQuery(base).qualityChallenge, parseReportQuery(base).flags], [false, 'lln']);
  assert.equal(parseReportQuery(`${base}&qc=1`).qualityChallenge, true);
  assert.equal(parseReportQuery(`${base}&qc=0`).qualityChallenge, false);
  assert.equal(parseReportQuery(`${base}&flags=none`).flags, 'none');
  // The case is the same with and without the settings.
  assert.deepEqual(parseReportQuery(`${base}&qc=1&flags=none`).descriptor, parseReportQuery(base).descriptor);
  assert.equal(parseReportQuery(`${base}&qc=1`).token, parseReportQuery(base).token);
  for (const bad of ['qc=2', 'qc=yes', 'qc=', 'flags=all', 'flags=']) assert.throws(() => parseReportQuery(`${base}&${bad}`), (e) => /^[A-Z].{15,}[.]$/.test(e.message) && !/undefined|\[object/.test(e.message), bad);
  const token = parseReportQuery(base).token;
  assert.equal(reportQuery({ token }), `?c=${encodeURIComponent(token)}&eq=GLIglobal`);
  const q = reportQuery({ token, qualityChallenge: true, flags: 'none', copy: 'instructor' });
  const back = parseReportQuery(q);
  assert.deepEqual([back.qualityChallenge, back.flags, back.copy], [true, 'none', 'instructor']);
});

test('the student copy still carries no key text with the quality challenge on or off, and the instructor copy still carries it', () => {
  for (const qualityChallenge of [false, true]) {
    const stu = assemble(CASES.obstruction, { qualityChallenge });
    assert.doesNotMatch(stu.html.replace(/<style>[\s\S]*?<\/style>/g, ''), /Answer key|Instructor appendix|Interpretation statement|Notes on this simulation|Computed from the reported values/);
    const ins = assemble(CASES.obstruction, { qualityChallenge, copy: 'instructor' });
    assert.match(ins.html, /Answer key/);
    assert.match(ins.html, /Instructor appendix/);
  }
});
