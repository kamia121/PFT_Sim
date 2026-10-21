/**
 * The rubric of one checked case: facts read from the EXISTING interpretation, for the displayed spirometry equation and for the other one.
 * Nothing is computed here: no threshold, no z-score, no reference value. `interp` and `interpOther` are the results of interpret() as the practice
 * page already builds them (never the generator's anchor key). Whether a test was performed comes from the report, not from the key: a post-bronchodilator
 * study with a missing post FEV1 has no 2022 result but was performed.
 */
import { hbKnown } from '../app/format.js';

export const PATTERN_TEXT = {
  normal: 'normal',
  obstruction: 'obstruction',
  'obstruction-low-fvc': 'obstruction with a low FVC (lung volumes needed)',
  restriction: 'restriction',
  mixed: 'mixed obstruction and restriction',
  nonspecific: 'a nonspecific pattern (preserved ratio, low FVC or FEV₁, TLC not low)',
  prism: 'a preserved ratio with a low FVC or FEV₁ (PRISm; lung volumes needed)',
  indeterminate: 'not interpretable',
};

/**
 * @param {{ caseData: object, interp: object, interpOther?: object|null, equation: string }} arg
 */
export function buildRubric({ caseData, interp, interpOther = null, equation }) {
  const key = interp.key;
  const keyB = interpOther?.key ?? null;
  const tlc = interp.measures?.tlc;
  const graded = ['mild', 'moderate', 'severe'].includes(key.severity);
  const obstructive = key.pattern === 'obstruction' || key.pattern === 'obstruction-low-fvc';
  return {
    equation,
    pattern: key.pattern,
    patternOther: keyB && keyB.pattern !== key.pattern ? keyB.pattern : null,
    severity: {
      applicable: obstructive && (graded || key.severity === 'fev1-normal'),
      key: key.severity ?? null,
      graded,
      accepted: obstructive && key.severity ? [key.severity, ...(key.severityAlso ?? [])] : [],
      other: obstructive && keyB && keyB.severity && keyB.severity !== key.severity ? keyB.severity : null,
    },
    bd: {
      performed: Boolean(caseData?.report?.spirometry?.post),
      key: key.bronchodilator ?? null,
      other: keyB?.bronchodilator && keyB.bronchodilator !== key.bronchodilator ? keyB.bronchodilator : null,
    },
    dlco: {
      performed: Boolean(caseData?.report?.dlco),
      key: key.dlco ?? null,
      other: keyB?.dlco && keyB.dlco !== key.dlco ? keyB.dlco : null,
      hbKnown: hbKnown(caseData?.dlco),
    },
    volumes: { measured: Boolean(tlc) && tlc.available !== false, limitationExpected: key.pattern === 'obstruction-low-fvc' || key.pattern === 'prism' },
    quality: { limited: Boolean(interp.qualityLimited) },
  };
}
