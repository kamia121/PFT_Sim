import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDlcoManeuver, summarizeDlcoSession } from '../src/core/dlco-session.js';
const t = (id, dlco = 20, extra = {}) => ({ id, dlco, vaL: 5, viL: 3.8, quality: { t85S: 2, breathHoldS: 10, sampleEndS: 3, leak: false, valsalva: false, mueller: false, stableBreathHold: true, visualQualityConfirmed: true, samplingMethod: 'classical', washoutL: .8, sampleL: .6, deadSpaceClearanceConfirmed: true }, ...extra });
const q = (id, dlco, quality = {}, extra = {}) => { const x = t(id, dlco, extra); return { ...x, quality: { ...x.quality, ...quality } }; };
const s = (maneuvers, more = {}) => summarizeDlcoSession({ maneuvers, vcL: 4, ...more });
const grade = (x, more = {}) => assessDlcoManeuver(x, { vcL: 4, ...more });
test('repeatable A subset excludes A outliers and all inferior results', () => {
  const rows = [t(1,20), t(2,22), t(3,35), q(4,5,{sampleEndS:4.5},{viL:3.3})], before = structuredClone(rows);
  const r=s(rows); assert.equal(r.status,'repeatable'); assert.deepEqual(r.selectedIds,[1,2]); assert.equal(r.values.dlco,21); assert.equal(r.repeatability.spread,2); assert.deepEqual(rows,before);
  assert.equal(s([t(1,20),t(2,22.000001)]).status,'qualified');
  assert.equal(s([t(1,2),t(2,2.67)],{units:'si'}).status,'repeatable');
  assert.equal(s([t(1,2),t(2,2.670001)],{units:'si'}).status,'qualified');
});
test('other acceptable VA comparator uses largest other value and never self comparison', () => {
  const low = t(2,21,{viL:3.4,vaL:5.25});
  const r=s([t(1),low]); assert.equal(r.assessments[1].grade,'A'); assert.equal(r.assessments[1].largestOtherAcceptableVaL,5);
  const alone=s([low]); assert.equal(alone.assessments[0].alternative,'unconfirmed'); assert.notEqual(alone.assessments[0].grade,'A'); assert.equal(alone.status,'qualified');
  const pair=s([low,t(3,21,{viL:3.5,vaL:5.25})]); assert.ok(pair.assessments.every((r)=>r.grade!=='A'));
  assert.equal(s([low],{completed:false}).status,'pending');
  const unrelated=s([t(1,20,{vaL:4}),t(2,20,{viL:3.5,vaL:5.2}),t(3,20,{viL:3.5,vaL:5.25})]);
  assert.deepEqual(unrelated.assessments.map(a=>a.grade),['A','B','B'],'an unrelated independent A cannot legitimize a circular low-VI pair');
  const largest=s([t(1),t(3,20,{vaL:6}),low]); assert.equal(largest.assessments[2].grade,'B'); assert.equal(largest.assessments[2].largestOtherAcceptableVaL,6);
});
test('qualified fallback uses A alone before any B–D; F-only has no output', () => {
  const b=t(2,10,{viL:3.5,vaL:4}), c=q(3,12,{sampleEndS:4.5},{viL:3.3}), d=q(4,14,{breathHoldS:7},{viL:3}), f=q(5,99,{breathHoldS:7,sampleEndS:6},{viL:3});
  const r=s([b,c,d,f]); assert.equal(r.status,'qualified'); assert.deepEqual(r.selectedIds,[2,3,4]); assert.equal(r.values.dlco,12);
  assert.deepEqual(s([t(1),b,c,d,f]).selectedIds,[1]);
  assert.deepEqual(s([t(1,20),t(2,30),c]).selectedIds,[1,2]);
  const none=s([f]); assert.equal(none.status,'unavailable'); assert.equal(none.values.dlco,null); assert.equal(none.values.vaL,null);
});
test('interim overlapping rows retain matches; unsupported mixed failures have no invented letter', () => {
  assert.deepEqual(grade(t(1)).matchingRows,['A','B','C']);
  assert.equal(grade(q(1,20,{breathHoldS:7})).grade,null);
  assert.equal(grade(q(1,20,{leak:true})).grade,null);
  const missing=t(1); delete missing.quality.stableBreathHold;
  assert.equal(s([missing]).status,'pending');
  assert.equal(s([t(1)],{vcL:null}).status,'pending');
});
test('exact timing, VI, sampling and clearance boundaries are source criteria', () => {
  assert.equal(grade(q(1,20,{t85S:4})).acceptable,false);
  assert.equal(grade(q(1,20,{t85S:3.999999})).acceptable,true);
  for (const breathHoldS of [8,12]) assert.equal(grade(q(1,20,{breathHoldS,sampleEndS:4})).acceptable,true);
  assert.equal(grade(t(1,20,{viL:3.6})).grade,'A');
  assert.equal(grade(t(1,20,{viL:3.4}),{largestOtherAcceptableVaL:5}).grade,'A');
  const small=q(1,20,{washoutL:.5,sampleL:.3},{viL:.9,vaL:1});
  assert.equal(grade(small,{vcL:.999}).acceptable,true); assert.equal(grade(small,{vcL:1}).acceptable,false);
  assert.equal(grade(q(1,20,{washoutL:.5},{viL:1.9}),{vcL:2}).acceptable,false);
  assert.equal(grade(q(1,20,{samplingMethod:'rga',sampleL:.085})).acceptable,true);
  assert.equal(grade(q(1,20,{samplingMethod:'rga',sampleL:.5})).acceptable,true);
  assert.equal(grade(q(1,20,{samplingMethod:'rga',sampleL:.50001})).acceptable,false);
});
