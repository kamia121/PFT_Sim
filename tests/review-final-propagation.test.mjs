import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCase } from '../src/core/case.js';
import { ds, resolveReference } from './report-helpers.mjs';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { summarizeSession } from '../src/core/quality.js';
import { maneuverTrace } from '../src/ui/figures/traces.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { PALETTES } from '../src/ui/palettes.js';
import { buildReportModel, allTables } from '../src/report/model.js';
import { renderReportHtml } from '../src/report/html.js';
import { toCsv } from '../src/report/export.js';
import { bdMlText, bdPctBaseText } from '../src/interpret/precision.js';
import { atLeast } from '../src/core/comparison.js';
import { composeNarrative } from '../src/interpret/narrative.js';
import { feedbackHtml } from '../src/quiz/explain.js';

for(const recorded of [false,true,undefined]) test(`supplied scalar FIVC with recorded=${recorded} preserves expiration without inventing inspiration`,()=>{
 const c=buildCase({v:5,seed:3,archetype:'normal',technique:'good'},ds);
 c.spirometry.pre.maneuvers.forEach(m=>{m.inspiratory={fivc:8,recorded,maximal:true,afterEofe:true};});
 c.spirometry.pre.summary=summarizeSession(c.spirometry.pre.maneuvers);
 const a=interpret(c.report,resolveReference);
 for(const m of c.spirometry.pre.maneuvers){
  const t=maneuverTrace(m,{seed:c.descriptor.seed,index:m.index});
  assert.ok(t.exp.v.length>1);assert.deepEqual(t.insp.v,[]);assert.deepEqual(t.insp.f,[]);assert.deepEqual(t.insp.t,[]);
 }
 if(recorded!==true) assert.ok(c.spirometry.pre.summary.evaluations.every(e=>e.fivc.status==='not-assessed'));
 for(const id of ['flow-volume','panel-spirometry']) {
  const data=FIGURES[id].dataFor({...c,interp:a,equation:'GLIglobal',resolve:resolveReference});
  assert.doesNotMatch(FIGURES[id].render(data,{palette:PALETTES.white}),/NaN|Infinity|undefined/);
 }
 const model=buildReportModel(c,a,{resolve:resolveReference,includeGrades:true});
 assert.deepEqual(model.meta.figureErrors,[]);
 const outputs=renderReportHtml(model)+toCsv(model);assert.doesNotMatch(outputs,/NaN|Infinity|undefined/);
 if(recorded!==true) {
  assert.match(outputs,/FIVC check not assessed/);
  assert.ok(!allTables(model).find(t=>t.id==='spirometry').rows.some(r=>r.id==='fivc'));
 }
});

test('incomplete, mismatched and nonfinite supplied inspiratory arrays are omitted regardless of recorded status',()=>{
 const c=buildCase({seed:3,archetype:'normal',technique:'good'},ds),m=c.spirometry.pre.maneuvers[0];
 for(const arrays of [{t:[0],v:[4],f:[0]},{t:[0,1],v:[4,0,0],f:[0,-1]},{t:[0,1],v:[4,NaN],f:[0,-1]}]){
  const t=maneuverTrace({...m,inspiratory:{fivc:8,recorded:false,...arrays}},{seed:3,index:0});
  assert.deepEqual(t.insp.v,[]);assert.ok(t.exp.v.length>1);
 }
});

// Synthetic report fixtures exercise display propagation, not a new clinical/reference model.
for(const [name,pre,post,positive] of [
 ['200mL decimal equality',1,1.2,true],
 ['200mL within L-unit machine equality',1,1.2-1e-15,true],
 ['200mL below machine equality',1,1.2-1e-10,false],
 ['12 percent decimal equality',5/3,5/3+.2,true],
 ['12 percent from 2L',2,2.24,true],
 ['12 percent below machine equality',2,2.24-1e-9,false],
]) test(`${name}: engine, precision, HTML, CSV and feedback agree`,()=>{
 const c=buildCase({v:5,seed:3,archetype:'bd-discordant',technique:'good'},ds);
 c.report.spirometry={fev1:pre,fvc:3,post:{fev1:post,fvc:3}};
 const a=interpret(c.report,resolveReference),b=interpret(c.report,resolveReference,'GLI2012'),cmp=compareEquations(c.report,resolveReference);
 assert.equal(a.bd.rule2005.significant,positive);
 assert.equal(atLeast(a.bd.dFev1,.2)&&atLeast(a.bd.pctBase.fev1,12),positive);
 const model=buildReportModel(c,a,{resolve:resolveReference});
 const row=allTables(model).find(t=>t.id==='spirometry').rows.find(r=>r.id==='fev1');
 const html=renderReportHtml(model),csv=toCsv(model);
 const item={id:'bronchodilator',options:[{id:'significant',label:'Significant'},{id:'not-significant',label:'Not significant'}],key:{correct:a.key.bronchodilator}};
 const feedback=feedbackHtml(item,{caseData:c,a,b,cmp,equation:'GLIglobal'},{status:'correct',response:a.key.bronchodilator});
 assert.match(feedback,new RegExp(`Earlier rule:[\\s\\S]*?</th><td class="l">${positive?'significant':'not significant'}</td>`));
 if(positive){
  for(const text of [html,csv,bdMlText(a.bd.dFev1),bdPctBaseText(a.bd.pctBase.fev1)])assert.doesNotMatch(text,/below (?:0\.200 L|200|12)/);
  assert.equal(typeof row.change,'number');assert.equal(typeof row.changePct,'number');
 } else if(a.bd.dFev1<.2-1e-14){
  assert.match(html,/below 0\.200 L/);assert.match(csv,/below 0\.200 L/);
 } else {
  assert.match(html,/below 12/);assert.match(csv,/below 12/);
 }
});

test('liter-to-milliliter formatting preserves the engine equality allowance before unit conversion',()=>{
 assert.equal(bdMlText(.2-1e-15),'200');
 assert.equal(bdPctBaseText(12-1e-14),'12.0');
 assert.match(bdMlText(.2-1e-10),/below 200/);
 assert.match(bdPctBaseText(12-1e-10),/below 12/);
});

test('discordant-rule narrative chooses the actual failed legacy criterion using shared equality',()=>{
 const c=buildCase({v:5,seed:3,archetype:'bd-discordant',technique:'good'},ds);
 const pre=.1999/.12;
 c.report.spirometry={fev1:pre,fvc:3,post:{fev1:pre+.1999,fvc:3}};
 const resolve=(measure)=>({available:true,predicted:1,lln:.7,uln:1.3,z:0,matched:true,equationId:'synthetic-boundary-fixture'});
 const a=interpret(c.report,resolve),cmp=compareEquations(c.report,resolve);
 assert.equal(a.bd.rule2022.significant,true);assert.equal(a.bd.rule2005.significant,false);
 assert.equal(atLeast(a.bd.pctBase.fev1,12),true);
 const text=JSON.stringify(composeNarrative({caseData:c,interp:a,cmp}));
 assert.match(text,/under the 200 mL/);assert.doesNotMatch(text,/under the 12%/);
});
