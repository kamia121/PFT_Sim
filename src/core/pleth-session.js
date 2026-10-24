/**
 * Plethysmographic reporting from assessed FRC/linked spirometry measurements.
 * Source: Bhakta et al. ERS/ATS 2023, corrected Table 3, Table 4 and reporting pp18–19,
 * DOI 10.1183/13993003.01519-2022; Table 3 erratum 10.1183/13993003.51519-2022.
 * Operator assessment of within-manoeuvre IC/SVC quality is an explicit input; unknown
 * quality is never assumed acceptable. This module does not infer faults from curves.
 */
import { atMost, atLeast } from './comparison.js';
import { LUNG_VOLUMES_2023 as S } from './standards.js';

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const valid = (value) => Number.isFinite(value) && value > 0;
const eligible = (status) => status === 'acceptable' || status === 'usable';
const ORDER = ['A', 'B', 'C', 'D', 'E', 'U', 'F'];
const worst = (...grades) => grades.reduce((a, b) => ORDER.indexOf(a) > ORDER.indexOf(b) ? a : b);
export const plethSpread = (values) => values.length < 2 ? null : (Math.max(...values) - Math.min(...values)) / mean(values);

/** Same-session FVC, or largest of at least three separately assessed acceptable VCs. */
export function plethVcComparator({ fvcL = null, acceptableVc = [] } = {}) {
  if (valid(fvcL)) return { value: fvcL, basis: 'same-session-fvc' };
  const vcs = acceptableVc.filter((v) => v.status === 'acceptable' && valid(v.vcL));
  return vcs.length >= S.noFvcAcceptableVcCount ? { value: Math.max(...vcs.map((v) => v.vcL)), basis: 'largest-of-three-acceptable-vc' } : { value: null, basis: 'unavailable' };
}

/** Corrected Table 3 thresholds. Pediatric "whichever is smaller" compares candidate VC thresholds. */
export function assessPlethLink(link, { age, comparator }) {
  const reject = (reason) => ({ status: 'rejected', reason });
  if (!link || link.linked !== true) return reject('Plethysmography requires linked spirometry.');
  if (!valid(link.icL) || !valid(link.svcL) || !atMost(link.icL, link.svcL)) return reject('Linked IC/SVC measurements are missing or physically inconsistent.');
  if (!Number.isFinite(age) || age < 0 || !valid(comparator)) return { status: 'unknown', reason: 'Age or same-session VC comparator is unavailable.' };
  if (!eligible(link.withinManeuverStatus)) return { status: link.withinManeuverStatus === 'rejected' ? 'rejected' : 'unknown', reason: 'Within-maneuver IC/SVC quality is not established as acceptable or usable.' };
  const limits = S.linkedSvc;
  const acc = age > limits.olderThanYears ? comparator - limits.acceptableDeficitL : Math.min(comparator - limits.childAcceptableDeficitL, comparator * (1 - limits.childFvcFraction));
  const use = age > limits.olderThanYears ? comparator - limits.usableDeficitL : Math.min(comparator - limits.childUsableDeficitL, comparator * (1 - limits.childFvcFraction));
  if (!atLeast(link.svcL, use)) return reject('Linked SVC is below the corrected Table 3 usable threshold.');
  const status = atLeast(link.svcL, acc) && link.withinManeuverStatus === 'acceptable' ? 'acceptable' : 'usable';
  return { status, acceptableThresholdL: acc, usableThresholdL: use, reason: status === 'usable' ? 'Linked spirometry requires qualification.' : '' };
}

/** Exact subset search (at most eight simulated trials). Tie policy is engineering, not a guideline. */
// Preferred selection concerns acceptable FRC; associated linked spirometry can be usable.
function bestAcceptableGroup(rows) {
  const acceptable = rows.filter((r) => r.frcStatus === 'acceptable' && eligible(r.linkStatus));
  let best = [], bestSpread = Infinity;
  for (let mask = 1; mask < 2 ** acceptable.length; mask++) {
    const group = acceptable.filter((_, i) => mask & 2 ** i);
    if (group.length < 2 || group.length < best.length) continue;
    const spread = plethSpread(group.map((r) => r.frcL));
    if (!atMost(spread, S.frcRepeatability.preferred)) continue;
    const earlier = (xs, ys) => { for (let i = 0; i < xs.length; i++) { if (xs[i].order !== ys[i].order) return xs[i].order < ys[i].order; } return false; };
    const smallerSpread = best.length > 0 && !atMost(bestSpread, spread);
    const tiedSpread = atMost(spread, bestSpread) && atLeast(spread, bestSpread);
    if (group.length > best.length || smallerSpread || tiedSpread && earlier(group, best)) { best = group; bestSpread = spread; }
  }
  return best;
}

/** Remove paired outliers only while >=3 remain; a discordant pair requires technical review. */
function selectRows(rows, dropped, warnings) {
  const preferred = bestAcceptableGroup(rows);
  if (preferred.length >= 2) {
    for (const r of rows) if (!preferred.includes(r)) dropped.push({ id: r.id, reason: 'Outside the selected acceptable 5% group.' });
    return { rows: preferred, policy: 'acceptable-within-5pct', pending: false };
  }
  const pool = [...rows];
  while (pool.length >= 3 && !atMost(plethSpread(pool.map((r) => r.frcL)), S.frcRepeatability.qualified)) {
    const average = mean(pool.map((r) => r.frcL));
    let furthest = pool[0];
    for (const row of pool.slice(1)) {
      const delta = Math.abs(row.frcL - average), previous = Math.abs(furthest.frcL - average);
      const farther = delta > previous && !atMost(delta, previous);
      const tied = atMost(delta, previous) && atLeast(delta, previous);
      if (farther || tied && row.order > furthest.order) furthest = row;
    }
    dropped.push({ id: furthest.id, reason: 'Furthest-from-mean FRC outlier; associated spirometry excluded.' });
    pool.splice(pool.indexOf(furthest), 1);
  }
  if (pool.length === 2 && !atMost(plethSpread(pool.map((r) => r.frcL)), S.frcRepeatability.qualified)) {
    warnings.push('Two discordant measurements need technical review or another measurement; neither is arbitrarily selected.');
    return { rows: [], pendingRows: pool, policy: 'needs-review', pending: true };
  }
  if (pool.length) warnings.push(pool.length === 1 ? 'A single retained measurement cannot demonstrate repeatability.' : 'Reporting uses the qualified 10% fallback.');
  return { rows: pool, policy: pool.length ? 'qualified-fallback' : 'unavailable', pending: false };
}

function countGrade(statuses) {
  const a = statuses.filter((s) => s === 'acceptable').length, u = statuses.filter((s) => s === 'usable').length;
  return a >= 3 ? 'A' : a >= 2 ? 'B' : a === 1 ? u ? 'D' : 'E' : u ? 'U' : 'F';
}

/**
 * @param {{ age:number, fvcL?:number|null, rvVcPolicy?:'retained-linked', acceptableVc?:{vcL:number,status:string}[],
 * trials:{id:string|number,frcL:number,frcStatus:string,link?:{linked:boolean,icL:number,svcL:number,withinManeuverStatus:string}}[] }} input
 * No original measurement is modified. `selectedIds` defines the exact reporting pool.
 */
export function summarizePlethSession(input) {
  const comparator = plethVcComparator(input), warnings = [], excluded = [];
  const rvVcPolicy = input.rvVcPolicy ?? 'retained-linked';
  if (rvVcPolicy !== 'retained-linked') throw new RangeError('Unsupported RV VC-pool policy. Reporting uses retained measurements and their associated spirometry under the 2023 reporting section.');
  if (input.trials.length > 8) throw new RangeError('This simulator adapter supports at most eight pleth trials (project limit, not a source criterion).');
  const ids = input.trials.map((t) => t.id);
  if (ids.some((id) => typeof id !== 'string' && !Number.isFinite(id) || id === '')) throw new TypeError('Pleth measurements require stable string or finite numeric IDs.');
  if (new Set(ids).size !== ids.length) throw new RangeError('Pleth measurement IDs must be unique.');
  const assessed = input.trials.map((t, order) => ({ ...t, order, ...{ linkAssessment: assessPlethLink(t.link, { age: input.age, comparator: comparator.value }) } }));
  for (const t of assessed) t.linkStatus = t.linkAssessment.status;
  const frcCandidates = assessed.filter((t) => valid(t.frcL) && eligible(t.frcStatus));
  const linked = frcCandidates.filter((t) => eligible(t.linkStatus));
  const frcOnly = linked.length === 0;
  for (const t of assessed) if (!(frcOnly ? frcCandidates : linked).includes(t)) excluded.push({ id: t.id, reason: !eligible(t.frcStatus) || !valid(t.frcL) ? 'FRC is rejected, unknown or invalid.' : t.linkAssessment.reason });
  // With no eligible linked spirometry, independently select FRC; never invent TLC or RV.
  const candidates = frcOnly ? frcCandidates.map((t) => ({ ...t, linkStatus: 'acceptable' })) : linked;
  const selection = selectRows(candidates, excluded, warnings), selected = selection.rows;
  const spread = plethSpread(selected.map((t) => t.frcL));
  const frcCountGrade = countGrade(selected.map((t) => t.frcStatus));
  const svcUnknown = frcOnly && frcCandidates.some((t) => t.linkStatus === 'unknown');
  const svcGrade = svcUnknown ? null : frcOnly ? 'F' : countGrade(selected.map((t) => t.linkStatus));
  const repeatabilityGrade = spread === null ? null : atMost(spread, S.frcRepeatability.preferred) ? 'A' : 'C';
  const frcGrade = selection.pending ? null : repeatabilityGrade ? worst(frcCountGrade, repeatabilityGrade) : frcCountGrade;
  const overallGrade = selection.pending || svcUnknown ? null : worst(frcGrade, svcGrade);
  const frc = selected.length ? mean(selected.map((t) => t.frcL)) : null;
  let tlc = !frcOnly && selected.length ? mean(selected.map((t) => t.frcL + t.link.icL)) : null;
  const ic = tlc === null ? null : mean(selected.map((t) => t.link.icL));
  const vc = tlc === null ? null : Math.max(...selected.map((t) => t.link.svcL));
  let rv = tlc === null ? null : tlc - vc;
  const inconsistent = rv !== null && atMost(rv, 0);
  if (inconsistent) { warnings.push('Derived RV is nonpositive; review linked measurements. TLC/RV are withheld rather than clamped.'); tlc = null; rv = null; }
  if (frcOnly) warnings.push('No eligible linked spirometry: FRC only; TLC and RV are unavailable.');
  return {
    source: 'ERS/ATS 2023 corrected Tables 3–4 and reporting pp18–19',
    status: selection.pending || inconsistent ? 'needs-review' : frc === null ? 'unavailable' : frcOnly ? 'frc-only' : 'reported',
    comparator, assessed, selectedIds: selected.map((t) => t.id), pendingIds: (selection.pendingRows ?? []).map((t) => t.id), excluded, selectionPolicy: selection.policy,
    engineeringPolicy: 'Largest qualifying acceptable subset; equal-size subsets prefer smaller spread, then earlier acquisition. Equidistant outliers discard the latest acquisition. Prefer full volumes from eligible pairs over a stronger FRC-only pool. No numerical choice resolves a discordant pair.',
    rvVcPolicy: { id: rvVcPolicy, verification: 'source-context interpretation: pp18–19 select measurements and associated spirometry for FRC and other volumes; Table 4 counts retained measurements; pp4–5 derive RV using largest VC. Only eligible retained linked VC is used.' },
    grades: { frc: frcGrade, svc: selection.pending ? null : svcGrade, repeatability: repeatabilityGrade, overall: inconsistent ? null : overallGrade },
    repeatability: { fraction: spread, assessable: spread !== null, n: selected.length },
    volumes: { method: 'plethysmography', frc, tlc, rv, vc, ic, erv: vc === null ? null : vc - ic },
    warnings,
  };
}
