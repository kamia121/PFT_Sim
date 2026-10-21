/**
 * Display of the bronchodilator change as a percent of the predicted value, the quantity of the 2022 decision (a rise above 10% in
 * FEV1 or FVC; the boundary is the one coded in interpret.js). One decimal is enough except next to the threshold, where it prints
 * 10.0 for a value of 9.96 or 10.03 and so hides which side the value is on. Within 0.05 of 10 the value takes two decimals; where two
 * decimals still print 10.00 (a distance under 0.005, below any meaningful precision of the inputs) it is qualified instead, as above
 * or below 10, so that the digits never have to grow without end. Display only: no decision is made here.
 */

/** The threshold of the 2022 rule, in percent of the predicted value (as coded in interpret.js). */
export const BD_PCT_PRED_THRESHOLD = 10;

/** 'above' or 'below' when even two decimals print the threshold for a value that is not the threshold; otherwise null. @param {number} x */
export function bdPctPredQualifier(x) {
  if (!Number.isFinite(x) || x === BD_PCT_PRED_THRESHOLD || Number(x.toFixed(2)) !== BD_PCT_PRED_THRESHOLD) return null;
  return x > BD_PCT_PRED_THRESHOLD ? 'above' : 'below';
}

/**
 * Decimals to print `x` with: one, or two when one would print the threshold for a value that is not the threshold.
 * @param {number} x percent of predicted
 * @returns {number}
 */
export function bdPctPredDp(x) {
  if (!Number.isFinite(x)) return 1;
  return Number(x.toFixed(1)) === BD_PCT_PRED_THRESHOLD && x !== BD_PCT_PRED_THRESHOLD ? 2 : 1;
}

/** @param {number} x percent of predicted @returns {string} the digits, with the qualifier "(above 10)" or "(below 10)" when digits cannot show the side */
export function bdPctPredText(x) {
  if (!Number.isFinite(x)) return '';
  const q = bdPctPredQualifier(x);
  return `${x.toFixed(bdPctPredDp(x))}${q ? ` (${q} ${BD_PCT_PRED_THRESHOLD})` : ''}`;
}
