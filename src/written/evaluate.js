/**
 * Deterministic comparison of extracted claims with the rubric. Every verdict is a lookup against the existing key; no similarity score exists anywhere.
 *
 * Groups: correct, missing (an expected element not mentioned), contradictory (the trainee's committed statement conflicts with the key, or with itself),
 * review (the wording is hedged, conditional, attributed, ambiguous, unsupported or outside what the key grades: neither credited nor penalized).
 * A hedged or unresolved claim is never credited and never counted against the trainee. A claim made in soft wording ("suggests") is credited when it
 * agrees with the key and goes to review, never to contradictory, when it does not.
 */
import { PATTERN_TEXT } from './rubric.js';

/** @typedef {{ domain: string, group: 'correct'|'missing'|'contradictory'|'review', text: string, quotes: string[], note?: string }} Item */

const LABEL = { pattern: 'Pattern', severity: 'Severity of obstruction', bd: 'Bronchodilator response', dlco: 'Diffusing capacity', volumes: 'Lung volumes', quality: 'Test quality' };
export const DOMAIN_ORDER = ['pattern', 'severity', 'bd', 'dlco', 'volumes', 'quality'];
const C = 'correct', X = 'contradictory', M = 'missing', R = 'review';
const SEVERITY_WORD = { mild: 'mild', moderate: 'moderate', severe: 'severe', 'fev1-normal': 'not graded (FEV₁ within normal limits)' };
const BD_WORD = { significant: 'significant', 'not-significant': 'not significant' };
const MAX_QUOTE = 90;

const clip = (s) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > MAX_QUOTE ? `${t.slice(0, MAX_QUOTE - 1)}…` : t; };
const quotes = (cs) => [...new Set(cs.map((c) => clip(c.quote)))];
const solid = (c) => c.certainty === 'asserted' || c.certainty === 'soft';
const allSoft = (cs) => cs.length > 0 && cs.every((c) => c.certainty === 'soft');

/**
 * @param {{ claims: import('./extract.js').Claim[], notes: any }} extraction
 * @param {ReturnType<import('./rubric.js').buildRubric>} rubric
 * @returns {{ status: 'graded'|'too-long'|'abstained', items: Item[], notices: string[] }}
 */
export function evaluate(extraction, rubric) {
  const { claims, notes } = extraction;
  const notices = [];
  if (notes.tooLong) return { status: 'too-long', items: [], notices };
  if (notes.injection) notices.push('Part of the text was addressed to the grader rather than describing the study; that part was ignored and earned nothing.');
  if (notes.truncated) notices.push('The text was long; only the first part was read.');
  for (const r of notes.repairs) notices.push(`Read “${r.from}” as “${r.to}”.`);
  if (notes.foreign) return { status: 'abstained', items: [{ domain: 'all', group: R, text: 'The text is not in English, or contains words this checker does not read, so nothing was scored. Write the impression in English to use this check.', quotes: [] }], notices };
  if (claims.length === 0) return { status: 'abstained', items: [{ domain: 'all', group: R, text: 'No interpretation statements could be recognized, so nothing was scored. This checker reads short statements about pattern, severity, bronchodilator response, lung volumes, diffusing capacity and test quality.', quotes: [] }], notices };

  const items = [];
  const mine = claims.filter((c) => c.attribution === 'self');
  const theirs = claims.filter((c) => c.attribution === 'other');
  const demote = (domain) => notes.injection || notes.truncated || notes.unread.has(domain) || (domain === 'severity' && notes.numericFev1);

  // statements about TLC when no TLC was reported are checked with the lung volumes, and kept out of the pattern comparison
  const isTlc = (c) => c.domain === 'pattern' && (c.scope === 'tlc' || c.scope === 'vol');
  const pattern = mine.filter((c) => c.domain === 'pattern' && (rubric.volumes.measured || !isTlc(c)));
  const volumes = mine.filter((c) => c.domain === 'volumes' || (!rubric.volumes.measured && isTlc(c)));

  patternItem(items, pattern, theirs, rubric, notes, demote, volumes.filter((c) => solid(c) && (c.value === 'absent' || c.value === 'needed')));
  severityItem(items, mine, theirs, rubric, notes, demote, pattern);
  bdItem(items, mine.filter((c) => c.domain === 'bd'), theirs.filter((c) => c.domain === 'bd'), rubric, demote);
  dlcoItem(items, mine.filter((c) => c.domain === 'dlco'), theirs.filter((c) => c.domain === 'dlco'), rubric, demote, notes);
  volumesItem(items, volumes, mine.filter((c) => c.domain === 'pattern' && c.certainty !== 'asserted' && c.certainty !== 'soft' && c.value === 'restriction'), rubric, demote);
  qualityItem(items, mine.filter((c) => c.domain === 'quality'), theirs.filter((c) => c.domain === 'quality'), rubric, demote);
  // conservative on attribution: when the text also gives the report's or the technologist's reading of a domain and it differs from the trainee's own,
  // the two cannot be separated reliably, so neither is scored
  for (const i of items) {
    if (i.group !== C && i.group !== X) continue;
    const mineVals = new Set(mine.filter((c) => c.domain === i.domain && solid(c)).map((c) => c.value));
    const theirVals = theirs.filter((c) => c.domain === i.domain).map((c) => c.value);
    if (theirVals.some((v) => !mineVals.has(v))) { i.group = R; i.text = `${i.text.split(':')[0]}: the text also gives the report’s or the technologist’s reading, and it differs from yours, so nothing here was scored.`; }
  }
  if (notes.corrections) {
    // a credited statement next to an unresolved one under a correction word ("Obstruction. Actually no, normal.") cannot be told from its own retraction
    for (const i of items) if (i.group === C && claims.some((c) => c.attribution === 'self' && c.certainty === 'unresolved' && (c.domain === i.domain || c.scope === 'elided'))) { i.group = R; i.text = `${i.text.split(':')[0]}: a statement here may have been corrected or retracted later in the text, so it was not scored.`; }
  }
  if (notes.corrections) {
    // a correction word means the last statement may be the one meant: never call anything contradictory then
    for (const i of items) if (i.group === X) { i.group = R; i.text = `${i.text.split(':')[0]}: a correction word appears (such as “actually” or “scratch that”), so it cannot be told which statement stands; this was not scored.`; }
  }
  return { status: 'graded', items, notices };
}

// ---------- pattern ----------

function flagsOf(cs) {
  const f = { obs: [], nobs: [], res: [], nres: [], mixed: [], normal: [], spiroNormal: [], prism: [], nsp: [], abnormal: [], lowFvc: [], notInterp: [] };
  const map = { obstruction: 'obs', 'no-obstruction': 'nobs', 'ratio-normal': 'nobs', restriction: 'res', 'no-restriction': 'nres', mixed: 'mixed', normal: 'normal', 'spiro-normal': 'spiroNormal', prism: 'prism', nonspecific: 'nsp', abnormal: 'abnormal', 'low-fvc': 'lowFvc', 'low-fev1': 'lowFvc', 'not-interpretable': 'notInterp' };
  for (const c of cs) { const k = map[c.value]; if (k) f[k].push(c); }
  return f;
}

function stance(f) {
  if (f.mixed.length || (f.obs.length && f.res.length)) return 'mixed';
  if (f.obs.length) return 'obstruction';
  if (f.res.length) return 'restriction';
  // an explicit label outranks the normal inferred from "no obstruction and no restriction"
  if (f.prism.length) return 'prism';
  if (f.nsp.length) return 'nonspecific';
  if (f.normal.length || (f.nobs.length && f.nres.length && !f.lowFvc.length)) return 'normal';
  return null;
}

/** Verdict of the pattern statements against one key value. */
function verdict(key, f) {
  const L = stance(f);
  const has = (k) => f[k].length > 0;
  switch (key) {
    case 'obstruction': case 'obstruction-low-fvc':
      if (L === 'obstruction') return C;
      if (L) return X;
      if (has('nobs') || has('spiroNormal')) return X;
      return has('abnormal') ? R : M;
    case 'restriction':
      if (L === 'restriction') return C;
      if (L === 'prism') return R;
      if (L) return X;
      if (has('nres')) return X;
      return has('abnormal') ? R : M;
    case 'mixed':
      if (L === 'mixed') return C;
      if (has('nres') || has('nobs')) return X; // an explicit "no restriction" or "no obstruction" denies one half of the key
      if (L === 'obstruction' || L === 'restriction') return M;
      if (L) return X;
      if (has('nobs') || has('nres')) return X;
      return has('abnormal') ? R : M;
    case 'normal':
      if (L === 'normal') return C;
      if (L) return X;
      if (has('spiroNormal')) return C;
      if (has('abnormal')) return X;
      return has('nobs') || has('nres') ? R : M;
    case 'nonspecific':
      if (L === 'nonspecific') return C;
      if (!L && has('lowFvc') && has('nobs') && has('nres')) return C; // a low FVC with a normal ratio and no restriction is the definition
      if (L === 'prism') return R;
      if (L) return X;
      if (has('spiroNormal')) return X;
      return has('abnormal') || has('lowFvc') ? R : M;
    case 'prism':
      if (L === 'prism') return C;
      if (!L && has('lowFvc') && has('nobs')) return has('nres') ? R : C; // "no restriction" cannot be established without TLC
      if (L === 'nonspecific') return R;
      if (L) return X;
      if (has('spiroNormal')) return X;
      return has('abnormal') || has('lowFvc') ? R : M;
    case 'indeterminate':
      return has('notInterp') ? C : R;
    default: return R;
  }
}

function patternItem(items, cs, theirs, rubric, notes, demote, limitClaims = []) {
  const domain = 'pattern';
  const solidCs = cs.filter(solid);
  const unc = cs.filter((c) => !solid(c));
  const f = flagsOf(solidCs);
  const L = stance(f);
  // the trainee contradicts themselves
  const conflicts = [
    [f.obs, f.nobs], [f.res, f.nres], [f.normal, f.obs], [f.normal, f.res], [f.normal, f.mixed], [f.normal, f.prism], [f.normal, f.abnormal], [f.mixed, f.nobs], [f.mixed, f.nres], [f.prism, f.nsp],
  ].find(([a, b]) => a.length && b.length);
  if (conflicts) {
    // the text commits to two incompatible statements: neither is credited and none is held against the trainee
    items.push({ domain, group: R, text: `${LABEL[domain]}: the text states incompatible patterns (for example both an obstruction and no obstruction), so it cannot be told which one is meant; this was not scored.`, quotes: quotes([...conflicts[0], ...conflicts[1]]) });
    return;
  }
  if (notes.corrections && f.obs.length && f.res.length && !f.mixed.length) {
    items.push({ domain, group: R, text: `${LABEL[domain]}: an obstructive and a restrictive statement appear with a correction word, so it cannot be told which one stands.`, quotes: quotes([...f.obs, ...f.res]) });
    return;
  }
  let v = verdict(rubric.pattern, f);
  const used = solidCs.filter((c) => !['lowFvc'].includes(c.value));
  let note;
  if (v !== C && rubric.patternOther && verdict(rubric.patternOther, f) === C) { v = C; note = `This matches the key under the other spirometry equation (${PATTERN_TEXT[rubric.patternOther]}); the pattern differs between GLI-2012 and GLI Global for this case, so it is accepted.`; }
  if (v === X && allSoft(used)) v = R;
  // the text asserts a pattern and, elsewhere, doubts or retracts the same one ("restriction confirmed ... cannot confirm restriction"): not a stable statement
  if (v === X && limitClaims.length && (rubric.pattern === 'prism' || rubric.pattern === 'obstruction-low-fvc')) {
    items.push({ domain, group: R, text: `${LABEL[domain]}: the text states a pattern and also says lung volumes are missing or needed, so it cannot be told whether the pattern is meant as confirmed; this was not scored.`, quotes: quotes([...used, ...limitClaims]) });
    return;
  }
  if (v === X && unc.some((c) => used.some((u) => u.value === c.value))) {
    items.push({ domain, group: R, text: `${LABEL[domain]}: the text both states and doubts the same pattern, so it cannot be told which is meant; this was not scored.`, quotes: quotes([...used, ...unc.filter((c) => used.some((u) => u.value === c.value))]) });
    return;
  }
  const q = quotes(used.length ? used : []);
  if (v === C) {
    // credit is withheld, not reversed, when the same text hedges a different pattern ("likely reflects restriction") or says lung volumes are needed although TLC was reported:
    // blind adjudication of these phrasings called them uncertain. The exception is the ideal answer when volumes are missing: a limit that names the missing volumes.
    const namedLimit = !rubric.volumes.measured && rubric.volumes.limitationExpected && limitClaims.length > 0;
    const hedgedOther = unc.filter((c) => c.certainty === 'hedged' && !used.some((u) => u.value === c.value) && ['obstruction', 'restriction', 'mixed', 'normal', 'prism', 'nonspecific'].includes(c.value));
    const volumesMisread = rubric.volumes.measured && limitClaims.length > 0;
    if ((hedgedOther.length && !namedLimit) || volumesMisread) {
      const why = volumesMisread ? 'the text says lung volumes are needed, but TLC was reported for this case' : 'the text also doubts or guesses at a different pattern';
      items.push({ domain, group: R, text: `${LABEL[domain]}: ${PATTERN_TEXT[rubric.pattern]} is stated, but ${why}, so it was not scored.`, quotes: quotes([...used, ...hedgedOther, ...(volumesMisread ? limitClaims : [])]) });
      return;
    }
    items.push({ domain, group: C, text: `${LABEL[domain]}: ${PATTERN_TEXT[note ? rubric.patternOther : rubric.pattern]} stated.`, quotes: q, note });
    return;
  }
  if (v === X) {
    const extra = rubric.pattern === 'obstruction-low-fvc' || rubric.pattern === 'prism' ? ' Lung volumes were not reported, so restriction or a mixed pattern cannot be established.' : '';
    items.push({ domain, group: X, text: `${LABEL[domain]}: this does not match the key, which is ${PATTERN_TEXT[rubric.pattern]}.${extra}`, quotes: q });
    return;
  }
  if (v === M && unc.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: the pattern was stated with uncertainty or as a condition, so it was not scored.`, quotes: quotes(unc) }); return; }
  if (v === M && theirs.length && !solidCs.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: the pattern is attributed to the report or the technologist; state your own reading.`, quotes: quotes(theirs) }); return; }
  if (v === M) {
    if (demote(domain)) items.push({ domain, group: R, text: `${LABEL[domain]}: part of the text could not be read, so the pattern could not be confirmed as missing.`, quotes: [] });
    else if (rubric.pattern === 'mixed' && L) items.push({ domain, group: M, text: `${LABEL[domain]}: the key is mixed obstruction and restriction; the ${L === 'obstruction' ? 'restrictive' : 'obstructive'} component was not stated.`, quotes: q });
    else items.push({ domain, group: M, text: `${LABEL[domain]}: not stated. The key is ${PATTERN_TEXT[rubric.pattern]}.`, quotes: [] });
    return;
  }
  // review
  const why = rubric.pattern === 'indeterminate' ? 'The key for this case is not interpretable; other patterns were not scored.' : (f.abnormal.length && !L) ? '“Abnormal” alone does not name a pattern.' : v === R && (L === 'prism' || L === 'nonspecific') ? 'PRISm and nonspecific differ by whether lung volumes were measured; the label was not scored against this key.' : 'The wording could not be matched to a pattern with certainty.';
  items.push({ domain, group: R, text: `${LABEL[domain]}: ${why}`, quotes: quotes(used.length ? used : unc) });
}

// ---------- severity ----------

const OBS_SCOPE = new Set(['obs', 'fev1', 'ratio', 'defect', 'spiro', 'study', 'unbound']);
const OTHER_SCOPE = new Set(['res', 'mix', 'tlc', 'vol']);

function severityItem(items, mine, theirs, rubric, notes, demote, patternClaims) {
  const domain = 'severity';
  const sev = mine.filter((c) => c.domain === 'severity');
  const s = rubric.severity;
  // a severity word attached to restriction, a mixed pattern or TLC is not graded by the key
  const offScope = sev.filter((c) => OTHER_SCOPE.has(c.scope));
  if (offScope.length && !(s.applicable && sev.some((c) => OBS_SCOPE.has(c.scope)))) {
    items.push({ domain, group: R, text: `${LABEL[domain]}: severity is graded here by the FEV₁ z-score for obstruction only; a severity attached to restriction, a mixed pattern or lung volumes was not scored.`, quotes: quotes(offScope) });
    if (!sev.some((c) => OBS_SCOPE.has(c.scope))) return;
  }
  if (!s.applicable) return;
  let cs = sev.filter((c) => OBS_SCOPE.has(c.scope));
  // an unattached severity word counts only when the trainee also names an obstruction
  const names = flagsOf(patternClaims.filter(solid));
  cs = cs.filter((c) => c.scope !== 'unbound' || names.obs.length || names.mixed.length);
  const solidCs = cs.filter(solid);
  const unc = cs.filter((c) => !solid(c));
  const STANDARD = (v) => ['mild', 'moderate', 'severe', 'fev1-normal'].includes(v) || v.startsWith('range:');
  let values = [...new Set(solidCs.map((c) => c.value))];
  if (values.some(STANDARD)) values = values.filter(STANDARD);
  const q = quotes(solidCs.filter((c) => values.includes(c.value)));
  if (values.length > 1) {
    items.push({ domain, group: R, text: `${LABEL[domain]}: the text gives more than one severity, so it cannot be told which is meant; this was not scored.`, quotes: q });
    return;
  }
  if (values.length === 0) {
    if (unc.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: severity was stated with uncertainty or as a condition, so it was not scored.`, quotes: quotes(unc) }); return; }
    if (!s.graded) return; // the key does not grade this obstruction; silence is acceptable
    if (demote(domain)) { items.push({ domain, group: R, text: `${LABEL[domain]}: a severity wording or a number could not be read, so it could not be confirmed as missing.`, quotes: [] }); return; }
    const o = theirs.filter((c) => c.domain === 'severity');
    if (o.length) items.push({ domain, group: R, text: `${LABEL[domain]}: severity is attributed to the report or the technologist; state your own reading.`, quotes: quotes(o) });
    else items.push({ domain, group: M, text: `${LABEL[domain]}: not stated. The key is ${SEVERITY_WORD[s.key]}.`, quotes: [] });
    return;
  }
  const value = values[0];
  if (value.startsWith('range:')) {
    const ends = value.slice(6).split('-');
    const exact = s.accepted.length === 2 && ends.every((e) => s.accepted.includes(e));
    items.push(exact ? { domain, group: C, text: `${LABEL[domain]}: ${ends.join(' to ')}; both bands are accepted for this z-score.`, quotes: q } : { domain, group: R, text: `${LABEL[domain]}: a range of severities was not scored; give one band.`, quotes: q });
    return;
  }
  if (!['mild', 'moderate', 'severe', 'fev1-normal'].includes(value)) {
    items.push({ domain, group: R, text: `${LABEL[domain]}: the 2022 grading uses mild, moderate and severe by the FEV₁ z-score; other wording was not scored.`, quotes: q });
    return;
  }
  if (value === 'fev1-normal' && !(names.obs.length || names.mixed.length)) {
    items.push({ domain, group: R, text: `${LABEL[domain]}: FEV₁ within normal limits is stated, but no obstruction is stated alongside it, so the severity was not scored.`, quotes: q });
    return;
  }
  if (s.accepted.includes(value)) {
    items.push({ domain, group: C, text: `${LABEL[domain]}: ${SEVERITY_WORD[value]} stated.`, quotes: q, note: value !== s.key ? 'The z-score is at a cut point of the 2022 scale, so the adjacent band is accepted.' : undefined });
    return;
  }
  if (s.other && value === s.other) {
    items.push({ domain, group: C, text: `${LABEL[domain]}: ${SEVERITY_WORD[value]} stated.`, quotes: q, note: 'This matches the key under the other spirometry equation; it is accepted.' });
    return;
  }
  if (allSoft(solidCs)) { items.push({ domain, group: R, text: `${LABEL[domain]}: the wording is tentative and differs from the key, so it was not scored.`, quotes: q }); return; }
  const why = s.key === 'fev1-normal' ? 'FEV₁ is within normal limits here, so the 2022 scale defines no severity grade.' : value === 'fev1-normal' ? 'FEV₁ is below the lower limit of normal here and is graded.' : `The key is ${SEVERITY_WORD[s.key]}.`;
  items.push({ domain, group: X, text: `${LABEL[domain]}: ${why}`, quotes: q });
}

// ---------- bronchodilator ----------

function bdItem(items, cs, theirs, rubric, demote) {
  const domain = 'bd';
  const b = rubric.bd;
  const solidCs = cs.filter(solid);
  const unc = cs.filter((c) => !solid(c));
  const q = quotes(solidCs);
  const rule = solidCs.filter((c) => c.tags?.rule);
  const values = [...new Set(solidCs.map((c) => c.value))];
  if (!b.performed && !solidCs.length && !unc.length) return; // nothing to say, nothing expected
  if (values.length > 1) { items.push({ domain, group: R, text: `${LABEL[domain]}: the text gives incompatible bronchodilator statements, so it was not scored.`, quotes: q }); return; }
  if (values.length === 0) {
    if (unc.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: ${unc.some((c) => c.value === 'ambiguous-none') ? 'it is unclear whether “no bronchodilator” means no response or no test; say which.' : 'stated with uncertainty or as a condition, so it was not scored.'}`, quotes: quotes(unc) }); return; }
    if (!b.performed) return;
    if (!b.key) return; // performed, but no 2022 result could be reported
    if (theirs.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: attributed to the report or the technologist; state your own reading.`, quotes: quotes(theirs) }); return; }
    if (demote(domain)) { items.push({ domain, group: R, text: `${LABEL[domain]}: part of the text could not be read, so it could not be confirmed as missing.`, quotes: [] }); return; }
    items.push({ domain, group: M, text: `${LABEL[domain]}: not mentioned. The key is a ${BD_WORD[b.key]} response by the 2022 rule.`, quotes: [] });
    return;
  }
  const v = values[0];
  if (rule.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: the key uses the 2022 rule (a change above 10% of the predicted value); a statement under another rule was not scored.`, quotes: quotes(rule) }); return; }
  if (v === 'unresolved' || v === 'ambiguous-none') { items.push({ domain, group: R, text: `${LABEL[domain]}: the wording could not be read as a result or as a missing test.`, quotes: q }); return; }
  if (!b.performed) {
    if (v === 'not-performed') return; // true, and not required
    // "no response" can be loose wording for "no study"; a positive response where no study exists is plainly wrong
    items.push(v === 'not-significant' ? { domain, group: R, text: `${LABEL[domain]}: no post-bronchodilator study is in this report; “no response” may mean no study, so it was not scored. Say that no bronchodilator was given.`, quotes: q } : { domain, group: X, text: `${LABEL[domain]}: no post-bronchodilator study is in this report, so there is no response to state.`, quotes: q });
    return;
  }
  if (!b.key) { items.push({ domain, group: R, text: `${LABEL[domain]}: a post-bronchodilator study exists but its change could not be reported by the 2022 rule, so this statement was not scored.`, quotes: q }); return; }
  if (v === 'not-performed') { items.push({ domain, group: X, text: `${LABEL[domain]}: a post-bronchodilator study was performed in this report.`, quotes: q }); return; }
  if (v === b.key) { items.push({ domain, group: C, text: `${LABEL[domain]}: ${v === 'significant' ? 'a significant' : 'no significant'} response stated.`, quotes: q }); return; }
  if (b.other && v === b.other) { items.push({ domain, group: C, text: `${LABEL[domain]}: ${v === 'significant' ? 'a significant' : 'no significant'} response stated.`, quotes: q, note: 'This matches the key under the other spirometry equation; it is accepted.' }); return; }
  items.push(allSoft(solidCs) ? { domain, group: R, text: `${LABEL[domain]}: the wording is tentative and differs from the key, so it was not scored.`, quotes: q } : { domain, group: X, text: `${LABEL[domain]}: the key is a ${BD_WORD[b.key]} response by the 2022 rule.`, quotes: q });
}

// ---------- diffusing capacity ----------

function dlcoItem(items, cs, theirs, rubric, demote, notes_) {
  const domain = 'dlco';
  const d = rubric.dlco;
  const solidCs = cs.filter(solid);
  const unc = cs.filter((c) => !solid(c));
  if (!d.performed && !solidCs.length && !unc.length) return;
  // the scored reference is the hemoglobin-adjusted DLCO; a reading tied to a carboxyhemoglobin correction is not scored
  if (notes_.hbNegated && solidCs.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: the text says the diffusing capacity was not adjusted for hemoglobin; the scored reference is the hemoglobin-adjusted value, so this was not scored.`, quotes: quotes(solidCs) }); return; }
  const cohb = solidCs.filter((c) => c.tags?.cohb);
  if (cohb.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: the scored reference is the hemoglobin-adjusted DLCO; a reading based on a carboxyhemoglobin correction was not scored.`, quotes: quotes(cohb) }); return; }
  const hbClaims = solidCs.filter((c) => c.tags?.hb);
  if (hbClaims.length && d.performed && !d.hbKnown) { items.push({ domain, group: R, text: `${LABEL[domain]}: no hemoglobin was available for this report, so a hemoglobin-adjusted reading cannot be matched to the key.`, quotes: quotes(hbClaims) }); return; }
  const values = [...new Set(solidCs.map((c) => (c.value === 'not-reduced' ? 'not-reduced' : c.value)))];
  const q = quotes(solidCs);
  if (values.length > 1) {
    const incompatible = !(values.length === 2 && values.includes('not-reduced') && values.includes('normal'));
    if (incompatible) { items.push({ domain, group: R, text: `${LABEL[domain]}: the text gives incompatible diffusing capacity statements, so it was not scored.`, quotes: q }); return; }
  }
  if (values.length === 0) {
    if (unc.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: stated with uncertainty, attributed elsewhere or not readable, so it was not scored.`, quotes: quotes(unc) }); return; }
    if (!d.performed || !d.key) return;
    if (theirs.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: attributed to the report or the technologist; state your own reading.`, quotes: quotes(theirs) }); return; }
    if (demote(domain)) { items.push({ domain, group: R, text: `${LABEL[domain]}: part of the text could not be read, so it could not be confirmed as missing.`, quotes: [] }); return; }
    items.push({ domain, group: M, text: `${LABEL[domain]}: not mentioned. The key is ${d.key} (hemoglobin-adjusted).`, quotes: [] });
    return;
  }
  const v = values.includes('normal') ? 'normal' : values[0];
  if (!d.performed) {
    if (v === 'not-performed') return;
    items.push({ domain, group: X, text: `${LABEL[domain]}: no diffusing capacity was performed for this report.`, quotes: q });
    return;
  }
  if (!d.key) { items.push({ domain, group: R, text: `${LABEL[domain]}: a diffusing capacity exists but could not be classified, so this statement was not scored.`, quotes: q }); return; }
  if (v === 'not-performed') { items.push({ domain, group: X, text: `${LABEL[domain]}: a diffusing capacity was performed in this report.`, quotes: q }); return; }
  if (v === 'abnormal' || v === 'unresolved-dlco' || v === 'unresolved') {
    items.push(d.key === 'normal' && v === 'abnormal' && !allSoft(solidCs) ? { domain, group: X, text: `${LABEL[domain]}: the key is normal (hemoglobin-adjusted).`, quotes: q } : { domain, group: R, text: `${LABEL[domain]}: “abnormal” or an unresolved wording does not say reduced or raised, so it was not scored.`, quotes: q });
    return;
  }
  if (v === 'not-reduced') {
    if (d.key === 'normal') items.push({ domain, group: C, text: `${LABEL[domain]}: not reduced; the key is normal.`, quotes: q });
    else if (d.key === 'raised') items.push({ domain, group: R, text: `${LABEL[domain]}: “not reduced” does not say whether it is normal or raised, so it was not scored.`, quotes: q });
    else items.push(allSoft(solidCs) ? { domain, group: R, text: `${LABEL[domain]}: tentative wording that differs from the key was not scored.`, quotes: q } : { domain, group: X, text: `${LABEL[domain]}: the key is reduced (hemoglobin-adjusted).`, quotes: q });
    return;
  }
  if (v === d.key) { items.push({ domain, group: C, text: `${LABEL[domain]}: ${v} stated.`, quotes: q }); return; }
  items.push(allSoft(solidCs) ? { domain, group: R, text: `${LABEL[domain]}: tentative wording that differs from the key was not scored.`, quotes: q } : { domain, group: X, text: `${LABEL[domain]}: the key is ${d.key} (hemoglobin-adjusted).`, quotes: q });
}

// ---------- lung volumes ----------

function volumesItem(items, cs, uncertainRestriction, rubric, demote) {
  const domain = 'volumes';
  const v = rubric.volumes;
  const solidCs = cs.filter(solid);
  const unc = cs.filter((c) => !solid(c));
  const absent = solidCs.filter((c) => c.value === 'absent' || c.value === 'needed');
  const high = cs.filter((c) => c.value === 'tlc-high'); // asserted or conditional: hyperinflation, air trapping and a high TLC are separate findings and none is scored
  const tlcStated = solidCs.filter((c) => c.domain === 'pattern');
  if (high.length) items.push({ domain, group: R, text: `${LABEL[domain]}: hyperinflation, air trapping and a high TLC were not scored in this version (they are separate findings, and their definitions are not yet verified against the statement)${high.every((c) => !solid(c)) ? '; this one was also stated as a condition' : ''}.`, quotes: quotes(high) });
  if (!v.measured) {
    if (tlcStated.length) { items.push({ domain, group: X, text: `${LABEL[domain]}: no TLC was reported for this case, so a TLC statement cannot be correct.`, quotes: quotes(tlcStated) }); return; }
    if (!v.limitationExpected) return;
    if (absent.length) { items.push({ domain, group: C, text: `${LABEL[domain]}: the missing lung volumes are named as a limit on the pattern.`, quotes: quotes(absent) }); return; }
    if (unc.length || uncertainRestriction.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: restriction is mentioned as uncertain; say that lung volumes (TLC) are needed to settle it.`, quotes: quotes([...unc, ...uncertainRestriction]) }); return; }
    if (demote(domain)) return;
    items.push({ domain, group: M, text: `${LABEL[domain]}: lung volumes were not measured; the limit this places on the pattern (restriction cannot be confirmed) was not stated.`, quotes: [] });
    return;
  }
  if (absent.length) items.push({ domain, group: X, text: `${LABEL[domain]}: TLC was reported for this case, so lung volumes were not missing.`, quotes: quotes(absent) });
}

// ---------- quality ----------

function qualityItem(items, cs, theirs, rubric, demote) {
  const domain = 'quality';
  const solidCs = cs.filter(solid);
  const unc = cs.filter((c) => !solid(c));
  const limited = solidCs.filter((c) => c.value === 'limited');
  const good = solidCs.filter((c) => c.value === 'good');
  if (rubric.quality.limited) {
    if (limited.length && !good.length) { items.push({ domain, group: C, text: `${LABEL[domain]}: a limit on the quality of the tests is stated.`, quotes: quotes(limited) }); return; }
    if (good.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: the quality was called acceptable, but at least one spirometry grade is D or worse; which test was meant could not be told, so it was not scored.`, quotes: quotes(good) }); return; }
    if (unc.length || theirs.length) { items.push({ domain, group: R, text: `${LABEL[domain]}: stated with uncertainty or attributed elsewhere, so it was not scored.`, quotes: quotes([...unc, ...theirs]) }); return; }
    if (demote(domain)) return;
    items.push({ domain, group: M, text: `${LABEL[domain]}: the quality limits the interpretation (a spirometry grade is D or worse); this was not stated.`, quotes: [] });
    return;
  }
  if (limited.length) items.push({ domain, group: R, text: `${LABEL[domain]}: a quality limit was stated; the spirometry grades here do not flag one, but other tests or maneuvers may, so it was not scored.`, quotes: quotes(limited) });
}

export { LABEL as DOMAIN_LABEL };
