/**
 * Built-in content used when the optional scenario and narrative modules are absent: neutral
 * intake notes, caveats and decoy caveats derived from the case, and a rule-based final-statement
 * generator. Nothing here changes a case value. Intake notes are neutral on purpose: a statement that
 * implied a medication, a preparation error or a technique problem would claim an effect that the
 * simulated measurements do not carry.
 */
import { shuffled, pick } from './shuffle.js';
import { PATTERNS } from '../interpret/interpret.js';

/** Twelve neutral intake notes, each with two equivalent phrasings. */
export const INTAKE_POOL = [
  ['Patient seated upright with nose clip in place; the maneuver was demonstrated before the first attempt.', 'The technologist demonstrated the maneuver; patient tested seated, nose clip on.'],
  ['No respiratory infection in the preceding four weeks, by patient report.', 'Patient denies a chest infection in the last month.'],
  ['No chest pain, recent eye, chest or abdominal surgery, or hemoptysis reported at intake.', 'Intake screen negative for chest pain, recent surgery and hemoptysis.'],
  ['Patient wore own dentures; mouthpiece seal maintained throughout.', 'Dentures left in place; no leak at the mouthpiece.'],
  ['English-speaking; no interpreter was required.', 'Instructions given in English; patient confirmed understanding.'],
  ['Patient rested seated for several minutes before the first maneuver.', 'A rest period preceded testing.'],
  ['Standing height measured barefoot with a stadiometer.', 'Height taken without shoes on a wall stadiometer.'],
  ['Weight measured on a calibrated scale.', 'Body weight recorded from a calibrated scale.'],
  ['Referral question: evaluation of respiratory symptoms.', 'Reason for testing recorded as a request for lung function assessment.'],
  ['Volume calibration check with a 3.00 L syringe passed at the start of the session.', 'Daily 3.00 L syringe check within tolerance.'],
  ['Ambient temperature and barometric pressure recorded; results reported at BTPS.', 'Room temperature and pressure logged; volumes expressed at BTPS.'],
  ['The patient was told that the grade reflects the consistency of the blows and not the health of the lungs.', 'Patient informed that the quality grade describes repeatability, not lung health.'],
];

const NOTE_COUNT = { none: 2, light: 2, moderate: 3, heavy: 4 };

/** @returns {{ id: string, category: string, text: string }[]} */
export function fallbackStatements(seed, level = 'none') {
  const count = NOTE_COUNT[level] ?? 2;
  const order = shuffled(INTAKE_POOL.map((_, i) => i), seed, 'quiz-intake');
  return order.slice(0, count).map((i) => ({ id: `fb-intake-${i + 1}`, category: 'intake', text: pick(INTAKE_POOL[i], seed, `quiz-intake-variant-${i}`) }));
}

const POOR = ['D', 'E', 'U', 'F'];
const hasFault = (set, f) => set.maneuvers.some((m) => m.faults.includes(f));

/** Facts about a prepared case that the caveat rules read. */
export function caseFacts(prep) {
  const { caseData: c, a, cmp } = prep;
  const pre = c.spirometry.pre, post = c.spirometry.post;
  const g = c.report.grades;
  const p = c.report.patient;
  const measures = Object.values(a.measures);
  return {
    pre, post,
    poorFev1: POOR.includes(g.fev1), poorFvc: POOR.includes(g.fvc),
    cough: hasFault(pre, 'cough'), early: hasFault(pre, 'early-termination'), slow: hasFault(pre, 'slow-start'), variable: hasFault(pre, 'variable-effort'),
    postEarly: post ? hasFault(post, 'early-termination') : false,
    bmi: p.weightKg / (p.heightCm / 100) ** 2,
    hb: c.dlco ? c.dlco.hbGdl : null,
    hasVolumes: Boolean(c.volumes), hasDlco: Boolean(c.dlco),
    europeanApplied: measures.some((m) => m.available !== false && m.matched === false),
    unavailable: measures.some((m) => m.available === false),
    equationFlip: cmp.labelChanges.length > 0 || cmp.patternChanged,
    borderline: ['fev1', 'fvc', 'fev1_fvc', 'tlc', 'dlco'].some((k) => a.measures[k]?.borderline),
    bdVariant: c.groundTruth.bdVariant ?? null,
  };
}

/**
 * Statements that limit or qualify this interpretation, and plausible statements that do not apply.
 * @returns {{ caveats: { id: string, text: string, weight: 'major'|'minor' }[], decoyCaveats: { id: string, text: string, why: string }[] }}
 */
export function fallbackCaveats(prep) {
  const f = caseFacts(prep);
  const { a, caseData: c } = prep;
  const caveats = [];
  const add = (cond, id, text, weight) => { if (cond) caveats.push({ id, text, weight }); };
  add(a.qualityLimited, 'fb-quality', 'The FEV₁ or FVC grade is D or poorer, so the reported values may understate what the patient can achieve and the classification is provisional until the test is repeated.', 'major');
  add(f.poorFvc && f.early, 'fb-early', 'Expiration that ended early lowers the FVC and raises the FEV₁/FVC ratio, so obstruction may be understated and a low FVC may not reflect lung volume.', 'major');
  add(f.poorFev1 && f.cough, 'fb-cough', 'A cough in the first second lowers the FEV₁ of the affected maneuvers, which weakens confidence in the FEV₁ and in the ratio.', 'minor');
  add(f.poorFev1 && f.slow, 'fb-slow', 'A slow start with a large back-extrapolated volume overstates the FEV₁, because the first second of the forced expiration begins late.', 'minor');
  add((f.poorFev1 || f.poorFvc) && f.variable, 'fb-variable', 'Variable effort between maneuvers means that the largest values may not be the patient’s maximal values.', 'minor');
  add(f.equationFlip, 'fb-equation', 'A spirometry classification changes between GLI-2012 and GLI Global, so a result close to the lower limit of normal depends on the reference equation chosen.', 'major');
  add(!f.equationFlip && f.borderline, 'fb-borderline', 'At least one value lies within 0.25 z-score units of a limit, where measurement variability alone can change the label.', 'minor');
  add(['prism', 'obstruction-low-fvc'].includes(a.pattern), 'fb-volumes-needed', 'Lung volumes were not measured, so a low FVC cannot be assigned to restriction or to air trapping.', 'major');
  add(!f.hasVolumes && !['prism', 'obstruction-low-fvc'].includes(a.pattern), 'fb-no-volumes', 'Lung volumes and diffusing capacity were not measured, so restriction and gas-transfer impairment are not assessed.', 'minor');
  add(f.europeanApplied, 'fb-european', 'The lung volume and diffusing capacity equations were derived in people of European ancestry and are applied to a patient of another group.', 'minor');
  add(f.hasDlco && f.hb < 11, 'fb-hb', 'The hemoglobin is low, which lowers the measured DLCO by itself; the interpretation rests on the hemoglobin-adjusted value.', 'minor');
  add(a.flags.some((x) => x.id === 'low-erv'), 'fb-erv', 'A low expiratory reserve volume with obesity reflects chest wall load; it qualifies the volumes and is not a pattern.', 'minor');
  add(Boolean(f.post) && f.bdVariant === 'artifact', 'fb-bd-artifact', 'The post-bronchodilator expirations ended early, so the fall in FVC and the apparent improvement in the ratio are technique effects and not a response.', 'major');
  add(Boolean(f.post) && f.bdVariant === 'volume', 'fb-bd-volume', 'The FVC rose more than the FEV₁ after the bronchodilator, a volume response that reflects air trapping and does not require the ratio to change.', 'minor');
  add(Boolean(a.bd) && !a.bd.rulesAgree && f.bdVariant === null, 'fb-bd-rules', 'The bronchodilator conclusion depends on the criterion: the 2022 rule (percent of predicted) and the earlier rule (percent of baseline) disagree.', 'minor');

  const decoys = [];
  const dec = (cond, id, text, why) => { if (cond) decoys.push({ id, text, why }); };
  dec(!f.cough, 'fb-d-cough', 'A cough in the first second invalidates the FEV₁ in this session.', 'No maneuver in the pre-bronchodilator set recorded a cough.');
  dec(!f.early, 'fb-d-early', 'Expiration that ended early lowers the FVC and raises the FEV₁/FVC ratio.', 'No pre-bronchodilator maneuver ended early.');
  dec(!f.slow, 'fb-d-slow', 'A slow start with a large back-extrapolated volume overstates the FEV₁.', 'No maneuver had a slow start.');
  dec(!f.variable, 'fb-d-variable', 'Variable effort between maneuvers means that the largest values may not be maximal.', 'The maneuvers did not show variable effort.');
  dec(!(f.hasDlco && f.hb < 11), 'fb-d-hb', 'Anemia lowers the measured DLCO and qualifies its interpretation.', 'The hemoglobin concentration is not low enough to matter, or no diffusing capacity was measured.');
  dec(f.bmi < 30, 'fb-d-obesity', 'Obesity lowers the expiratory reserve volume and qualifies the interpretation of the volumes.', 'The body mass index is below the obese range.');
  dec(!f.post || (f.bdVariant !== 'artifact' && !f.postEarly), 'fb-d-postearly', 'The post-bronchodilator expiration ended early, so the change in FVC is a technique effect.', 'No post-bronchodilator technique problem is present, or no bronchodilator study was done.');
  dec(!f.europeanApplied, 'fb-d-european', 'The volume and diffusing capacity equations were derived in a different ancestry group from the patient.', 'Those equations match the group on the requisition, or no volumes were measured.');
  dec(f.hasVolumes, 'fb-d-novol', 'Lung volumes were not measured, so restriction was not assessed.', 'Lung volumes were measured.');
  dec(!f.unavailable, 'fb-d-age', 'The patient’s age lies outside the range of the reference equations, so the predicted values are extrapolated.', 'The age lies inside the range of every equation used.');
  void c;
  return { caveats, decoyCaveats: decoys };
}

// ---------------------------------------------------------------------------------------------
// Final interpretation statements

const SEVERITIES = ['mild', 'moderate', 'severe'];
const SUBTYPE_TEXT = {
  'low-kco-preserved-va': ' with a low KCO and a preserved alveolar volume, which points to a defect intrinsic to the lung',
  'low-va-high-kco': ' with a small alveolar volume and a raised KCO, as when expansion is incomplete and the gas-exchanging tissue is intact',
  'low-va-normal-kco': ' with a small alveolar volume and a KCO in the reference range',
  'both-low': ' with both the alveolar volume and the KCO reduced',
  'low-dlco-only': ' with the alveolar volume and KCO individually within their ranges',
};

/** Claims a final statement makes; one claim at a time is changed to build a distractor. */
export function claimsFrom(prep) {
  const { a, cmp, caseData: c } = prep;
  return {
    quality: a.qualityLimited ? 'limited' : 'adequate',
    pattern: a.pattern,
    severity: a.severity?.scored ? a.severity.id : null,
    airTrapping: a.flags.some((x) => x.id === 'air-trapping'),
    hyperinflation: a.flags.some((x) => x.id === 'hyperinflation'),
    dlco: a.dlco ? a.dlco.category : null,
    dlcoSubtype: a.dlco?.subtype ?? null,
    bd: a.bd ? (a.bd.rule2022.significant ? 'significant' : 'not-significant') : null,
    equation: cmp.labelChanges.length > 0 || cmp.patternChanged ? 'dependent' : 'silent',
    hasVolumes: Boolean(c.volumes),
  };
}

const V = (variants, i) => variants[i % variants.length];

/** @param {ReturnType<typeof claimsFrom>} k @param {number} v variant index shared by the correct statement and its distractors */
export function renderClaims(k, v = 0) {
  const s = [];
  s.push(k.quality === 'limited'
    ? V(['Test quality is reduced, with a grade of D or poorer in the FEV₁ or the FVC, so the findings are provisional and the study should be repeated before firm conclusions are drawn.', 'The session grade for the FEV₁ or FVC is D or poorer; the findings are therefore provisional and the study should be repeated.'], v)
    : V(['The session grades support interpretation of the forced expiratory indices.', 'Test quality is acceptable for interpreting the forced expiratory indices.'], v));
  const sev = k.severity ? `, graded ${k.severity} by the FEV₁ z-score` : '';
  const text = {
    normal: k.hasVolumes
      ? V(['The FEV₁/FVC ratio, the FVC, the lung volumes and the gas-transfer measurements, where measured, lie within their reference ranges, so there is no obstructive or restrictive pattern.', 'Airflow, lung volumes and gas transfer fall within their reference ranges, without an obstructive or a restrictive pattern.'], v)
      : V(['The FEV₁/FVC ratio and the FVC are within their reference ranges, which excludes airflow obstruction but leaves restriction unassessed without lung volumes.', 'The ratio and the FVC are within their ranges; obstruction is excluded, and restriction cannot be assessed without lung volumes.'], v),
    obstruction: V([`The FEV₁/FVC ratio is below its lower limit of normal, which defines airflow obstruction${sev}.`, `Airflow obstruction is present because the FEV₁/FVC ratio falls below its lower limit of normal${sev}.`], v)
      + (k.airTrapping ? ' A raised RV or RV/TLC shows air trapping.' : '') + (k.hyperinflation ? ' A TLC above its upper limit shows hyperinflation.' : ''),
    'obstruction-low-fvc': V(['The FEV₁/FVC ratio and the FVC are both low; obstruction is present, but a low FVC may reflect air trapping or coexisting restriction, which cannot be separated without lung volumes.', 'Obstruction is shown by the low ratio; the low FVC cannot be attributed to air trapping or to restriction until lung volumes are measured.'], v),
    restriction: V(['The TLC is below its lower limit of normal with a preserved FEV₁/FVC ratio, which defines restriction.', 'Restriction is present: the TLC is below its lower limit and the FEV₁/FVC ratio is preserved.'], v),
    mixed: V(['The FEV₁/FVC ratio and the TLC are both below their lower limits of normal, which defines mixed obstruction and restriction.', 'Both the ratio and the TLC are below their lower limits, so the pattern is mixed obstruction and restriction.'], v),
    nonspecific: V(['The ratio is preserved and the FVC or FEV₁ is low while the TLC is not low; this nonspecific pattern does not establish restriction.', 'A low FVC or FEV₁ with a preserved ratio and a TLC that is not low is a nonspecific pattern and not restriction.'], v),
    prism: V(['The ratio is preserved with a low FVC or FEV₁ and no lung volumes were measured (PRISm); restriction is possible but unproven.', 'This is preserved ratio with impaired spirometry; without a TLC restriction is possible but not established.'], v),
    indeterminate: 'No usable maneuver was recorded, so the study cannot be interpreted.',
  }[k.pattern];
  s.push(text);
  if (k.dlco) {
    const sub = k.dlco === 'reduced' && k.dlcoSubtype ? SUBTYPE_TEXT[k.dlcoSubtype] ?? '' : '';
    s.push(k.dlco === 'reduced' ? `The hemoglobin-adjusted DLCO is reduced${sub}.` : k.dlco === 'raised' ? 'The hemoglobin-adjusted DLCO is above its upper limit of normal.' : 'The hemoglobin-adjusted DLCO is within its reference range.');
  }
  if (k.bd) s.push(k.bd === 'significant' ? 'The bronchodilator response is significant by the 2022 criterion.' : 'The bronchodilator response is not significant by the 2022 criterion.');
  if (k.equation === 'dependent') s.push('Because a spirometry classification changes between GLI-2012 and GLI Global, the result is borderline and the reference equation used should be stated.');
  if (k.equation === 'independent') s.push('The classification is the same under every reference equation and does not depend on the equation chosen.');
  if (k.equation === 'false-dependent') s.push('Because the spirometry classification changes between GLI-2012 and GLI Global, the result is borderline and the reference equation used should be stated.');
  return s.join(' ');
}

/** Wrong pattern a learner might assert, with the flaw, by true pattern and whether TLC was measured. */
const WRONG_PATTERN = {
  normal: [['obstruction', 'Asserts obstruction although the FEV₁/FVC ratio is within its limits.']],
  obstruction: [['mixed', 'Asserts a restrictive component although the TLC is not below its lower limit.'], ['normal', 'Calls the study normal although the ratio is below its lower limit.']],
  'obstruction-low-fvc': [['mixed', 'Asserts mixed disease without a measured TLC.'], ['restriction', 'Attributes the low FVC to restriction without a measured TLC.']],
  restriction: [['nonspecific', 'Calls the pattern nonspecific although the TLC is below its lower limit, which defines restriction.'], ['normal', 'Calls the study normal although the TLC is below its lower limit.']],
  mixed: [['obstruction', 'Omits the restrictive component although the TLC is below its lower limit.'], ['restriction', 'Omits the obstruction although the ratio is below its lower limit.']],
  nonspecific: [['restriction', 'Calls restriction although the TLC is not below its lower limit.']],
  prism: [['restriction', 'Asserts restriction without a measured TLC.'], ['normal', 'Calls the study normal although the FVC or FEV₁ is low.']],
  indeterminate: [['normal', 'Interprets a study with no usable maneuver.']],
};

/**
 * @returns {{ id: string, text: string, flaw: string }[]} every available single-flaw distractor
 */
export function fallbackDistractors(prep, variant = 0) {
  const k = claimsFrom(prep);
  const out = [];
  const push = (id, claims, flaw) => {
    const text = renderClaims(claims, variant);
    if (text !== renderClaims(k, variant)) out.push({ id, text, flaw });
  };
  if (k.severity) {
    const other = SEVERITIES.filter((x) => x !== k.severity);
    push('fb-n-severity', { ...k, severity: other[(variant + (k.severity === 'mild' ? 1 : 0)) % other.length] }, 'States the wrong severity band: severity of obstruction follows the FEV₁ z-score.');
  }
  for (const [i, [pattern, flaw]] of (WRONG_PATTERN[k.pattern] ?? []).entries()) {
    const sev = ['obstruction', 'obstruction-low-fvc'].includes(pattern) ? 'moderate' : null;
    const noTlc = !k.hasVolumes && ['mixed', 'restriction'].includes(pattern);
    push(`fb-n-pattern-${i}`, { ...k, pattern, severity: sev, airTrapping: false, hyperinflation: false }, noTlc ? `Asserts ${pattern === 'mixed' ? 'a restrictive component' : 'restriction'} without a measured TLC.` : flaw);
  }
  if (k.quality === 'limited') push('fb-n-quality', { ...k, quality: 'adequate' }, 'Ignores the poor test quality; a grade of D or poorer makes the findings provisional.');
  else push('fb-n-quality', { ...k, quality: 'limited' }, 'Claims a quality limitation that the session grades do not support.');
  if (k.dlco) push('fb-n-dlco', { ...k, dlco: k.dlco === 'reduced' ? 'normal' : 'reduced', dlcoSubtype: null }, 'Misstates the hemoglobin-adjusted diffusing capacity.');
  if (k.bd) push('fb-n-bd', { ...k, bd: k.bd === 'significant' ? 'not-significant' : 'significant' }, 'Misstates the bronchodilator response under the 2022 criterion.');
  if (k.equation === 'dependent') push('fb-n-equation', { ...k, equation: 'independent' }, 'States that the result is independent of the reference equation although a classification changes between GLI-2012 and GLI Global.');
  else push('fb-n-equation', { ...k, equation: 'false-dependent' }, 'Asserts equation dependence although the classification is the same under GLI-2012 and GLI Global.');
  return out;
}

export const PATTERN_NAMES = PATTERNS;
