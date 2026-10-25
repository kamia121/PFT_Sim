/**
 * Feedback for one item: the verdict, the key, and an explanation that opens on physiology. Teaching
 * text is reused from src/app/explain.js; the text for the generated items is new. Rules not yet
 * checked against their primary statement are flagged in the same words as on the learner page.
 * Values appear in tables, not in prose, and nothing here advises treatment.
 */
import { esc, num, MEASURES, EQUATION_NAMES, hbKnown, hbLow } from '../app/format.js';
import { PATTERN_TEXT, DLCO_TEXT, BD_TEXT, GRADE_TEXT, LOW_ERV_TEXT, bdArtifactText } from '../app/explain.js';
import { label as answerLabel, OTHER_EQUATION_LABEL } from '../app/answers.js';
import { PATTERNS } from '../interpret/interpret.js';
import * as R from '../app/render.js';
import { otherEquation } from './prepare.js';
import { CANDIDATE_LABELS } from './sensitivity.js';
import { ITEM_NAMES } from './items.js';

const STATUS = {
  correct: ['ok', 'Correct'],
  'other-equation': ['ok', 'Accepted: matches the other reference equation'],
  partial: ['miss', 'Partly correct'],
  incorrect: ['miss', 'Differs from the key'],
  unanswered: ['miss', 'Not answered'],
};

const paras = (arr) => arr.map((t) => `<p>${esc(t)}</p>`).join('');
const optLabel = (item, id) => item.options.find((o) => o.id === id)?.label ?? (id ? answerLabel(item.id, id) : '—');

function zTable(prep, names, title) {
  const rows = names.map((n) => {
    const x = prep.cmp.a.measures[n], y = prep.cmp.b.measures[n];
    if (!x || !y || x.available === false || y.available === false) return '';
    const flip = x.label !== y.label;
    return `<tr><th scope="row" class="l">${MEASURES[n].label}</th><td>${num(x.value, MEASURES[n].dp)}</td><td>${num(x.z, 2)}</td><td class="l">${x.label}${x.borderline ? ' (borderline)' : ''}</td><td>${num(y.z, 2)}</td><td class="l">${y.label}${y.borderline ? ' (borderline)' : ''}</td><td class="l">${flip ? `<span class="flag">${x.label} → ${y.label}</span>` : 'no change'}</td></tr>`;
  }).join('');
  if (!rows) return '';
  return `<div class="scroll"><table class="data"><caption>${esc(title)}</caption><thead><tr><th class="l">Measure</th><th>Value</th><th>z, GLI-2012</th><th class="l">Label</th><th>z, GLI Global</th><th class="l">Label</th><th class="l">Reclassified</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function explainPattern(item, prep) {
  const { a, b } = prep;
  const reason = a.patternReason === 'reference-unavailable' ? '<p>The spirometric pattern cannot be classified because a required reference is unavailable. Measured values and independently interpretable components are preserved; a missing FEV₁/FVC reference is not a normal ratio.</p>' : paras(PATTERN_TEXT[a.pattern] ?? []);
  const out = [`<h4>${esc(PATTERNS[a.pattern])}</h4>`, reason];
  if (a.pattern !== b.pattern) out.push(`<p><span class="flag">The pattern depends on the equation.</span> ${esc(EQUATION_NAMES[otherEquation(prep.equation)])} gives ${esc(PATTERNS[b.pattern])}, so either answer is accepted.</p>`);
  out.push(zTable(prep, ['fev1', 'fvc', 'fev1_fvc', 'tlc'], 'Values behind the pattern under both spirometry equations'));
  for (const f of a.flags) out.push(f.id === 'low-erv' ? `<p>${esc(LOW_ERV_TEXT)}</p>` : `<p><strong>${esc(f.text)}</strong> ${esc(f.verification ?? 'Source status unavailable')}</p>`);
  return out.join('');
}

function explainSeverity(item, prep) {
  const s = prep.a.severity;
  if (s?.scored) {
    const measure = s.measure === 'tlc' ? 'TLC' : 'FEV₁';
    const context = s.measure === 'tlc' ? 'TLC below its lower limit establishes restrictive impairment.' : 'FEV₁/FVC below its lower limit establishes obstruction, even when FEV₁ is within its reference range.';
    return `<p>${context} ${measure} grades the impairment: mild to z −2.5, moderate to −4.0, severe below. Continuous full-precision bins resolve the rounded prose of the 2022 standard (Figure 7), with the 2024 authors clarification (doi:10.1183/13993003.00055-2024).</p><p>The key band is <strong>${esc(s.id)}</strong> at a ${measure} z-score of ${num(s.z, 2)}. Physiological impairment is not overall disease severity.</p>`;
  }
  return '<p>No single composite grade is assigned here. FEV₁ grades obstruction, TLC grades restriction, and DLCO grades diffusion impairment. Interpret these components separately.</p>';

}

function explainGrade(item, prep, result, opts) {
  const which = item.id === 'gradeFev1' ? 'fev1' : 'fvc';
  const g = prep.caseData.report.grades[which];
  const rule = which === 'fev1'
    ? 'The FEV₁ is judged on its own: a maneuver counts toward the FEV₁ grade when its back-extrapolated volume is at or below 5% of the FVC or 0.100 L, whichever is greater, and there is no cough or glottic closure in the first second.'
    : 'The FVC is judged on its own: a maneuver counts toward the FVC grade when its back-extrapolated volume is within the same limit, there is no glottic closure at any time, and expiration ended with a plateau, a forced expiratory time of at least 15 s, or an FVC within 0.150 L of the largest FVC in the set.';
  return `<p>${esc(rule)} BEV and plateau equality follow the inclusive 2019 Table 7 convention; adjacent prose uses strict comparisons. A confirmed maximal post-expiratory FIVC exceeding FVC by more than the larger of 0.100 L or 5% of FVC invalidates acceptability of both values, while preserving potential usability. A missing or display-only inspiratory observation is not assessed and does not alone invalidate ordinary spirometry. The grade then depends on how many acceptable maneuvers exist and how far apart the two largest values lie, because repeatability is the check that the patient could reproduce the result.</p><p>Grade <strong>${g}</strong>: ${esc(GRADE_TEXT[g])}</p>
    <details><summary>Acceptability of each maneuver</summary>${R.renderManeuvers(prep.caseData.spirometry.pre, 'Pre-bronchodilator maneuvers with acceptability', { revealed: true, id: `${opts.idPrefix}key-maneuvers-${which}` })}</details>`;
}

function explainBd(item, prep) {
  const b = prep.a.bd;
  const c = prep.caseData;
  const rows = `<tr><th scope="row" class="l">2022 rule: change above 10% of predicted</th><td class="l">${b.rule2022.significant ? 'significant' : 'not significant'}</td></tr><tr><th scope="row" class="l">Earlier rule: at least 12% of baseline and 200 mL</th><td class="l">${b.rule2005.significant ? 'significant' : 'not significant'}</td></tr>`;
  const extra = c.groundTruth.bdVariant === 'volume' ? paras([BD_TEXT.volume]) : c.groundTruth.bdVariant === 'artifact' ? paras([bdArtifactText(b)]) : '';
  return `<p>${esc(BD_TEXT.rules)}</p><div class="scroll"><table class="data"><caption>Bronchodilator response under both rules</caption><tbody>${rows}</tbody></table></div>${extra}
    <p>The 2022 statement calls a change above 10% of the predicted value significant, a strict comparison as printed.${prep.cmp.bronchodilatorChanged ? ' Because the 2022 rule uses the predicted value, the result also changes with the spirometry equation.' : ''}</p>`;
}

function explainDlco(item, prep) {
  const d = prep.a.dlco, c = prep.caseData;
  if (!d) {
    if (prep.a.measures.dlco?.available === false) return '<p>The measured DLCO is preserved, but its reference is unavailable for this patient. No normal or abnormal diffusion classification can be assigned. Repeating an acceptable measurement does not resolve reference applicability; check the equation and supported age range.</p>';
    if (!c.report.dlco && !c.report.dlcoQuality) return '<p>DLCO was not performed; no diffusion classification is available.</p>';
    return '<p>DLCO is not reportable from this pending or unavailable acquisition session. Review the recorded maneuver criteria and missing observations before deciding whether repeat testing is needed; no normal or abnormal diffusion label can be assigned.</p>';
  }
  const known = hbKnown(c.dlco);
  const out = [`<p>${esc(known ? DLCO_TEXT[d.category] : DLCO_TEXT.unadjusted)}</p>`];
  if (d.subtype) out.push(`<p>${esc(DLCO_TEXT.subtype[d.subtype])}</p>`);
  if (hbLow(c.dlco.hbGdl)) out.push(`<p>${esc(DLCO_TEXT.hb)}</p>`);
  if (known) out.push('<p class="note">The hemoglobin adjustment follows the 2017 ERS/ATS standard, equations 31 and 32, with Hb in g/dL. The reciprocal measured-value adjustment is equivalent to adjusting the predicted reference; do not apply both.</p>');
  if (d.severity) out.push(`<p>Diffusion impairment is ${esc(d.severity)} by the DLCO z-score (2022 Figure 7 and the 2024 authors clarification). This grades physiological impairment, not overall disease severity.</p>`);
  return out.join('');
}

function explainLimitations(item, prep, result) {
  const opts = item.explain?.options ?? [];
  const truth = opts.filter((o) => o.truth && o.id !== 'none');
  const decoys = opts.filter((o) => !o.truth && o.id !== 'none');
  const picked = new Set(Array.isArray(result.response) ? result.response : []);
  const li = (o, extra = '') => `<li>${picked.has(o.id) ? '<strong>Selected: </strong>' : ''}${esc(o.text)}${extra}</li>`;
  const intro = '<p>A careful interpretation states what the data cannot support as well as what they show. Quality problems, borderline values near a limit, tests that were not done, and reference populations that represent the patient less well each change how firmly a classification can be stated. Each statement offered is true in general; it applies to this case only when the fact it names is present in the chart.</p>';
  if (!truth.length) return `${intro}<p>No qualifying statement applies to this case, so “none of these” is the key. Each statement offered describes a limitation that is absent here:</p><ul>${decoys.map((o) => li(o, o.why ? ` <span class="muted">${esc(o.why)}</span>` : '')).join('')}</ul>`;
  return `${intro}<h4>Statements that apply</h4><ul>${truth.map((o) => li(o, o.weight === 2 ? ' <span class="muted">(major)</span>' : '')).join('')}</ul>${decoys.length ? `<h4>Statements that do not apply</h4><ul>${decoys.map((o) => li(o, o.why ? ` <span class="muted">${esc(o.why)}</span>` : '')).join('')}</ul>` : ''}`;
}

function explainFinal(item, prep, result) {
  const opts = item.explain.options;
  const key = opts.find((o) => o.truth);
  const picked = result.response;
  return `<p>A final interpretation states the quality of the study, the pattern and its severity, the gas-transfer and bronchodilator findings where they were measured, and how firmly the classification can be held. Each wrong statement below differs from the key by one error.</p>
    <blockquote class="keystatement">${esc(key.text)}</blockquote>
    <h4>What is wrong with the other statements</h4><ul>${opts.filter((o) => !o.truth).map((o) => `<li>${picked === o.id ? '<strong>Your choice. </strong>' : ''}${esc(o.flaw)}<br><span class="muted">${esc(o.text)}</span></li>`).join('')}</ul>`;
}

function explainSensitivity(item, prep) {
  const ex = item.explain;
  const wrong = ex.options.filter((o) => !o.truth);
  const reasons = {
    weight: 'Weight and body mass index are not inputs to the GLI spirometry equations, which use age, sex, height and, for GLI-2012, the group.',
    smoking: 'Smoking status is not an input to any GLI equation.',
    hb: 'Hemoglobin adjusts the measured DLCO and does not enter the spirometry reference.',
    'bd-rule': 'The bronchodilator criterion changes the response label and not the spirometry classification.',
    'height-rounding': 'A 1 cm change in height does not change a spirometry label in this case.',
  };
  const lines = wrong.map((o) => `<li>${esc(o.text)}: ${esc(reasons[o.sem] ?? 'it does not change a spirometry label in this case.')}</li>`).join('');
  const correctText = ex.correctSem === 'equation'
    ? 'GLI-2012 uses coefficients specific to the group on the requisition, whereas GLI Global is a single composite across groups. For the same measured FEV₁ or FVC the predicted value and the lower limit of normal therefore differ, and a value close to the limit can fall on either side of it. The change is in the reference, not in the lung.'
    : `${CANDIDATE_LABELS[ex.correctSem]} changes a spirometry classification more than the choice of equation does, because it alters the predicted value and the lower limit that each measurement is compared with.`;
  return `<p>${esc(correctText)}</p>${zTable(prep, ['fev1', 'fvc', 'fev1_fvc'], 'Spirometry under both equations')}<h4>Why the other factors do not explain it</h4><ul>${lines}</ul>`;
}

const EXPLAINERS = { pattern: explainPattern, severity: explainSeverity, gradeFev1: explainGrade, gradeFvc: explainGrade, bronchodilator: explainBd, dlco: explainDlco, limitations: explainLimitations, final: explainFinal, sensitivity: explainSensitivity };

const show = (item, v) => (Array.isArray(v) ? (v.length ? v.map((x) => esc(optLabel(item, x))).join('; ') : '—') : esc(optLabel(item, v)));

/**
 * @param {object} item item with key and explain
 * @param {object} prep
 * @param {ReturnType<import('./scoring.js').scoreItem>} result
 */
export function feedbackHtml(item, prep, result, opts = {}) {
  const o = { idPrefix: '', ...opts };
  const [cls, base] = STATUS[result.status] ?? STATUS.incorrect;
  const text = result.status === 'other-equation' ? (OTHER_EQUATION_LABEL[item.key.altEquation] ?? base) : base;
  const pts = result.status === 'unanswered' ? '' : ` (${num(result.score, result.score % 1 ? 2 : 0)} of 1)`;
  const detail = result.detail
    ? `<p class="muted">You selected ${num(result.detail.recall * 100, 0)}% of the applicable statements (weighted) and ${num(result.detail.falseRate * 100, 0)}% of the statements that do not apply. The score is the first share minus the second, and not below 0, so selecting every statement scores 0.</p>` : '';
  const key = item.key.correct;
  const alt = (item.key.alt ? `<span class="muted"> (other equation: ${esc(optLabel(item, item.key.alt))})</span>` : '')
    + (item.key.also?.length ? `<span class="muted"> (also accepted, the z-score being at a cut point: ${item.key.also.map((a) => esc(optLabel(item, a))).join(', ')})</span>` : '');
  const body = EXPLAINERS[item.id]?.(item, prep, result, o) ?? '';
  const lines = item.id === 'limitations' || item.id === 'final' ? '' : `<p>Your answer: ${show(item, result.response ?? '')}</p><p>Key: <strong>${show(item, key)}</strong>${alt}</p>`;
  return `<div class="feedback"><p><span class="${cls}">${text}${pts}</span></p>${lines}${detail}${body}</div>`;
}

export { ITEM_NAMES };
