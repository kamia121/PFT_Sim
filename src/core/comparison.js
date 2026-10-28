/** Numerical equality allowance only: 8 × Number.EPSILON × max(1, |a|, |b|), never rounding a measured value to mL. */
const tolerance = (a, b) => 8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
export const atMost = (a, b) => a <= b || a - b <= tolerance(a, b);
export const atLeast = (a, b) => a >= b || b - a <= tolerance(a, b);
