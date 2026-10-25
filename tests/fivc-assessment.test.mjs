import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPostExpirationFivc, evaluateManeuver, summarizeSession } from '../src/core/quality.js';
import { buildInspiratory } from '../src/core/inspiratory.js';
import { maneuverTrace } from '../src/ui/figures/traces.js';
import { buildCase } from '../src/core/case.js';
import { ds, resolveReference } from './report-helpers.mjs';
import { interpret } from '../src/interpret/interpret.js';
import { buildReportModel, allTables } from '../src/report/model.js';
import { renderReportHtml } from '../src/report/html.js';
import { toCsv } from '../src/report/export.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { PALETTES } from '../src/ui/palettes.js';
const m=(fvc=4, extra={})=>({fvc,fev1:.8*fvc,pef:7,fef2575:3,bev:.03,plateau:.01,fet:8,coughFirstSecond:false,glottisClosedAt:null,faults:[],...extra});
const recorded=(fivc, extra={})=>({fivc,recorded:true,maximal:true,afterEofe:true,...extra});

test('2019 FIVC is a one-sided inclusive difference, not symmetric loop closure',()=>{
 for(const [fvc,fivc,status] of [[1,1.1,'pass'],[1,1.100000001,'fail'],[4,4.2,'pass'],[4,4.200000001,'fail'],[4,3,'pass'],[4,4,'pass']]){
  const a=evaluateManeuver(m(fvc,{inspiratory:recorded(fivc)}));
  assert.equal(a.fivc.status,status,`${fvc}/${fivc}`);
  for(const k of ['fev1','fvc']) {assert.equal(a[k].acceptable,status==='pass');assert.equal(a[k].usable,true);}
 }
});

test('missing, display-only, nonmaximal, wrong timing and invalid FIVC are explicitly not assessed, never failed',()=>{
 const display=buildInspiratory(m(),{seed:3,index:0});
 assert.equal(display.recorded,false);assert.equal(display.role,'display-only');
 for(const observation of [undefined,display,{fivc:8},recorded(8,{maximal:false}),recorded(8,{afterEofe:false}),recorded(null),recorded(NaN),recorded(0)]){
  const a=evaluateManeuver(m(4,{inspiratory:observation}));
  assert.equal(a.fivc.status,'not-assessed'); assert.equal(a.fivc.fivcL,null);
  assert.equal(a.fev1.acceptable,true);assert.equal(a.fvc.acceptable,true);
 }
});

test('FIVC pass/absence never rescues independent faults and FIVC failure preserves potential usability',()=>{
 const bad=evaluateManeuver(m(4,{inspiratory:recorded(5),coughFirstSecond:true}));
 assert.equal(bad.fivc.status,'fail');assert.equal(bad.fev1.usable,false);assert.equal(bad.fvc.usable,true);
 const pass=evaluateManeuver(m(4,{inspiratory:recorded(4),plateau:.2,fet:6}));
 assert.equal(pass.fivc.status,'pass');assert.equal(pass.fvc.acceptable,false);
 const absent=evaluateManeuver(m(4,{zeroFlowError:true}));assert.equal(absent.fivc.status,'not-assessed');assert.equal(absent.fev1.usable,false);
});

test('reported FIVC uses all confirmed observations while expiratory selection obeys acceptability/usability',()=>{
 const rows=[m(4,{inspiratory:recorded(4.1)}),m(4.2,{inspiratory:recorded(4.7)}),m(3.95)];
 const a=summarizeSession(rows);
 assert.equal(a.fivc,4.7);assert.equal(a.fvc,4);assert.equal(a.fev1,3.2);
 assert.deepEqual(a.fivcAssessment,{pass:1,fail:1,notAssessed:1});
 const onlyFail=summarizeSession(rows.slice(0,2).map(r=>({...r,inspiratory:recorded(5)})));
 assert.equal(onlyFail.grades.fev1,'U');assert.equal(onlyFail.grades.fvc,'U');assert.equal(onlyFail.fvc,4.2);
 const none=summarizeSession([m(),m()]);assert.equal(none.fivc,null);assert.equal(none.fivcAssessment.notAssessed,2);
});

test('default acquired records stay unassessed despite rendered display limbs, with no invented report FIVC',()=>{
 const c=buildCase({seed:3,archetype:'normal',technique:'good'},ds);
 for(const set of [c.spirometry.pre,c.spirometry.post].filter(Boolean)){
  assert.equal(set.summary.fivc,null);assert.equal(set.summary.fivcAssessment.notAssessed,set.maneuvers.length);
  assert.ok(set.summary.evaluations.every(e=>e.fivc.status==='not-assessed'));
 }
 const a=interpret(c.report,resolveReference),model=buildReportModel(c,a,{resolve:resolveReference,includeGrades:true});
 const tables=allTables(model);assert.ok(!tables.find(t=>t.id==='spirometry').rows.some(r=>r.id==='fivc'));
 assert.match(tables.find(t=>t.id==='maneuvers-pre').footnote,/FIVC check not assessed/);
 assert.match(renderReportHtml(model),/Synthetic display limbs are not measurements/);
 assert.match(toCsv(model),/FIVC check not assessed/);
});

test('recorded FIVC is reported with its check; scalar-only observations never fabricate an inspiratory waveform',()=>{
 const c=buildCase({seed:3,archetype:'normal',technique:'good'},ds);
 const set=c.spirometry.pre;
 set.maneuvers.forEach((r,i)=>{r.inspiratory=recorded(r.fvc+(i===0?.7:0));});
 set.summary=summarizeSession(set.maneuvers);
 c.report.spirometry.fvc=set.summary.fvc;c.report.spirometry.fev1=set.summary.fev1;c.report.grades=set.summary.grades;
 const a=interpret(c.report,resolveReference),model=buildReportModel(c,a,{resolve:resolveReference,includeGrades:true});
 const row=allTables(model).find(t=>t.id==='spirometry').rows.find(r=>r.id==='fivc');
 assert.equal(row.pre,Math.round(set.summary.fivc*100)/100);
 assert.match(allTables(model).find(t=>t.id==='maneuvers-pre').rows[0].comment,/FIVC check fail/);
 const trace=maneuverTrace(set.maneuvers[0],{seed:c.descriptor.seed,index:0});assert.deepEqual(trace.insp.v,[]);
 assert.equal(trace.insp.flags[0],'inspiratory-trace-not-recorded');
 for(const id of ['flow-volume','panel-spirometry']){
  const data=FIGURES[id].dataFor({...c,interp:a,equation:'GLIglobal',resolve:resolveReference});
  const svg=FIGURES[id].render(data,{palette:PALETTES.white});assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
 }
 assert.equal(model.meta.figureErrors.length,0);
 assert.match(toCsv(model),/FIVC check fail/);
});
