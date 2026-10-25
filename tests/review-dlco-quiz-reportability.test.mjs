import test from 'node:test'; import assert from 'node:assert/strict';
import { build, makeCtx, datasets, resolve } from './quiz-helpers.mjs';
import { NO_ADAPTERS } from '../src/quiz/adapters.js'; import { buildCase } from '../src/core/case.js';
import { interpret,compareEquations } from '../src/interpret/interpret.js'; import { buildItems } from '../src/quiz/items.js';
const ctx=makeCtx({adapters:NO_ADAPTERS});
const prepare=(c)=>({caseData:c,a:interpret(c.report,resolve,'GLIglobal'),b:interpret(c.report,resolve,'GLI2012'),cmp:compareEquations(c.report,resolve),equation:'GLIglobal'});
const text=(items)=>items.find(i=>i.id==='final').explain.options.find(o=>o.truth).text;
const make=(extra={})=>buildCase({v:4,seed:3,archetype:'normal',technique:'good',...extra},datasets);
const pending=()=>{const c=make();c.dlco={...c.dlco,raw:null,adjusted:null,va:null,kco:null};c.report.dlco=null;c.report.dlcoQuality={status:'pending',selectedIds:[],warnings:['Same-session VC comparator is unavailable.']};return c;};
for(const [name,fixture] of [['unavailable',()=>make({scenarioIds:['dlco-valsalva']})],['pending',pending]]){
 test(`categorical ${name} key is an offered reportability answer with adapters disabled`,()=>{
  const prep=prepare(fixture()),items=buildItems(prep,ctx),item=items.find(i=>i.id==='dlco');assert.equal(item.key.correct,'unavailable');assert.match(item.stem,/reported/);
  for(const i of items.filter(i=>!['limitations','final','sensitivity'].includes(i.id))) assert.ok(i.options.some(o=>o.id===i.key.correct),`${i.id}: key missing`);
  assert.ok(item.options.some(o=>o.id==='unavailable'));const final=items.find(i=>i.id==='final');assert.equal(final.explain.source,'fallback');assert.match(text(items),new RegExp(`not reportable from this ${name} session`));
  assert.doesNotMatch(text(items),/gas.transfer.*within.*reference|DLCO.*within.*reference|DLCO.*is reduced|DLCO.*above.*upper/);
 });
}
test('fallback preserves qualified diffusion and lung-volume reporting without conflating spirometry quality',()=>{
 const c=make({technique:'poor'}),items=buildItems(prepare(c),ctx),final=text(items);assert.equal(c.report.dlcoQuality.status,'qualified');assert.ok(['C','D','E','U'].includes(c.pleth.grade));
 assert.match(final,/diffusion values require qualification/);assert.match(final,/lung volumes require qualification/);assert.doesNotMatch(final,/gas.transfer fall within|gas.transfer measurements.*within/);
});
test('categorical answer keys remain available across source-backed normal and failed cases',()=>{
 for(const seed of [1,3,11,26])for(const technique of ['good','poor']){const {items}=build({v:4,seed,archetype:'normal',technique});for(const i of items.filter(i=>i.type==='single'&&!['final','sensitivity'].includes(i.id)))assert.ok(i.options.some(o=>o.id===i.key.correct),`${seed}/${technique}/${i.id}`);}
});
