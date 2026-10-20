/**
 * Assembles a complete simulated case from a descriptor: demographics, true physiology, the
 * recorded maneuver sets (before and, when done, after a bronchodilator), lung volumes, diffusing
 * capacity, and the report object the interpretation engine reads. A case is a pure function of
 * its descriptor and the GLI datasets.
 */
import { resolveDescriptor } from './descriptor.js';
import { generatePhysiology, hbFactor, ANCHOR } from './physiology.js';
import { generateManeuvers } from './maneuver.js';
import { createStream } from './prng.js';
import { createReference } from '../reference/gli.js';
import { interpret, LLN_Z } from '../interpret/interpret.js';

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
/** Loop shape from the true ratio: more scooped (smaller k) with more obstruction. */
const shapeFor = (ratio) => clamp(0.55 + 0.6 * ratio, 0.6, 1.05);
const durationFor = (ratio) => (ratio < 0.6 ? 15 : 12);

/**
 * @param {Partial<import('./descriptor.js').Descriptor> & { seed: number, archetype: string }} input
 * @param {Record<string, object>} datasets
 */
export function buildCase(input, datasets) {
  const d = resolveDescriptor(input);
  const { resolveReference } = createReference(datasets);
  const truth = generatePhysiology(d.seed, d, datasets);

  const pre = generateManeuvers(d.seed, { fvc: truth.fvc, fev1: truth.fev1, k: shapeFor(truth.ratio), T: durationFor(truth.ratio), technique: d.technique, prefix: 'maneuver' });

  // A bronchodilator study follows when the baseline is obstructive, in the bronchodilator archetype,
  // and occasionally otherwise, as in a laboratory that tests on clinical suspicion.
  let post = null;
  if (truth.post && d.panel === 'full') {
    const perform = createStream(d.seed, 'bd-decision').uniform();
    const patient = { age: d.age, sex: d.sex, heightCm: d.heightCm, group: d.group };
    const ratioZ = pre.summary.ratio ? resolveReference('fev1_fvc', { ...patient, measured: pre.summary.ratio }, 'GLIglobal').z : 0;
    if (['obstruction', 'mixed', 'bd-discordant'].includes(d.archetype) || ratioZ < LLN_Z || perform < 0.15) {
      const ratioPost = truth.post.fev1 / truth.post.fvc;
      post = generateManeuvers(d.seed, { fvc: truth.post.fvc, fev1: truth.post.fev1, k: shapeFor(ratioPost), T: durationFor(ratioPost), technique: d.technique, prefix: 'post', earlyStop: truth.post.earlyStop });
    }
  }

  // Lung volumes by plethysmography: FRC, ERV and IC are measured; TLC, RV and VC follow from them.
  let volumes = null;
  if (d.panel === 'full') {
    const rng = createStream(d.seed, 'volumes');
    const frc = truth.frc * Math.exp(0.03 * rng.normal());
    const erv = truth.erv * Math.exp(0.08 * rng.normal());
    const ic = truth.ic * Math.exp(0.04 * rng.normal());
    volumes = { method: 'plethysmography', frc, erv, ic, tlc: frc + ic, rv: Math.max(frc - erv, 0.2), vc: ic + erv };
  }

  // Single-breath diffusing capacity: measured DLCO is the hemoglobin-corrected truth uncorrected again.
  let dlco = null;
  if (d.panel === 'full') {
    const rng = createStream(d.seed, 'dlco');
    const corrected = truth.dlcoCorrected * Math.exp(0.04 * rng.normal());
    const va = Math.min(truth.va * Math.exp(0.03 * rng.normal()), 0.99 * volumes.tlc);
    const factor = hbFactor(d.hbGdl, d.sex, d.age);
    const raw = corrected / factor;
    dlco = { raw, hbGdl: d.hbGdl, hbFactor: factor, adjusted: corrected, va, kco: corrected / va };
  }

  const report = {
    patient: { age: d.age, sex: d.sex, heightCm: d.heightCm, group: d.group, weightKg: d.weightKg, hbGdl: d.hbGdl },
    spirometry: {
      fev1: pre.summary.fev1,
      fvc: pre.summary.fvc,
      post: post ? { fev1: post.summary.fev1, fvc: post.summary.fvc } : null,
    },
    volumes,
    dlco: dlco ? { dlcoAdjusted: dlco.adjusted, va: dlco.va } : null,
    grades: { fev1: pre.summary.grades.fev1, fvc: pre.summary.grades.fvc, postFev1: post?.summary.grades.fev1, postFvc: post?.summary.grades.fvc },
  };

  const anchorKey = interpret(report, resolveReference, ANCHOR.spirometry);
  return {
    descriptor: d,
    groundTruth: { archetype: d.archetype, phenotype: truth.phenotype, bdVariant: truth.bdVariant, note: truth.note, anchor: ANCHOR, severityTarget: d.severity },
    truth,
    spirometry: { pre, post },
    volumes,
    dlco,
    report,
    anchorKey,
  };
}

/** Expected anchor pattern for each archetype when technique is good. */
export const EXPECTED_PATTERN = {
  normal: ['normal'],
  obstruction: ['obstruction'],
  'restriction-parenchymal': ['restriction'],
  'restriction-extraparenchymal': ['restriction'],
  mixed: ['mixed'],
  nonspecific: ['nonspecific'],
  'low-dlco': ['normal'],
  anemia: ['normal'],
  'obesity-low-erv': ['normal', 'nonspecific'],
  'bd-discordant': ['obstruction'],
};
