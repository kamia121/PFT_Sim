import { createHash } from 'node:crypto';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../../src/core/descriptor.js';

/** Descriptors for the numerical identity check: 220 seeds for each of the ten archetypes, plus forced scenario cases. */
export function identityDescriptors() {
  const out = [];
  for (let seed = 1; seed <= 220; seed++) {
    ARCHETYPES.forEach((archetype, ai) => {
      out.push({ seed, archetype, technique: TECHNIQUE_LEVELS[(seed + ai) % 3], severity: 1 + (seed % 3), panel: 'full' });
    });
  }
  for (let seed = 301; seed <= 330; seed++) {
    out.push({ seed, archetype: ARCHETYPES[seed % ARCHETYPES.length], technique: 'fair', severity: 2, panel: 'full', scenarioIds: ['pleth-thermal-drift', 'pleth-pant-fast'] });
  }
  return out;
}

/** Pleth fields that must stay bit-identical. Resistance fields (raw, timeline, the raw-loop flag) are excluded on purpose. */
export const PLETH_FROZEN = ['version', 'method', 'box', 'trials', 'replicateTable', 'trueFrcL', 'reportedFrcL', 'frcBasis', 'repeatability', 'grade', 'faults', 'suggestedVolumes', 'unverified'];

/** The case with every plethysmography field that does not depend on the resistance loop; flags without the sRaw flag. */
export function frozenView(c) {
  const pleth = c.pleth ? Object.fromEntries(PLETH_FROZEN.map((k) => [k, c.pleth[k]])) : null;
  if (pleth) pleth.flags = c.pleth.flags.filter((f) => f.code !== 'sraw-above-upper-limit');
  const { pleth: _drop, ...rest } = c;
  return { ...rest, pleth };
}

export const frozenHash = (c) => createHash('sha256').update(JSON.stringify(frozenView(c))).digest('hex');
