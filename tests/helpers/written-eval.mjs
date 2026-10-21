/**
 * Evaluation harness for the written-impression grader: abstract rubrics for the six held-out scenarios, and the comparison of the grader's
 * verdicts with the gold labels of the frozen held-out set (tests/fixtures/written/heldout.json, written by a separate agent that never saw the code).
 */
import { extractClaims } from '../../src/written/extract.js';
import { evaluate } from '../../src/written/evaluate.js';

const base = (o) => ({
  equation: 'GLIglobal', pattern: 'normal', patternOther: null,
  severity: { applicable: false, key: null, graded: false, accepted: [], other: null },
  bd: { performed: false, key: null, other: null },
  dlco: { performed: false, key: null, other: null, hbKnown: true },
  volumes: { measured: true, limitationExpected: false },
  quality: { limited: false },
  ...o,
});

export const SCENARIOS = {
  S1: base({ pattern: 'obstruction', severity: { applicable: true, key: 'mild', graded: true, accepted: ['mild'], other: null }, bd: { performed: true, key: 'not-significant', other: null }, dlco: { performed: true, key: 'normal', other: null, hbKnown: true } }),
  S2: base({ pattern: 'obstruction-low-fvc', severity: { applicable: true, key: 'moderate', graded: true, accepted: ['moderate'], other: null }, bd: { performed: true, key: 'significant', other: null }, volumes: { measured: false, limitationExpected: true } }),
  S3: base({ pattern: 'restriction', dlco: { performed: true, key: 'reduced', other: null, hbKnown: true } }),
  S4: base({ pattern: 'normal', dlco: { performed: true, key: 'normal', other: null, hbKnown: true }, quality: { limited: true } }),
  S5: base({ pattern: 'prism', volumes: { measured: false, limitationExpected: true } }),
  S6: base({ pattern: 'obstruction', severity: { applicable: true, key: 'fev1-normal', graded: false, accepted: ['fev1-normal'], other: null }, bd: { performed: true, key: 'not-significant', other: null }, dlco: { performed: true, key: 'normal', other: null, hbKnown: true } }),
};

/** Rubrics of the seven scenarios of the second, unseen set (written before that set was run). */
Object.assign(SCENARIOS, {
  T1: base({ pattern: 'obstruction', severity: { applicable: true, key: 'moderate', graded: true, accepted: ['moderate'], other: null }, bd: { performed: true, key: 'significant', other: null }, dlco: { performed: true, key: 'reduced', other: null, hbKnown: true } }),
  T2: base({ pattern: 'obstruction', severity: { applicable: true, key: 'severe', graded: true, accepted: ['severe'], other: null }, bd: { performed: true, key: 'not-significant', other: null }, dlco: { performed: true, key: 'normal', other: null, hbKnown: true }, quality: { limited: true } }),
  T3: base({ pattern: 'prism', dlco: { performed: true, key: 'normal', other: null, hbKnown: true }, volumes: { measured: false, limitationExpected: true } }),
  T4: base({ pattern: 'mixed', bd: { performed: true, key: 'not-significant', other: null }, dlco: { performed: true, key: 'reduced', other: null, hbKnown: true } }),
  T5: base({ pattern: 'normal', dlco: { performed: true, key: 'normal', other: null, hbKnown: true } }),
  T6: base({ pattern: 'obstruction', severity: { applicable: true, key: 'fev1-normal', graded: false, accepted: ['fev1-normal'], other: null }, bd: { performed: true, key: 'significant', other: null }, dlco: { performed: true, key: 'normal', other: null, hbKnown: true } }),
  T7: base({ pattern: 'nonspecific', dlco: { performed: true, key: 'raised', other: null, hbKnown: true } }),
});

/** Verdict of one domain: the group of its item, or 'none'. */
export function verdicts(text, rubric) {
  const r = evaluate(extractClaims(text), rubric);
  const out = { status: r.status, pattern: 'none', severity: 'none', bd: 'none', dlco: 'none', quality: 'none', volumes: 'none' };
  for (const i of r.items) if (i.domain in out) out[i.domain] = i.group;
  if (r.status === 'abstained') for (const d of ['pattern', 'severity', 'bd', 'dlco', 'quality']) out[d] = 'review';
  return out;
}

/** Metrics over a set of {scenario, text, gold}. Domains: pattern, severity, bd, dlco, quality. */
export function evaluateSet(set) {
  const m = { n: set.length, judgments: 0, goldCorrect: 0, credited: 0, falseCredit: [], falseContradiction: [], falseMissing: [], missedCredit: 0, abstainOnClear: 0, goldClear: 0, reviewOnUnclear: 0, goldUnclear: 0, contradictionOnWrong: 0, goldWrong: 0 };
  for (const it of set) {
    const v = verdicts(it.text, SCENARIOS[it.scenario]);
    for (const d of ['pattern', 'severity', 'bd', 'dlco', 'quality']) {
      const gold = it.gold[d], mine = v[d];
      m.judgments++;
      if (gold === 'correct') { m.goldCorrect++; if (mine === 'correct') m.credited++; else m.missedCredit++; }
      if (mine === 'correct' && gold !== 'correct') m.falseCredit.push({ id: it.id, d, gold, text: it.text });
      if (mine === 'contradictory' && (gold === 'correct' || gold === 'uncertain' || gold === 'absent')) m.falseContradiction.push({ id: it.id, d, gold, text: it.text });
      if (mine === 'missing' && (gold === 'correct' || gold === 'wrong')) m.falseMissing.push({ id: it.id, d, gold, text: it.text });
      if (gold === 'wrong') { m.goldWrong++; if (mine === 'contradictory') m.contradictionOnWrong++; }
      if (gold === 'correct' || gold === 'wrong') { m.goldClear++; if (mine === 'review') m.abstainOnClear++; }
      if (gold === 'uncertain') { m.goldUnclear++; if (mine === 'review') m.reviewOnUnclear++; }
    }
  }
  return m;
}

/** Full confusion matrix of gold label (rows) by grader group (columns), with denominators. */
export function confusion(set) {
  const gold = ['correct', 'wrong', 'absent', 'uncertain'], mine = ['correct', 'contradictory', 'missing', 'review', 'none'];
  const t = Object.fromEntries(gold.map((g) => [g, Object.fromEntries(mine.map((x) => [x, 0]))]));
  for (const it of set) {
    const v = verdicts(it.text, SCENARIOS[it.scenario]);
    for (const d of ['pattern', 'severity', 'bd', 'dlco', 'quality']) t[it.gold[d]][v[d]]++;
  }
  return t;
}

export const summarize = (m) => ({
  items: m.n, judgments: m.judgments,
  falseCredit: m.falseCredit.length, falseContradiction: m.falseContradiction.length, falseMissing: m.falseMissing.length,
  creditRecall: `${m.credited}/${m.goldCorrect}`, contradictionRecall: `${m.contradictionOnWrong}/${m.goldWrong}`,
  abstainedOnClear: `${m.abstainOnClear}/${m.goldClear}`, reviewedOnUnclear: `${m.reviewOnUnclear}/${m.goldUnclear}`,
});
