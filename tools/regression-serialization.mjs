/** Test-only snapshot serialization. Never used by clinical equations, decisions or reports.
 * Node 22 and 24 transcendental functions can differ by a final binary digit. Keep 9 decimal
 * places in snapshot numbers (at most 5e-10 L quantization, consistent with trace snapshots), not exact binary-byte identity.
 * Strings, booleans, missing/null state and object/array ordering remain exact. Clinical threshold
 * tests and independent equation fixtures still use unrounded values and their own explicit tolerances.
 */
import { createHash } from 'node:crypto';
export const SNAPSHOT_DECIMAL_PLACES = 9;
export const regressionHash = (value) => createHash('sha256').update(JSON.stringify(value, (_k, x) =>
  typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(SNAPSHOT_DECIMAL_PLACES)) : x)).digest('hex');
export function regressionCaseHash(c) {
  const {scenario,...body}=c;
  return regressionHash(body);
}
