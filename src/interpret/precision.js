/**
 * Display of the bronchodilator change as a percent of the predicted value, the quantity of the 2022 decision (a rise above 10% in
 * FEV1 or FVC; the boundary is the one coded in interpret.js). One decimal is enough except next to the threshold, where it prints
 * 10.0 for a value of 9.96 or 10.03 and so hides which side the value is on. Within 0.05 of 10 the value takes two decimals; where two
 * decimals still print 10.00 (a distance under 0.005, below any meaningful precision of the inputs) it is qualified instead, as above
 * or below 10, so that the digits never have to grow without end. Display only: no decision is made here.
 */

/** The threshold of the 2022 rule, in percent of the predicted value (as coded in interpret.js). */
export const BD_PCT_PRED_THRESHOLD = 10;

/*
 * Labels and notes of the bronchodilator change, shared by the report model (CSV, TSV, clipboard), page 1, the narrow-screen excerpt and the
 * card view. ERS/ATS 2022 (Box 1): 100 × (post − pre) / predicted value, the predicted value from the GLI spirometry equation in use; it is
 * the same value before and after the bronchodilator, and page 1 does not print it. The percent of baseline belongs to the 2005 criterion
 * (with at least 0.200 L), which the 2022 statement no longer recommends, so it is a secondary column of the exports only.
 */
export const BD_PCT_PRED_LABEL = 'Change (% predicted)';
export const BD_PCT_BASE_LABEL = 'Change (% of baseline; 2005 rule, superseded)';
/** Footnote sentence that defines the denominator; it follows the sentence that names the reference equation. */
export const BD_PCT_PRED_NOTE = 'Change (% predicted) = 100 × (post − pre) / predicted value (same before and after), unrounded.';
/** Footnote sentence of the secondary column, in the exports only. */
export const BD_PCT_BASE_NOTE = 'Change (% of baseline) = 100 × change / pre-bronchodilator value, from the printed values; the 2005 criterion, superseded in 2022, read it with a change of at least 0.200 L.';

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

/* ---------------------------------------------------------------------------------- the 2005 rule */

/** Thresholds of the earlier rule (at least 12% of baseline and at least 0.200 L, as coded in interpret.js; `>=` on the unrounded values). */
export const BD_2005_PCT_BASE = 12;
export const BD_2005_LITERS = 0.2;

/** Whether a value printed with `dp` decimals would read as meeting `threshold` (printed >= threshold) while the value itself does not, or the reverse. */
const hides = (x, threshold, dp) => (Number(x.toFixed(dp)) >= threshold) !== (x >= threshold);

/**
 * Decimals for a decision quantity of the earlier rule: `dp` normally; one or two more when rounding to `dp` would put the printed value on the other
 * side of the threshold from the value (11.96% printing as 12.0%, 199.6 mL as 200). Display only.
 * @returns {number}
 */
export function nearDp(x, threshold, dp) {
  if (!Number.isFinite(x)) return dp;
  let d = dp;
  while (d < dp + 3 && hides(x, threshold, d)) d += 1;
  return d;
}

/** Side qualifier when even `dp + 3` decimals hide the side; otherwise null. */
export function nearQualifier(x, threshold, dp) {
  return Number.isFinite(x) && hides(x, threshold, dp + 3) ? (x >= threshold ? 'at or above' : 'below') : null;
}

/** The change in percent of baseline with the digits (or the qualifier) that show its side of 12%. @param {number} x */
export function bdPctBaseText(x) {
  if (!Number.isFinite(x)) return '';
  const q = nearQualifier(x, BD_2005_PCT_BASE, 1);
  return `${x.toFixed(nearDp(x, BD_2005_PCT_BASE, 1))}${q ? ` (${q} ${BD_2005_PCT_BASE})` : ''}`;
}

/** The change in liters as milliliters, with the digits (or the qualifier) that show its side of 200 mL. @param {number} liters */
export function bdMlText(liters) {
  if (!Number.isFinite(liters)) return '';
  const ml = liters * 1000, t = BD_2005_LITERS * 1000;
  const q = nearQualifier(ml, t, 0);
  return `${ml.toFixed(nearDp(ml, t, 0))}${q ? ` (${q} ${t})` : ''}`;
}
