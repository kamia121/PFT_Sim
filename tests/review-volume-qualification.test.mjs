import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { composeNarrative } from '../src/interpret/narrative.js';
import { conciseSummary, conciseText } from '../src/report/concise.js';
import { renderMethod } from '../src/app/render.js';
import { evaluateManeuver } from '../src/core/quality.js';
import { feedbackHtml } from '../src/quiz/explain.js';
import { buildFeedback } from '../src/app/feedback.js';
import { renderReveal } from '../src/app/render.js';
import { buildChallenges, scoreChallenge } from '../src/challenges/index.js';
import { buildRtReport } from '../src/core/rt-report.js';
import { SPIROMETRY_2019 } from '../src/core/standards.js';

const descriptor = { v: 2, seed: 2, archetype: 'restriction-extraparenchymal', technique: 'good', panel: 'full', severity: 2 };
for (const [name, change] of [['weakness', {}], ['suboptimal effort', { scenarioIds: ['qs-submaximal-effort'] }], ['parenchymal restriction', { archetype: 'restriction-parenchymal' }]]) {
  test(`qualified volume language survives all narrative variants: ${name}`, () => {
    const c = buildCase({ ...descriptor, ...change }, ds);
    const a = interpret(c.report, resolveReference), cmp = compareEquations(c.report, resolveReference);
    assert.equal(a.pattern, 'restriction');
    if (name !== 'parenchymal restriction') {
      assert.ok(Math.abs(a.measures.tlc.z + 3.874768753) < 1e-8);
      assert.ok(Math.abs(a.measures.rv_tlc.z - 1.838998396) < 1e-8);
      assert.ok(a.flags.some((f) => f.id === 'high-rv-tlc'));
    }
    for (let seed = 0; seed < 24; seed++) {
      const n = composeNarrative({ caseData: c, interp: a, cmp, seed });
      const output = [n.finalStatement, ...n.sections.map((s) => s.text), ...n.findings.map((f) => f.text)].join('\n');
      assert.doesNotMatch(output, /consistent with air trapping|compatible with air trapping|shows air trapping/);
      assert.ok(!n.findings.some((f) => f.id === 'air-trapping'));
      if (name !== 'parenchymal restriction') {
        assert.match(output, /restriction, muscle weakness and effort also affect this ratio/);
        assert.ok(n.findings.some((f) => f.id === 'high-rv-tlc'));
      }
    }
    assert.doesNotMatch(conciseText(conciseSummary({ caseData: c, interp: a })), /with (?:possible )?air trapping/);
  });
}

test('high TLC with high RV/TLC remains possible, not a completed Table 7 classification', () => {
  const c = buildCase({ seed: 12, archetype: 'obstruction', technique: 'good', bronchodilator: false }, ds);
  const fake = (measure) => ({ available: true, z: ['tlc', 'rv_tlc'].includes(measure) ? 2 : 0, predicted: 4, percentPredicted: 100, lln: 3, uln: 5, equationId: 'test-only', matched: true });
  c.report.post = null;
  const a = interpret(c.report, fake), cmp = compareEquations(c.report, fake);
  assert.ok(!a.flags.some((f) => f.id === 'hyperinflation'));
  assert.ok(a.flags.some((f) => f.id === 'possible-hyperinflation'));
  for (let seed = 0; seed < 24; seed++) {
    const n = composeNarrative({ caseData: c, interp: a, cmp, seed });
    const output = [n.finalStatement, ...n.sections.map((s) => s.text), ...n.findings.map((f) => f.text)].join('\n');
    assert.match(output, /possible hyperinflation/);
    assert.match(output, /FRC\/TLC reference is unavailable/);
    assert.doesNotMatch(output, /consistent with hyperinflation|compatible with hyperinflation/);
    assert.ok(!n.findings.some((f) => f.id === 'hyperinflation'));
  }
});

test('method distinguishes prior transcription and archived spline agreement from printed-table verification', () => {
  const html = renderMethod(2);
  assert.match(html, /coefficients match the project’s prior coefficient transcription/);
  assert.match(html, /spline arrays match the archived lookup workbooks/);
  assert.doesNotMatch(html, /equations match the printed tables/);
  assert.match(html, /do not independently verify the printed coefficient tables/);
});

const maneuver = (fvc, extra = {}) => ({ fvc, fev1: fvc - 0.4, pef: 5, fef2575: 2, fet: 7, bev: 0.01, plateau: 0.01, coughFirstSecond: false, glottisClosedAt: null, ...extra });
test('BEV equality uses the documented inclusive Table 7 convention at both branches of the limit', () => {
  assert.match(SPIROMETRY_2019.boundaryConventions.bev, /Table 7 prints ≤ while prose prints </);
  const c = buildCase({ seed: 2, archetype: 'normal', technique: 'good' }, ds);
  const feedback = buildChallenges(c, { rt: buildRtReport(c) }).find((i) => i.id === 'acceptableManeuversPre').why;
  assert.match(feedback, /back-extrapolated volume at or below the larger/);
  assert.match(feedback, /Table 7 includes equality for BEV and the 0.025 L plateau limit, while adjacent prose uses strict comparisons/);
  assert.doesNotMatch(feedback, /volume below the larger/);
  const grade = c.report.grades.fev1;
  const quizFeedback = feedbackHtml({ id: 'gradeFev1', options: [{ id: grade, label: grade }], key: { correct: grade } }, { caseData: c }, { status: 'correct', score: 1, response: grade });
  assert.match(quizFeedback, /back-extrapolated volume is at or below 5%/);
  assert.match(quizFeedback, /inclusive 2019 Table 7 convention; adjacent prose uses strict comparisons/);
  for (const [fvc, limit] of [[1.5, 0.1], [4, 0.2]]) {
    for (const [offset, acceptable] of [[-1e-10, true], [0, true], [1e-10, false]]) {
      const q = evaluateManeuver(maneuver(fvc, { bev: limit + offset }));
      assert.equal(q.fev1.acceptable, acceptable);
      assert.equal(q.fvc.acceptable, acceptable);
    }
  }
});
test('plateau equality uses the same inclusive Table 7 convention without a rescuing EOFE alternative', () => {
  assert.match(SPIROMETRY_2019.boundaryConventions.plateau, /Table 7 and prose differ on equality/);
  for (const [offset, acceptable] of [[-1e-10, true], [0, true], [1e-10, false]]) {
    const q = evaluateManeuver(maneuver(3, { plateau: 0.025 + offset }), 4);
    assert.equal(q.fvc.acceptable, acceptable); assert.equal(q.fev1.acceptable, true);
  }
});

test('a lone short no-plateau maneuver remains provisional; a completed pair can establish EOFE', async () => {
  const { summarizeSession } = await import('../src/core/quality.js');
  const short = maneuver(3, { plateau: 0.2, fet: 5 });
  assert.equal(evaluateManeuver(short).fvc.acceptable, false);
  assert.equal(summarizeSession([short]).grades.fvc, 'U');
  assert.equal(summarizeSession([short, { ...short, fvc: 3.1 }]).grades.fvc, 'B');
  assert.equal(summarizeSession([short, { ...short, faults: ['leak'] }]).evaluations[1].fvc.acceptable, false);
});

test('DLCO strict inspiration boundary, classical sample exception and separate RGA criteria', async () => {
  const { gradeDlcoTest } = await import('../src/core/dlco-trace.js');
  const q = { viOverVc: 0.95, t85S: 2, breathHoldS: 10, sampleEndS: 3, washoutL: 0.8, sampleL: 0.7, vcL: 4, contamination: 0 };
  for (const [time, pass] of [[4 - 1e-10, true], [4, false], [4 + 1e-10, false]]) assert.equal(gradeDlcoTest({ ...q, t85S: time }).acceptable, pass);
  for (const [vcL, clearance, pass] of [[0.99, true, true], [1, true, false], [1.05, true, false], [0.99, false, false]]) {
    const g = gradeDlcoTest({ ...q, vcL, washoutL: 0.5, sampleL: 0.4, deadSpaceClearanceConfirmed: clearance });
    assert.equal(g.acceptable, pass);
    if (vcL < 1 && !clearance) assert.ok(g.unknown.length);
  }
  assert.equal(gradeDlcoTest({ ...q, samplingMethod: 'rga', washoutL: 0.1, sampleL: 0.085, deadSpaceClearanceConfirmed: true }).acceptable, true);
  assert.equal(gradeDlcoTest({ ...q, samplingMethod: 'rga', sampleL: 0.501, deadSpaceClearanceConfirmed: true }).acceptable, false);
  const missing = gradeDlcoTest({ ...q, viOverVc: 0.87 });
  assert.equal(missing.acceptable, false); assert.ok(missing.unknown.length);
  assert.equal(gradeDlcoTest({ ...q, viOverVc: 0.87, vaL: 3, largestOtherAcceptableVaL: 3.2 }).acceptable, true, 'decimal equality survives arithmetic representation');
  assert.equal(gradeDlcoTest({ ...q, viOverVc: 0.87, vaL: 4, largestOtherAcceptableVaL: 4.1 }).acceptable, true);
});


test('pause-at-TLC explanation agrees with acceptable maneuvers and coaching warnings', () => {
  const c = buildCase({ seed: 2, archetype: 'normal', technique: 'good', scenarioIds: ['qs-pause-at-tlc'] }, ds);
  let affected = 0;
  for (const set of ['pre', 'post']) {
    const s = c.spirometry[set]; if (!s) continue;
    s.maneuvers.forEach((m, i) => {
      if (!m.faults.includes('pause-at-TLC')) return;
      affected++;
      assert.equal(s.summary.evaluations[i].fev1.acceptable, true);
      assert.ok(s.summary.evaluations[i].fev1.warnings.length);
    });
  }
  assert.ok(affected);
  const text = c.scenario.caveats.find((x) => x.id === 'pause-at-tlc').text;
  assert.match(text, /prompts coaching and review/);
  assert.match(text, /pause alone does not make the affected FEV1 unacceptable under Table 7/);
  assert.doesNotMatch(text, /affected FEV1 is not acceptable/);
});

test('pleth feedback distinguishes a qualifying subset from the displayed 9.35% reporting set', () => {
  const c = buildCase({ v: 2, seed: 3, archetype: 'normal', technique: 'fair' }, ds);
  assert.equal(c.pleth.grade, 'A');
  assert.equal(c.pleth.repeatability.nAcceptable, 5);
  assert.equal(c.pleth.repeatability.nWithin5Pct, 3);
  assert.equal(c.pleth.repeatability.spreadFraction, 0.0935);
  const item = buildChallenges(c, { rt: buildRtReport(c) }).find((x) => x.id === 'plethAcceptable');
  assert.equal(item.key, 'acceptable'); // Internal key retained; scored question is the simulator rubric only.
  assert.deepEqual(item.options, [['acceptable', 'Subset qualifies (simulator rubric)'], ['not-acceptable', 'No qualifying acceptable subset']]);
  assert.match(item.prompt, /Overall ATS\/ERS quality cannot be established/);
  assert.match(item.why, /reported FRC currently averages all acceptable trials, rather than selecting the qualifying subset/);
  assert.match(item.why, /displayed acceptable set spans 9.35%/);
  assert.match(item.why, /does not establish that the displayed reporting set meets 5%/);
  assert.match(item.why, /Retained linked SVC quality and full reporting selection are not implemented/);
  assert.doesNotMatch(item.why, /trials of this study meet these requirements|acceptable trials, which must agree within 5%/);
  const interp = interpret(c.report, resolveReference), cmp = compareEquations(c.report, resolveReference);
  const feedback = buildFeedback({ caseData: c, interp, interpOther: interp, equation: 'GLIglobal', responses: { structured: {}, challenge: { plethAcceptable: item.key }, impression: '' }, items: [item], scoreChallenge, rt: buildRtReport(c) });
  const row = feedback.rows.find((r) => r.id === item.id);
  assert.equal(row.status, 'correct');
  assert.match(row.why, /displayed acceptable set spans 9.35%/);
  assert.ok(feedback.quality.lines.some((l) => /FRC subset simulator rubric qualifies; overall ATS\/ERS quality is not established/.test(l)));
  for (const scored of [false, true]) assert.match(renderReveal(c, interp, cmp, [], scored, feedback), /displayed acceptable set spans 9.35%/);

});
