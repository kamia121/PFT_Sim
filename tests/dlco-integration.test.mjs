import test from 'node:test'; import assert from 'node:assert/strict';
import { ds,resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js'; import { buildDlcoReplicates } from '../src/core/dlco-replicates.js';
import { interpret,compareEquations } from '../src/interpret/interpret.js'; import { composeNarrative } from '../src/interpret/narrative.js';
import { buildReportModel,allTables } from '../src/report/model.js'; import { renderReportHtml,renderReportDocument } from '../src/report/html.js'; import {toCsv} from '../src/report/export.js';
import {conciseSummary} from '../src/report/concise.js'; import {buildChallenges,scoreChallenge} from '../src/challenges/index.js'; import {buildRtReport} from '../src/core/rt-report.js';
import {FIGURES} from '../src/ui/figures/index.js'; import {PALETTES} from '../src/ui/palettes.js'; import {scoreAll} from '../src/app/feedback.js';
const make=(technique='good',extra={})=>buildCase({v:4,seed:3,archetype:'normal',technique,...extra},ds);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} vs ${b}`);
test('v4 reported DLCO/VA use the same retained pool; v3 retains its single trace',()=>{
 const c=make(),s=c.dlcoTrace.session,kept=c.dlcoTrace.tests.filter(t=>t.selected),mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
 assert.equal(s.status,'repeatable');assert.equal(kept.length,2);close(c.dlco.raw,mean(kept.map(t=>t.values.dlcoMlMinMmHg)));close(c.dlco.va,mean(kept.map(t=>t.values.vaL)));close(c.dlco.adjusted,c.dlco.raw*c.dlco.hbFactor);close(c.dlco.kco*c.dlco.va,c.dlco.adjusted);
 assert.equal(make('good',{v:3}).dlcoTrace.session,undefined);
 const model=buildReportModel(c,interpret(c.report,resolveReference),{resolve:resolveReference});assert.ok(allTables(model).some(t=>t.id==='dlco-replicates'));
});
test('qualified single-A session stays separate from representative maneuver acceptability',()=>{
 const c=make('poor'),s=c.dlcoTrace.session;assert.equal(s.status,'qualified');assert.equal(s.selectedIds.length,1);
 const rt=buildRtReport(c);assert.equal(rt.truth.dlco.acceptable,false);assert.equal(c.dlcoTrace.tests.find(t=>t.selected).grade.acceptable,true);
 const item=buildChallenges(c,{rt}).find(i=>i.id==='dlcoAcceptable');assert.equal(item.key,'qualified');assert.equal(scoreChallenge(item,'qualified').status,'correct');
 const i=interpret(c.report,resolveReference);assert.match(conciseSummary({caseData:c,interp:i}).impression,/DLCO session qualified/);
});
test('failed session withholds classification, numbers, and grading rather than reporting a rejected trace',()=>{
 const c=make('good',{scenarioIds:['dlco-valsalva']});assert.equal(c.dlcoTrace.session.status,'unavailable');assert.equal(c.report.dlco,null);assert.equal(c.dlco.raw,null);assert.equal(c.dlco.va,null);
 const a=interpret(c.report,resolveReference),cmp=compareEquations(c.report,resolveReference);assert.equal(a.dlco,null);assert.equal(a.key.dlco,'unavailable');assert.equal(a.measures.dlco,undefined);
 const m=buildReportModel(c,a,{resolve:resolveReference,includeGrades:true});const rows=allTables(m).find(t=>t.id==='dlco').rows;assert.equal(rows.find(r=>r.id==='dlco').result,'not reportable');assert.equal(rows.find(r=>r.id==='kco').result,'not reportable');
 const html=renderReportHtml(m),doc=renderReportDocument(m,{css:''}),csv=toCsv(m);assert.doesNotMatch(html+doc+csv,/NaN|Infinity|undefined/);assert.match(csv,/not reportable/);assert.match(composeNarrative({caseData:c,interp:a,cmp}).finalStatement,/DLCO session unavailable/);
 const rt=buildRtReport(c),item=buildChallenges(c,{rt}).find(i=>i.id==='dlcoAcceptable');assert.equal(item.key,'unavailable');
 const score=scoreAll({caseData:c,interp:a,interpOther:cmp.b,equation:'GLIglobal',responses:{structured:{dlco:'unavailable'},challenges:{}},items:[]});assert.equal(score.rows.find(r=>r.id==='dlco').status,'correct');
 for(const [id,f] of Object.entries(FIGURES)){const d=f.dataFor(c,a);if(d)assert.doesNotMatch(f.render(d,{palette:PALETTES.white}),/NaN|Infinity|undefined/,id);}
});
test('missing same-session VC remains pending and never borrows true VC or VI',()=>{
 const c=make(),p=buildDlcoReplicates({seed:3,truth:c.truth,dlco:{raw:20,va:5},vcL:null,patient:{},technique:'good'});
 assert.equal(p.session.status,'pending');assert.equal(p.session.values.dlco,null);assert.equal(p.tests.length,0);assert.equal(p.session.vcL,null);
 c.dlcoTrace=p; c.dlco={...c.dlco,raw:null,adjusted:null,va:null,kco:null}; c.report.dlco=null;
 c.report.dlcoQuality={status:'pending',warnings:p.session.warnings,selectedIds:[]};
 const a=interpret(c.report,resolveReference),m=buildReportModel(c,a,{resolve:resolveReference});
 assert.equal(a.key.dlco,'unavailable');assert.match(toCsv(m),/not reportable/);assert.doesNotMatch(renderReportHtml(m),/NaN|Infinity|undefined/);
});
