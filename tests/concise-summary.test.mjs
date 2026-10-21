/** The concise interpretation summary: impression first, labelled lines, essential caveats kept, supporting explanation apart, classifications untouched. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeModel, resolveReference } from './report-helpers.mjs';
import { compareEquations, interpret } from '../src/interpret/interpret.js';
import { interpretationFor } from '../src/report/statement.js';
import { conciseSummary, conciseText } from '../src/report/concise.js';
import { statementHtml } from '../src/report/html.js';
import { buildCase } from '../src/core/case.js';
import { ds } from './report-helpers.mjs';

const CASES = {
  normal: { seed: 5, archetype: 'normal' },
  obstruction: { seed: 12, archetype: 'obstruction' },
  restriction: { seed: 31, archetype: 'restriction-parenchymal' },
  mixed: { seed: 44, archetype: 'mixed' },
  lowDlco: { seed: 5, archetype: 'low-dlco' },
  poor: { seed: 8, archetype: 'bd-discordant', technique: 'poor', scenarioLevel: 'heavy' },
  cohb: { seed: 6, archetype: 'anemia', technique: 'good', scenarioIds: ['sub-cohb-measured'] },
};
const stmtOf = (input) => {
  const { c, interp } = makeModel(input);
  const cmp = compareEquations(c.report, resolveReference, 'GLI2012', 'GLIglobal');
  return { c, interp, cmp, stmt: interpretationFor(c, interp, cmp) };
};
const words = (s) => s.trim().split(/\s+/).length;

test('every representative case has an impression of one to three short sentences, then labelled lines, and the plain text mirrors them', () => {
  for (const [name, input] of Object.entries(CASES)) {
    const { stmt } = stmtOf(input);
    assert.ok(stmt.parts, name);
    assert.ok(words(stmt.parts.impression) <= 45, `${name}: impression ${words(stmt.parts.impression)} words`);
    assert.ok(stmt.parts.lines.length >= 3 && stmt.parts.lines.length <= 14, `${name}: ${stmt.parts.lines.length} lines`);
    assert.ok(stmt.parts.lines.every((l) => l.label && l.text.length > 8 && l.text.length < 420), `${name}: line length`);
    assert.equal(stmt.text, conciseText(stmt.parts));
    assert.ok(stmt.text.startsWith('Impression: '));
    assert.ok(stmt.supporting.length > stmt.parts.impression.length, `${name}: the supporting explanation is kept`);
  }
});

test('the summary does not change a classification: it states the pattern, severity, DLCO and bronchodilator result of the key', () => {
  for (const [name, input] of Object.entries(CASES)) {
    const { interp, stmt } = stmtOf(input);
    const imp = stmt.parts.impression.toLowerCase();
    const head = { normal: 'normal spirometry', obstruction: 'airflow obstruction', restriction: 'restriction', mixed: 'mixed obstruction and restriction', nonspecific: 'nonspecific', prism: 'prism', 'obstruction-low-fvc': 'airflow obstruction', indeterminate: 'not interpretable' }[interp.pattern];
    assert.ok(imp.startsWith(head), `${name}: "${imp}" for ${interp.pattern}`);
    if (interp.key.severity && !['fev1-normal', 'not-graded'].includes(interp.key.severity)) assert.ok(imp.includes(`, ${interp.key.severity}`), `${name} severity`);
    if (interp.key.dlco === 'reduced') assert.ok(imp.includes('reduced dlco'), name);
    if (interp.key.dlco === 'normal') assert.ok(imp.includes('dlco normal'), name);
    if (interp.key.bronchodilator === 'significant') assert.ok(imp.includes('significant bronchodilator response'), name);
    if (interp.key.bronchodilator === 'not-significant') assert.ok(imp.includes('no significant bronchodilator response'), name);
  }
});

test('Quality limits, uncertainty near a limit, equation differences, caveats and the reference population are kept as lines', () => {
  const poor = stmtOf(CASES.poor);
  const text = (s, label) => s.stmt.parts.lines.find((l) => l.label === label)?.text ?? '';
  assert.match(text(poor, 'Quality'), /Grades FEV₁/);
  const cohb = stmtOf(CASES.cohb);
  assert.match(text(cohb, 'DLCO'), /measured value against the reference adjusted for hemoglobin/, 'the basis is stated');
  assert.match(text(cohb, 'DLCO'), /COHb \d+\.\d% is above 2%.*supplementary.*not the basis of this classification/);
  assert.match(text(cohb, 'Uncertainty'), /within 0\.25 z of a limit/);
  assert.match(text(cohb, 'Reference'), /European-ancestry/);
  assert.match(text(cohb, 'Caveat'), /carboxyhemoglobin/);
  assert.ok(cohb.interp.qualityLimited === (/limits confidence/.test(text(cohb, 'Quality'))));
  // A case with a grade of D or worse says so in both the impression and the quality line.
  let found = false;
  for (let seed = 1; seed <= 300 && !found; seed++) {
    const s = stmtOf({ seed, archetype: 'obstruction', technique: 'poor' });
    if (s.interp.qualityLimited) {
      found = true;
      assert.match(s.stmt.parts.impression, /Test quality limits confidence/);
      assert.match(s.stmt.parts.lines.find((l) => l.label === 'Quality').text, /grade of D or worse limits confidence/);
    }
  }
  assert.ok(found, 'a quality-limited case exists');
  // Scenario caveats of the session survive in the Limits line.
  const caveated = stmtOf({ seed: 12, archetype: 'obstruction', scenarioLevel: 'heavy' });
  const cav = [...(caveated.c.scenario.caveats ?? [])];
  if (cav.length) assert.equal(caveated.stmt.parts.lines.filter((l) => l.label === 'Caveat').length >= 1, true);
});

test('the preserved-FEV1 obstruction is summarized as not graded, with the reason, and never as mild', () => {
  const s = { patient: { age: 50, sex: 'M', heightCm: 178, group: 'White', weightKg: 80, hbGdl: 14.6 }, spirometry: { fev1: 3.5, fvc: 5.9, post: null }, volumes: null, dlco: null, grades: { fev1: 'A', fvc: 'A' } };
  const interp = interpret(s, resolveReference, 'GLIglobal');
  assert.equal(interp.key.severity, 'fev1-normal');
  const parts = conciseSummary({ caseData: { report: s, spirometry: {} }, interp });
  assert.match(parts.impression, /not graded \(FEV₁ within normal limits\)/);
  assert.doesNotMatch(conciseText(parts), /\bmild\b/i);
  assert.match(parts.lines.find((l) => l.label === 'Spirometry').text, /Severity not graded.*normal variant/);
});

test('the markup is an impression paragraph and a list, with the text escaped; a model without parts falls back to paragraphs', () => {
  const html = statementHtml({ impression: 'A <b>b</b>.', lines: [{ label: 'Quality', text: 'x & y' }] }, 'plain');
  assert.match(html, /<p class="stmt-impression"><strong>Impression\.<\/strong> A &lt;b&gt;b&lt;\/b&gt;\.<\/p><ul class="stmt-lines"><li><strong>Quality\.<\/strong> x &amp; y<\/li><\/ul>/);
  assert.equal(statementHtml(null, 'one\n\ntwo'), '<p>one</p><p>two</p>');
});

test('the summary is deterministic and shorter than the supporting explanation on average', () => {
  let a = 0, b = 0;
  for (const input of Object.values(CASES)) {
    const x = stmtOf(input), y = stmtOf(input);
    assert.equal(x.stmt.text, y.stmt.text);
    a += x.stmt.text.length; b += x.stmt.supporting.length;
  }
  assert.ok(a < b, `${a} vs ${b}`);
  void buildCase; void ds;
});
