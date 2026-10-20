#!/usr/bin/env node
/**
 * Sweeps seeds across every archetype and technique level and checks the exact constraints on the
 * reported values. Usage: node tools/constraint-sweep.mjs [seedsPerArchetype=2000] [scenarioLevel=none|light|moderate|heavy]
 */
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';

const N = Number(process.argv[2] ?? 2000);
const LEVEL = process.argv[3] ?? 'none';
const ds = await loadDatasets();
let cases = 0, violations = 0;
const fail = (msg, a, seed) => { violations++; if (violations <= 10) console.error('VIOLATION', msg, a, seed); };
const t0 = Date.now();
for (const a of ARCHETYPES) {
  for (let seed = 1; seed <= N; seed++) {
    const technique = TECHNIQUE_LEVELS[seed % 3];
    const c = buildCase({ seed, archetype: a, technique, severity: 1 + (seed % 3), ...(LEVEL === 'none' ? {} : { scenarioLevel: LEVEL, panel: seed % 11 === 0 ? 'spirometry' : 'full' }) }, ds);
    cases++;
    const s = c.report.spirometry;
    if (s.fev1 !== null && s.fvc !== null && s.fev1 > s.fvc + 1e-9) fail('FEV1 > FVC', a, seed);
    if (s.post?.fev1 && s.post?.fvc && s.post.fev1 > s.post.fvc + 1e-9) fail('post FEV1 > FVC', a, seed);
    for (const m of [...c.spirometry.pre.maneuvers, ...(c.spirometry.post?.maneuvers ?? [])]) if (m.fev1 > m.fvc + 1e-9) fail('maneuver FEV1 > FVC', a, seed);
    const v = c.volumes, d = c.dlco;
    if (!v) continue;
    if (Math.abs(v.tlc - v.rv - v.vc) > 1e-9) fail('TLC != RV + VC', a, seed);
    if (Math.abs(v.ic - (v.tlc - v.frc)) > 1e-9) fail('IC != TLC - FRC', a, seed);
    if (!(v.rv > 0 && v.erv > 0 && v.ic > 0 && v.vc > 0)) fail('non-positive volume', a, seed);
    if (Math.abs(v.frc - v.rv - v.erv) > 1e-9) fail('FRC != RV + ERV', a, seed);
    if (d.va > v.tlc + 1e-9) fail('VA > TLC', a, seed);
    if (Math.abs(d.adjusted - d.kco * d.va) > 1e-9) fail('DLCO != KCO x VA', a, seed);
  }
}
console.log(`level ${LEVEL}: ${cases} cases, ${violations} violations, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(violations ? 1 : 0);
