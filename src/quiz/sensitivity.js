/**
 * Which input or assumption most changes the classification of a case. Each candidate is tested by
 * recomputing the interpretation, so a distractor is offered only when it does not change a spirometry
 * label, and the correct answer is the candidate that changes the most.
 */
import { interpret } from '../interpret/interpret.js';

const SPIRO = ['fev1', 'fvc', 'fev1_fvc'];

/** Label changes (and a pattern change, counted once) between two interpretations. */
export function flipCount(x, y) {
  let n = 0;
  for (const k of SPIRO) {
    const p = x.measures[k], q = y.measures[k];
    if (p && q && p.available !== false && q.available !== false && p.label !== q.label) n += 1;
  }
  return n + (x.pattern !== y.pattern ? 1 : 0);
}

export const CANDIDATE_LABELS = {
  equation: 'The choice between GLI-2012 and GLI Global for spirometry',
  sex: 'The sex used for the reference (sex assigned at birth or sex used by the laboratory)',
  height: 'The stated height compared with the true height',
  'height-rounding': 'Rounding the height by 1 cm',
  hb: 'The hemoglobin concentration',
  weight: 'Body weight and body mass index',
  smoking: 'Smoking status on the requisition',
  'bd-rule': 'The bronchodilator criterion (2022 or earlier rule)',
};

/**
 * @param {{ caseData: object, a: object, cmp: object, equation: string }} prep
 * @param {{ resolve: Function }} ctx
 */
export function analyzeSensitivity(prep, ctx) {
  const { caseData: c, a, cmp } = prep;
  const sc = c.scenario ?? null;
  const flipsWith = (patch) => flipCount(a, interpret({ ...c.report, patient: { ...c.report.patient, ...patch } }, ctx.resolve, prep.equation));
  const candidates = [{ id: 'equation', flips: cmp.labelChanges.length + (cmp.patternChanged ? 1 : 0) }];
  if (sc?.referenceSex && sc.referenceSex.used !== sc.referenceSex.birth) candidates.push({ id: 'sex', flips: flipsWith({ sex: sc.referenceSex.birth }) });
  if (sc?.height && Number.isFinite(sc.height.trueCm) && sc.height.trueCm !== c.report.patient.heightCm) candidates.push({ id: 'height', flips: flipsWith({ heightCm: sc.height.trueCm }) });
  const h = c.report.patient.heightCm;
  candidates.push({ id: 'height-rounding', flips: Math.max(flipsWith({ heightCm: h + 1 }), flipsWith({ heightCm: h - 1 })) });
  candidates.push({ id: 'weight', flips: 0 }, { id: 'smoking', flips: 0 });
  if (c.dlco) candidates.push({ id: 'hb', flips: 0 });
  if (c.spirometry.post) candidates.push({ id: 'bd-rule', flips: 0 });
  const top = Math.max(...candidates.map((x) => x.flips));
  const correct = candidates.find((x) => x.id === 'equation' && x.flips === top) ?? candidates.find((x) => x.flips === top);
  return {
    eligible: candidates[0].flips > 0,
    correct: correct.id,
    candidates,
    distractors: candidates.filter((x) => x.flips === 0).map((x) => x.id),
  };
}
