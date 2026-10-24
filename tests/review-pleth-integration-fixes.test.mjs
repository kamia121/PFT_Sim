import test from 'node:test'; import assert from 'node:assert/strict';
import { ds,resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js'; import { assessPlethPantFrequency } from '../src/core/pleth.js';
import { interpret } from '../src/interpret/interpret.js'; import { conciseSummary } from '../src/report/concise.js';
import {buildReportModel} from '../src/report/model.js'; import {renderReportDocument} from '../src/report/html.js'; import {toCsv} from '../src/report/export.js';
const make=(seed,technique,version=3)=>buildCase({v:version,seed,technique,archetype:'normal'},ds);
test('2023 frequency boundary bands and actual normal trial above 1.5 Hz are usable',()=>{
  for(const f of [.5,1,1.5]) assert.equal(assessPlethPantFrequency(f,true),'acceptable');
  for(const f of [1.500001,2]) assert.equal(assessPlethPantFrequency(f,true),'usable');
  for(const f of [.499999,2.000001]) assert.equal(assessPlethPantFrequency(f,true),'rejected');
  assert.equal(assessPlethPantFrequency(1.500001,false),'rejected');
  const trial=make(10,'poor').pleth.trials[3];assert.equal(trial.panFreqHz,1.681);assert.equal(trial.status,'usable');
});
test('reportable qualified volume results carry a domain-specific concise caution',()=>{
  const c=make(11,'fair'),i=interpret(c.report,resolveReference),summary=conciseSummary({caseData:c,interp:i});
  assert.equal(c.pleth.grade,'D');assert.equal(c.report.grades.fev1,'A');assert.equal(c.report.grades.fvc,'A');
  assert.match(summary.impression,/Lung volumes.*grade D/);assert.ok(summary.lines.some(l=>l.label==='Lung-volume quality'));
});
test('v3 linked IC precedes expiratory SVC with measured pair amplitudes; legacy is unchanged',()=>{
  for(const t of make(3,'fair').pleth.timeline.trials){const a=t.segments.find(s=>s.id==='inspiration'),b=t.segments.find(s=>s.id==='expiration');assert.ok(a.t0<b.t0);assert.ok(Math.abs(t.v[a.i1]-t.v[a.i0]-t.levels.icL)<.0002);assert.ok(Math.abs(t.v[b.i0]-t.v[b.i1]-(t.levels.tlcL-t.levels.rvL))<.0002);}
  const t=make(3,'fair',2).pleth.timeline.trials[0];assert.ok(t.segments.find(s=>s.id==='expiration').t0<t.segments.find(s=>s.id==='inspiration').t0);
});
test('HTML, print rules and CSV describe the actual case generator version',()=>{
 for(const version of [2,3,4]){const c=make(3,'fair',version),m=buildReportModel(c,interpret(c.report,resolveReference));assert.equal(m.meta.generatorVersion,version);assert.match(renderReportDocument(m,{css:''}),new RegExp(`generator version ${version}`));assert.match(toCsv(m),new RegExp(`generator version,value,${version}`));}
});
