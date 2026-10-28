#!/usr/bin/env node
/**
 * Writes tests/fixtures/trace-rendering-hashes.json: the SHA-256 of the plotted spirometry traces (expiration with its fault
 * artifacts and the inspiratory limb, as maneuverTrace returns them, numbers rounded to 1e-9) for every maneuver of a fixed set of
 * cases, with the trace-rendering identifier and the generator version. The generator version reproduces the case and every
 * tabulated value; the trace-rendering identifier names the drawing. A change of any plotted trace fails
 * tests/trace-texture.test.mjs until TRACE_TEXTURE_MODEL.version is raised and this fixture is written again.
 * Usage: node tools/trace-rendering-hashes.mjs [--write]
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { loadDatasets } from '../src/reference/load.js';
import { buildCase } from '../src/core/case.js';
import { GENERATOR_VERSION } from '../src/core/standards.js';
import { TRACE_RENDERING_ID } from '../src/core/trace-texture.js';
import { maneuverTrace } from '../src/ui/figures/traces.js';

export const TRACE_DESCRIPTORS = [
  { seed: 11, archetype: 'normal' },
  { seed: 11, archetype: 'obstruction' },
  { seed: 11, archetype: 'restriction-parenchymal' },
  { seed: 11, archetype: 'mixed' },
  { seed: 5, archetype: 'normal', technique: 'poor' },
  { seed: 8, archetype: 'bd-discordant', technique: 'fair', severity: 3 },
  { seed: 3, archetype: 'obstruction', technique: 'poor', scenarioIds: ['qs-cough-first-second', 'qs-leak'] },
  // The inspiratory cap binds on maneuver 2 of this case (added with spirometry-texture-v2, which enforces the cap after the correction).
  { seed: 18, archetype: 'normal', technique: 'good' },
];

const r9 = (a) => a.map((x) => Math.round(x * 1e9) / 1e9);

/** Hash of the plotted traces of every maneuver of a case, keyed set:index. */
export function traceHashes(c) {
  const out = {};
  const seed = c.descriptor.seed;
  for (const [set, ms] of [['pre', c.spirometry.pre], ['post', c.spirometry.post]]) {
    if (!ms) continue;
    ms.maneuvers.forEach((m, i) => {
      const { exp, insp } = maneuverTrace(m, { seed, index: i, set, scenario: c.scenario ?? null });
      const body = JSON.stringify([r9(exp.t), r9(exp.v), r9(exp.f), r9(insp.t), r9(insp.v), r9(insp.f)]);
      out[`${set}:${i}`] = createHash('sha256').update(body).digest('hex');
    });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ds = await loadDatasets();
  const cases = TRACE_DESCRIPTORS.map((d) => ({ descriptor: d, traces: traceHashes(buildCase(d, ds)) }));
  const text = JSON.stringify({ traceRendering: TRACE_RENDERING_ID, generatorVersion: GENERATOR_VERSION, note: 'sha256 of the plotted traces (maneuverTrace, rounded to 1e-9); see tools/trace-rendering-hashes.mjs', cases }, null, 1) + '\n';
  if (process.argv.includes('--write')) await fs.writeFile(new URL('../tests/fixtures/trace-rendering-hashes.json', import.meta.url), text);
  else process.stdout.write(text);
}
