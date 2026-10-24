import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { resolveDescriptor, serializeDescriptor, parseDescriptor } from '../src/core/descriptor.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { composeNarrative } from '../src/interpret/narrative.js';
import { buildReportModel, allTables } from '../src/report/model.js';
import { renderReportHtml } from '../src/report/html.js';
import { toCsv } from '../src/report/export.js';
import { buildRtReport } from '../src/core/rt-report.js';
import { buildChallenges, scoreChallenge } from '../src/challenges/index.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { PALETTES } from '../src/ui/palettes.js';
import { conciseSummary } from '../src/report/concise.js';
const make = (seed, technique = 'poor', extra = {}) => buildCase({ v: 3, seed, archetype: 'normal', technique, ...extra }, ds);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} vs ${b}`);

test('v3 reports the selected measured linked pairs and v2 links retain their legacy generator', () => {
  const c = make(3, 'fair'), p = c.pleth, retained = p.trials.filter((t) => t.selected);
  assert.equal(c.descriptor.v, 3); assert.equal(p.session.status, 'reported');
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  close(c.volumes.frc, mean(retained.map((t) => t.frcL)));
  close(c.volumes.tlc, mean(retained.map((t) => t.frcL + t.link.icL)));
  close(c.volumes.rv, c.volumes.tlc - Math.max(...retained.map((t) => t.link.svcL)));
  assert.equal(p.grade, p.session.grades.overall);
  for (const t of p.timeline.trials) {
    const measured = p.trials.find((r) => r.index === t.trial);
    assert.ok(Math.abs(t.levels.icL - measured.link.icL) <= 0.000051);
    assert.ok(Math.abs(t.levels.tlcL - (measured.frcL + measured.link.icL)) <= 0.000051);
  }
  const old = buildCase(parseDescriptor('v=2&s=3&a=normal&t=fair'), ds);
  assert.equal(old.descriptor.v, 2); assert.equal(old.pleth.session, undefined);
  assert.equal(old.pleth.repeatability.spreadFraction, 0.0935);
  assert.equal(parseDescriptor(serializeDescriptor(resolveDescriptor({ seed: 3, archetype: 'normal' }))).v, 4);
});

for (const [name, c] of [['FRC only', make(2)], ['pending pair', make(26)], ['all FRC rejected', make(5, 'good', { archetype: 'obstruction', scenarioIds: ['pleth-pant-fast'] })]]) {
  test(`unavailable volume workflow: ${name}`, () => {
    assert.notEqual(c.pleth.session.status, 'reported');
    assert.equal(c.volumes.tlc, null); assert.equal(c.volumes.rv, null);
    const a = interpret(c.report, resolveReference), cmp = compareEquations(c.report, resolveReference);
    for (const key of ['tlc', 'rv', 'rv_tlc']) assert.equal(a.measures[key], undefined, key);
    assert.ok(!['restriction', 'mixed'].includes(a.pattern));
    const model = buildReportModel(c, a, { resolve: resolveReference, includeKey: true, includeGrades: true });
    const tlc = allTables(model).flatMap((t) => t.rows).find((r) => r.id === 'tlc');
    assert.equal(tlc.result, 'not reportable'); assert.equal(tlc.z, null);
    const html = renderReportHtml(model), csv = toCsv(model);
    assert.match(html, /not reportable/); assert.match(csv, /not reportable/);
    assert.doesNotMatch(html + csv, /NaN|undefined|Infinity/);
    const summary = conciseSummary({ caseData: c, interp: a });
    assert.match(summary.impression, /TLC (?:is )?unavailable/);
    const n = composeNarrative({ caseData: c, interp: a, cmp });
    assert.match(n.finalStatement, /Lung volumes/); assert.doesNotMatch(n.finalStatement, /TLC (?:is |remains )?(?:normal|within the reference range)/);
    const rt = buildRtReport(c), item = buildChallenges(c, { rt }).find((i) => i.id === 'plethAcceptable');
    assert.equal(item.key, 'unavailable'); assert.equal(scoreChallenge(item, 'unavailable').status, 'correct');
    assert.match(item.why, /Repeatability|retained/);
    for (const [id, f] of Object.entries(FIGURES)) {
      const data = f.dataFor(c, a);
      if (data) assert.doesNotMatch(f.render(data, { palette: PALETTES.white }), /NaN|undefined|Infinity/, id);
    }
  });
}

test('incomplete linked inspiration withholds TLC/RV without manufacturing a diffusion change', () => {
  const base = make(5, 'good'), c = make(5, 'good', { scenarioIds: ['pleth-incomplete-ic'] });
  assert.equal(c.pleth.session.status, 'frc-only'); assert.equal(c.volumes.tlc, null);
  assert.ok(c.pleth.trials.every((t) => t.link.withinManeuverStatus === 'rejected'));
  close(c.dlco.raw, base.dlco.raw); close(c.dlco.va, base.dlco.va);
  assert.match(c.scenario.caveats.find((x) => x.id === 'pleth-ic-short-tlc-low').text, /complete TLC\/RV report may be unavailable/);
});

test('qualified measurement pools remain reportable with the retained set and component grades', () => {
  const c = make(3), a = interpret(c.report, resolveReference), rt = buildRtReport(c);
  assert.equal(c.pleth.grade, 'E'); assert.equal(c.pleth.session.status, 'reported');
  const item = buildChallenges(c, { rt }).find((i) => i.id === 'plethAcceptable');
  assert.equal(item.key, 'qualified'); assert.match(item.why, /Repeatability cannot be assessed/);
  assert.equal(rt.truth.pleth.acceptable, false); assert.ok(Number.isFinite(c.volumes.tlc));
  const model = buildReportModel(c, a, { resolve: resolveReference, includeGrades: true });
  assert.match(renderReportHtml(model), /Linked IC|Linked SVC/);
});


test('a physical garment constraint affects diffusion independently of pleth linkage failures', () => {
  const base = make(5, 'good'), c = make(5, 'good', { scenarioIds: ['prep-binder'] });
  assert.ok(c.dlco.va < base.dlco.va);
  assert.ok(c.pleth.trials.some((t) => t.linkAssessment.status === 'acceptable'));
  assert.ok(c.pleth.trials.every((t) => !t.link.notes.some((n) => /Incomplete maximal inspiration/.test(n))));
});
