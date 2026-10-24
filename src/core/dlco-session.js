/** ERS/ATS 2017 Table 3 and reporting pp21–22. No synthetic-signal validation is implied. */
import { DLCO_2017 } from './standards.js';
const S = DLCO_2017;
const valid = (v) => Number.isFinite(v) && v > 0;
const epsilon = (a, b) => 8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
const le = (a, b) => a <= b + epsilon(a, b);
const ge = (a, b) => b <= a + epsilon(a, b);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const range = (xs) => xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : null;

/** Individual assessments use measured VI and the largest eligible same-session VC, never VI as VC. */
export function assessDlcoManeuver(t, { vcL, largestOtherAcceptableVaL = null } = {}) {
  const q = t.quality ?? {}, criteria = [];
  const add = (id, known, pass) => criteria.push({ id, status: !known ? 'unknown' : pass ? 'pass' : 'fail' });
  const ratio = valid(t.viL) && valid(vcL) ? t.viL / vcL : null;
  const alternate = ratio !== null && ge(ratio, S.viFraction.alternative) && !ge(ratio, S.viFraction.preferred);
  const comparator = valid(largestOtherAcceptableVaL) ? largestOtherAcceptableVaL : null;
  const vaAgreement = valid(t.vaL) && comparator !== null ? le(Math.abs(t.vaL - comparator), Math.max(S.vaAgreement.absoluteL, S.vaAgreement.fraction * comparator)) : null;
  add('VI/VC', ratio !== null && (!alternate || vaAgreement !== null), ratio !== null && (ge(ratio, S.viFraction.preferred) || alternate && vaAgreement));
  add('t85 <4 s', Number.isFinite(q.t85S), q.t85S >= 0 && q.t85S < S.t85MaxS);
  add('stable breath-hold', typeof q.stableBreathHold === 'boolean', q.stableBreathHold === true);
  for (const id of ['leak', 'valsalva', 'mueller']) add(`no ${id}`, typeof q[id] === 'boolean', q[id] === false);
  add('trace quality', typeof q.visualQualityConfirmed === 'boolean', q.visualQualityConfirmed === true);
  const bhKnown = valid(q.breathHoldS), sampleKnown = Number.isFinite(q.sampleEndS) && q.sampleEndS >= 0;
  const hold = bhKnown && ge(q.breathHoldS, S.breathHoldS[0]) && le(q.breathHoldS, S.breathHoldS[1]);
  add('breath-hold 8–12 s', bhKnown, hold);
  add('sample complete <=4 s from exhalation start', sampleKnown, le(q.sampleEndS, S.sampleCompleteS));
  add('dead-space clearance', typeof q.deadSpaceClearanceConfirmed === 'boolean', q.deadSpaceClearanceConfirmed === true);
  if (q.samplingMethod === 'classical') {
    const low = valid(vcL) && vcL < S.classical.reducedWashoutVcL ? S.classical.reducedWashoutL : S.classical.washoutL[0];
    add('classical washout volume', valid(vcL) && valid(q.washoutL), ge(q.washoutL, low) && le(q.washoutL, S.classical.washoutL[1]));
    add('classical sample volume', valid(vcL) && valid(q.sampleL), le(q.sampleL, S.classical.sampleL[1]) && (ge(q.sampleL, S.classical.sampleL[0]) || vcL < S.classical.smallSampleVcL && q.deadSpaceClearanceConfirmed === true));
  } else if (q.samplingMethod === 'rga') add('RGA virtual sample volume', valid(q.sampleL), ge(q.sampleL, S.rgaSampleL[0]) && le(q.sampleL, S.rgaSampleL[1]));
  else add('sampling method', false, false);
  add('measured DLCO/VA/VI', valid(t.dlco) && valid(t.vaL) && valid(t.viL), true);
  const acceptable = criteria.every((c) => c.status === 'pass');
  const numericColumns = new Set(['VI/VC', 'breath-hold 8–12 s', 'sample complete <=4 s from exhalation start']);
  const otherCriteria = criteria.filter((c) => !numericColumns.has(c.id));
  const otherPass = otherCriteria.every((c) => c.status === 'pass');
  // Table 3 overlaps. Select its best matching row; never invent a worst-criterion catch-all.
  const matchingRows = [];
  if (acceptable) matchingRows.push('A');
  if (ratio !== null && bhKnown && sampleKnown && otherPass) {
    if (ge(ratio, .85) && hold && le(q.sampleEndS, 4)) matchingRows.push('B');
    if (ge(ratio, .80) && hold && le(q.sampleEndS, 5)) matchingRows.push('C');
    if (le(ratio, .80) && !hold) matchingRows.push(le(q.sampleEndS, 5) ? 'D' : 'F');
  }
  const grade = matchingRows[0] ?? null;
  return { id: t.id, grade, matchingRows, acceptable, usable: ['A', 'B', 'C', 'D'].includes(grade),
    viOverVc: ratio, largestOtherAcceptableVaL: comparator, alternative: alternate ? vaAgreement === null ? 'unconfirmed' : vaAgreement ? 'pass' : 'fail' : 'not-needed',
    criteria, failed: criteria.filter((c) => c.status === 'fail').map((c) => c.id), unknown: criteria.filter((c) => c.status === 'unknown').map((c) => c.id),
    classification: grade ? 'interim-table-row' : criteria.some((c) => c.status === 'unknown') ? 'pending' : 'unclassified-mixed-failure',
  };
}

function bestSubset(rows, acceptable) {
  let best = [], spread = Infinity;
  for (let mask = 1; mask < 2 ** rows.length; mask++) {
    const group = rows.filter((_, i) => mask & 2 ** i);
    if (group.length < best.length || !acceptable(group)) continue;
    const d = range(group.map((r) => r.dlco)) ?? 0;
    if (group.length > best.length || d < spread && !le(spread, d)) { best = group; spread = d; }
  }
  return best;
}

/** Complete-session fallback requires repeat testing to have ended; never assigns a session letter grade. */
export function summarizeDlcoSession({ maneuvers, vcL = null, units = 'traditional', completed = true }) {
  if (!['traditional', 'si'].includes(units)) throw new RangeError('DLCO units must be traditional or si.');
  if (maneuvers.length > 8) throw new RangeError('This simulator reporting adapter supports at most eight DLCO maneuvers (project limit).');
  const ids = maneuvers.map((t) => t.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !(typeof id === 'string' && id.length || typeof id === 'number' && Number.isFinite(id)))) throw new TypeError('DLCO maneuver IDs must be stable and unique.');
  const initial = maneuvers.map((t) => assessDlcoManeuver(t, { vcL }));
  const roots = maneuvers.filter((_, i) => initial[i].acceptable);
  const candidates = maneuvers.filter((_, i) => initial[i].alternative === 'unconfirmed' && initial[i].grade === 'B');
  // An independently acceptable root prevents circular acceptance of low-VI pairs.
  const promoted = roots.length ? bestSubset(candidates, (group) => {
    const pool = [...roots, ...group], reached = [...roots], pending = [...group];
    // Each candidate needs a comparison chain rooted in an independently acceptable maneuver.
    // An unrelated A root must not legitimize two mutually supporting low-VI candidates.
    while (pending.length) {
      const index = pending.findIndex((t) => assessDlcoManeuver(t, { vcL, largestOtherAcceptableVaL: Math.max(...reached.map((r) => r.vaL)) }).acceptable);
      if (index < 0) return false;
      reached.push(pending.splice(index, 1)[0]);
    }
    return group.every((t) => assessDlcoManeuver(t, { vcL, largestOtherAcceptableVaL: Math.max(...pool.filter((r) => r.id !== t.id).map((r) => r.vaL)) }).acceptable);
  }) : [];
  const acceptedPool = [...roots, ...promoted];
  const assessments = maneuvers.map((t) => {
    const others = acceptedPool.filter((r) => r.id !== t.id);
    const assessment = assessDlcoManeuver(t, { vcL, largestOtherAcceptableVaL: others.length ? Math.max(...others.map((r) => r.vaL)) : null });
    if (assessment.acceptable && !acceptedPool.some((r) => r.id === t.id)) {
      return { ...assessment, grade: null, acceptable: false, usable: false, classification: 'unclassified-alternative-set-conflict', unknown: [...assessment.unknown, 'Conflicting low-VI acceptance sets require review.'] };
    }
    return assessment;
  });
  const a = maneuvers.filter((_, i) => assessments[i].acceptable);
  const threshold = S.repeatability[units];
  const repeatable = bestSubset(a, (xs) => xs.length >= 2 && le(range(xs.map((r) => r.dlco)), threshold));
  let selected = repeatable, status = 'repeatable', policy = 'repeatable-A-only';
  const warnings = [];
  if (!repeatable.length) {
    if (!completed) { selected = []; status = 'pending'; policy = 'await-repeat-testing'; warnings.push('Repeat testing is incomplete; no session DLCO is reported yet.'); }
    else if (a.length) { selected = a; status = 'qualified'; policy = a.length > 1 ? 'nonrepeatable-A-only' : 'single-A-only'; warnings.push(a.length > 1 ? 'Acceptable A maneuvers are not repeatable; report their mean with caution.' : 'Only one acceptable A maneuver; repeatability cannot be demonstrated.'); }
    else {
      selected = maneuvers.filter((_, i) => ['B', 'C', 'D'].includes(assessments[i].grade));
      status = selected.length ? 'qualified' : assessments.some((r) => r.unknown.length) ? 'pending' : 'unavailable';
      policy = selected.length ? 'B-D-only-after-repeat-testing' : 'no-reportable-maneuvers';
      warnings.push(selected.length ? 'No A maneuver was obtained after repeat testing; the mean of B–D maneuvers is qualified.' : 'No DLCO is reportable; F and unclassified maneuvers are excluded.');
    }
  }
  if (assessments.some((r) => r.alternative === 'unconfirmed')) warnings.push('The low-VI A alternative lacks another independently acceptable VA comparator; it is not established.');
  if (assessments.some((r) => r.grade === null)) warnings.push('Some criteria are missing or mixed failures have no specified interim letter; they require review and are excluded.');
  const reported = selected.length ? { dlco: mean(selected.map((r) => r.dlco)), vaL: mean(selected.map((r) => r.vaL)), viL: mean(selected.map((r) => r.viL)) } : { dlco: null, vaL: null, viL: null };
  return { source: S.source, status, policy, completed, units, vcL: valid(vcL) ? vcL : null, assessments,
    selectedIds: selected.map((r) => r.id), excludedIds: ids.filter((id) => !selected.some((r) => r.id === id)),
    repeatability: { threshold, spread: range(selected.map((r) => r.dlco)), demonstrated: repeatable.length >= 2 },
    values: { ...reported, kco: reported.vaL === null ? null : reported.dlco / reported.vaL }, warnings,
    engineeringPolicy: 'Largest repeatable A subset, then smallest DLCO range, then acquisition order. Low-VI acceptance needs an independently acceptable root and the largest other acceptable VA in the selected valid acceptance set. KCO is derived from reported DLCO/mean VA. No fully specified mixed-failure or session-letter algorithm is asserted.',
  };
}
