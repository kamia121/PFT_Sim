/**
 * Built-in content used when the optional scenario and narrative modules are absent: neutral
 * intake notes, caveats and decoy caveats derived from the case, and a rule-based final-statement
 * generator. Nothing here changes a case value. Intake notes are neutral on purpose: a statement that
 * implied a medication, a preparation error or a technique problem would claim an effect that the
 * simulated measurements do not carry.
 */
import { shuffled, pick } from './shuffle.js';
import { PATTERNS } from '../interpret/interpret.js';
import { hbKnown, hbLow, showBirthSex, sexUndisclosed } from '../app/format.js';

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
  const sc = c.scenario ?? null;
  const trace = c.dlcoTrace ?? null;
  return {
    pre, post,
    poorFev1: POOR.includes(g.fev1), poorFvc: POOR.includes(g.fvc),
    cough: hasFault(pre, 'cough'), early: hasFault(pre, 'early-termination'), slow: hasFault(pre, 'slow-start'), variable: hasFault(pre, 'variable-effort'), glottic: hasFault(pre, 'glottic-closure'),
    postEarly: post ? hasFault(post, 'early-termination') : false,
    bmi: p.weightKg / (p.heightCm / 100) ** 2,
    // A missing hemoglobin is null. It is neither low nor normal, and `null < 11` is true in JavaScript, so it is kept apart on purpose.
    hb: hbKnown(c.dlco) ? c.dlco.hbGdl : null,
    hbMissing: Boolean(c.dlco) && !hbKnown(c.dlco),
    hasVolumes: Number.isFinite(c.volumes?.tlc), hasDlco: Number.isFinite(c.dlco?.adjusted),
    lowErv: a.flags.some((x) => x.id === 'low-erv'),
    europeanApplied: measures.some((m) => m.available !== false && m.matched === false),
    unavailable: measures.some((m) => m.available === false),
    ageClamped: measures.some((m) => m.ageClamped),
    equationFlip: cmp.labelChanges.length > 0 || cmp.patternChanged,
    borderline: ['fev1', 'fvc', 'fev1_fvc', 'tlc', 'dlco'].some((k) => a.measures[k]?.borderline),
    bdVariant: c.groundTruth.bdVariant ?? null,
    // Scenario facts the chart shows to the learner.
    medicationNote: Boolean(sc?.ids?.some((id) => id.startsWith('med-'))) || Number.isFinite(sc?.preTest?.lastSabaHours) || Number.isFinite(sc?.preTest?.lastLabaHours),
    recentSmoke: [sc?.preTest?.lastSmokingHours, sc?.preTest?.lastVapingHours].some((h) => Number.isFinite(h) && h < 1),
    estimatedHeight: Boolean(sc?.height) && sc.height.source !== 'measured',
    sexAssumption: showBirthSex(sc) || sexUndisclosed(sc),
    lowInspiredVolume: Number.isFinite(trace?.inspired?.viOverVc) && trace.inspired.viOverVc < 0.9,
  };
}

/**
 * Each rule is one statement about limits on an interpretation. The statement is true in general. It applies to a case when
 * `applies(f)` holds, and it is offered as a distractor when `decoy(f)` holds, so the same words are a correct option in one case and
 * a wrong one in another and only the case facts tell them apart. `why` explains, after submission, which fact makes it irrelevant.
 * `topic` keeps two statements about the same subject out of one question.
 */
const RULES = [
  { id: 'fb-quality', topic: 'quality', weight: 'major', text: 'A grade of D or poorer for the FEV₁ or the FVC means that the reported values may understate what the patient can achieve, so the classification is provisional until the test is repeated.',
    applies: (f, a) => a.qualityLimited, decoy: (f, a) => !a.qualityLimited, why: 'Both quality grades are better than D.' },
  { id: 'fb-early', topic: 'early', weight: 'major', text: 'Expiration that ends early lowers the FVC and raises the FEV₁/FVC ratio, so obstruction may be understated and a low FVC may not reflect lung volume.',
    applies: (f) => f.poorFvc && f.early, decoy: (f) => !f.early, why: 'No pre-bronchodilator maneuver ended early.' },
  { id: 'fb-cough', topic: 'cough', weight: 'minor', text: 'A cough in the first second makes the FEV₁ of the affected maneuver unreliable, which weakens confidence in the FEV₁ and in the ratio.',
    applies: (f) => f.poorFev1 && f.cough, decoy: (f) => !f.cough, why: 'No pre-bronchodilator maneuver recorded a cough.' },
  { id: 'fb-slow', topic: 'slow', weight: 'minor', text: 'A slow start with a large back-extrapolated volume overstates the FEV₁, because the first second of the forced expiration begins late.',
    applies: (f) => f.poorFev1 && f.slow, decoy: (f) => !f.slow, why: 'No maneuver had a slow start.' },
  { id: 'fb-variable', topic: 'variable', weight: 'minor', text: 'Variable effort between maneuvers means that the largest values may not be the patient’s maximal values.',
    applies: (f) => (f.poorFev1 || f.poorFvc) && f.variable, decoy: (f) => !f.variable, why: 'The maneuvers did not show variable effort.' },
  { id: 'fb-equation', topic: 'equation', weight: 'major', text: 'A spirometry classification that changes between GLI-2012 and GLI Global shows that a result close to the lower limit of normal depends on the reference equation chosen.',
    applies: (f) => f.equationFlip, decoy: (f) => !f.equationFlip, why: 'No spirometry classification changes between GLI-2012 and GLI Global.' },
  { id: 'fb-borderline', topic: 'borderline', weight: 'minor', text: 'A value within 0.25 z-score units of a limit can change its label through measurement variability alone.',
    applies: (f) => !f.equationFlip && f.borderline, decoy: (f) => !f.borderline, why: 'No value lies within 0.25 z-score units of a limit.' },
  { id: 'fb-volumes-needed', topic: 'volumes', weight: 'major', text: 'Without a measured TLC a low FVC cannot be assigned to restriction or to air trapping, so lung volumes are needed.',
    applies: (f, a) => ['prism', 'obstruction-low-fvc'].includes(a.pattern), decoy: (f) => f.hasVolumes, why: 'Lung volumes were measured.' },
  { id: 'fb-no-volumes', topic: 'volumes', weight: 'minor', text: 'When TLC is unavailable, restriction cannot be assessed; available diffusing-capacity measurements are interpreted separately.',
    applies: (f, a) => !f.hasVolumes && !['prism', 'obstruction-low-fvc'].includes(a.pattern), decoy: () => false, why: '' },
  { id: 'fb-european', topic: 'european', weight: 'minor', text: 'Lung volume and diffusing capacity equations derived in people of European ancestry may represent a patient of another group less well, which limits how firmly those indices can be classified.',
    applies: (f) => f.europeanApplied, decoy: (f) => !f.europeanApplied && (f.hasVolumes || f.hasDlco), why: 'The reference equations for volumes and diffusing capacity match the group on the requisition.' },
  { id: 'fb-hb', topic: 'hemoglobin', weight: 'minor', text: 'A low hemoglobin concentration lowers the measured DLCO and KCO while the VA is unchanged, which is why the interpretation rests on the hemoglobin-adjusted value.',
    applies: (f) => f.hasDlco && hbLow(f.hb), decoy: (f) => f.hasDlco && !f.hbMissing && !hbLow(f.hb), why: 'The hemoglobin concentration is not low.' },
  { id: 'fb-hb-missing', topic: 'hemoglobin', weight: 'major', text: 'Without a hemoglobin concentration the DLCO cannot be adjusted, so a low hemoglobin could lower it and a high hemoglobin could raise it independently of the lung.',
    applies: (f, a, c) => f.hbMissing && !(c.scenario?.caveats ?? []).some((x) => x.id === 'hb-missing-dlco-unadjusted'), decoy: (f) => f.hasDlco && !f.hbMissing, why: 'A hemoglobin concentration was available, so the DLCO was adjusted.' },
  { id: 'fb-erv', topic: 'erv', weight: 'minor', text: 'A low expiratory reserve volume with obesity reflects chest wall load; it qualifies the volumes and is not a pattern.',
    applies: (f) => f.lowErv, decoy: (f) => f.hasVolumes && !f.lowErv, why: 'The expiratory reserve volume is not below its lower limit.' },
  { id: 'fb-bd-artifact', topic: 'bd', weight: 'major', text: 'A post-bronchodilator expiration that ends early lowers the FVC and makes the ratio look better, so the fall in FVC and the apparent improvement in the ratio are technique effects and not a response.',
    applies: (f) => Boolean(f.post) && f.bdVariant === 'artifact', decoy: (f) => !f.post || (f.bdVariant !== 'artifact' && !f.postEarly), why: 'No post-bronchodilator technique problem is present, or no bronchodilator study was done.' },
  { id: 'fb-bd-volume', topic: 'bd', weight: 'minor', text: 'A rise in the FVC that exceeds the rise in the FEV₁ after a bronchodilator is a volume response that reflects air trapping and does not require the ratio to change.',
    applies: (f) => Boolean(f.post) && f.bdVariant === 'volume', decoy: (f) => f.bdVariant !== 'volume', why: 'The bronchodilator response was not a volume response, or no bronchodilator study was done.' },
  { id: 'fb-bd-rules', topic: 'bd', weight: 'minor', text: 'When the 2022 rule (percent of predicted) and the earlier rule (percent of baseline) disagree, the bronchodilator conclusion depends on the criterion.',
    applies: (f, a) => Boolean(a.bd) && !a.bd.rulesAgree && f.bdVariant === null, decoy: (f, a) => !a.bd || a.bd.rulesAgree, why: 'The two bronchodilator criteria agree, or no bronchodilator study was done.' },
  { id: 'fb-age-cap', topic: 'age', weight: 'minor', text: 'A patient older than the upper age limit of a reference equation is referenced at the last age the equation covers, so the z-scores at this age are an approximation and carry added uncertainty.',
    applies: (f) => f.ageClamped, decoy: (f) => !f.ageClamped, why: 'The age lies inside the range of every equation used.' },
  // Statements that never become a caveat in the built-in set; they are irrelevant whenever the stated fact is absent.
  { id: 'fb-d-age', topic: 'age', text: 'An age outside the range of a reference equation means that predicted values cannot be computed or must be extrapolated.',
    decoy: (f) => !f.unavailable && !f.ageClamped, why: 'The age lies inside the range of every equation used.' },
  { id: 'fb-d-saba', topic: 'medication', text: 'A short-acting bronchodilator taken inside its withholding window can raise the baseline FEV₁ and FVC and narrow the bronchodilator increment.',
    decoy: (f) => !f.medicationNote, why: 'No bronchodilator or other inhaled medication is recorded before the test.' },
  { id: 'fb-d-smoke', topic: 'smoke', text: 'Smoke or vapor inhaled within the hour before testing can cause bronchoconstriction and cough, lowering the FEV₁ and FVC.',
    decoy: (f) => !f.recentSmoke, why: 'No smoking within the hour before testing is recorded.' },
  { id: 'fb-d-height', topic: 'height', text: 'A height estimated from arm span or ulna length carries an error of several centimeters that shifts every predicted value and z-score.',
    decoy: (f) => !f.estimatedHeight, why: 'The height was measured.' },
  { id: 'fb-d-sex', topic: 'sex', text: 'A reference sex that differs from the sex assigned at birth can move z-scores across the lower limit without any change in the lungs.',
    decoy: (f) => !f.sexAssumption, why: 'The reference sex is the patient’s recorded sex, and no assumption about sex is recorded.' },
  { id: 'fb-d-vi', topic: 'vi', text: 'An incomplete inhalation before the breath-hold lowers the VA and the DLCO and raises the KCO artifactually.',
    decoy: (f) => f.hasDlco && !f.lowInspiredVolume, why: 'The inspired volume reached at least 90% of the vital capacity.' },
  { id: 'fb-d-glottic', topic: 'glottic', text: 'Glottic closure ends expiration abruptly, which makes the FVC unacceptable and raises the ratio.',
    decoy: (f) => !f.glottic, why: 'No maneuver showed glottic closure.' },
];

/**
 * Statements that limit or qualify this interpretation, and true statements that do not apply to this case.
 * @returns {{ caveats: { id: string, text: string, weight: 'major'|'minor', topic: string }[], decoyCaveats: { id: string, text: string, why: string, topic: string }[] }}
 */
export function fallbackCaveats(prep) {
  const f = caseFacts(prep);
  const { a, caseData: c } = prep;
  const caveats = [], decoys = [];
  for (const r of RULES) {
    if (r.applies?.(f, a, c)) caveats.push({ id: r.id, text: r.text, weight: r.weight, topic: r.topic });
    else if (r.decoy?.(f, a, c)) decoys.push({ id: r.id, text: r.text, why: r.why, topic: r.topic });
  }
  // A subject that is a caveat in this case is never also offered as a distractor.
  const live = new Set(caveats.map((x) => x.topic));
  return { caveats, decoyCaveats: decoys.filter((d) => !live.has(d.topic)) };
}

// ---------------------------------------------------------------------------------------------
// Final interpretation statements

const SEVERITIES = ['mild', 'moderate', 'severe'];
const SEVERITY_KEYS_ALL = ['fev1-normal', ...SEVERITIES];
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
    patternReferenceUnavailable: a.patternReason === 'reference-unavailable',
    severity: a.severity?.scored ? a.severity.id : null,
    airTrapping: a.flags.some((x) => x.id === 'air-trapping'),
    hyperinflation: a.flags.some((x) => x.id === 'hyperinflation'),
    dlco: a.dlco ? a.dlco.category : null,
    dlcoSubtype: a.dlco?.subtype ?? null,
    dlcoSession: c.report.dlcoQuality?.status ?? null,
    volumeSession: c.report.volumeQuality?.status ?? null,
    volumeQualification: a.flags.some((f) => f.id === 'volume-measurement-limited'),
    hbMissing: Boolean(c.dlco) && !hbKnown(c.dlco),
    bd: a.bd ? (a.bd.rule2022.significant ? 'significant' : 'not-significant') : null,
    equation: cmp.labelChanges.length > 0 || cmp.patternChanged ? 'dependent' : 'silent',
    hasVolumes: a.measures.tlc?.available !== false && Number.isFinite(a.measures.tlc?.z),
    volumeMeasured: Number.isFinite(c.volumes?.tlc),
    referenceUnavailable: Object.values(a.measures).some((m) => m.available === false && m.reason === 'age-outside-range'),
  };
}

const V = (variants, i) => variants[i % variants.length];

/** @param {ReturnType<typeof claimsFrom>} k @param {number} v variant index shared by the correct statement and its distractors */
export function renderClaims(k, v = 0) {
  const s = [];
  s.push(k.quality === 'limited'
    ? V(['Test quality is reduced, with a grade of D or poorer in the FEV₁ or the FVC, so the findings are provisional and the study should be repeated before firm conclusions are drawn.', 'The session grade for the FEV₁ or FVC is D or poorer; the findings are therefore provisional and the study should be repeated.'], v)
    : V(['The session grades support interpretation of the forced expiratory indices.', 'Test quality is acceptable for interpreting the forced expiratory indices.'], v));
  const sev = k.severity ? `, graded ${k.severity} by the ${k.pattern === 'restriction' ? 'TLC' : 'FEV₁'} z-score` : '';
  const text = {
    normal: k.hasVolumes
      ? V(['Spirometry shows no airflow obstruction; the reported TLC is not below its lower limit, so restriction is not demonstrated.', 'The ratio and FVC are within their ranges, and the reported TLC does not establish restriction.'], v)
      : V(['The FEV₁/FVC ratio and the FVC are within their reference ranges, which excludes airflow obstruction but leaves restriction unassessed without an interpretable TLC reference.', 'The ratio and the FVC are within their ranges; obstruction is excluded, and restriction cannot be assessed without an interpretable TLC reference.'], v),
    obstruction: V([`The FEV₁/FVC ratio is below its lower limit of normal, which defines airflow obstruction${sev}.`, `Airflow obstruction is present because the FEV₁/FVC ratio falls below its lower limit of normal${sev}.`], v)
      + (k.airTrapping ? ' Elevated RV/TLC may reflect air trapping; technique and clinical context are needed.' : '') + (k.hyperinflation ? ' The hyperinflation finding requires review of the fractional volumes and clinical context.' : ''),
    'obstruction-low-fvc': V(['The FEV₁/FVC ratio and the FVC are both low; obstruction is present, but a low FVC may reflect air trapping or coexisting restriction, which cannot be separated without lung volumes.', 'Obstruction is shown by the low ratio; the low FVC cannot be attributed to air trapping or to restriction until TLC can be interpreted with valid reference limits.'], v),
    restriction: V(['The TLC is below its lower limit of normal with a preserved FEV₁/FVC ratio, which defines restriction.', 'Restriction is present: the TLC is below its lower limit and the FEV₁/FVC ratio is preserved.'], v),
    mixed: V(['The FEV₁/FVC ratio and the TLC are both below their lower limits of normal, which defines mixed obstruction and restriction.', 'Both the ratio and the TLC are below their lower limits, so the pattern is mixed obstruction and restriction.'], v),
    nonspecific: V(['The ratio is preserved and the FVC or FEV₁ is low while the TLC is not low; this nonspecific pattern does not establish restriction.', 'A low FVC or FEV₁ with a preserved ratio and a TLC that is not low is a nonspecific pattern and not restriction.'], v),
    prism: V(['The ratio is preserved with a low FVC or FEV₁ and no lung volumes were measured; TLC is needed to distinguish restriction from a non-specific pattern.', 'This is preserved-ratio spirometric impairment; without a TLC restriction is possible but not established.'], v),
    indeterminate: k.patternReferenceUnavailable ? 'The spirometric pattern cannot be classified because a required reference is unavailable; the measured values and independently interpretable components remain available.' : 'No usable maneuver was recorded, so the study cannot be interpreted.',
  }[k.pattern];
  s.push(text);
  if (k.dlco && !['pending', 'unavailable'].includes(k.dlcoSession)) {
    const sub = k.dlco === 'reduced' && k.dlcoSubtype ? SUBTYPE_TEXT[k.dlcoSubtype] ?? '' : '';
    const name = k.hbMissing ? 'DLCO, classified without hemoglobin adjustment because no hemoglobin was available,' : 'hemoglobin-adjusted DLCO';
    s.push(k.dlco === 'reduced' ? `The ${name} is reduced${sub}.` : k.dlco === 'raised' ? `The ${name} is above its upper limit of normal.` : `The ${name} is within its reference range.`);
  }
  if (['pending', 'unavailable'].includes(k.dlcoSession)) s.push(`DLCO is not reportable from this ${k.dlcoSession} session; no diffusion classification can be assigned.`);
  else if (k.dlcoSession === 'qualified') s.push('The reported diffusion values require qualification because the session did not meet the best reporting criteria.');
  if (k.volumeQualification) s.push(k.volumeMeasured ? 'The reported lung volumes require qualification; interpret them with the recorded measurement limitations.' : `Complete TLC/RV are not reportable from this ${k.volumeSession ?? 'limited'} session; restriction remains unassessed.`);
  if (k.referenceUnavailable) s.push('Some measured indices cannot be classified because age is outside their reference range; their measured values are preserved.');
  if (k.bd) s.push(k.bd === 'significant' ? 'The bronchodilator response is significant by the 2022 criterion.' : 'The bronchodilator response is not significant by the 2022 criterion.');
  if (k.equation === 'dependent') s.push('Because a spirometry classification changes between GLI-2012 and GLI Global, the result is borderline and the reference equation used should be stated.');
  if (k.equation === 'silent' || k.equation === 'independent') s.push('The spirometry classification is the same under GLI-2012 and GLI Global, so the result does not depend on the reference equation chosen.');
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
