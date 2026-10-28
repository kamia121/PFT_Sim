import test from 'node:test';
import assert from 'node:assert/strict';
import { build, makeCtx } from './quiz-helpers.mjs';
import { feedbackHtml } from '../src/quiz/explain.js';
import { scoreItem } from '../src/quiz/scoring.js';
import { buildCase } from '../src/core/case.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { ds, resolveReference } from './report-helpers.mjs';
import { composeNarrative } from '../src/interpret/narrative.js';
import { conciseSummary, conciseText } from '../src/report/concise.js';
import { buildItems } from '../src/quiz/items.js';
import { claimsFrom, renderClaims } from '../src/quiz/fallbacks.js';
import { buildReportModel, allTables } from '../src/report/model.js';
import { toCsv } from '../src/report/export.js';

for (const v of [2,3,4,5]) test(`v${v}: measured DLCO outside its reference range is classifiable as unavailable, never not performed`,()=>{
 const {prep,items}=build({v,seed:3,archetype:'normal',technique:'good',age:95});
 assert.ok(Number.isFinite(prep.caseData.dlco.raw)); assert.ok(Number.isFinite(prep.caseData.report.dlco.dlcoAdjusted));
 assert.equal(prep.a.measures.dlco.available,false); assert.equal(prep.a.key.dlco,'unavailable');
 const item=items.find(i=>i.id==='dlco'); assert.ok(item);assert.equal(item.key.correct,'unavailable');
 assert.ok(item.options.some(o=>o.id===item.key.correct)); assert.ok(!item.options.some(o=>o.id==='not-done'));
 assert.match(item.stem,/reference is unavailable/);
 const html=feedbackHtml(item,prep,scoreItem(item,item.key.correct));
 assert.match(html,/measured DLCO is preserved/);assert.match(html,/Repeating an acceptable measurement does not resolve reference applicability/);
 assert.doesNotMatch(html,/DLCO is not reportable|Review the maneuver criteria and repeat testing/);
 const model=buildReportModel(prep.caseData,prep.a,{resolve:resolveReference});
 const row=allTables(model).find(t=>t.id==='dlco').rows.find(r=>r.id==='dlco');
 assert.equal(typeof row.result,'number');assert.equal(row.z,null);assert.equal(row.lln,null);
 assert.doesNotMatch(toCsv(model),/NaN|Infinity|undefined/);
});

test('absent acquisition and pending acquisition retain distinct DLCO feedback from unavailable references',()=>{
 const {prep,items}=build({v:5,seed:3,archetype:'normal',technique:'good',scenarioIds:['dlco-valsalva']});
 const item=items.find(i=>i.id==='dlco');
 assert.equal(prep.caseData.report.dlcoQuality.status,'unavailable');
 const html=feedbackHtml(item,prep,scoreItem(item,item.key.correct));
 assert.match(html,/unavailable acquisition session/);assert.doesNotMatch(html,/reference is unavailable for this patient/);
 const pending=structuredClone(prep);pending.caseData.report.dlcoQuality.status='pending';
 assert.match(feedbackHtml(item,pending,scoreItem(item,item.key.correct)),/pending or unavailable acquisition session/);
 const notDone=structuredClone(prep);notDone.caseData.report.dlco=null;delete notDone.caseData.report.dlcoQuality;
 assert.match(feedbackHtml(item,notDone,scoreItem(item,item.key.correct)),/DLCO was not performed/);
});

for(const v of [2,3,4,5]) test(`v${v}: unavailable ratio cannot establish normal or preserved-ratio spirometry; other components survive`,()=>{
 const c=buildCase({v,seed:3,archetype:'normal',technique:'good'},ds);
 for(const ratio of [{available:false,fallbackReason:'test-ratio-reference-missing'},{available:true,predicted:.8,z:null}]){
  const resolve=(measure,patient,eq)=>measure==='fev1_fvc'?{...ratio,equationId:'test-only'}:resolveReference(measure,patient,eq);
  const a=interpret(c.report,resolve),b=interpret(c.report,resolve,'GLI2012'),cmp=compareEquations(c.report,resolve);
  assert.equal(a.pattern,'indeterminate');assert.equal(a.patternReason,'reference-unavailable');
  assert.equal(a.measures.fev1_fvc.available,false);assert.equal(a.measures.fev1.value,c.report.spirometry.fev1);
  assert.ok(Number.isFinite(a.measures.fev1.z));assert.ok(Number.isFinite(a.measures.tlc.z));assert.ok(a.dlco);
  const prep={caseData:c,a,b,cmp,equation:'GLIglobal'},items=buildItems(prep,makeCtx({resolve}));
  const item=items.find(i=>i.id==='pattern');assert.ok(item.options.some(o=>o.id===item.key.correct));
  const html=feedbackHtml(item,prep,scoreItem(item,item.key.correct));assert.match(html,/required reference is unavailable/);assert.doesNotMatch(html,/No maneuver was usable/);
  const narrative=composeNarrative({caseData:c,interp:a,cmp}).finalStatement;
  assert.match(narrative,/required reference is unavailable/);assert.doesNotMatch(narrative,/no usable FEV1|no reportable FEV1/i);
  assert.match(conciseText(conciseSummary({caseData:c,interp:a})),/reference unavailable/);
  const fallback=renderClaims(claimsFrom(prep));assert.match(fallback,/required reference is unavailable/);assert.doesNotMatch(fallback,/No usable maneuver was recorded/);
 }
});
