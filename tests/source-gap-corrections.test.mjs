import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildCase } from '../src/core/case.js';
import { jonesMeadeTiming, analyzeDlcoTrace } from '../src/core/dlco-trace.js';
import { interpret } from '../src/interpret/interpret.js';
import { evaluateManeuver, summarizeSession, faultWording } from '../src/core/quality.js';
import { makeModel, ds } from './report-helpers.mjs';
import { conciseSummary, conciseText } from '../src/report/concise.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { PALETTES } from '../src/ui/palettes.js';
import { claimsFrom, renderClaims } from '../src/quiz/fallbacks.js';

// Independent hand arithmetic: t0=.2, t90=2.2 => tI=2, start=.8;
// sample at 10..13 seconds => end=11.5, interval=10.7. No volume-event input.
test('Jones–Meade uses back-extrapolated zero and arithmetic midpoint of collection times', () => {
  const t = jonesMeadeTiming(.2, 2.2, 10, 13);
  assert.ok(Math.abs(t.startS - .8) < 1e-12);
  assert.equal(t.endS, 11.5); assert.ok(Math.abs(t.seconds - 10.7) < 1e-12);
  for (const args of [[NaN, 2, 10, 13], [2, 1, 10, 13], [.2, 2.2, 1, 3], [.2, 2.2, 13, 10]]) assert.throws(() => jonesMeadeTiming(...args));
});

test('nonlinear inspiration and expiration use independent timing endpoints, decay and full-precision quality', () => {
  for (const archetype of ['normal', 'obstruction']) {
    const c = buildCase({ v: 5, seed: 3, archetype, technique: 'good' }, ds);
    for (const t of c.dlcoTrace.tests) {
      const m = t.markers;
      assert.equal(t.version, 2); assert.equal('t30PctS' in m, false);
      // Solve F(x90)=.9 independently from the generator, using Newton steps.
      let x = .68;
      for (let i = 0; i < 12; i++) x -= (6*x*x-8*x**3+3*x**4-.9)/(12*x-24*x*x+12*x**3);
      const duration = (m.t90PctS - m.tInspStartS) / x;
      // Maximum derivative of this polynomial is at x=1/3; tangent intercept 5/48.
      const zero = m.tInspStartS + duration*5/48;
      const start = zero + .3*(m.t90PctS-zero);
      assert.ok(Math.abs(zero-m.tZeroS) < 1e-12);
      assert.ok(Math.abs((start-m.tInspStartS)/duration-.27677849155012116) < 1e-12);
      const end = (m.sample.startS + m.sample.endS)/2;
      assert.ok(Math.abs(m.tBhStartS-start) < 1e-12); assert.equal(m.tSampleMidS,end);
      assert.ok(Math.abs(t.quality.breathHoldS-(end-start)) < 1e-12);
      assert.ok(Math.abs(t.breathHold.seconds-(end-start)) < 1e-12);
      const rec = analyzeDlcoTrace(t);
      assert.equal(rec.breathHoldS, end-start);
      assert.ok(Math.abs(rec.dlco/t.caseValues.dlcoMlMinMmHg-1) < .01);
    }
  }
});

test('analyzer uses time midpoint even with asymmetric collection and ignores legacy volume-event marker', () => {
  const c = buildCase({ v: 5, seed: 3, archetype: 'normal', technique: 'good' }, ds);
  const t = structuredClone(c.dlcoTrace.tests[0]);
  t.markers.tZeroS=.2; t.markers.t90PctS=2.2;
  t.markers.sample.startS=10; t.markers.sample.endS=13;
  t.markers.tSampleMidS=10.1; t.markers.t30PctS=1.7;
  const baseline=analyzeDlcoTrace(c.dlcoTrace.tests[0]);
  const r=analyzeDlcoTrace(t);
  assert.equal(r.faTracer,baseline.faTracer); assert.equal(r.faCo,baseline.faCo); assert.equal(r.vaL,baseline.vaL);
  assert.ok(Math.abs(r.breathHoldS-10.7) < 1e-12);
  const expected = (r.vaL*1000*(t.barometricMmHg-47)/760*273/310)/(10.7/60*(t.barometricMmHg-47))*Math.log(r.fCo0/r.faCo);
  assert.ok(Math.abs(r.dlco-expected) < 1e-12);
});

test('explicit v2–v4 acquisitions retain pre-correction numeric fixtures from 8507c25', () => {
  const expected={2:'e77404938462872132c851bc1f0a69d2c14211edc7157a25cd0b6e340cd11645',3:'8de0fa06c62229943761f358b720414075e880bca57fbd7a844a901280f4bffa',4:'620ccd83d3ee0be5f452a0d8749993c9996780fccce69d521fd2e1b6830e7602'};
  for (const v of [2,3,4]) {
    const c=buildCase({v,seed:3,archetype:'normal',technique:'good'},ds);
    const numeric=(c.dlcoTrace.tests??[c.dlcoTrace]).map(t=>({time:t.time,byVolume:t.byVolume,values:t.values,quality:t.quality}));
    assert.equal(createHash('sha256').update(JSON.stringify(numeric)).digest('hex'),expected[v]);
  }
});

test('inclusive legacy BDR convention handles binary 200mL and 12% boundaries without clinical rounding', () => {
  const report={patient:{age:40,sex:'M',heightCm:175,group:'White'},spirometry:{fev1:1,fvc:3,post:{fev1:1.2,fvc:3}},grades:{fev1:'A',fvc:'A'}};
  const resolve=()=>({available:true,z:0,predicted:4,matched:true});
  const a=interpret(report,resolve);
  assert.equal(a.bd.rule2005.significant,true); assert.deepEqual(a.bd.rule2005.which,['FEV1']);
  assert.match(a.bd.rule2005.verification,/Table 9.*prose differs/);
  report.spirometry.post.fev1=1.199999999;
  assert.equal(interpret(report,resolve).bd.rule2005.significant,false);
  report.spirometry.fev1=2; report.spirometry.post.fev1=2.24;
  assert.equal(interpret(report,resolve).bd.rule2005.significant,true);
  report.spirometry.post.fev1=2.239999999;
  assert.equal(interpret(report,resolve).bd.rule2005.significant,false);
});

test('explicit zero-flow assessment rejects both values, including otherwise acceptable plateau and repeated sets', () => {
  const base={fev1:3,fvc:4,bev:.03,plateau:.01,fet:8,coughFirstSecond:false,glottisClosedAt:null};
  assert.equal(evaluateManeuver(base).fev1.acceptable,true);
  for(const extra of [{zeroFlowError:true},{faults:['zero-flow-error']}]) {
    const a=evaluateManeuver({...base,...extra},4);
    for(const k of ['fev1','fvc']) {assert.equal(a[k].usable,false);assert.equal(a[k].acceptable,false);assert.match(a[k].reasons.join(' '),/zero-flow/);}
    const s=summarizeSession([1,2,3].map(()=>({...base,...extra})));
    assert.equal(s.fev1,null);assert.equal(s.fvc,null); assert.equal(s.grades.fev1,'F');
  }
  assert.match(faultWording('zero-flow-error'),/zero-flow/);
});

test('older patients preserve measured volumes but receive no invented reference z-scores or diffusion labels', () => {
  const {c,interp,model}=makeModel({v:5,seed:3,archetype:'normal',technique:'good',age:95});
  assert.ok(Number.isFinite(c.volumes.tlc));assert.ok(Number.isFinite(c.dlco.raw));
  for(const k of ['tlc','dlco']) {assert.equal(interp.measures[k].available,false);assert.equal(interp.measures[k].value>0,true);assert.equal(interp.measures[k].z,undefined);}
  assert.equal(interp.dlco,null);
  assert.match(conciseText(conciseSummary({caseData:c,interp})),/outside the supported reference range/);
  const cmp={labelChanges:[],patternChanged:false};
  const fallback=renderClaims(claimsFrom({a:interp,cmp,caseData:c}));
  assert.match(fallback,/outside their reference range/); assert.doesNotMatch(fallback,/DLCO.*within.*reference|reported TLC is not below/);
  assert.match(JSON.stringify(model),/age-outside-range/);
});

test('incomplete sampled expiration remains an attempted trace with no gas result and finite SVG', () => {
  const c=buildCase({v:5,seed:15949,archetype:'restriction-extraparenchymal',technique:'poor',severity:3},ds);
  const failed=c.dlcoTrace.tests.filter(t=>t.quality.sampleCollectionComplete===false);
  assert.ok(failed.length>0);
  for(const t of failed) {
    for(const k of ['vaL','dlcoMlMinMmHg','kco']) assert.equal(t.values[k],null);
    assert.equal(analyzeDlcoTrace(t).reason,'incomplete-sample'); assert.equal(t.selected,false);
    const svg=FIGURES['dlco-trace'].render(t,{palette:PALETTES.white});
    assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  }
  const data=FIGURES['panel-dlco'].dataFor(c);
  const svg=FIGURES['panel-dlco'].render(data,{palette:PALETTES.white});
  assert.match(svg,/0.3 inspiratory time/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
});
