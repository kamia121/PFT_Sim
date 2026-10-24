/**
 * Rule-based composer of final interpretations for a simulated pulmonary function report.
 *
 * Input is the assembled case, the interpretation key of the engine (src/interpret/interpret.js)
 * and the comparison of the two spirometry equations. Output is a set of sections in the order of
 * a physician interpretation (test quality, reference values and assumptions, pattern and
 * severity, lung volumes, diffusing capacity, bronchodilator response, sensitivity to the
 * reference equation, limitations), a three-to-six sentence final statement, atomic findings, and
 * wrong final statements (distractors) tagged with the error each one commits.
 *
 * The composer reads only what a reader of the report could see: the report values, the test
 * quality, the interpretation key and the scenario record. It never reads the descriptor
 * archetype or the ground truth. Every sentence type has at least three phrasing variants chosen
 * through createStream(seed, 'narrative'); the variants of a sentence type carry identical
 * facts, which `extractFacts` recovers from the text so a test can compare them.
 *
 * No treatment advice and no diagnosis: patterns are "consistent with", severity is stated only
 * for the patterns the engine scores, and a value within 0.25 z of a limit is called borderline.
 * The rules are documented in docs/narrative-model.md, including the 2022 rules that are still
 * unverified against the primary text.
 */
import { createStream } from '../core/prng.js';
import { hbKnown, coHbMeasured, coHbUnmeasured, sexUndisclosed } from '../app/format.js';
import { bdPctPredText, bdPctPredQualifier, bdPctBaseText, bdMlText } from './precision.js';

export const NARRATIVE_VERSION = 2;

/** Error classes a distractor can commit. */
export const FLAWS = [
  'wrong-severity',
  'wrong-pattern',
  'restriction-without-tlc',
  'ignores-quality',
  'ignores-equation-change',
  'wrong-bronchodilator-rule',
  'reads-percent-predicted-as-normal-range',
  'dlco-unadjusted-for-hb',
  'over-diagnoses',
];

/** Phrases a correct narrative must never contain (treatment advice, diagnosis, hidden case metadata). */
export const BANNED_PHRASES = [
  /\brecommend/i, /\bshould (?:be )?(?:start|treat|use|take|receive)/i, /\bprescri/i, /\binitiat/i, /\btreatment\b/i, /\btherapy\b/i,
  /\binhaler/i, /\bsteroid/i, /\bdiagnos/i, /\barchetype\b/i, /ground[ -]?truth/i,
  /restriction-parenchymal|restriction-extraparenchymal|obesity-low-erv|bd-discordant|low-dlco/i,
  /\b(?:COPD|asthma|emphysema|fibrosis|interstitial lung|heart failure|pneumonia|sarcoid)/i,
];

const MINUS = '−';
const zf = (z) => (z < 0 ? MINUS : '') + Math.abs(z).toFixed(2);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const sentence = (s) => { const t = s.trim(); return /[.!?]$/.test(t) ? t : `${t}.`; };
const list = (a) => (a.length <= 1 ? (a[0] ?? '') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`);
const mL = (liters) => `${liters >= 0 ? '+' : MINUS}${Math.round(Math.abs(liters) * 1000)} mL`;
const pct1 = (x) => `${x.toFixed(1)}%`;
/** The change as a percent of predicted, with the digits that show which side of the 10% threshold it is on. */
const pctPred = (x) => (bdPctPredQualifier(x) ? `just ${bdPctPredQualifier(x)} 10%` : `${bdPctPredText(x)}%`);

const EQ_NAMES = { GLIglobal: 'GLI Global (2022)', GLI2012: 'GLI-2012', GLI2021vol: 'GLI-2021', GLI2017tlco: 'GLI-2017', NHANES3: 'NHANES III' };
const eqName = (id) => EQ_NAMES[id] ?? String(id);
const SEX = { M: 'male', F: 'female' };
const DISPLAY = { fev1: 'FEV1', fvc: 'FVC', fev1_fvc: 'FEV1/FVC ratio', tlc: 'TLC', rv: 'RV', rv_tlc: 'RV/TLC ratio', vc: 'VC', frc: 'FRC', erv: 'ERV', ic: 'IC', dlco: 'DLCO', va: 'alveolar volume (VA)', kco: 'KCO' };
const REL = {
  low: 'below the lower limit of normal',
  'low-borderline': 'marginally below the lower limit of normal',
  high: 'above the upper limit of normal',
  'high-borderline': 'marginally above the upper limit of normal',
  normal: 'within the reference range',
  'normal-low': 'within the reference range but close to the lower limit',
  'normal-high': 'within the reference range but close to the upper limit',
};
const LABEL_PHRASE = { low: 'below the lower limit of normal', normal: 'within the reference range', high: 'above the upper limit of normal' };
const DLCO_CAT = { reduced: 'reduced', raised: 'raised', normal: 'within the reference range' };
const GRADE_RANK = { A: 0, B: 1, C: 2, D: 3, E: 4, U: 5, F: 6 };
const NOUN = {
  normal: 'normal spirometry',
  obstruction: 'airflow obstruction',
  'obstruction-low-fvc': 'airflow obstruction',
  restriction: 'restriction',
  mixed: 'mixed obstruction and restriction',
  nonspecific: 'a nonspecific pattern',
  prism: 'preserved-ratio spirometric impairment',
};
const CAVEAT_NO_EFFECT = /(?:does|do) not change the interpretation/i;

/** Text of a caveat without the closing "does not change the interpretation" clause and trailing period. */
export const caveatCore = (text) => {
  const t = String(text ?? '')
    .replace(/[;,.]?\s*(?:this\s+|which\s+|it\s+)?(?:does|do) not change the interpretation\.?/i, '')
    .replace(/[.\s]+$/, '')
    .trim();
  // Items are joined inside sentences, so an ordinary capitalized word is lowercased; acronyms and units keep their case.
  return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
};

/**
 * One-clause paraphrases of the scenario caveats, keyed by caveat id. The narrative states a limitation in these words and never
 * quotes the caveat text, which the quiz shows as a limitations option, so the final interpretation does not hand over the answer to
 * that item. A caveat id that is not listed gets a generic clause. Each entry is a lower-case clause without a final period.
 */
export const CAVEAT_PARAPHRASE = {
  'saba-baseline-raised': 'a short-acting beta-agonist taken inside its withholding window can raise the baseline FEV1 and FVC and narrow the bronchodilator increment',
  'saba-deviation-recorded': 'the drug, dose and time of the last bronchodilator dose are recorded as a deviation from the preparation list',
  'laba-baseline-raised': 'a long-acting beta-agonist taken inside its withholding window leaves the airways partly dilated and blunts the bronchodilator increment',
  'lama-baseline-raised': 'a long-acting antimuscarinic taken inside its withholding window lowers vagal tone in the airways and leaves little room for a bronchodilator increment',
  'on-treatment-context': 'the study was done on the usual maintenance medication, so baseline airflow reflects it and a small bronchodilator response does not exclude reversibility',
  'ics-today-no-change': 'a daily inhaled corticosteroid or leukotriene-modifier dose taken today does not change the interpretation',
  'allergy-meds-no-change': 'a nasal spray or an antihistamine does not change the interpretation',
  'smoking-acute-airflow': 'smoke or vapor inhaled shortly before testing can cause acute bronchoconstriction and cough, so mild obstruction may be exaggerated',
  'smoking-cohb-dlco': 'carboxyhemoglobin from recent smoking lowers the measured DLCO, and no adjustment for it is made',
  'smoking-cohb-dlco-hours': 'carboxyhemoglobin persists for hours after smoking and can lower the measured DLCO and KCO, which are not adjusted for it',
  'cohb-measured-unadjusted': 'a measured carboxyhemoglobin above the endogenous level lowers the DLCO and KCO, and the reported values are not adjusted for it',
  'alcohol-effort-variable': 'recent intoxicants can impair effort and coordination and lower flows and repeatability',
  'caffeine-small-bronchodilation': 'caffeine is a weak bronchodilator and could raise the baseline FEV1 slightly, mainly when obstruction is near the limit',
  'exercise-airway-lability': 'vigorous exercise shortly before testing can lower the FEV1 in people with exercise-sensitive airways',
  'exercise-yesterday-no-change': 'exercise on the previous day does not change the interpretation',
  'meal-abdominal-distension': 'a full stomach can slightly lower the FVC, VC and inspiratory capacity, with weak supporting evidence',
  'binder-restriction-artifact': 'restrictive clothing lowers FVC, VC and TLC with a preserved ratio, so a restrictive pattern may reflect chest-wall mechanics and not parenchymal disease',
  'oxygen-dlco-lowered': 'supplemental oxygen raises the alveolar oxygen tension and lowers the measured DLCO',
  'mi-contraindication-effort': 'a recent myocardial infarction limits effort, so the flows may not represent the patient’s best',
  'surgery-splinting-restriction': 'recent abdominal or thoracic surgery can limit inspiration through pain and splinting and give a restrictive-looking pattern from reduced effort',
  'uri-transient-narrowing': 'a current respiratory infection can cause transient bronchial narrowing and cough, so the values may overstate chronic impairment',
  'serial-decline-best-early': 'the FEV1 fell across successive maneuvers, so the best values come from the early blows and maneuver-induced narrowing of the airways is possible',
  'syncope-fvc-understated': 'effort was eased late in expiration, so the maneuver was not maximal and the FVC is understated',
  'kyphoscoliosis-standing-height': 'standing height understates skeletal height in kyphoscoliosis, so arm span is the usual substitute',
  'height-estimated-armspan-error': 'height was estimated from arm span with a fixed ratio, an estimate whose error of several centimeters shifts every predicted value and z-score',
  'armspan-ratio-sources-differ': 'published arm-span ratios differ between sources',
  'height-method-stated': 'the method used to obtain height is stated on the report',
  'height-estimated-ulna-error': 'height was estimated from ulna length, and the error of that estimate moves the predicted values and z-scores',
  'halfspan-less-precise': 'a doubled half-span is less precise than a full arm span',
  'chart-height-too-tall': 'a height carried over from an old record is likely to be too tall, which raises predicted values and can make normal values look low',
  'sex-birth-used-default': 'predicted values follow sex assigned at birth, the default of the standard, which gives no rule for patients taking hormones, nonbinary patients or intersex patients',
  'sex-evidence-limited': 'the evidence on which sex fits patients taking hormones is limited, and the sex used can move z-scores across the lower limit without a change in the lungs',
  'sex-identity-used-nondefault': 'the reference sex is the sex the patient identifies with and not the sex assigned at birth that the standard specifies, so z-scores and classification can differ',
  'sex-default-applied': 'sex was not disclosed, so the predicted values rest on the laboratory default and shift with the alternative',
  'race-field-default-group': 'a missing or other group on the requisition selects the composite GLI-2012 set, so a classification that differs between GLI-2012 and GLI Global reflects the equation and not the lungs',
  'race-global-no-field': 'GLI Global does not use the group field of the requisition',
  'volumes-dlco-european-only': 'the lung-volume and TLCO equations were derived in people of European ancestry, which limits how well that reference population represents the patient, and a discordance with spirometry calls for caution',
  'trach-interface-unreliable': 'a tracheostomy adapter changes dead space and may leak, so flows and volumes are less reliable',
  'dentures-poor-fit-leak': 'poorly fitting dentures can cause air escape or an obstructed mouthpiece',
  'dentures-ok-no-change': 'well-fitting dentures left in place do not change the interpretation',
  'facial-weakness-leak': 'facial weakness can cause a leak at the lips and slow the rise to peak flow, which makes affected maneuvers unreliable',
  'coop-submaximal-unreliable': 'difficulty following directions can produce submaximal and variable results, so the ratio is unreliable',
  'anxiety-variable-effort': 'anxiety can cause hesitant starts, early stops and variable effort, so the values may reflect technique and not lung disease',
  'pain-limits-inspiration': 'pain on deep inspiration can limit inflation and lower the FVC and FEV1 with a preserved ratio, which does not establish a low TLC',
  'altitude-dlco-unadjusted': 'the DLCO depends on the inspired oxygen tension, and an unadjusted value may sit higher at altitude, with limited evidence',
  'obesity-low-erv-not-restriction': 'obesity lowers ERV and FRC with a preserved TLC, so a low ERV is not restriction and a low FVC with a normal ratio needs a TLC',
  'anemia-dlco-adjusted': 'low hemoglobin lowers the measured DLCO and KCO, and the reported DLCO is adjusted for hemoglobin',
  'hb-missing-dlco-unadjusted': 'the DLCO is reported without hemoglobin adjustment, so an abnormal value cannot be attributed to the lung until the hemoglobin is known',
  'submaximal-effort-mimics': 'consistently low effort can mimic restriction or more severe disease even when repeatability is good',
  'slow-start-bev-fev1-unusable': 'a slow start enlarges the back-extrapolated volume, which can make the FEV1 unusable, with no fixed direction of error',
  'vaping-acute-airway-irritation': 'vapor inhaled shortly before testing can irritate the airways and provoke cough, with an effect of uncertain size',
  'vaping-little-cohb': 'an e-cigarette delivers little carbon monoxide, so no carboxyhemoglobin adjustment of the DLCO is expected from this history alone',
  'height-ulna-measurement': 'an ulna-based height depends on a reproducible forearm measurement and on a conversion equation whose coefficients vary with sex, age and ancestry',
  'sex-choice-no-change': 'under the other reference sex the pattern and every label are unchanged, although the z-scores shift',
  'weakness-true-low-fvc': 'facial weakness may accompany generalized neuromuscular weakness that itself lowers the FVC, so a low FVC is not attributed to the leak alone',
  'early-termination-fvc-low': 'early termination lowers the FVC and raises the ratio, which can mimic restriction or mask obstruction',
  'no-plateau-eofe': 'without an end-of-forced-expiration indicator the FVC is not acceptable and the ratio is overestimated',
  'cough-first-second': 'a cough in the first second makes the FEV1 unreliable while the FVC may remain acceptable',
  'glottic-closure-fvc': 'glottic closure ends expiration abruptly, which lowers the FVC and raises the ratio',
  'leak-unacceptable': 'a leak makes the FEV1 and FVC unacceptable and lowers the measured flows',
  'mouthpiece-obstruction': 'obstruction of the mouthpiece by the tongue or teeth makes the FEV1 and FVC unacceptable',
  'pause-at-tlc': 'a pause at total lung capacity lowers the peak flow and the FEV1',
  'variable-effort-grade': 'poor repeatability lowers the grade and the confidence that a repeat would give the same number',
  'post-bd-set-small': 'the post-bronchodilator set has too few maneuvers for a high grade, so the change is less reliable',
  'bd-timing-short': 'a post-bronchodilator maneuver taken before the protocol wait can underestimate the response',
  'bd-effort-artifact': 'better effort after the bronchodilator can raise the apparent response, and a rise in the FVC can reflect a longer expiratory time',
  'dlco-low-vi': 'an incomplete inhalation lowers the VA and the DLCO and raises the KCO artifactually',
  'dlco-valsalva': 'straining during the breath-hold lowers the measured DLCO, and the maneuver is not acceptable',
  'dlco-mueller': 'inspiratory effort against a closed glottis can spuriously raise the measured DLCO',
  'dlco-leak': 'a leak during the breath-hold makes the VA and DLCO unreliable',
  'pant-fast-frc-over': 'rapid panting overestimates the FRC, RV and TLC and can look like air trapping',
  'pleth-thermal-drift': 'thermal drift makes the FRC unstable, so the RV and TLC carry extra uncertainty',
  'pleth-ic-short-tlc-low': 'a linked maneuver that does not reach total lung capacity lowers IC, VC and TLC, so a low TLC may be a technique artifact',
};
const GENERIC_CAVEAT = 'a limitation recorded for this session qualifies the result';

// ---------------------------------------------------------------------------------------------
// Phrasing variants. Every sentence type has at least three, equivalent in meaning. Variants of a
// type are fragments or sentences that share the same slots; the markers that `extractFacts`
// reads (for example "consistent with", "adequate", "depends on the reference equation") occur in
// every variant of the type that carries that fact.
// ---------------------------------------------------------------------------------------------
const TYPES = {};
const T = (id, ...variants) => {
  if (variants.length < 3) throw new Error(`sentence type ${id} needs at least three variants`);
  TYPES[id] = variants;
};
/** Number of phrasing variants for each sentence type. */
export const sentenceTypes = () => Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.length]));

// --- test quality ---
T('q-grades',
  (p) => `${p.g.length > 2 ? 'Before bronchodilator' : 'At baseline'}, FEV1 was graded ${p.g[0]} and FVC was graded ${p.g[1]}${p.g.length > 2 ? `; after bronchodilator, FEV1 was graded ${p.g[2]} and FVC was graded ${p.g[3]}` : ''}`,
  (p) => `Test quality is grade ${p.g[0]} for FEV1 and grade ${p.g[1]} for FVC${p.g.length > 2 ? `, and grade ${p.g[2]} for FEV1 and grade ${p.g[3]} for FVC after bronchodilator` : ''}`,
  (p) => `Graded separately, FEV1 is grade ${p.g[0]} and FVC is grade ${p.g[1]} at baseline${p.g.length > 2 ? `, and FEV1 is grade ${p.g[2]} and FVC is grade ${p.g[3]} after the bronchodilator` : ''}`);
T('q-acceptable',
  (p) => `${p.accFev1} of ${p.n} maneuvers were acceptable for FEV1 and ${p.accFvc} of ${p.n} for FVC${p.reasons}`,
  (p) => `Acceptability criteria were met by ${p.accFev1} of ${p.n} maneuvers for FEV1 and by ${p.accFvc} of ${p.n} for FVC${p.reasons}`,
  (p) => `Of ${p.n} recorded maneuvers, ${p.accFev1} were acceptable for FEV1 and ${p.accFvc} for FVC${p.reasons}`);
T('q-rejected',
  (p) => `maneuvers were rejected for ${p.list}`,
  (p) => `the faults recorded were ${p.list}`,
  (p) => `rejection followed from ${p.list}`);
T('q-repeat',
  (p) => `The two largest acceptable values differ by ${p.fev1} for FEV1 and by ${p.fvc} for FVC, against a repeatability limit of 150 mL`,
  (p) => `Repeatability, the difference between the two largest acceptable values, is ${p.fev1} for FEV1 and ${p.fvc} for FVC, and the limit is 150 mL`,
  (p) => `Against the 150 mL repeatability limit, the two largest acceptable values differ by ${p.fev1} for FEV1 and ${p.fvc} for FVC`);
T('q-weaker',
  (p) => `The ${p.weak} grade is the lower of the two, so the FEV1/FVC ratio and the pattern rest more on the less reliable measurement`,
  (p) => `Because the ${p.weak} is the less well graded measurement, conclusions that depend on it carry more uncertainty than those that do not`,
  (p) => `Test quality differs between the two variables, and the ${p.weak} is the weaker`);
T('q-fvc-adjusted',
  () => 'The reported FVC was set equal to the FEV1 because the largest FEV1 came from a maneuver whose FVC was not accepted',
  () => 'Because the largest FEV1 came from a maneuver with an unaccepted FVC, the reported FVC was set equal to the FEV1',
  () => 'The FVC shown equals the FEV1, an adjustment made because the best FEV1 and the best FVC came from different maneuvers');
T('q-confidence-good',
  () => 'The technical quality is adequate, and the measurements support interpretation without additional reservation',
  () => 'Quality is adequate and does not reduce confidence in the classification of any index',
  () => 'The maneuvers are adequate in number and agreement, so the values can be classified with full confidence in the technique');
T('q-confidence-moderate',
  () => 'Agreement between maneuvers is less than ideal, so the interpretation carries reduced confidence, most of all for values near a limit',
  () => 'The interpretation is made with reduced confidence because repeatability is only fair',
  () => 'With only fair repeatability, the interpretation carries reduced confidence, and a value close to a limit may fall on either side');
T('q-confidence-limited',
  () => 'Quality is poor enough that every classification below is qualified and may change with better maneuvers',
  () => 'The results are qualified by test quality, and values near a limit cannot be assigned reliably',
  () => 'Because quality is poor, the interpretation is qualified throughout and indicative only');
T('q-confidence-unknown',
  () => 'No quality grade is available, so the interpretation carries reduced confidence in the technique',
  () => 'Without a recorded quality grade, repeatability cannot be judged and the interpretation carries reduced confidence',
  () => 'Grades were not recorded for this session, which leaves the interpretation with reduced confidence');
T('q-post-limited',
  (p) => `The post-bronchodilator maneuvers are of lower quality (FEV1 grade ${p.g[2]}, FVC grade ${p.g[3]}), so the bronchodilator comparison is qualified`,
  (p) => `Quality after the bronchodilator is poorer (FEV1 grade ${p.g[2]}, FVC grade ${p.g[3]}), and the response is therefore qualified`,
  (p) => `The comparison of post-bronchodilator with baseline values is qualified by the lower post-bronchodilator grades (FEV1 ${p.g[2]}, FVC ${p.g[3]})`);

// --- final statement: quality ---
const F1_GOOD = [
  (p) => `Technical quality is adequate (${p.gr}), and the results can be interpreted with confidence.`,
  (p) => `The maneuvers are acceptable and repeatable (${p.gr}), so the session is adequate and does not limit the interpretation.`,
  (p) => `With ${p.gr}, test quality is adequate for interpretation.`,
];
const F1_MODERATE = [
  (p) => `Agreement between maneuvers is only fair (${p.gr}), so the interpretation carries reduced confidence, most of all for values near a limit.`,
  (p) => `The session is ${p.gr}; the interpretation is made with reduced confidence.`,
  (p) => `With ${p.gr}, test quality supports interpretation with reduced confidence.`,
];
const F1_LIMITED = [
  (p) => `Test quality is poor (${p.gr}), and the interpretation is qualified accordingly.`,
  (p) => `Because the session is ${p.gr}, every classification below is qualified and may change with better maneuvers.`,
  (p) => `With ${p.gr}, the results are qualified by test quality and are indicative only.`,
];
const F1_UNKNOWN = [
  () => 'No quality grade was recorded, so the interpretation carries reduced confidence.',
  () => 'Test quality was not graded for this session, and the interpretation is made with reduced confidence.',
  () => 'Without a recorded quality grade, the interpretation carries reduced confidence.',
];
TYPES['f-quality-good'] = F1_GOOD; TYPES['f-quality-moderate'] = F1_MODERATE; TYPES['f-quality-limited'] = F1_LIMITED;
TYPES['f-quality-unknown'] = F1_UNKNOWN;
// A distractor that ignores poor quality uses the sentences of a correct adequate-quality statement, so its wording is no tell; only the grades it cites contradict it.
TYPES['f-quality-ignore'] = F1_GOOD;

// --- pattern ---
T('p-lowfvc',
  (p) => (p.haveTlc
    ? `the ${p.mz} is also ${p.rel}, but with a TLC that is not reduced this argues against restriction`
    : `the ${p.mz} is also ${p.rel}, which spirometry alone cannot assign to air trapping or to coexisting restriction`),
  (p) => (p.haveTlc
    ? `the FVC ${p.zp} is ${p.rel}, and with a TLC that is not reduced this does not indicate restriction`
    : `the FVC ${p.zp} is likewise ${p.rel}, and without a TLC air trapping and coexisting restriction cannot be separated`),
  (p) => (p.haveTlc
    ? `the ${p.mz} is also ${p.rel}; the TLC is not reduced, so the low FVC is not evidence of restriction`
    : `with the FVC ${p.zp} also ${p.rel}, air trapping and coexisting restriction cannot be distinguished on spirometry alone`));
T('p-near-limit',
  (p) => `the ${p.list} ${p.plural ? 'lie' : 'lies'} close to a limit of normal`,
  (p) => `the ${p.list} ${p.plural ? 'sit' : 'sits'} near a limit, so ${p.plural ? 'their classifications are' : 'its classification is'} uncertain`,
  (p) => `the ${p.list} ${p.plural ? 'are' : 'is'} near a limit of normal, and a small change in the measurement or the reference could move ${p.plural ? 'them' : 'it'} across the limit`);
const sev = (p) => p.sev;
T('p-normal',
  (p) => `FEV1, FVC and the FEV1/FVC ratio are each at or above their lower limits of normal, consistent with normal spirometry${sev(p)}.`,
  (p) => `Expiratory flow and vital capacity are preserved, and no spirometric index falls below its lower limit of normal, consistent with normal spirometry${sev(p)}.`,
  (p) => `No spirometric index lies below its lower limit of normal, consistent with normal spirometry${sev(p)}.`);
T('p-obstruction',
  (p) => `Expiratory flow is limited relative to lung volume: the ${p.R} is ${p.relR}, consistent with ${p.bl}airflow obstruction${sev(p)}.`,
  (p) => `Narrowed or collapsing airways empty the lungs slowly, so the ${p.R} is ${p.relR}, consistent with ${p.bl}airflow obstruction${sev(p)}.`,
  (p) => `The ${p.R} is ${p.relR}, indicating slowed expiratory flow, consistent with ${p.bl}airflow obstruction${sev(p)}.`);
T('p-restriction',
  (p) => `The lungs hold less gas at full inflation: the ${p.T} is ${p.relT} while the FEV1/FVC ratio is preserved, consistent with ${p.bl}restriction${sev(p)}.`,
  (p) => `A ${p.T} that is ${p.relT}, with a preserved FEV1/FVC ratio, shows reduced lung volume at full inflation, consistent with ${p.bl}restriction${sev(p)}.`,
  (p) => `Because the ${p.T} is ${p.relT} and the FEV1/FVC ratio is preserved, the findings are consistent with ${p.bl}restriction${sev(p)}.`);
T('p-mixed',
  (p) => `Both airflow and lung volume are reduced: the ${p.R} is ${p.relR} and the ${p.T} is ${p.relT}, consistent with mixed obstruction and restriction${sev(p)}.`,
  (p) => `Slowed expiratory flow and a small total lung capacity coexist, with the ${p.R} ${p.relR} and the ${p.T} ${p.relT}, consistent with mixed obstruction and restriction${sev(p)}.`,
  (p) => `The ${p.R} is ${p.relR} and the ${p.T} is ${p.relT}, so the findings are consistent with mixed obstruction and restriction${sev(p)}.`);
T('p-nonspecific',
  (p) => `Vital capacity or first-second volume is reduced although the lungs hold a normal amount of gas at full inflation: ${p.low} ${p.relL}, with a preserved ratio and a TLC within the reference range, consistent with a nonspecific pattern${sev(p)}.`,
  (p) => `With a preserved FEV1/FVC ratio and a TLC within the reference range, ${p.low} ${p.relL}, consistent with a nonspecific pattern${sev(p)}.`,
  (p) => `Expiration ends early relative to the volume the lungs contain: ${p.low} ${p.relL} while the ratio and the TLC are preserved, consistent with a nonspecific pattern${sev(p)}.`);
T('p-prism',
  (p) => `${cap(p.low)} ${p.relL} with a preserved FEV1/FVC ratio, consistent with preserved-ratio spirometric impairment${sev(p)}.`,
  (p) => `The ratio is preserved while ${p.low} ${p.relL}, consistent with preserved-ratio spirometric impairment${sev(p)}.`,
  (p) => `A low vital capacity or first-second volume with a preserved ratio is consistent with preserved-ratio spirometric impairment${sev(p)}, where ${p.low} ${p.relL}.`);
T('p-indeterminate',
  () => 'No FEV1 or FVC could be reported from this session, so no pattern can be assigned and the study cannot be interpreted.',
  () => 'The session yielded no reportable FEV1 or FVC, and the study cannot be interpreted.',
  () => 'Because no usable FEV1 or FVC was obtained, the study cannot be interpreted and no pattern is assigned.');
T('p-claim', // data-free pattern statement used by distractors that assert a pattern the values do not show
  (p) => `Expiratory airflow and lung volume are altered, and the findings are consistent with ${p.noun}${sev(p)}.`,
  (p) => `The spirometric findings are consistent with ${p.noun}${sev(p)}.`,
  (p) => `Taken together, the measurements are consistent with ${p.noun}${sev(p)}.`);
T('p-values',
  (p) => `Measured FEV1 is ${p.fev1}, FVC is ${p.fvc} and the FEV1/FVC ratio is ${p.ratio}; classification rests on the z-scores, and percent predicted is not used to classify.`,
  (p) => `The reported FEV1 is ${p.fev1}, the FVC ${p.fvc} and the FEV1/FVC ratio ${p.ratio}, each classified by z-score and not by percent predicted.`,
  (p) => `FEV1 of ${p.fev1}, FVC of ${p.fvc} and an FEV1/FVC ratio of ${p.ratio} are classified against the lower limit of normal, and percent predicted is shown for reference only.`);
T('p-severity-scored',
  (p) => `Grading impairment on ${p.mz}, with cut-points at ${MINUS}2.5 and ${MINUS}4.0, gives ${p.w} severity${p.within}.`,
  (p) => `The impairment is of ${p.w} severity on ${p.mz}, using continuous z-score bands${p.within}.`,
  (p) => `The ${p.mz} gives ${p.w} impairment, with cut-points at ${MINUS}2.5 and ${MINUS}4.0${p.within}.`);
T('p-severity-fev1-normal',
  (p) => `Low-ratio obstruction is mild despite the ${p.mz} lying within its reference range (2024 authors clarification).`,
  (p) => `The ${p.mz} is within its reference range; the low ratio still supports mild obstructive impairment.`,
  (p) => `A preserved ${p.mz} does not erase obstruction defined by the ratio; the impairment grade is mild.`);
T('p-severity-unscored',
  () => 'Severity is not graded for this pattern.',
  () => 'No severity grade is assigned to this pattern, so severity is not graded.',
  () => 'No single composite severity grade is assigned to this pattern; assess its components separately.');

// --- lung volumes ---
T('vf-tlc',
  (p) => `the ${p.mz} is ${p.rel}${p.hyper}`,
  (p) => `lung volumes show a ${p.mz} that is ${p.rel}${p.hyper}`,
  (p) => `${p.mz} is found ${p.rel}${p.hyper}`);
T('v-volume-qualified',
  (p) => `${p.list}: ${p.note}`,
  (p) => `for ${p.list}, ${p.note}`,
  (p) => `${p.list}; ${p.note}`);
T('v-low-erv',
  (p) => `the ${p.mz} is ${p.rel}, lowering the FRC, at a body mass index of ${p.bmi} kg/m²${p.note}`,
  (p) => `${p.mz} is ${p.rel}, which lowers the FRC; body mass index is ${p.bmi} kg/m²${p.note}`,
  (p) => `a reduced FRC follows from the ${p.mz} being ${p.rel}, with a body mass index of ${p.bmi} kg/m²${p.note}`);
T('v-missing-needed',
  (p) => `lung volumes were not measured, so restriction is not established, and lung volumes are needed ${p.purpose}`,
  (p) => `TLC was not measured, which leaves restriction unestablished; lung volumes are needed ${p.purpose}`,
  (p) => `restriction cannot be assessed because lung volumes were not measured, and lung volumes are needed ${p.purpose}`);
T('v-missing',
  () => 'lung volumes and diffusing capacity were not measured, so this interpretation applies to spirometry only',
  () => 'the report contains spirometry only: lung volumes and diffusing capacity were not measured',
  () => 'because lung volumes and diffusing capacity were not measured, the interpretation is limited to spirometry');
T('vs-restriction-support',
  () => 'A TLC below the lower limit of normal means that the lungs hold less gas at full inflation, whatever the cause',
  () => 'The reduction of TLC is the criterion for restriction; the cause of the reduced volume is not identified by lung function alone',
  () => 'Lung volume at full inflation is reduced, and spirometry alone could not have established this');
T('vs-normal-tlc',
  () => 'A TLC within the reference range argues against restriction',
  () => 'Because the TLC is not reduced, restriction is not supported',
  () => 'Lung volume at full inflation is preserved, which does not support restriction');

// --- diffusing capacity ---
T('df-cat',
  (p) => `the hemoglobin-adjusted ${p.mz} is ${p.cat}`,
  (p) => `adjusted for hemoglobin, the ${p.mz} is ${p.cat}`,
  (p) => `the ${p.mz}, adjusted for hemoglobin, is ${p.cat}`);
T('df-cat-nohb',
  (p) => `the ${p.mz}, reported without hemoglobin adjustment because no hemoglobin was available, is ${p.cat}`,
  (p) => `with no hemoglobin available, the ${p.mz} is classified without adjustment and is ${p.cat}`,
  (p) => `the ${p.mz} is ${p.cat}, classified without hemoglobin adjustment because no hemoglobin was available`);
T('df-unadjusted-claim',
  (p) => `the DLCO, taken as measured without hemoglobin adjustment, is ${p.cat}`,
  (p) => `without hemoglobin adjustment, the DLCO is ${p.cat}`,
  (p) => `the measured DLCO, used without hemoglobin adjustment, is ${p.cat}`);
T('df-raw-misleads',
  (p) => `without hemoglobin adjustment the measured DLCO would be classified as ${p.cat}, which would attribute an effect of hemoglobin to the lung`,
  (p) => `before hemoglobin adjustment the measured DLCO appears ${p.cat}, a classification that reflects hemoglobin and not the lung`,
  (p) => `the unadjusted DLCO would be read as ${p.cat}, an artifact of the hemoglobin concentration`);
T('df-subtype',
  (p) => `${p.hedge}${p.core}`,
  (p) => `on analysis of the components, ${p.hedge}${p.core}`,
  (p) => `the component analysis shows that ${p.hedge}${p.core}`);
T('ds-hb',
  (p) => `Hemoglobin concentration is ${p.hb} g/dL, and the measured DLCO of ${p.raw} mL/min/mmHg was adjusted to ${p.adj} mL/min/mmHg for the standard hemoglobin before classification.`,
  (p) => `The measured DLCO of ${p.raw} mL/min/mmHg corresponds to ${p.adj} mL/min/mmHg after adjustment from the patient's hemoglobin of ${p.hb} g/dL to the standard value.`,
  (p) => `Adjustment for a hemoglobin of ${p.hb} g/dL changes the measured DLCO from ${p.raw} mL/min/mmHg to ${p.adj} mL/min/mmHg, and the adjusted value is the one classified.`);
T('ds-hb-missing',
  (p) => `No hemoglobin was available, so the measured DLCO of ${p.raw} mL/min/mmHg is classified without hemoglobin adjustment; a low hemoglobin concentration lowers the measured value and a high one raises it.`,
  (p) => `Without a hemoglobin concentration the measured DLCO of ${p.raw} mL/min/mmHg cannot be adjusted, and it is classified as measured; anemia lowers the measured value and polycythemia raises it.`,
  (p) => `The hemoglobin concentration was not recorded, so the DLCO of ${p.raw} mL/min/mmHg is classified as measured; a low hemoglobin lowers it and a high hemoglobin raises it, independently of the lung.`);
T('ds-hb-direction',
  (p) => (p.low ? 'A low hemoglobin concentration lowers the measured DLCO because less hemoglobin is available to bind carbon monoxide.' : 'A high hemoglobin concentration raises the measured DLCO because more hemoglobin is available to bind carbon monoxide.'),
  (p) => (p.low ? 'Carbon monoxide uptake falls with the hemoglobin available to bind it, so a low hemoglobin concentration lowers the measured DLCO.' : 'Carbon monoxide uptake rises with the hemoglobin available to bind it, so a high hemoglobin concentration raises the measured DLCO.'),
  (p) => (p.low ? 'The measured DLCO is lowered by a low hemoglobin concentration independently of the condition of the lung.' : 'A high hemoglobin concentration increases the measured DLCO independently of the condition of the lung.'));
T('ds-cohb',
  (p) => `Carboxyhemoglobin was ${p.pct}%; carbon monoxide already bound to hemoglobin lowers the measured DLCO, and no correction for it is applied to the value reported here.`,
  (p) => `The carboxyhemoglobin of ${p.pct}% lowers the measured DLCO through back-pressure of carbon monoxide, and the reported value is not corrected for it.`,
  (p) => `With carboxyhemoglobin at ${p.pct}%, the measured DLCO is lowered by carbon monoxide already in the blood, and this report applies no carboxyhemoglobin correction.`);
T('ds-cohb-unmeasured',
  () => 'Carboxyhemoglobin was not measured; if smoking was recent, carbon monoxide already bound to hemoglobin lowers the measured DLCO, which may therefore be underestimated.',
  () => 'Without co-oximetry the carboxyhemoglobin is unknown, and the DLCO may be underestimated if smoking was recent.',
  () => 'No carboxyhemoglobin measurement was made, so the DLCO may be underestimated if smoking was recent, because carbon monoxide already in the blood lowers the measured value.');
T('ds-vatlc',
  (p) => `Alveolar volume is ${p.pct}% of TLC; in airflow obstruction uneven ventilation lowers this share, so the KCO is read together with the alveolar volume.`,
  (p) => `The alveolar volume measured by the single breath is ${p.pct}% of TLC, and the KCO is interpreted with that volume because uneven ventilation lowers the share in airflow obstruction.`,
  (p) => `VA is ${p.pct}% of TLC; where ventilation is uneven the single-breath volume understates TLC, and the KCO is read with the VA.`);
T('ds-severity',
  (p) => `Diffusion impairment is ${p.grade} by the DLCO z-score.`,
  (p) => `The DLCO z-score grades the diffusion impairment as ${p.grade}.`,
  (p) => `Diffusion impairment is graded ${p.grade}; this is not overall disease severity.`);
T('ds-value',
  (p) => `The ${p.which} is ${p.dlco} (predicted ${p.pred}), with alveolar volume ${p.va} and KCO ${p.kco}.`,
  (p) => `${cap(p.which)} is ${p.dlco} against a predicted ${p.pred}; alveolar volume is ${p.va} and KCO is ${p.kco}.`,
  (p) => `The values are DLCO ${p.dlco} (predicted ${p.pred}), alveolar volume ${p.va} and KCO ${p.kco}.`);

// --- bronchodilator ---
const bdSegments = (p) => ({
  a: `${p.r22 ? 'significant' : 'not significant'} by the 2022 criterion (change above 10% of the predicted value)`,
  b: `${p.rE ? 'significant' : 'not significant'} by the earlier criterion (change of at least 12% and 200 mL over baseline)`,
});
T('f-bd',
  (p) => { const s = bdSegments(p); return `The bronchodilator response is ${s.a} and ${s.b}.`; },
  (p) => { const s = bdSegments(p); return `The change in FEV1 and FVC after bronchodilator is ${s.a}; it is ${s.b}.`; },
  (p) => { const s = bdSegments(p); return `After bronchodilator the response is ${s.b}, and ${s.a}.`; });
T('bd-why',
  (p) => `the two criteria disagree because ${p.reason}`,
  (p) => `the criteria disagree: ${p.reason}`,
  (p) => `the result depends on the criterion, since ${p.reason}`);
T('bs-change',
  (p) => `After bronchodilator, FEV1 changed by ${p.dFev1} (${p.ppFev1} of the predicted value and ${p.pbFev1} of baseline) and FVC by ${p.dFvc} (${p.ppFvc} of the predicted value and ${p.pbFvc} of baseline).`,
  (p) => `The FEV1 change was ${p.dFev1}, which is ${p.ppFev1} of the predicted value and ${p.pbFev1} of baseline; the FVC change was ${p.dFvc}, which is ${p.ppFvc} of the predicted value and ${p.pbFvc} of baseline.`,
  (p) => `Bronchodilator changed FEV1 by ${p.dFev1} (${p.pbFev1} of baseline, ${p.ppFev1} of the predicted value) and FVC by ${p.dFvc} (${p.pbFvc} of baseline, ${p.ppFvc} of the predicted value).`);
T('bs-rule-explain',
  () => 'The 2022 criterion expresses the change as a percentage of the predicted value, so it also varies with the reference equation, whereas the earlier criterion relates the change to the baseline value and requires an absolute change of 200 mL.',
  () => 'Because the 2022 criterion divides the change by the predicted value, it varies with the reference equation; the earlier criterion divides by the baseline value and adds an absolute requirement of 200 mL.',
  () => 'The earlier criterion scales the change to the baseline and requires 200 mL, and the 2022 criterion scales it to the predicted value, which varies with the reference equation.');
T('bs-agree',
  () => 'The two criteria agree for this study.',
  () => 'Both criteria lead to the same classification here.',
  () => 'Neither criterion contradicts the other in this study.');
T('bs-post-ratio',
  (p) => `The post-bronchodilator FEV1/FVC ratio is ${p.ratio}, which ${p.phr} the lower limit of normal (${p.lln}).`,
  (p) => `With a post-bronchodilator ratio of ${p.ratio}, the FEV1/FVC ratio ${p.phr} the lower limit of normal (${p.lln}).`,
  (p) => `The ratio after bronchodilator, ${p.ratio}, ${p.phr} the lower limit of normal of ${p.lln}.`);
T('bd-discordant-short',
  () => 'the FEV1 and FVC responses are discordant in direction or size',
  () => 'the responses of FEV1 and FVC are discordant',
  () => 'FEV1 and FVC show a discordant response');
T('bd-discordant',
  (p) => {
    if (p.kind === 'opposite-fvc-fell') return `The FEV1 and FVC responses are discordant: the FVC fell while the FEV1 rose, and a shorter forced expiratory time after the bronchodilator lowers the FVC and raises the FEV1/FVC ratio without any change in the airways, so the expiratory times need review before the response is accepted.`;
    if (p.kind === 'opposite-fev1-fell') return `The FEV1 and FVC responses are discordant: the FEV1 fell while the FVC rose, and a weaker early effort or a bronchoconstrictor response after the bronchodilator lowers the FEV1 while a longer expiration raises the FVC, so the first-second effort and the expiratory times need review before the response is accepted.`;
    return `The FEV1 and FVC responses are discordant in size: ${p.bigger} rose more than ${p.smaller}, ${p.meaning}.`;
  },
  (p) => {
    if (p.kind === 'opposite-fvc-fell') return `The responses of FEV1 and FVC are discordant, with the FVC falling and the FEV1 rising; a shorter expiration after the bronchodilator can lower the FVC and improve the ratio without a change in the airways, which makes the expiratory times worth reviewing.`;
    if (p.kind === 'opposite-fev1-fell') return `The responses of FEV1 and FVC are discordant, with the FEV1 falling and the FVC rising; a weaker first-second effort after the bronchodilator can lower the FEV1 while a longer expiration raises the FVC, and bronchoconstriction is also possible, which makes the maneuvers worth reviewing.`;
    return `The responses of FEV1 and FVC are discordant in size, with ${p.bigger} rising more than ${p.smaller}; ${p.meaning}.`;
  },
  (p) => {
    if (p.kind === 'opposite-fvc-fell') return `Discordant directions of change are present, the FVC falling and the FEV1 rising, and a technique effect on expiratory time must be considered before the improvement in the ratio is attributed to the airways.`;
    if (p.kind === 'opposite-fev1-fell') return `Discordant directions of change are present, the FEV1 falling and the FVC rising, and a technique effect on the first-second effort or an induced airway narrowing must be considered before the change in the ratio is attributed to a lasting change in the airways.`;
    return `The two variables show a discordant response in size, ${p.bigger} more than ${p.smaller}, and ${p.meaning}.`;
  });

// --- sensitivity to the reference equation ---
const eqDetail = (p) => p.changes.map((c) => `${DISPLAY[c.measure]} is ${LABEL_PHRASE[c.from]} under ${p.nameA} (z-score ${zf(c.zA)}${c.border ? ', borderline' : ''}) but ${LABEL_PHRASE[c.to]} under ${p.nameB} (z-score ${zf(c.zB)}${c.border ? ', borderline' : ''})`).join('; ');
const eqPattern = (p) => (p.patternPart ? `, and the pattern is ${p.patternPart.a} under ${p.nameA} but ${p.patternPart.b} under ${p.nameB}` : '');
T('f-eq-flip',
  (p) => `The result depends on the reference equation: ${eqDetail(p)}${eqPattern(p)}${p.extra}.`,
  (p) => `Reclassification between equations matters here, since ${eqDetail(p)}${eqPattern(p)}${p.extra}, so the result depends on the reference equation.`,
  (p) => `Because ${eqDetail(p)}${eqPattern(p)}${p.extra}, the classification depends on the reference equation.`);
T('f-eq-borderline',
  (p) => `The ${p.list} ${p.plural ? 'lie' : 'lies'} within 0.25 z-score units of a limit, so the classification could change under another reference equation.`,
  (p) => `Because the ${p.list} ${p.plural ? 'are' : 'is'} near a limit, the classification could change under another reference equation.`,
  (p) => `Classification of the ${p.list} is borderline and could change under another reference equation.`);
T('f-eq-robust',
  (p) => `The ${p.m} has a z-score of ${p.zA} under ${p.nameA} and ${p.zB} under ${p.nameB}, and it is classified the same way under both reference equations.`,
  (p) => `The classification of the ${p.m} is the same under both reference equations, with z-scores of ${p.zA} under ${p.nameA} and ${p.zB} under ${p.nameB}.`,
  (p) => `Under ${p.nameA} and ${p.nameB} the ${p.m} has z-scores of ${p.zA} and ${p.zB}, and its classification is the same under both reference equations.`);
T('se-compare',
  (p) => `The same measurements were classified under ${p.nameA} and ${p.nameB}, and only the spirometry equation differs between the two runs.`,
  (p) => `Two classifications were made from identical measurements, one under ${p.nameA} and one under ${p.nameB}; only the spirometry equation differs between them.`,
  (p) => `${cap(p.nameA)} and ${p.nameB} were each applied to the same values, and any difference between the runs arises from the spirometry equation.`);
T('se-physiology',
  () => 'Reference equations differ in predicted value and in lower limit, so a measurement near a limit can be low under one equation and normal under another with no change in the lungs.',
  () => 'A measurement close to a lower limit can fall on either side of it depending on the equation, because predicted values and limits differ between equations while the lungs do not.',
  () => 'The predicted value and the lower limit both depend on the equation, and a value near the limit is classified differently when the equation changes even though the lungs are unchanged.');
T('se-stable',
  (p) => `No classification of FEV1, FVC or the FEV1/FVC ratio differs between ${p.nameA} and ${p.nameB}, and no spirometric value lies within 0.25 z-score units of a limit.`,
  (p) => `The classification of every spirometric index is the same under ${p.nameA} and ${p.nameB}, and no value is within 0.25 z-score units of a limit, so no classification differs between the equations.`,
  (p) => `Under ${p.nameA} and ${p.nameB} no classification differs, and none of the spirometric values is within 0.25 z-score units of a limit.`);
T('se-severity',
  (p) => `the severity grade is ${p.sevA} under ${p.nameA} and ${p.sevB} under ${p.nameB}`,
  (p) => `the severity grade is ${p.sevA} under ${p.nameA} but ${p.sevB} under ${p.nameB}`,
  (p) => `the severity grade is ${p.sevA} under ${p.nameA} and ${p.sevB} under ${p.nameB}, a change in grade caused by the equation alone`);
T('se-bd',
  () => 'the bronchodilator result by the 2022 criterion differs between the equations, because percent of predicted depends on the predicted value',
  () => 'the bronchodilator result by the 2022 criterion also differs between the equations, since the predicted value in its denominator differs',
  () => 'the bronchodilator classification differs between the equations through the predicted value used by the 2022 criterion');

// --- reference values and assumptions ---
T('r-equations',
  (p) => `Reference values were taken from ${p.parts}; the lower limit of normal is the z-score of ${MINUS}1.645, the fifth percentile.`,
  (p) => `The reference equations are ${p.parts}, and the lower limit of normal is the z-score of ${MINUS}1.645 (fifth percentile).`,
  (p) => `The fifth percentile, a z-score of ${MINUS}1.645, defines the lower limit of normal, and the reference equations used are ${p.parts}.`);
T('r-mixed',
  () => 'Because the indices come from more than one reference source, the pattern rests on more than one reference.',
  () => 'The pattern is built from indices referenced to different equations and therefore rests on more than one reference.',
  () => 'More than one reference source supplies the indices that define the pattern, so the pattern rests on more than one reference.');
T('r-fallback',
  (p) => `The reference population for ${p.what} (${p.eqs}) is of European ancestry, so it may represent a patient recorded as ${p.group} less well, which limits the result, and no ancestry adjustment is applied.`,
  (p) => `For ${p.what} the ${p.eqs} ${p.was} applied, and its reference population is of European ancestry; how closely that population represents a patient recorded as ${p.group} is uncertain, and this limits the result.`,
  (p) => `The ${p.eqs}, derived in people of European ancestry, ${p.was} applied to ${p.what}; the reference population may not represent a patient recorded as ${p.group} well, and the result carries that limitation without any ancestry adjustment.`);
T('r-age',
  (p) => `The patient's age lies outside the range of the ${p.eq} equation, so ${p.what} could not be referenced.`,
  (p) => `${cap(p.what)} could not be referenced because the patient's age is outside the range of the ${p.eq} equation.`,
  (p) => `No reference value exists for ${p.what} at this age under the ${p.eq} equation.`);
T('r-age-cap',
  (p) => `The patient is older than the upper age limit of the ${p.eq} equation (${p.max} years), so the reference values for ${p.max} years were used for ${p.what}.`,
  (p) => `For ${p.what} the ${p.eq} reference values at ${p.max} years, the upper limit of the equation, were applied because the patient is older.`,
  (p) => `${cap(p.what)} was referenced at the equation's upper age limit of ${p.max} years (${p.eq}), since the patient is older than that.`);
T('r-height',
  (p) => `Height of ${p.cm} cm was taken from ${p.source} and not measured directly; predicted values scale with height, so uncertainty in height carries into every z-score.`,
  (p) => `The height used for prediction, ${p.cm} cm, comes from ${p.source}, and because predicted values scale with height, any error in it shifts every z-score.`,
  (p) => `Stature was not measured; ${p.cm} cm from ${p.source} was used, and the predicted values and z-scores depend on that assumed height.`);
T('r-sex',
  (p) => `Reference values were calculated for ${p.used} sex, which differs from the sex recorded at birth (${p.birth}); predicted values and limits would change if the other were used.`,
  (p) => `The prediction used ${p.used} sex and not the ${p.birth} sex recorded at birth, so the predicted values and limits are those of the sex assumed.`,
  (p) => `Reference equations were applied for ${p.used} sex, an assumption that differs from the recorded sex at birth (${p.birth}) and that changes the predicted values and limits.`);
T('r-sex-default',
  (p) => `Sex was not disclosed, so reference values were calculated for ${p.used} sex, the laboratory default; predicted values and limits would change with the other sex.`,
  (p) => `The patient did not give a sex, and the laboratory default of ${p.used} sex was used for the prediction, so the predicted values and limits are those of the sex assumed.`,
  (p) => `Reference equations were applied for ${p.used} sex by laboratory default because sex was not disclosed, an assumption that changes the predicted values and limits.`);

// --- limitations ---
T('l-major',
  (p) => `Stated limitations: ${p.items}`,
  (p) => `The interpretation is limited by the following: ${p.items}`,
  (p) => `The interpretation is subject to these limitations: ${p.items}`);
T('l-minor',
  (p) => `Further, less important points: ${p.items}`,
  (p) => `Minor limitations also apply: ${p.items}`,
  (p) => `Additional minor points: ${p.items}`);
T('l-noeffect',
  (p) => `the following do not change the interpretation: ${p.items}`,
  (p) => `${p.items}; these items do not change the interpretation`,
  (p) => `items that do not change the interpretation: ${p.items}`);
T('l-generic',
  () => 'The interpretation rests on the measured values, the stated demographics and the reference equations alone; clinical history, symptoms and earlier studies are not available.',
  () => 'Only the measurements, the recorded demographics and the reference equations inform this interpretation, which cannot take account of clinical history or earlier studies.',
  () => 'No clinical history, symptoms or earlier results were available, so the interpretation depends on the measurements, the demographics and the reference equations.');
T('l-fallback',
  () => 'The volume and transfer-factor classifications rest on a reference population of European ancestry, which may represent this patient less well.',
  () => 'Where the reference population differs in ancestry from the patient, the classification of the volume and transfer-factor indices is less certain.',
  () => 'The lung volume and transfer-factor classifications carry added uncertainty because their reference population is of European ancestry.');
T('l-none',
  () => 'No session-specific limitations were recorded beyond those of the reference equations.',
  () => 'Apart from the limits of the reference equations, no specific limitation was recorded for this session.',
  () => 'The session carries no recorded limitation other than those inherent to the reference equations.');

// --- over-diagnosis (distractors only) ---
T('f-dx',
  (p) => (p.kind === 'exclude' ? `These findings exclude ${p.term}.` : `These findings are diagnostic of ${p.term}.`),
  (p) => (p.kind === 'exclude' ? `Together they establish that ${p.term} is absent.` : `Together they establish ${p.term}.`),
  (p) => (p.kind === 'exclude' ? `They make ${p.term} an unlikely explanation.` : `They point to ${p.term} as the likely cause.`));

// The percent-predicted convention. The sentence is used by a correct statement (which then names the engine label) and by the
// distractor that applies the 80% rule, so the phrasing is the same in both and only the stated classification differs.
T('f-pctpred',
  (p) => `the ${p.nm} is ${p.pp}% of predicted, ${p.dir} the conventional 80% threshold, with a z-score of ${p.z}, and is classified as ${p.status}`,
  (p) => `on percent predicted, the ${p.nm} is ${p.pp}% of predicted, ${p.dir} the conventional 80% threshold, and its z-score of ${p.z} gives a classification of ${p.status}`,
  (p) => `by the percent-predicted convention, the ${p.nm} is ${p.pp}% of predicted, ${p.dir} the conventional 80% threshold; with a z-score of ${p.z} it is classified as ${p.status}`);

// ---------------------------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------------------------

function makeContext(caseData, interp, cmp, { finalCaveats = true } = {}) {
  const m = interp.measures ?? {};
  const report = caseData.report ?? {};
  const patient = report.patient ?? {};
  const has = (k) => Boolean(m[k]) && m[k].available !== false && Number.isFinite(m[k].z);
  const band = (k) => {
    const e = m[k];
    if (e.label === 'low') return e.borderline ? 'low-borderline' : 'low';
    if (e.label === 'high') return e.borderline ? 'high-borderline' : 'high';
    return e.borderline ? (e.z < 0 ? 'normal-low' : 'normal-high') : 'normal';
  };
  const zp = (k) => `(z-score ${zf(m[k].z)}${m[k].borderline ? ', borderline' : ''})`;
  const mz = (k) => `${DISPLAY[k]} ${zp(k)}`;
  const rel = (k) => REL[band(k)];
  const val = (k) => {
    const v = m[k].value;
    if (k === 'fev1_fvc') return v.toFixed(2);
    if (k === 'rv_tlc') return `${v.toFixed(0)}%`;
    if (k === 'dlco') return `${v.toFixed(1)} mL/min/mmHg`;
    if (k === 'kco') return `${v.toFixed(2)} mL/min/mmHg/L`;
    return `${v.toFixed(2)} L`;
  };

  const g = report.grades ?? {};
  const gradesPre = [interp.key?.gradeFev1 ?? g.fev1 ?? null, interp.key?.gradeFvc ?? g.fvc ?? null];
  const hasBd = Boolean(interp.bd);
  const gradesPost = hasBd ? [g.postFev1 ?? null, g.postFvc ?? null] : [];
  const letters = [...gradesPre, ...gradesPost];
  const graded = gradesPre.every((x) => x in GRADE_RANK) && (!hasBd || gradesPost.every((x) => x in GRADE_RANK));
  const worstPre = Math.max(...gradesPre.map((x) => GRADE_RANK[x] ?? -1));
  const worstPost = gradesPost.length ? Math.max(...gradesPost.map((x) => GRADE_RANK[x] ?? -1)) : -1;
  const worst = Math.max(worstPre, worstPost);
  const tier = !graded ? 'unknown' : worst <= 1 ? 'good' : worst === 2 ? 'moderate' : 'limited';
  const postLimited = worstPost >= 3;

  const hasVol = has('tlc');
  const hasDlco = has('dlco');
  const scen = caseData.scenario ?? null;
  const caveats = { major: [], minor: [], noEffect: [] };
  for (const c of Array.isArray(scen?.caveats) ? scen.caveats : []) {
    const text = String(c?.text ?? '').trim();
    if (!text) continue;
    const noEffect = CAVEAT_NO_EFFECT.test(text);
    const clause = CAVEAT_PARAPHRASE[c.id] ?? (noEffect ? 'an item recorded for this session' : GENERIC_CAVEAT);
    if (noEffect) caveats.noEffect.push(caveatCore(clause));
    else (c.weight === 'major' ? caveats.major : caveats.minor).push(clause);
  }

  const dl = caseData.dlco ?? null;
  const hbOk = hbKnown(dl);
  const rawDlco = dl && Number.isFinite(dl.raw) ? dl.raw : null;
  let rawCat = null;
  // Without a hemoglobin the reported value is the measured value, so there is no separate unadjusted category.
  if (hasDlco && rawDlco !== null && hbOk) rawCat = rawDlco < m.dlco.lln ? 'reduced' : rawDlco > m.dlco.uln ? 'raised' : 'normal';
  const hbFactor = dl && hbOk && Number.isFinite(dl.hbFactor) ? dl.hbFactor : null;
  const hbMaterial = hbFactor !== null && Math.abs(hbFactor - 1) >= 0.05;
  const bmi = patient.weightKg && patient.heightCm ? patient.weightKg / (patient.heightCm / 100) ** 2 : null;

  // comparison of the two spirometry equations
  const cmpOk = Boolean(cmp && cmp.a && cmp.b);
  const flips = cmpOk ? cmp.labelChanges ?? [] : [];
  const borderMeasures = ['fev1', 'fvc', 'fev1_fvc', 'tlc', 'dlco'].filter((k) => has(k) && m[k].borderline);
  const eqSensitive = cmpOk && (flips.length > 0 || cmp.patternChanged || cmp.severityChanged || cmp.bronchodilatorChanged);

  return {
    m, has, band, zp, mz, rel, val, report, patient, scen, caveats, tier, letters, graded, hasBd, postLimited, hasVol, hasDlco,
    interp, key: interp.key ?? {}, pattern: interp.pattern, bd: interp.bd ?? null, dl: interp.dlco ?? null, caseData,
    rawCat, rawDlco, hbOk, hbFactor, hbMaterial, bmi, finalCaveats, cmp: cmpOk ? cmp : null, flips, borderMeasures, eqSensitive,
    limited: tier === 'limited',
    sevScored: Boolean(interp.severity?.scored),
    sevNotGraded: Boolean(interp.severity?.notGraded),
    sevWord: interp.severity?.scored ? interp.severity.id : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Fragment builders shared by the sections and the final statement
// ---------------------------------------------------------------------------------------------

const gradesClause = (ctx) => {
  const [a, b, c, d] = ctx.letters;
  return `grade ${a} for FEV1 and grade ${b} for FVC${ctx.hasBd ? ` before bronchodilator and grade ${c} for FEV1 and grade ${d} for FVC after` : ''}`;
};

function severityClause(ctx, s) {
  if (!s || s.kind === 'none') return '';
  if (s.kind === 'unscored') return ', with severity not graded for this pattern';
  if (s.kind === 'fev1-normal') return ', of mild obstructive impairment with FEV1 within its reference range';
  if (s.bare || !ctx.has('fev1')) return `, of ${s.word} severity`;
  const measure = ctx.a?.severity?.measure ?? ctx.interp?.severity?.measure ?? (ctx.pattern === 'restriction' ? 'tlc' : 'fev1');
  const within = ctx.m[measure]?.label !== 'low';
  return `, of ${s.word} severity, graded on ${ctx.mz(measure)}${within ? ', which itself lies within the reference range' : ''}`;
}

function lowSpirometry(ctx) {
  const ks = ['fvc', 'fev1'].filter((k) => ctx.has(k) && ctx.m[k].label === 'low');
  const names = ks.map((k) => `the ${ctx.mz(k)}`);
  const allBorder = ks.every((k) => ctx.m[k].borderline);
  return { ks, low: list(names), verb: ks.length > 1 ? 'are' : 'is', rel: allBorder ? REL['low-borderline'] : REL.low };
}

/** Measures whose z-score appears in the main pattern sentence, so the near-limit clause does not repeat them. */
function covered(ctx, patternId, sevKind) {
  const c = new Set(sevKind === 'scored' ? ['fev1'] : []);
  if (patternId === 'obstruction' || patternId === 'obstruction-low-fvc') { c.add('fev1_fvc'); if (ctx.has('fvc') && ctx.m.fvc.label === 'low') c.add('fvc'); }
  if (patternId === 'restriction') c.add('tlc');
  if (patternId === 'mixed') { c.add('fev1_fvc'); c.add('tlc'); }
  if (patternId === 'nonspecific' || patternId === 'prism') for (const k of lowSpirometry(ctx).ks) c.add(k);
  return c;
}

/** Main pattern sentence plus the low-FVC and near-limit clauses. */
function patternSentence(ctx, P, claim, sevState, skipNear = false) {
  const id = claim.id;
  const sevText = severityClause(ctx, sevState);
  let s;
  if (claim.synthetic) {
    s = P('p-claim', { noun: NOUN[id], sev: sevText });
  } else if (id === 'normal') {
    s = P('p-normal', { sev: '' });
  } else if (id === 'obstruction' || id === 'obstruction-low-fvc') {
    s = P('p-obstruction', { R: ctx.mz('fev1_fvc'), relR: ctx.rel('fev1_fvc'), bl: ctx.m.fev1_fvc.borderline ? 'borderline ' : '', sev: sevText });
  } else if (id === 'restriction') {
    s = P('p-restriction', { T: ctx.mz('tlc'), relT: ctx.rel('tlc'), bl: ctx.m.tlc.borderline ? 'borderline ' : '', sev: sevText });
  } else if (id === 'mixed') {
    s = P('p-mixed', { R: ctx.mz('fev1_fvc'), relR: ctx.rel('fev1_fvc'), T: ctx.mz('tlc'), relT: ctx.rel('tlc'), sev: sevText });
  } else if (id === 'nonspecific' || id === 'prism') {
    const l = lowSpirometry(ctx);
    s = P(id === 'prism' ? 'p-prism' : 'p-nonspecific', { low: l.low, relL: `${l.verb} ${l.rel}`, sev: sevText });
  } else {
    s = P('p-indeterminate', {});
  }
  const extra = [];
  if (!claim.synthetic && (id === 'obstruction' || id === 'obstruction-low-fvc') && ctx.has('fvc') && ctx.m.fvc.label === 'low') {
    extra.push(P('p-lowfvc', { haveTlc: ctx.hasVol, mz: ctx.mz('fvc'), zp: ctx.zp('fvc'), rel: ctx.rel('fvc') }));
  }
  if (!claim.synthetic && id !== 'indeterminate' && !skipNear) {
    const cov = covered(ctx, id, sevState?.kind);
    const near = ['fev1_fvc', 'fvc', 'fev1', 'tlc'].filter((k) => ctx.has(k) && ctx.m[k].borderline && !cov.has(k));
    if (near.length) extra.push(P('p-near-limit', { list: list(near.map((k) => ctx.mz(k))), plural: near.length > 1 }));
  }
  return extra.length ? `${s.replace(/\.$/, '')}; ${extra.join('; ')}.` : s;
}

function airTrappingFragment(ctx, P) {
  const finding = ctx.interp.flags.find((f) => ['high-rv-tlc', 'air-trapping'].includes(f.id));
  if (!finding || !ctx.has('rv_tlc')) return null;
  return P('v-volume-qualified', { list: ctx.mz('rv_tlc'), note: finding.text.replace(/\.$/, '').replace(/\. /g, '; ') });
}

function lowErvFragment(ctx, P) {
  if (!(ctx.has('erv') && ctx.m.erv.label === 'low') || ctx.bmi === null) return null;
  const note = ctx.bmi >= 30 ? ', where chest-wall load from body mass commonly contributes' : ', a value that does not itself account for the reduction';
  return P('v-low-erv', { mz: ctx.mz('erv'), rel: ctx.rel('erv'), bmi: ctx.bmi.toFixed(1), note });
}

function tlcFragment(ctx, P) {
  const finding = ctx.interp.flags.find((f) => ['possible-hyperinflation', 'high-tlc'].includes(f.id));
  const hyper = finding ? `; ${finding.text.replace(/\.$/, '').replace(/\. /g, '; ')}` : '';
  return P('vf-tlc', { mz: ctx.mz('tlc'), rel: ctx.rel('tlc'), hyper });
}

function missingVolumesFragment(ctx, P) {
  if (ctx.pattern === 'prism') return P('v-missing-needed', { purpose: 'to establish whether the TLC is reduced' });
  if (ctx.pattern === 'obstruction-low-fvc') return P('v-missing-needed', { purpose: 'to separate air trapping from coexisting restriction' });
  return P('v-missing', {});
}

function subtypeCore(ctx) {
  const st = ctx.dl?.subtype;
  const CORES = {
    'low-kco-preserved-va': 'the KCO is reduced and the alveolar volume is preserved, which can reflect impaired gas transfer without an isolated reduction in measured alveolar volume',
    'low-va-high-kco': 'the alveolar volume is reduced and the KCO is raised, which can accompany incomplete expansion or localized volume loss; a raised KCO does not prove structurally intact gas-exchanging tissue',
    'low-va-normal-kco': 'the alveolar volume is reduced and the KCO is within the reference range, and because the KCO normally rises as expansion falls this suggests an intrinsic defect in addition to the volume loss',
    'both-low': 'both the alveolar volume and the KCO are reduced, which can reflect volume loss together with impaired gas transfer',
    'low-dlco-only': 'the alveolar volume and the KCO are each within their ranges, so the lowering of transfer is shared between the two components',
    'normal-kco-at-low-va': 'the alveolar volume is reduced and the KCO is not raised as expected for that volume, which can accompany a small intrinsic defect',
  };
  if (st && CORES[st]) return CORES[st];
  if (ctx.has('kco') && ctx.m.kco.label === 'high') {
    if (ctx.has('va') && ctx.m.va.label === 'low') return CORES['low-va-high-kco'];
    return 'the KCO is raised with an alveolar volume within the reference range, which can accompany an increased pulmonary capillary blood volume';
  }
  return null;
}

/** Qualification placed before the KCO and alveolar volume reading: a borderline value, or an unknown hemoglobin that could account for part of the change. */
function subtypeHedge(ctx) {
  const parts = [];
  if (ctx.m.dlco.borderline && ctx.dl.category !== 'normal') parts.push('with the transfer factor only marginally outside its limit');
  if (!ctx.hbOk) parts.push('because the hemoglobin is unknown and could account for part of the change');
  return parts.length ? `${parts.join(' and ')}, ` : '';
}

function dlcoCatPhrase(ctx, cat) {
  const e = ctx.m.dlco;
  if (cat === 'reduced') return e.borderline && ctx.dl?.category === 'reduced' ? 'only marginally reduced' : 'reduced';
  if (cat === 'raised') return e.borderline && ctx.dl?.category === 'raised' ? 'only marginally raised' : 'raised';
  return DLCO_CAT.normal;
}

// ---------------------------------------------------------------------------------------------
// Final statement
// ---------------------------------------------------------------------------------------------

function correctClaims(ctx) {
  let severity = { kind: 'none' };
  if (ctx.pattern !== 'normal' && ctx.pattern !== 'indeterminate') severity = ctx.sevScored ? { kind: 'scored', word: ctx.sevWord } : ctx.sevNotGraded ? { kind: 'fev1-normal' } : { kind: 'unscored' };
  return {
    quality: 'tier',
    pattern: { id: ctx.pattern, synthetic: false },
    severity,
    dx: null,
    pctpred: pctPredTarget(ctx),
    pctpredStatus: 'engine',
    volumes: 'full',
    bd: ctx.bd ? 'both' : null,
    dlco: ctx.hasDlco ? 'adjusted' : null,
    equation: 'auto',
    caveats: 'full',
  };
}

function bdWhy(ctx) {
  const bd = ctx.bd;
  if (bd.rulesAgree) return null;
  if (bd.rule2022.significant) {
    const v = bd.rule2022.which[0]; const k = v.toLowerCase();
    const d = k === 'fev1' ? bd.dFev1 : bd.dFvc;
    const fail = bd.pctBase[k] < 12 ? `${bdPctBaseText(bd.pctBase[k])}% of the baseline value, under the 12% the earlier criterion requires` : `${bdMlText(d)} mL, under the 200 mL the earlier criterion requires`;
    return `the ${v} change is ${pctPred(bd.pctPred[k])} of the predicted value, above the 10% the 2022 criterion requires, but ${fail}`;
  }
  const v = bd.rule2005.which[0]; const k = v.toLowerCase();
  return `the ${v} change is ${bdPctBaseText(bd.pctBase[k])}% of a low baseline value and at least 200 mL, which meets the earlier criterion, but only ${pctPred(bd.pctPred[k])} of the predicted value, under the 10% the 2022 criterion requires`;
}

function equationDetail(ctx) {
  const cmp = ctx.cmp;
  const nameA = eqName(cmp.a.spirometryEquation), nameB = eqName(cmp.b.spirometryEquation);
  const changes = ctx.flips.map((c) => ({ ...c, border: ctx.cmp.a.measures?.[c.measure]?.borderline || ctx.cmp.b.measures?.[c.measure]?.borderline }));
  const noun = (p) => NOUN[p] ?? p;
  const patternPart = cmp.patternChanged ? { a: noun(cmp.a.pattern), b: noun(cmp.b.pattern) } : null;
  return { nameA, nameB, changes, patternPart };
}

function sensitivityFlip(ctx, P) {
  const d = equationDetail(ctx);
  const extras = [];
  if (!ctx.cmp.patternChanged && ctx.cmp.severityChanged) {
    extras.push(P('se-severity', { sevA: ctx.cmp.a.severity?.id ?? 'not graded', sevB: ctx.cmp.b.severity?.id ?? 'not graded', nameA: d.nameA, nameB: d.nameB }));
  }
  if (ctx.cmp.bronchodilatorChanged) extras.push(P('se-bd', {}));
  if (d.changes.length) return P('f-eq-flip', { ...d, extra: extras.length ? `; ${extras.join('; ')}` : '' });
  // The classification of FEV1, FVC and the ratio is the same under both equations, but the severity grade or the bronchodilator result is not.
  return extras.length ? sentence(`${cap(extras.join('; '))}, so the result depends on the reference equation`) : '';
}

/** Parameters of the sentence that says the classification does not depend on the equation. Null when no spirometric z-score exists. */
function robustParams(ctx) {
  if (!ctx.cmp) return null;
  const pref = ctx.flips.length ? [ctx.flips[0].measure] : [];
  for (const k of [...pref, 'fev1_fvc', 'fev1', 'fvc']) {
    const a = ctx.cmp.a.measures?.[k], b = ctx.cmp.b.measures?.[k];
    if (a && b && a.available !== false && b.available !== false && Number.isFinite(a.z) && Number.isFinite(b.z)) {
      return { m: DISPLAY[k], zA: zf(a.z), zB: zf(b.z), nameA: eqName(ctx.cmp.a.spirometryEquation), nameB: eqName(ctx.cmp.b.spirometryEquation) };
    }
  }
  return null;
}

function buildFinal(ctx, c, P) {
  const out = [];

  // 1. quality
  const gr = ctx.graded ? gradesClause(ctx) : '';
  if (c.quality === 'ignore') out.push(P('f-quality-ignore', { gr }));
  else if (ctx.tier === 'unknown') out.push(P('f-quality-unknown', {}));
  else out.push(P(`f-quality-${ctx.tier}`, { gr }));

  // 2. pattern and severity, with any wrong claim a distractor adds
  const skipNear = c.equation === 'auto' && ctx.cmp && !ctx.eqSensitive && ctx.borderMeasures.length > 0;
  let s2 = patternSentence(ctx, P, c.pattern, c.severity, skipNear);
  if (c.pctpred) {
    const q = c.pctpred;
    const status = c.pctpredStatus === 'wrong' ? (q.claim === 'normal' ? LABEL_PHRASE.normal : LABEL_PHRASE.low) : LABEL_PHRASE[ctx.m[q.k].label];
    s2 = `${s2.replace(/\.$/, '')}; ${P('f-pctpred', { nm: DISPLAY[q.k], pp: q.pp, dir: q.pp >= 80 ? 'at or above' : 'below', z: zf(ctx.m[q.k].z), status })}.`;
  }
  out.push(s2);
  if (c.dx) out.push(P('f-dx', c.dx));

  // 3. lung volumes and diffusing capacity
  if (c.volumes !== 'omit') {
    const pieces = [];
    if (ctx.hasVol) {
      if (c.pattern.synthetic || !['restriction', 'mixed'].includes(c.pattern.id)) pieces.push(tlcFragment(ctx, P));
      const at = airTrappingFragment(ctx, P); if (at) pieces.push(at);
      const erv = lowErvFragment(ctx, P); if (erv) pieces.push(erv);
    } else pieces.push(missingVolumesFragment(ctx, P));
    if (c.dlco === 'adjusted' && ctx.hasDlco) {
      pieces.push(P(ctx.hbOk ? 'df-cat' : 'df-cat-nohb', { mz: ctx.mz('dlco'), cat: dlcoCatPhrase(ctx, ctx.dl.category) }));
      if (ctx.rawCat && ctx.rawCat !== ctx.dl.category) pieces.push(P('df-raw-misleads', { cat: DLCO_CAT[ctx.rawCat] }));
      const core = subtypeCore(ctx); if (core) pieces.push(P('df-subtype', { core, hedge: subtypeHedge(ctx) }));
    } else if (c.dlco && typeof c.dlco === 'object') {
      pieces.push(P('df-unadjusted-claim', { cat: DLCO_CAT[c.dlco.cat] }));
    }
    if (!pieces.length && ctx.hasVol) pieces.push(tlcFragment(ctx, P));
    if (pieces.length) out.push(sentence(cap(pieces.join('; '))));
  }

  // 4. bronchodilator
  if (ctx.bd && c.bd === 'both') {
    let s = P('f-bd', { r22: ctx.bd.rule2022.significant, rE: ctx.bd.rule2005.significant });
    const why = bdWhy(ctx);
    if (why) s = `${s.replace(/\.$/, '')}; ${P('bd-why', { reason: why })}.`;
    if (ctx.bd.discordant) s = `${s.replace(/\.$/, '')}; ${P('bd-discordant-short', {})}.`;
    out.push(s);
  } else if (ctx.bd && c.bd === 'earlier-as-2022') {
    // The earlier criterion's result is reported under the 2022 label, so the two criteria appear to agree.
    out.push(P('f-bd', { r22: ctx.bd.rule2005.significant, rE: ctx.bd.rule2005.significant }));
  }

  // 5. reference equation
  if (c.equation === 'robust') {
    const rp = robustParams(ctx);
    if (rp) out.push(P('f-eq-robust', rp));
  } else if (c.equation === 'auto' && ctx.cmp) {
    if (ctx.eqSensitive) {
      const s = sensitivityFlip(ctx, P);
      if (s) out.push(s);
    } else if (ctx.borderMeasures.length) {
      out.push(P('f-eq-borderline', { list: list(ctx.borderMeasures.map((k) => ctx.mz(k))), plural: ctx.borderMeasures.length > 1 }));
    } else {
      const rp = robustParams(ctx);
      if (rp) out.push(P('f-eq-robust', rp));
    }
  }

  // 6. limitations
  if (c.caveats === 'full' && ctx.finalCaveats && (ctx.caveats.major.length || ctx.caveats.noEffect.length)) {
    const parts = [];
    if (ctx.caveats.major.length) parts.push(P('l-major', { items: ctx.caveats.major.join('; ') }));
    if (ctx.caveats.noEffect.length) parts.push(P('l-noeffect', { items: ctx.caveats.noEffect.join('; ') }));
    out.push(sentence(cap(parts.length > 1 ? `${parts[0]}; ${parts[1]}` : parts[0])));
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

function qualitySection(ctx, P) {
  const cd = ctx.caseData;
  const out = [];
  if (ctx.graded) out.push(sentence(P('q-grades', { g: ctx.letters })));
  const pre = cd.spirometry?.pre;
  const sum = pre?.summary;
  if (sum && pre.maneuvers?.length) {
    const reasons = new Set();
    for (const e of sum.evaluations ?? []) { for (const r of e.fev1.reasons) reasons.add(r); for (const r of e.fvc.reasons) reasons.add(r); }
    const rtxt = reasons.size ? `; ${P('q-rejected', { list: list([...reasons]) })}` : '';
    out.push(sentence(P('q-acceptable', { accFev1: sum.nAcceptable.fev1, accFvc: sum.nAcceptable.fvc, n: pre.maneuvers.length, reasons: rtxt })));
    const sp = sum.spread ?? {};
    if (Number.isFinite(sp.fev1) && Number.isFinite(sp.fvc)) out.push(sentence(P('q-repeat', { fev1: `${Math.round(sp.fev1 * 1000)} mL`, fvc: `${Math.round(sp.fvc * 1000)} mL` })));
    if (sum.fvcAdjusted) out.push(sentence(P('q-fvc-adjusted', {})));
  }
  if (ctx.graded) {
    const [a, b] = ctx.letters;
    if (a !== b && (GRADE_RANK[a] ?? 0) !== (GRADE_RANK[b] ?? 0)) {
      const weak = GRADE_RANK[a] > GRADE_RANK[b] ? 'FEV1' : 'FVC';
      out.push(sentence(P('q-weaker', { weak })));
    }
  }
  if (ctx.hasBd && ctx.postLimited) out.push(sentence(P('q-post-limited', { g: ctx.letters })));
  out.push(sentence(P(ctx.tier === 'unknown' ? 'q-confidence-unknown' : `q-confidence-${ctx.tier}`, {})));
  return out.join(' ');
}

function referenceSection(ctx, P) {
  const out = [];
  const m = ctx.m;
  const parts = [];
  const ids = new Set();
  const use = (k, what) => { if (ctx.has(k)) { parts.push(`${eqName(m[k].equationId)} for ${what}`); ids.add(m[k].equationId); } };
  use('fev1', 'spirometric indices');
  use('tlc', 'lung volumes');
  use('dlco', 'transfer factor');
  if (parts.length) out.push(sentence(P('r-equations', { parts: list(parts) })));
  if (ids.size > 1) out.push(sentence(P('r-mixed', {})));
  const group = ctx.patient.group ?? 'not stated';
  const fb = [];
  for (const [k, what] of [['tlc', 'lung volumes'], ['dlco', 'transfer factor']]) if (m[k] && m[k].available !== false && m[k].matched === false && m[k].fallbackReason === 'equation-derived-in-european-ancestry-only') fb.push({ what, eq: eqName(m[k].equationId) });
  if (fb.length) { const eqs = [...new Set(fb.map((x) => x.eq))]; out.push(sentence(P('r-fallback', { group, what: list(fb.map((x) => x.what)), eqs: `${list(eqs)} equation${eqs.length > 1 ? 's' : ''}`, was: eqs.length > 1 ? 'were' : 'was' }))); }
  for (const [k, what] of [['fev1', 'spirometry'], ['tlc', 'lung volumes'], ['dlco', 'transfer factor']]) if (m[k] && m[k].available === false && m[k].fallbackReason === 'age-outside-range') out.push(sentence(P('r-age', { what, eq: eqName(m[k].equationId) })));
  const capped = [['fev1', 'spirometry'], ['tlc', 'lung volumes'], ['dlco', 'transfer factor']].filter(([k]) => m[k]?.ageClamped);
  for (const [k, what] of capped) out.push(sentence(P('r-age-cap', { what, eq: eqName(m[k].equationId), max: m[k].ageUsed })));
  const sc = ctx.scen;
  if (sc?.height && sc.height.source && sc.height.source !== 'measured' && Number.isFinite(sc.height.statedCm)) {
    const SRC = { 'arm-span': 'arm span', ulna: 'ulna length', reported: 'the patient’s report' };
    out.push(sentence(P('r-height', { cm: sc.height.statedCm, source: SRC[sc.height.source] ?? sc.height.source })));
  }
  if (sc?.referenceSex?.used && sexUndisclosed(sc)) {
    // The sex the patient declined to give is not revealed, and the sentence is written whether or not the default matches it.
    out.push(sentence(P('r-sex-default', { used: SEX[sc.referenceSex.used] ?? sc.referenceSex.used })));
  } else if (sc?.referenceSex && sc.referenceSex.used && sc.referenceSex.birth && sc.referenceSex.used !== sc.referenceSex.birth) {
    out.push(sentence(P('r-sex', { used: SEX[sc.referenceSex.used] ?? sc.referenceSex.used, birth: SEX[sc.referenceSex.birth] ?? sc.referenceSex.birth })));
  }
  return out.join(' ');
}

function patternSection(ctx, P) {
  const claim = { id: ctx.pattern, synthetic: false };
  const sevState = correctClaims(ctx).severity;
  const out = [patternSentence(ctx, P, claim, sevState)];
  const m = ctx.m;
  if (ctx.has('fev1') && ctx.has('fvc') && ctx.has('fev1_fvc')) out.push(P('p-values', { fev1: ctx.val('fev1'), fvc: ctx.val('fvc'), ratio: ctx.val('fev1_fvc') }));
  if (sevState.kind === 'scored') {
    out.push(P('p-severity-scored', { mz: ctx.mz(ctx.pattern === 'restriction' ? 'tlc' : 'fev1'), z: m[ctx.pattern === 'restriction' ? 'tlc' : 'fev1'].z, w: sevState.word, within: m[ctx.pattern === 'restriction' ? 'tlc' : 'fev1'].label !== 'low' ? ', although the FEV1 itself lies within the reference range' : '' }));
  } else if (sevState.kind === 'fev1-normal') out.push(P('p-severity-fev1-normal', { mz: ctx.mz('fev1') }));
  else if (sevState.kind === 'unscored') out.push(P('p-severity-unscored', {}));
  return out.join(' ');
}

function volumesSection(ctx, P) {
  if (!ctx.hasVol) return sentence(cap(missingVolumesFragment(ctx, P)));
  const out = [sentence(cap(tlcFragment(ctx, P)))];
  if (ctx.m.tlc.label === 'low') out.push(sentence(P('vs-restriction-support', {})));
  else if (['restriction', 'mixed'].includes(ctx.pattern) === false && ctx.m.tlc.label === 'normal') out.push(sentence(P('vs-normal-tlc', {})));
  const at = airTrappingFragment(ctx, P); if (at) out.push(sentence(cap(at)));
  const erv = lowErvFragment(ctx, P); if (erv) out.push(sentence(cap(erv)));
  return out.join(' ');
}

function dlcoSection(ctx, P) {
  const out = [];
  const dl = ctx.caseData.dlco;
  if (dl && Number.isFinite(dl.raw) && Number.isFinite(dl.adjusted ?? ctx.m.dlco.value) && ctx.hbOk) {
    out.push(P('ds-hb', { hb: dl.hbGdl.toFixed(1), raw: dl.raw.toFixed(1), adj: (dl.adjusted ?? ctx.m.dlco.value).toFixed(1) }));
  } else if (dl && Number.isFinite(dl.raw) && !ctx.hbOk) {
    out.push(P('ds-hb-missing', { raw: dl.raw.toFixed(1) }));
  }
  if (ctx.hbMaterial) {
    out.push(P('ds-hb-direction', { low: ctx.hbFactor > 1 }));
    if (ctx.rawCat && ctx.rawCat !== ctx.dl.category) out.push(sentence(cap(P('df-raw-misleads', { cat: DLCO_CAT[ctx.rawCat] }))));
  }
  out.push(sentence(cap(P(ctx.hbOk ? 'df-cat' : 'df-cat-nohb', { mz: ctx.mz('dlco'), cat: dlcoCatPhrase(ctx, ctx.dl.category) }))));
  const m = ctx.m;
  if (ctx.has('va') && ctx.has('kco')) out.push(P('ds-value', { which: ctx.hbOk ? 'adjusted DLCO' : 'DLCO', dlco: ctx.val('dlco'), pred: `${m.dlco.predicted.toFixed(1)} mL/min/mmHg`, va: ctx.val('va'), kco: ctx.val('kco') }));
  const core = subtypeCore(ctx); if (core) out.push(sentence(cap(P('df-subtype', { core, hedge: subtypeHedge(ctx) }))));
  if (ctx.dl.vaOverTlc && ['obstruction', 'obstruction-low-fvc', 'mixed'].includes(ctx.pattern)) out.push(P('ds-vatlc', { pct: (100 * ctx.dl.vaOverTlc).toFixed(0) }));
  // A carboxyhemoglobin value is stated only when co-oximetry was done; otherwise the section says it was not measured.
  if (coHbMeasured(ctx.scen) && ctx.scen.coHbPercent > 0) out.push(P('ds-cohb', { pct: ctx.scen.coHbPercent.toFixed(1) }));
  else if (coHbUnmeasured(ctx.scen)) out.push(P('ds-cohb-unmeasured', {}));
  if (ctx.dl.category === 'reduced') out.push(P('ds-severity', { grade: ctx.dl.severity }));
  return out.join(' ');
}

function bronchodilatorSection(ctx, P) {
  const bd = ctx.bd;
  const out = [];
  out.push(P('bs-change', {
    dFev1: mL(bd.dFev1), dFvc: mL(bd.dFvc),
    ppFev1: pctPred(bd.pctPred.fev1), ppFvc: pctPred(bd.pctPred.fvc), pbFev1: pct1(bd.pctBase.fev1), pbFvc: pct1(bd.pctBase.fvc),
  }));
  out.push(P('f-bd', { r22: bd.rule2022.significant, rE: bd.rule2005.significant }));
  const why = bdWhy(ctx);
  out.push(why ? sentence(cap(P('bd-why', { reason: why }))) : P('bs-agree', {}));
  out.push(P('bs-rule-explain', {}));
  if (ctx.has('fev1_fvc')) {
    const lln = ctx.m.fev1_fvc.lln;
    const preLow = ctx.m.fev1_fvc.label === 'low', postLow = bd.postRatio < lln;
    const phr = postLow ? (preLow ? 'remains below' : 'is below') : (preLow ? 'is no longer below' : 'remains above');
    out.push(P('bs-post-ratio', { ratio: bd.postRatio.toFixed(2), lln: lln.toFixed(2), phr }));
  }
  if (bd.discordant) {
    const opposite = (bd.dFev1 > 0) !== (bd.dFvc > 0);
    if (opposite) {
      // The explanation depends on which value fell: a shorter expiration lowers the FVC, whereas a weaker first-second effort or airway narrowing lowers the FEV1.
      out.push(P('bd-discordant', { kind: bd.dFvc < 0 ? 'opposite-fvc-fell' : 'opposite-fev1-fell' }));
    } else {
      const fvcBigger = bd.pctPred.fvc > bd.pctPred.fev1;
      out.push(P('bd-discordant', {
        kind: 'size', bigger: fvcBigger ? 'the FVC' : 'the FEV1', smaller: fvcBigger ? 'the FEV1' : 'the FVC',
        meaning: fvcBigger ? 'a volume response in which airways that closed early stay open longer, so more gas is expelled before expiration ends' : 'a flow response without a matching gain in vital capacity',
      }));
    }
  }
  return out.join(' ');
}

function sensitivitySection(ctx, P) {
  const d = { nameA: eqName(ctx.cmp.a.spirometryEquation), nameB: eqName(ctx.cmp.b.spirometryEquation) };
  const out = [P('se-compare', d)];
  if (ctx.eqSensitive || ctx.borderMeasures.length) out.push(P('se-physiology', {}));
  if (ctx.eqSensitive) { const s = sensitivityFlip(ctx, P); if (s) out.push(s); }
  if (ctx.borderMeasures.length && !(ctx.flips.length)) out.push(P('f-eq-borderline', { list: list(ctx.borderMeasures.map((k) => ctx.mz(k))), plural: ctx.borderMeasures.length > 1 }));
  if (!ctx.eqSensitive && !ctx.borderMeasures.length) out.push(P('se-stable', d));
  return out.join(' ');
}

function limitationsSection(ctx, P) {
  const out = [];
  const c = ctx.caveats;
  if (c.major.length) out.push(sentence(P('l-major', { items: c.major.join('; ') })));
  if (c.minor.length) out.push(sentence(P('l-minor', { items: c.minor.join('; ') })));
  if (c.noEffect.length) out.push(sentence(cap(P('l-noeffect', { items: c.noEffect.join('; ') }))));
  if (!c.major.length && !c.minor.length && !c.noEffect.length) out.push(P('l-none', {}));
  out.push(P('l-generic', {}));
  const m = ctx.m;
  if (['tlc', 'dlco'].some((k) => m[k] && m[k].available !== false && m[k].matched === false)) out.push(P('l-fallback', {}));
  return out.join(' ');
}

// ---------------------------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------------------------

function buildFindings(ctx) {
  const f = [];
  const add = (id, text) => f.push({ id, text });
  if (ctx.graded) {
    const [a, b, c, d] = ctx.letters;
    add('quality', `Test quality: FEV1 grade ${a}, FVC grade ${b}${ctx.hasBd ? `; after bronchodilator FEV1 grade ${c}, FVC grade ${d}` : ''}.`);
  }
  add('confidence', `Confidence in the technique: ${ctx.tier === 'good' ? 'adequate' : ctx.tier === 'moderate' ? 'reduced' : ctx.tier === 'limited' ? 'qualified' : 'unknown'}.`);
  add('pattern', ctx.pattern === 'indeterminate' ? 'Pattern: cannot be interpreted.' : `Pattern: consistent with ${NOUN[ctx.pattern]}.`);
  if (ctx.pattern !== 'normal' && ctx.pattern !== 'indeterminate') add('severity', ctx.sevScored ? `Severity: ${ctx.sevWord} (graded on ${ctx.pattern === 'restriction' ? 'TLC' : 'FEV1'} z-score).` : ctx.sevNotGraded ? 'Severity: mild obstruction despite FEV1 within its reference range.' : 'Severity: not graded for this pattern.');
  for (const k of ctx.borderMeasures) add(`borderline-${k}`, `Borderline: ${ctx.mz(k)}.`);
  if (ctx.pattern === 'prism' || ctx.pattern === 'obstruction-low-fvc') add('volumes-needed', 'Lung volumes are needed to classify this pattern.');
  for (const finding of ctx.interp.flags.filter((f) => ['possible-hyperinflation', 'high-tlc', 'high-rv-tlc', 'high-rv', 'air-trapping'].includes(f.id))) add(finding.id, finding.text);
  if (ctx.hasVol && ctx.has('erv') && ctx.m.erv.label === 'low') add('low-erv', `ERV below the lower limit of normal${ctx.bmi !== null ? `; body mass index ${ctx.bmi.toFixed(1)} kg/m²` : ''}.`);
  if (ctx.bd) {
    add('bronchodilator', `Bronchodilator response: ${ctx.bd.rule2022.significant ? 'significant' : 'not significant'} by the 2022 criterion and ${ctx.bd.rule2005.significant ? 'significant' : 'not significant'} by the earlier criterion.`);
    if (ctx.bd.discordant) add('bd-discordant', 'The FEV1 and FVC responses are discordant.');
  }
  if (ctx.hasDlco) {
    add('dlco', ctx.hbOk ? `Diffusing capacity, adjusted for hemoglobin: ${DLCO_CAT[ctx.dl.category]}.` : `Diffusing capacity, not adjusted because no hemoglobin was available: ${DLCO_CAT[ctx.dl.category]}.`);
    if (!ctx.hbOk) add('hb-missing', 'Hemoglobin was not available: the DLCO is classified without adjustment.');
    const core = subtypeCore(ctx);
    if (core) add('dlco-subtype', `KCO and alveolar volume: ${core}.`);
    if (ctx.hbMaterial) add('hb-adjustment', `Hemoglobin adjustment is material (factor ${ctx.hbFactor.toFixed(2)})${ctx.rawCat && ctx.rawCat !== ctx.dl.category ? `; unadjusted DLCO would be classified as ${ctx.rawCat}` : ''}.`);
    if (coHbMeasured(ctx.scen) && ctx.scen.coHbPercent > 0) add('cohb', `Carboxyhemoglobin ${ctx.scen.coHbPercent.toFixed(1)}%: not corrected for.`);
    else if (coHbUnmeasured(ctx.scen)) add('cohb', 'Carboxyhemoglobin was not measured: the DLCO may be underestimated if smoking was recent.');
  }
  if (ctx.cmp) {
    if (ctx.flips.length) add('equation-change', `Classification differs between ${eqName(ctx.cmp.a.spirometryEquation)} and ${eqName(ctx.cmp.b.spirometryEquation)} for ${list(ctx.flips.map((c) => DISPLAY[c.measure]))}.`);
    else if (ctx.eqSensitive) add('equation-change', `${ctx.cmp.severityChanged ? 'Severity grade' : 'Bronchodilator classification'} differs between the reference equations.`);
  }
  for (const text of ctx.caveats.major) add(`caveat-major-${f.filter((x) => x.id.startsWith('caveat-major')).length + 1}`, `Major limitation: ${text}.`);
  for (const text of ctx.caveats.minor) add(`caveat-minor-${f.filter((x) => x.id.startsWith('caveat-minor')).length + 1}`, `Minor limitation: ${text}.`);
  for (const text of ctx.caveats.noEffect) add(`caveat-noeffect-${f.filter((x) => x.id.startsWith('caveat-noeffect')).length + 1}`, `Noted, does not change the interpretation: ${text}.`);
  return f;
}

// ---------------------------------------------------------------------------------------------
// Distractors
// ---------------------------------------------------------------------------------------------

const SEV_WORDS = ['mild', 'moderate', 'severe'];
const DX = {
  obstruction: ['chronic obstructive pulmonary disease', 'asthma', 'emphysema'],
  restrictive: ['pulmonary fibrosis', 'interstitial lung disease', 'congestive heart failure'],
  normal: ['asthma', 'interstitial lung disease', 'early chronic obstructive pulmonary disease'],
};

/** A wrong pattern a statement can assert for each true pattern. Restriction and mixed disease are offered only when a TLC was measured; without one they belong to the restriction-without-tlc flaw. */
function wrongPatterns(ctx) {
  const vol = ctx.hasVol;
  const table = {
    normal: ['obstruction', 'prism', ...(vol ? ['restriction'] : [])],
    obstruction: ['normal', ...(vol ? ['mixed'] : [])],
    'obstruction-low-fvc': ['normal'],
    restriction: ['normal', 'nonspecific', 'obstruction'],
    mixed: ['obstruction', 'restriction'],
    nonspecific: ['restriction', 'normal'],
    prism: ['normal', 'obstruction'],
    indeterminate: ['normal'],
  };
  return (table[ctx.pattern] ?? ['normal']).slice(0, 2);
}

/** Applicability of each flaw to the case, as functions of the engine output only. */
export function applicableFlaws(caseData, interp, cmp) {
  const ctx = makeContext(caseData, interp, cmp);
  const flaws = new Set(['wrong-pattern', 'over-diagnoses']);
  if (ctx.sevScored) flaws.add('wrong-severity');
  if (!ctx.hasVol && (ctx.pattern === 'prism' || ctx.pattern === 'obstruction-low-fvc')) flaws.add('restriction-without-tlc');
  if (ctx.tier === 'limited') flaws.add('ignores-quality');
  if (ctx.eqSensitive && robustParams(ctx)) flaws.add('ignores-equation-change');
  if (ctx.bd && !ctx.bd.rulesAgree) flaws.add('wrong-bronchodilator-rule');
  if (pctPredTarget(ctx)) flaws.add('reads-percent-predicted-as-normal-range');
  if (ctx.hasDlco && ctx.rawCat && ctx.rawCat !== ctx.dl.category) flaws.add('dlco-unadjusted-for-hb');
  return FLAWS.filter((f) => flaws.has(f));
}

function pctPredTarget(ctx) {
  for (const k of ['fev1', 'fvc', 'tlc', 'dlco']) {
    if (!ctx.has(k) || !Number.isFinite(ctx.m[k].percentPredicted)) continue;
    const pp = Math.round(ctx.m[k].percentPredicted), lab = ctx.m[k].label;
    if (pp >= 80 && lab === 'low') return { k, pp, claim: 'normal' };
    if (pp < 80 && lab === 'normal') return { k, pp, claim: 'reduced' };
  }
  return null;
}

function buildDistractors(ctx, P) {
  const out = [];
  const add = (flaw, claims) => {
    const n = out.filter((d) => d.flaw === flaw).length + 1;
    out.push({ id: `d-${flaw}-${n}`, text: buildFinal(ctx, claims, P), flaw });
  };
  const base = () => correctClaims(ctx);

  // wrong-severity: the two other bands. FEV1 grades obstruction, TLC grades restriction; a mixed pattern has no single composite grade here.
  if (ctx.sevScored) {
    for (const w of SEV_WORDS.filter((x) => x !== ctx.sevWord)) {
      const c = base();
      c.severity = { kind: 'scored', word: w };
      add('wrong-severity', c);
    }
  }

  // wrong-pattern: a pattern the values do not show
  for (const id of wrongPatterns(ctx)) {
    const c = base();
    c.pattern = { id, synthetic: true };
    c.severity = id === 'obstruction' ? { kind: 'scored', word: ctx.sevWord ?? 'moderate', bare: true } : id === 'normal' ? { kind: 'none' } : { kind: 'unscored' };
    c.pctpred = null;
    add('wrong-pattern', c);
  }

  if (!ctx.hasVol && (ctx.pattern === 'prism' || ctx.pattern === 'obstruction-low-fvc')) {
    const c = base();
    c.pattern = { id: ctx.pattern === 'prism' ? 'restriction' : 'mixed', synthetic: true };
    c.severity = { kind: 'unscored' };
    c.volumes = 'omit';
    c.pctpred = null;
    add('restriction-without-tlc', c);
  }
  if (ctx.tier === 'limited') { const c = base(); c.quality = 'ignore'; add('ignores-quality', c); }
  if (ctx.eqSensitive && robustParams(ctx)) { const c = base(); c.equation = 'robust'; add('ignores-equation-change', c); }
  if (ctx.bd && !ctx.bd.rulesAgree) { const c = base(); c.bd = 'earlier-as-2022'; add('wrong-bronchodilator-rule', c); }
  if (pctPredTarget(ctx)) { const c = base(); c.pctpredStatus = 'wrong'; add('reads-percent-predicted-as-normal-range', c); }
  if (ctx.hasDlco && ctx.rawCat && ctx.rawCat !== ctx.dl.category) { const c = base(); c.dlco = { cat: ctx.rawCat }; add('dlco-unadjusted-for-hb', c); }

  const family = ctx.pattern === 'normal' ? 'normal' : ['obstruction', 'obstruction-low-fvc', 'indeterminate'].includes(ctx.pattern) ? 'obstruction' : 'restrictive';
  for (const term of DX[family]) { const c = base(); c.dx = { kind: family === 'normal' ? 'exclude' : 'diagnostic', term }; add('over-diagnoses', c); }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Notes on the simulation
// ---------------------------------------------------------------------------------------------

/**
 * Verification notes for the reader of a simulated report. They state which rules in the interpretation are conventions of this tool
 * or rest on secondary sources, so that the physician text itself stays free of statements about the tool. Deterministic and not varied.
 * @returns {string[]}
 */
function notesFor(ctx) {
  const n = [];
  if (ctx.sevScored) n.push('Impairment grades use FEV1 for obstruction and TLC for restriction, with continuous cut-points at −2.5 and −4.0 (ERS/ATS 2022 Figure 7 and 2024 authors clarification). Normal-FEV1 obstruction is mild; impairment grade is not disease severity.');
  else if (ctx.sevNotGraded) n.push('The 2022 ERS/ATS statement calls a z-score above −1.645 normal and defines no severity grade for an obstruction whose FEV1 is within normal limits, so none is assigned; severity of impairment is not disease severity.');
  else if (ctx.pattern !== 'normal' && ctx.pattern !== 'indeterminate') n.push('No single composite impairment grade is assigned to mixed or nonspecific patterns; report the relevant components separately.');
  if (ctx.hasDlco && ctx.dl?.category === 'reduced') n.push('Diffusion impairment uses the DLCO z-score bands, per ERS/ATS 2022 Figure 7 and the 2024 authors clarification.');
  if (ctx.bd) n.push('The bronchodilator criterion is a change above 10% of the predicted value in FEV1 or FVC (2022 ERS/ATS Table 1; the comparison is strict, as the statement prints it).');
  if (ctx.hasVol && (ctx.m.tlc?.label === 'high' || ['rv', 'rv_tlc'].some((k) => ctx.has(k) && ctx.m[k].label === 'high'))) n.push('Volume interpretation follows ERS/ATS 2022 Figure 10 and Table 7. This port has no FRC/TLC reference, so a full fractional-volume algorithm is not available; elevated ratios require clinical and quality context.');
  if (ctx.hasDlco && ctx.hbOk) n.push('The hemoglobin adjustment follows the 2017 ERS/ATS standard (eqs 31 and 32), which the 2022 statement recommends applying to the reference value; the key is read against the hemoglobin-adjusted reference.');
  if (coHbMeasured(ctx.scen) || coHbUnmeasured(ctx.scen)) n.push('The key is read against the hemoglobin-adjusted reference without a carboxyhemoglobin correction; the 2017 ERS/ATS standard recommends one for interpretation only when carboxyhemoglobin is known or suspected to exceed 2% (eq. 37, predicted x (102% − COHb%)), and the report shows that adjustment as a separate, supplementary line when COHb was measured above 2%.');
  if (['tlc', 'dlco'].some((k) => ctx.m[k] && ctx.m[k].available !== false && ctx.m[k].matched === false)) n.push('The ATS 2023 statement advises against race adjustment factors for volumes and DLCO. European-ancestry derivation remains a limitation regardless of requisition race.');
  n.push('The wording of this interpretation is rule-based and has not been reviewed by a clinician.');
  return n;
}

// ---------------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------------

/**
 * @param {object} args
 * @param {object} args.caseData case from buildCase (read: report, spirometry, dlco, scenario; never the descriptor archetype or ground truth)
 * @param {object} args.interp result of interpret()
 * @param {object|null} [args.cmp] result of compareEquations()
 * @param {number} [args.seed] selects phrasing variants through createStream(seed, 'narrative')
 * @param {number} [args.forceVariant] test hook: use variant (forceVariant mod n) of every sentence type
 * @param {boolean} [args.finalCaveats] false leaves the scenario limitations out of the final statement and its distractors (the quiz asks for them in a separate item)
 * @returns {{ sections: {id: string, title: string, text: string}[], finalStatement: string, findings: {id: string, text: string}[], distractors: {id: string, text: string, flaw: string}[], notes: string[] }}
 */
export function composeNarrative({ caseData, interp, cmp = null, seed = 0, forceVariant, finalCaveats = true } = {}) {
  const ctx = makeContext(caseData, interp, cmp, { finalCaveats });
  const rng = createStream((Number.isFinite(seed) ? seed : 0) >>> 0, 'narrative');
  const P = (type, params) => {
    const variants = TYPES[type];
    if (!variants) throw new Error(`unknown sentence type ${type}`);
    const i = forceVariant === undefined ? rng.int(0, variants.length - 1) : ((forceVariant % variants.length) + variants.length) % variants.length;
    return variants[i](params ?? {});
  };

  const sections = [];
  const push = (id, title, text) => { if (text) sections.push({ id, title, text }); };
  push('quality', 'Test quality', qualitySection(ctx, P));
  push('reference', 'Reference values and assumptions', referenceSection(ctx, P));
  push('pattern', 'Pattern and severity', patternSection(ctx, P));
  push('volumes', 'Lung volumes', volumesSection(ctx, P));
  if (ctx.hasDlco) push('dlco', 'Diffusing capacity', dlcoSection(ctx, P));
  if (ctx.bd) push('bronchodilator', 'Bronchodilator response', bronchodilatorSection(ctx, P));
  if (ctx.cmp && ctx.has('fev1')) push('sensitivity', 'Sensitivity to the reference equation', sensitivitySection(ctx, P));
  push('limitations', 'Limitations', limitationsSection(ctx, P));

  const finalStatement = buildFinal(ctx, correctClaims(ctx), P);
  const findings = buildFindings(ctx);
  const distractors = buildDistractors(ctx, P).filter((d) => d.text !== finalStatement);
  return { sections, finalStatement, findings, distractors, notes: notesFor(ctx), caveats: { major: ctx.caveats.major, minor: ctx.caveats.minor } };
}

// ---------------------------------------------------------------------------------------------
// Fact extraction from text
// ---------------------------------------------------------------------------------------------

const MEASURE_RE = '(FEV1\\/FVC ratio|RV\\/TLC ratio|alveolar volume \\(VA\\)|FEV1|FVC|TLC|RV|VC|FRC|ERV|IC|DLCO|KCO)';

/**
 * Recover the facts a narrative text asserts, as sorted tokens. Used to test that phrasing
 * variants are equivalent and that distractors contradict the key in the stated way.
 * @param {string} text
 * @returns {string[]}
 */
export function extractFacts(text) {
  const f = new Set();
  const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/);
  const clauses = sentences.flatMap((s) => s.split(/;\s+/));

  for (const s of sentences) {
    for (const part of s.split(/;\s+/)) {
      const cw = part.match(/consistent with ([^.;]*)/);
      if (cw) {
        const x = cw[1];
        if (/mixed obstruction and restriction/.test(x)) f.add('pattern:mixed');
        else if (/airflow obstruction/.test(x)) f.add('pattern:obstruction');
        else if (/restriction/.test(x)) f.add('pattern:restriction');
        else if (/nonspecific pattern/.test(x)) f.add('pattern:nonspecific');
        else if (/preserved-ratio spirometric impairment/.test(x)) f.add('pattern:prism');
        else if (/normal spirometry/.test(x)) f.add('pattern:normal');
        if (/hyperinflation/.test(x)) f.add('hyperinflation');
        if (/air trapping/.test(x)) f.add('air-trapping');
      }
    }
  }
  if (/cannot be interpreted/.test(text)) f.add('pattern:indeterminate');

  for (const m of text.matchAll(/\bof (mild|moderate|severe) severity\b/g)) f.add(`severity:${m[1]}`);
  if (/\bnot graded\b/i.test(text)) f.add('severity:not-graded');

  const gradeSentence = sentences.find((s) => /\bgrade[d]? [A-FU]\b/.test(s));
  if (gradeSentence) f.add(`grades:${[...gradeSentence.matchAll(/\bgrade[d]? ([A-FU])\b/g)].map((x) => x[1]).join('')}`);
  if (/\badequate\b/i.test(text)) f.add('quality:adequate');
  if (/reduced confidence/i.test(text)) f.add('quality:reduced');
  if (/\bqualified\b/i.test(text)) f.add('quality:qualified');

  for (const m of text.matchAll(/(not significant|significant) by the 2022 criterion/g)) f.add(`bd:2022:${m[1].replace(' ', '-')}`);
  for (const m of text.matchAll(/(not significant|significant) by the earlier criterion/g)) f.add(`bd:earlier:${m[1].replace(' ', '-')}`);
  if (/\bdiscordant\b/i.test(text)) f.add('bd:discordant');
  for (const c of clauses) {
    if (/bronchodilator/.test(c) && /ratio/.test(c)) {
      if (/\b(remains below|is below)\b/.test(c)) f.add('bd:post-ratio:low');
      else if (/\b(is no longer below|remains above)\b/.test(c)) f.add('bd:post-ratio:normal');
    }
  }
  if (/bronchodilator/i.test(text)) f.add('bd:mentioned');

  for (const c of clauses) {
    if (!/DLCO|diffusing capacity/.test(c) || /% of predicted/.test(c)) continue;
    const cat = /\bonly marginally reduced\b|\breduced\b/.test(c) ? 'reduced' : /\braised\b|\bonly marginally raised\b/.test(c) ? 'raised' : /within the reference range/.test(c) ? 'normal' : null;
    if (!cat) continue;
    if (/no hemoglobin (?:was )?available/i.test(c)) { f.add(`dlco:${cat}`); f.add('dlco:hb-unavailable'); }
    else if (/without hemoglobin adjustment|before hemoglobin adjustment|unadjusted/i.test(c)) f.add(`dlco:unadjusted:${cat}`);
    else {
      f.add(`dlco:${cat}`);
      if (/adjusted for hemoglobin|hemoglobin-adjusted/i.test(c)) f.add('dlco:hb-adjusted');
    }
  }

  if (/(?:lung volumes|TLC)(?: and diffusing capacity)? (?:was|were) not measured/i.test(text)) f.add('volumes:not-measured');
  if (/lung volumes are needed/i.test(text)) f.add('volumes:needed');
  if (/\bERV\b[^;.]*below the lower limit/.test(text)) f.add('low-erv');

  for (const m of text.matchAll(new RegExp(`${MEASURE_RE} \\(z-score [^)]*borderline\\)`, 'g'))) f.add(`borderline:${m[1]}`);

  if (/depends on the reference equation/i.test(text)) f.add('equation:sensitive');
  for (const m of text.matchAll(/(FEV1\/FVC ratio|FEV1|FVC) is [a-z ]+ under [^;]*? but [a-z ]+ under /g)) f.add(`equation:differs:${m[1]}`);
  if (/the pattern is [^;]*? under [^;]*? but [^;]*? under/.test(text)) f.add('equation:pattern-changes');
  if (/the severity grade is/i.test(text)) f.add('equation:severity-changes');
  if (/bronchodilator[^;.]* differs between the equations/.test(text)) f.add('equation:bd-changes');
  if (/could change under another reference equation/i.test(text)) f.add('equation:borderline');
  if (/no classification[^;.]* differs between|no classification differs/i.test(text)) f.add('equation:stable');
  if (/the same(?: way)? under both reference equations/i.test(text)) f.add('equation:robust');

  if (/do(?:es)? not change the interpretation/i.test(text)) f.add('caveat:no-effect');
  if (/(?:diagnostic of|These findings exclude|Together they establish|as the likely cause|an unlikely explanation)/.test(text)) f.add('diagnosis');
  for (const m of text.matchAll(/(FEV1\/FVC ratio|FEV1|FVC|TLC|DLCO) is (\d+)% of predicted, (?:at or above|below) the conventional 80% threshold[^]{0,90}?(?:classified as|classification of) (within the reference range|below the lower limit of normal|above the upper limit of normal)/g)) f.add(`pctpred:${m[1]}:${m[3] === 'within the reference range' ? 'normal' : 'reduced'}`);
  return [...f].sort();
}
