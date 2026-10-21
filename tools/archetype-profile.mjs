#!/usr/bin/env node
/**
 * Profile of the generator's true physiology by archetype and severity: mean and SD of each quantity as percent of the
 * GLI anchor prediction (spirometry: GLI Global; volumes: GLI-2021; TLCO: GLI-2017), and as GLI z-score, for White patients,
 * before measurement variability and technique faults. Used to compare the generator with the cohort values collected in
 * docs/research/archetype-literature.md and to record the numerical check of an archetype change in SPEC.md.
 * Usage: node tools/archetype-profile.mjs [seedsPerCell=300] [archetype ...]
 */
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { resolveDescriptor, ARCHETYPES } from '../src/core/descriptor.js';
import { generatePhysiology } from '../src/core/physiology.js';

const n = Number(process.argv[2] ?? 300);
const only = process.argv.slice(3);
const ds = await loadDatasets();
const { resolveReference } = createReference(ds);

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const fmt = (a, dp = 0) => `${mean(a).toFixed(dp)}±${sd(a).toFixed(dp)}`;
const pct = (a, f) => (100 * a.filter(f).length) / a.length;

const rows = [];
for (const archetype of only.length ? only : ARCHETYPES) {
  for (const severity of [1, 2, 3]) {
    const acc = { fev1: [], fvc: [], ratio: [], tlc: [], rv: [], erv: [], frc: [], dlco: [], kco: [], va: [], zfvc: [], zdlco: [], zkco: [], dFev1: [], dFvc: [], pos: [] };
    for (let i = 0; i < n; i++) {
      const d = resolveDescriptor({ seed: 100000 + i * 7919 + severity, archetype, severity, group: 'White' });
      const t = generatePhysiology(d.seed, d, ds);
      const pat = { age: d.age, sex: d.sex, heightCm: d.heightCm, group: 'White' };
      const r = (m, v) => resolveReference(m, { ...pat, measured: v }, 'GLIglobal');
      const p = { fev1: r('fev1', t.fev1), fvc: r('fvc', t.fvc), tlc: r('tlc', t.tlc), rv: r('rv', t.rv), erv: r('erv', t.erv), frc: r('frc', t.frc), dlco: r('dlco', t.dlcoCorrected), kco: r('kco', t.kco), va: r('va', t.va) };
      acc.fev1.push(p.fev1.percentPredicted); acc.fvc.push(p.fvc.percentPredicted);
      acc.ratio.push(t.ratio); acc.tlc.push(p.tlc.percentPredicted); acc.rv.push(p.rv.percentPredicted); acc.erv.push(p.erv.percentPredicted);
      acc.frc.push(p.frc.percentPredicted); acc.dlco.push(p.dlco.percentPredicted); acc.kco.push(p.kco.percentPredicted); acc.va.push(p.va.percentPredicted);
      acc.zfvc.push(p.fvc.z); acc.zdlco.push(p.dlco.z); acc.zkco.push(p.kco.z);
      if (t.post) {
        const fev1Pred = p.fev1.predicted, fvcPred = p.fvc.predicted;
        const dF = (100 * (t.post.fev1 - t.fev1)) / fev1Pred, dV = (100 * (t.post.fvc - t.fvc)) / fvcPred;
        acc.dFev1.push(dF); acc.dFvc.push(dV); acc.pos.push(dF > 10 || dV > 10 ? 1 : 0);
      }
    }
    rows.push({ archetype, severity, ...Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v])) });
  }
}
const header = 'archetype                      sev  FEV1%p    FVC%p    FEV1/FVC  TLC%p    RV%p     ERV%p    DLCO%p   zDLCO       KCO%p    VA%p     dFEV1%p   dFVC%p   BD>10%';
console.log(header);
for (const r of rows) {
  console.log([
    r.archetype.padEnd(30), String(r.severity).padEnd(4), fmt(r.fev1).padEnd(9), fmt(r.fvc).padEnd(8), fmt(r.ratio, 2).padEnd(9),
    fmt(r.tlc).padEnd(8), fmt(r.rv).padEnd(8), fmt(r.erv).padEnd(8), fmt(r.dlco).padEnd(8), fmt(r.zdlco, 1).padEnd(11), fmt(r.kco).padEnd(8), fmt(r.va).padEnd(8),
    r.dFev1.length ? fmt(r.dFev1, 1).padEnd(9) : '-'.padEnd(9), r.dFvc.length ? fmt(r.dFvc, 1).padEnd(8) : '-'.padEnd(8), r.pos.length ? pct(r.pos, (x) => x === 1).toFixed(0) + '%' : '-',
  ].join(' '));
}
