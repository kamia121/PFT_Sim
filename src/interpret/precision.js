/**
 * Display precision of the bronchodilator change as a percent of the predicted value, the quantity of the 2022 decision (a rise
 * above 10% in FEV1 or FVC; the boundary is the one coded in interpret.js). One decimal is enough except next to the threshold, where
 * it prints 10.0 for a value of 9.96 or 10.03 and so hides which side the value is on. Display only: no decision is made here.
 */

/** The threshold of the 2022 rule, in percent of the predicted value (as coded in interpret.js). */
export const BD_PCT_PRED_THRESHOLD = 10;

/**
 * Decimals to print `x` with: one, or as many more (up to four) as it takes for the printed value to differ from the threshold.
 * @param {number} x percent of predicted
 * @returns {number}
 */
export function bdPctPredDp(x) {
  if (!Number.isFinite(x)) return 1;
  let dp = 1;
  while (dp < 4 && Number(x.toFixed(dp)) === BD_PCT_PRED_THRESHOLD && x !== BD_PCT_PRED_THRESHOLD) dp += 1;
  return dp;
}

/** @param {number} x percent of predicted @returns {string} the value with its digits, without a unit */
export const bdPctPredText = (x) => (Number.isFinite(x) ? x.toFixed(bdPctPredDp(x)) : '');
