/**
 * Assembles a complete simulated case from a descriptor: demographics, true physiology, the
 * recorded maneuver sets (before and, when done, after a bronchodilator), lung volumes, diffusing
 * capacity, and the report object the interpretation engine reads. A case is a pure function of
 * its descriptor and the GLI datasets.
 */
import { resolveDescriptor } from './descriptor.js';
import { generatePhysiology, hbFactor, ANCHOR } from './physiology.js';
import { selectScenarios, applyScenarios, emptyScenario } from '../scenarios/apply.js';
import { generateManeuvers } from './maneuver.js';
import { createStream } from './prng.js';
import { createReference } from '../reference/gli.js';
import { buildPleth, buildMeasuredPleth } from './pleth.js';
import { buildDlcoTrace } from './dlco-trace.js';
import { interpret, LLN_Z } from '../interpret/interpret.js';

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
/** Loop shape from the true ratio: more scooped (smaller k) with more obstruction. */
export const shapeFor = (ratio) => clamp(0.55 + 0.6 * ratio, 0.6, 1.05);
export const durationFor = (ratio) => (ratio < 0.6 ? 15 : 12);

/**
 * @param {Partial<import('./descriptor.js').Descriptor> & { seed: number, archetype: string }} input
 * @param {Record<string, object>} datasets
 */
export function buildCase(input, datasets) {
  const d = resolveDescriptor(input);
  const { resolveReference } = createReference(datasets);
  const truth = generatePhysiology(d.seed, d, datasets);

  // Encounter scenarios (src/scenarios). Without them every line below reproduces the case exactly as it was made before they existed.
  const plan = d.scenarioLevel || d.scenarioIds?.length
    ? applyScenarios({ selection: selectScenarios({ seed: d.seed, level: d.scenarioLevel ?? 'light', archetype: d.archetype, panel: d.panel, forcedIds: d.scenarioIds ?? [], descriptor: d }), descriptor: d })
    : null;
  // What the laboratory enters (stated height, reference sex, requisition group) and the true values after acute effects.
  const lab = plan ? plan.demographics() : { heightCm: d.heightCm, sex: d.sex, group: d.group, hbGdl: d.hbGdl };
  const eff = plan ? plan.physiology(truth) : truth;

  const pre = generateManeuvers(d.seed, { fvc: eff.fvc, fev1: eff.fev1, k: shapeFor(eff.ratio), T: durationFor(eff.ratio), technique: d.technique, prefix: 'maneuver', scenario: plan?.maneuver('pre') ?? null });

  // A bronchodilator study follows when the baseline is obstructive, in the bronchodilator archetype,
  // and occasionally otherwise, as in a laboratory that tests on clinical suspicion.
  let post = null;
  if (eff.post && d.panel === 'full') {
    const perform = createStream(d.seed, 'bd-decision').uniform();
    const patient = { age: d.age, sex: lab.sex, heightCm: lab.heightCm, group: lab.group };
    const ratioZ = pre.summary.ratio ? resolveReference('fev1_fvc', { ...patient, measured: pre.summary.ratio }, 'GLIglobal').z : 0;
    if (['obstruction', 'mixed', 'bd-discordant'].includes(d.archetype) || ratioZ < LLN_Z || perform < 0.15 || plan?.forcePostBd) {
      const ratioPost = eff.post.fev1 / eff.post.fvc;
      post = generateManeuvers(d.seed, { fvc: eff.post.fvc, fev1: eff.post.fev1, k: shapeFor(ratioPost), T: durationFor(ratioPost), technique: d.technique, prefix: 'post', earlyStop: eff.post.earlyStop, scenario: plan?.maneuver('post') ?? null });
    }
  }

  // Lung volumes by plethysmography: FRC, ERV and IC are measured; TLC, RV and VC follow from them.
  let volumes = null, tlcBeforeScenario = null;
  if (d.panel === 'full') {
    const rng = createStream(d.seed, 'volumes');
    let frc = truth.frc * Math.exp(0.03 * rng.normal());
    // ERV cannot exceed FRC; the cap keeps RV = FRC - ERV positive so the identities stay exact.
    let erv = Math.min(truth.erv * Math.exp(0.08 * rng.normal()), 0.85 * frc);
    let ic = truth.ic * Math.exp(0.04 * rng.normal());
    if (plan) { tlcBeforeScenario = frc + ic; ({ frc, erv, ic } = plan.volumeComponents({ frc, erv, ic })); }
    volumes = { method: 'plethysmography', frc, erv, ic, tlc: frc + ic, rv: frc - erv, vc: ic + erv };
  }

  // The plethysmograph tracings decide the reported FRC (the mean of the acceptable trials); ERV and IC are kept, and TLC, RV and VC follow.
  // Scenario trace faults (src/scenarios names) are translated to the ids the tracing builders force (docs/pleth-dlco-model.md).
  const TRACE_IDS = { pleth: { 'thermal-drift': 'PLE-01', 'pant-too-fast': 'PLE-02' }, dlco: { 'incomplete-inhalation': 'DLC-01', valsalva: 'DLC-04', mueller: 'DLC-05', leak: 'DLC-06' } };
  // The scenario forces the fault; for faults the tracing models (incomplete inhalation, Valsalva, Mueller) the tracing alone sets the numbers.
  // The inspired-volume fraction stated in the intake text is the one the tracing uses.
  const traceScenario = plan
    ? { incompleteIc: plan.selection.ids.includes('pleth-incomplete-ic'), ids: Object.entries(plan.merged.traceFaults ?? {}).flatMap(([test, faults]) => faults.map((f) => TRACE_IDS[test]?.[f]).filter(Boolean)), ...(plan.merged.dlco.viFraction !== undefined ? { viOverVc: plan.merged.dlco.viFraction } : {}) }
    : null;
  const trueRatioZ = resolveReference('fev1_fvc', { age: d.age, sex: d.sex, heightCm: d.heightCm, group: ANCHOR.group, measured: truth.ratio }, ANCHOR.spirometry).z;
  // A physical constraint (e.g. a garment) can affect both tests; a bad pleth link cannot.
  const dlcoModelTlc = d.v >= 3 ? (plan?.merged.volumes.vaFollowsTlc ? volumes?.tlc : truth.tlc) : null;
  const dlcoModelTlcRatio = d.v >= 3 && volumes && plan?.merged.volumes.vaFollowsTlc ? volumes.tlc / tlcBeforeScenario : 1;
  let pleth = null;
  if (volumes) {
    pleth = (d.v >= 3 ? buildMeasuredPleth : buildPleth)({ age: d.age, fvcL: pre.summary.fvc, seed: d.seed, truth: { ...truth, frc: volumes.frc }, volumes, technique: d.technique, scenario: traceScenario, ratioZ: trueRatioZ });
    volumes = pleth.suggestedVolumes;
  }

  // Single-breath diffusing capacity: measured DLCO is the hemoglobin-corrected truth uncorrected again.
  let dlco = null;
  if (d.panel === 'full') {
    const rng = createStream(d.seed, 'dlco');
    let corrected = truth.dlcoCorrected * Math.exp(0.04 * rng.normal());
    let va = Math.min(truth.va * Math.exp(0.03 * rng.normal()), 0.99 * (d.v >= 3 ? dlcoModelTlc : volumes.tlc));
    if (!plan) {
      const factor = hbFactor(d.hbGdl, d.sex, d.age);
      const raw = corrected / factor;
      dlco = { raw, hbGdl: d.hbGdl, hbFactor: factor, adjusted: corrected, va, kco: corrected / va };
    } else {
      ({ corrected, va } = plan.dlcoParts({ corrected, va, tlc: d.v >= 3 ? dlcoModelTlc : volumes.tlc, tlcRatio: d.v >= 3 ? dlcoModelTlcRatio : volumes.tlc / tlcBeforeScenario }));
      // The measured value follows the patient's own hemoglobin and birth sex; the laboratory adjusts with the sex and hemoglobin it has on file.
      const raw = corrected / hbFactor(d.hbGdl, d.sex, d.age);
      const factor = lab.hbGdl === null ? 1 : hbFactor(lab.hbGdl, lab.sex, d.age);
      // With the patient's own sex and hemoglobin the adjustment returns the corrected value exactly.
      const adjusted = lab.hbGdl !== null && lab.sex === d.sex ? corrected : raw * factor;
      dlco = { raw, hbGdl: lab.hbGdl, hbFactor: factor, adjusted, va, kco: adjusted / va };
    }
  }

  // The single-breath tracing is built from the case values. When a technical fault changes the physics (low inspired volume,
  // Valsalva, Mueller, a poor sample) the laboratory reports what the test measured, so the tracing's recomputed values replace them.
  let dlcoTrace = null;
  if (dlco) {
    dlcoTrace = buildDlcoTrace({ seed: d.seed, truth, dlco: { raw: dlco.raw, va: dlco.va }, volumes: d.v >= 3 ? { vc: Math.max(pre.summary.fvc ?? 0, ...pleth.trials.filter((t) => ['acceptable', 'usable'].includes(t.linkAssessment.status)).map((t) => t.link.svcL)) } : volumes, patient: { weightKg: d.weightKg }, technique: d.technique, scenario: traceScenario, ratioZ: trueRatioZ });
    if (dlcoTrace && dlcoTrace.reproducesCase === false && dlcoTrace.values) {
      const scale = dlcoTrace.values.dlcoMlMinMmHg / dlco.raw;
      const va = Math.min(dlcoTrace.values.vaL, 0.99 * (d.v >= 3 ? dlcoModelTlc : volumes.tlc));
      dlco = { ...dlco, raw: dlcoTrace.values.dlcoMlMinMmHg, adjusted: dlco.adjusted * scale, va, kco: (dlco.adjusted * scale) / va };
    }
  }

  const report = {
    patient: { age: d.age, sex: lab.sex, heightCm: lab.heightCm, group: lab.group, weightKg: d.weightKg, hbGdl: lab.hbGdl },
    spirometry: {
      fev1: pre.summary.fev1,
      fvc: pre.summary.fvc,
      post: post ? { fev1: post.summary.fev1, fvc: post.summary.fvc } : null,
    },
    volumes,
    ...(pleth?.session ? { volumeQuality: { status: pleth.session.status, grade: pleth.grade, warnings: pleth.session.warnings } } : {}),
    dlco: dlco ? { dlcoAdjusted: dlco.adjusted, va: dlco.va } : null,
    grades: { fev1: pre.summary.grades.fev1, fvc: pre.summary.grades.fvc, postFev1: post?.summary.grades.fev1, postFvc: post?.summary.grades.fvc },
  };

  let scenario = emptyScenario(d);
  if (plan) {
    // Caveat ids travel with the report so that interpret() carries them into the key (key.caveatIds).
    report.caveatIds = plan.caveatsFor(plan.caveatFlags({ dlco: Boolean(dlco), volumes: Boolean(volumes), post: Boolean(post) }, report, resolveReference)).map((c) => c.id);
    scenario = plan.describe({ report, pre, post, volumes, dlco, resolve: resolveReference });
  }
  const anchorKey = interpret(report, resolveReference, ANCHOR.spirometry, { generatorKey: true });
  return {
    descriptor: d,
    groundTruth: { archetype: d.archetype, phenotype: truth.phenotype, bdVariant: truth.bdVariant, note: truth.note, anchor: ANCHOR, severityTarget: d.severity },
    truth,
    spirometry: { pre, post },
    volumes,
    dlco,
    pleth,
    dlcoTrace,
    report,
    anchorKey,
    scenario,
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
