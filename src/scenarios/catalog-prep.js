/**
 * Scenarios about preparation before the test: medications, tobacco and other substances, recent
 * activity, and clinical conditions that are relative contraindications in the ATS/ERS 2019
 * spirometry statement (Table 2). Rows refer to docs/research/scenarios.md.
 */
import { scenario, BMI, hasBdStudy, fullPanel, byArchetype } from './define.js';
import { SCENARIO_CONSTANTS as C, bronchodilatorBaselineShift } from './constants.js';

const NO_DISCORDANT = (d) => d.archetype !== 'bd-discordant';
const PEAK = C.bronchodilatorWashout.peakShift;
/** Baseline shift from the hours since the dose: the drawn value is the shift at the moment of the dose, and it decays over the withholding window. */
const shiftFromDose = (kind, hoursKey) => (fx) => ({ ...fx, physiology: { ...fx.physiology, baselineShiftToPost: bronchodilatorBaselineShift(kind, fx.preTest[hoursKey], fx.physiology.baselineShiftToPost) } });

export const PREP_SCENARIOS = [
  scenario({
    id: 'med-saba-recent', category: 'Medication', exclusive: 'bronchodilator-prep',
    variants: [
      'Pt took albuterol about {h} h before arrival; the short-acting bronchodilator was not held.',
      'Intake: used the rescue inhaler (albuterol) {h} h ago for chest tightness on the way in; no hold was observed.',
      'Patient reports albuterol roughly {h} h before testing and says no one asked about holding it.',
    ],
    applies: (d) => hasBdStudy(d) && NO_DISCORDANT(d),
    weight: byArchetype({ obstruction: 4, mixed: 3 }, 1),
    effects: { preTest: { lastSabaHours: [1, 3.5] }, physiology: { baselineShiftToPost: PEAK }, report: { forcePostBd: true } },
    finalize: shiftFromDose('saba', 'lastSabaHours'),
    deviation: 'short-acting bronchodilator taken inside the withholding window',
    vars: (fx) => ({ h: fx.hours(fx.preTest.lastSabaHours) }),
    verifiedNumbers: ['4', '6'],
    caveats: [
      { id: 'saba-baseline-raised', weight: 'major', text: 'A short-acting beta-agonist taken inside the 4 to 6 h withholding window (ATS/ERS 2019, Table 8) raises the baseline FEV1 and FVC and narrows the bronchodilator increment. Baseline obstruction can be understated, and a small response does not exclude reversibility.' },
      { id: 'saba-deviation-recorded', weight: 'minor', text: 'The operator records the drug, dose and time of the last dose, and the interpretation states the deviation from the preparation list.' },
    ],
    decoyCaveats: [{ id: 'decoy-ics-withhold', text: 'An inhaled corticosteroid taken today must have been withheld, so the baseline spirometry is unreliable.' }],
    confidence: 'medium', source: 'PRE-01; S1 Table 8; direction mem',
  }),
  scenario({
    id: 'med-laba-recent', category: 'Medication', exclusive: 'bronchodilator-prep',
    variants: [
      'Used salmeterol this morning, about {h} h before the test; not held.',
      'Long-acting beta-agonist inhaler taken {h} h before arrival (patient was unaware of the hold).',
      'Intake sheet: formoterol/maintenance inhaler last used {h} h ago.',
    ],
    applies: (d) => hasBdStudy(d) && NO_DISCORDANT(d),
    weight: byArchetype({ obstruction: 3, mixed: 2 }, 1),
    effects: { preTest: { lastLabaHours: [8, 20] }, physiology: { baselineShiftToPost: PEAK }, report: { forcePostBd: true } },
    finalize: shiftFromDose('laba', 'lastLabaHours'),
    deviation: 'long-acting beta-agonist taken inside the withholding window',
    vars: (fx) => ({ h: fx.hours(fx.preTest.lastLabaHours) }),
    verifiedNumbers: ['24', '36'],
    caveats: [
      { id: 'laba-baseline-raised', weight: 'major', text: 'A long-acting beta-agonist taken inside its withholding window (24 h for LABA, 36 h for ultra-LABA; ATS/ERS 2019, Table 8) keeps the airways partly dilated at baseline. The bronchodilator increment is blunted and the baseline FEV1 and FVC are higher than off treatment.' },
    ],
    decoyCaveats: [{ id: 'decoy-saba-only', text: 'Only a short-acting bronchodilator alters the baseline; a long-acting agent taken this morning is not a concern.' }],
    confidence: 'medium', source: 'PRE-02; S1 Table 8',
  }),
  scenario({
    id: 'med-lama-recent', category: 'Medication', exclusive: 'bronchodilator-prep',
    variants: [
      'Tiotropium taken yesterday evening, about {h} h before the test.',
      'Pt on a once-daily anticholinergic inhaler; last dose {h} h ago, not held.',
      'Medication list: LAMA inhaler last used {h} h before arrival.',
    ],
    applies: (d) => hasBdStudy(d) && NO_DISCORDANT(d),
    weight: byArchetype({ obstruction: 3, mixed: 2 }, 1),
    effects: { preTest: { lastLamaHours: [14, 34] }, physiology: { baselineShiftToPost: PEAK }, report: { forcePostBd: true } },
    finalize: shiftFromDose('lama', 'lastLamaHours'),
    deviation: 'long-acting antimuscarinic taken inside the withholding window',
    vars: (fx) => ({ h: fx.hours(fx.preTest.lastLamaHours) }),
    verifiedNumbers: ['36', '48'],
    caveats: [
      { id: 'lama-baseline-raised', weight: 'major', text: 'A long-acting antimuscarinic inside its withholding window (36 to 48 h, ATS/ERS 2019, Table 8) lowers vagal airway tone for the whole day. Baseline airflow is higher than off treatment and the bronchodilator increment is small.' },
    ],
    decoyCaveats: [{ id: 'decoy-lama-dlco', text: 'The anticholinergic inhaler raises the DLCO, so the diffusing capacity is overestimated.' }],
    confidence: 'medium', source: 'PRE-02; S1 Table 8 footnote',
  }),
  scenario({
    id: 'med-usual-inhalers', category: 'Medication', exclusive: 'bronchodilator-prep',
    variants: [
      'Tested on usual inhalers at the referring physician\'s request (assessing control).',
      'Order states: "perform on current therapy". Patient used the maintenance inhalers this morning.',
      'Pt instructed to take all regular inhalers as usual before the test; last dose {h} h ago.',
    ],
    applies: (d) => hasBdStudy(d) && NO_DISCORDANT(d) && ['obstruction', 'mixed', 'normal'].includes(d.archetype),
    weight: byArchetype({ obstruction: 3, mixed: 2 }, 0.5),
    effects: { preTest: { lastLabaHours: [4, 14] }, physiology: { baselineShiftToPost: PEAK }, report: { forcePostBd: true } },
    finalize: shiftFromDose('laba', 'lastLabaHours'), // same curve as med-laba-recent: the same hours since the dose give the same shift
    deviation: 'tested on usual therapy by request, not a deviation',
    vars: (fx) => ({ h: fx.hours(fx.preTest.lastLabaHours) }),
    caveats: [
      { id: 'on-treatment-context', weight: 'major', text: 'The study was requested on current therapy, so the baseline reflects treated airflow and the bronchodilator increment is smaller than off treatment. A small response is not evidence against reversibility, and the interpretation states the on-treatment context.' },
    ],
    decoyCaveats: [{ id: 'decoy-withhold-deviation', text: 'Failure to withhold the maintenance inhalers is a protocol deviation that invalidates the study.' }],
    confidence: 'high', source: 'PRE-03; S1 (do not withhold when the question is response on therapy)',
  }),
  scenario({
    id: 'med-ics-today', category: 'Medication', noncontributory: true,
    variants: [
      'Takes fluticasone twice daily and montelukast nightly; both taken today.',
      'Medication list includes a daily inhaled steroid (taken this morning) and a leukotriene tablet.',
      'Patient used the controller inhaler (inhaled corticosteroid) at breakfast as usual.',
    ],
    applies: () => true,
    weight: byArchetype({ obstruction: 3, mixed: 2, 'bd-discordant': 2 }, 1),
    effects: { preTest: { notes: 'inhaled corticosteroid taken today' } },
    caveats: [
      { id: 'ics-today-no-change', weight: 'minor', text: 'A daily inhaled corticosteroid or leukotriene-modifier dose taken today does not change the interpretation: neither class needs to be withheld before spirometry (ATS/ERS 2019).' },
    ],
    decoyCaveats: [{ id: 'decoy-ics-blunts-bdr', text: 'The inhaled corticosteroid taken today blunts the bronchodilator response, so a negative response cannot be interpreted.' }],
    confidence: 'high', source: 'PRE-04; S1',
  }),
  scenario({
    id: 'med-allergy-spray', category: 'Medication', noncontributory: true,
    variants: [
      'Used a saline and steroid nasal spray this morning for seasonal congestion.',
      'Took a daily antihistamine tablet at breakfast; no inhalers.',
      'Intake: intranasal spray and an antihistamine today for hay fever.',
    ],
    weight: 0.7,
    effects: { preTest: { notes: 'intranasal spray and antihistamine today' } },
    caveats: [
      { id: 'allergy-meds-no-change', weight: 'minor', text: 'An intranasal spray or an antihistamine is not among the preparation exclusions of the ATS/ERS 2019 statement and does not change the interpretation of the flows, volumes or diffusing capacity.' },
    ],
    decoyCaveats: [{ id: 'decoy-nasal-obstruction', text: 'Nasal congestion from the allergy lowers the FEV1 and invalidates the baseline.' }],
    confidence: 'low', source: 'mem; S1 preparation list (absence)',
  }),

  scenario({
    id: 'sub-smoked-within-hour', category: 'Smoking', exclusive: 'smoking',
    variants: [
      'Smoked a cigarette about {min} min before arrival.',
      'Intake: last cigarette {min} min ago, in the parking lot.',
      'Water pipe (hookah) session about {min} min before the appointment.',
    ],
    weight: byArchetype({ obstruction: 2, mixed: 2 }, 1),
    effects: {
      preTest: { lastSmokingHours: [0.25, 0.75] },
      physiology: { fev1Mult: [0.93, 0.98], fvcMult: [0.96, 1.0] },
      maneuver: { faultProb: { cough: 0.3 } },
      dlco: { coHbPercent: [4, 9] },
    },
    deviation: 'inhaled smoke inside the 1 h exclusion',
    vars: (fx) => ({ min: String(Math.round((fx.preTest.lastSmokingHours * 60) / 5) * 5) }),
    verifiedNumbers: ['1'],
    caveats: [
      { id: 'smoking-acute-airflow', weight: 'major', text: 'Inhaled smoke or vapor within 1 h of testing (ATS/ERS 2019) can cause acute bronchoconstriction and cough, lowering FEV1, FVC and peak flow. Mild obstruction may be exaggerated, and a repeat after abstinence would separate the acute effect from chronic disease.' },
      { id: 'smoking-cohb-dlco', weight: 'major', requires: 'dlco', text: 'Combustion of tobacco, by cigarette or water pipe, produces carbon monoxide. The resulting carboxyhemoglobin competes with the test gas for hemoglobin and raises the back-pressure of CO, so a measured DLCO is lower than the value without carboxyhemoglobin. The report does not adjust for carboxyhemoglobin.' },
    ],
    decoyCaveats: [{ id: 'decoy-smoking-volumes', text: 'Recent smoking lowers the plethysmographic TLC, so a low TLC is unreliable.' }],
    confidence: 'medium', source: 'PRE-05; S1 (1 h); DLCO part S2 search summary; water pipe produces carbon monoxide (mem)',
  }),
  scenario({
    id: 'sub-vaped-within-hour', category: 'Smoking', exclusive: 'smoking',
    variants: [
      'Pt vaped in the parking lot {min} min ago.',
      'Used an e-cigarette about {min} min before arrival.',
      'Intake: vaping pen used {min} min before the test; no tobacco today.',
    ],
    weight: byArchetype({ obstruction: 1.5, mixed: 1.5 }, 0.8),
    // Unverified minor effect: airway irritation and cough only. No carboxyhemoglobin: an e-cigarette does not burn tobacco and delivers little carbon monoxide.
    effects: {
      preTest: { lastVapingHours: [0.25, 0.75] },
      physiology: { fev1Mult: [0.97, 1.0] },
      maneuver: { faultProb: { cough: 0.2 } },
    },
    deviation: 'inhaled vapor inside the 1 h exclusion',
    vars: (fx) => ({ min: String(Math.round((fx.preTest.lastVapingHours * 60) / 5) * 5) }),
    verifiedNumbers: ['1'],
    caveats: [
      { id: 'vaping-acute-airway-irritation', weight: 'minor', text: 'Inhaled vapor within 1 h of testing (ATS/ERS 2019) can irritate the airways and provoke cough, so a small fall in FEV1 and a cough in the first second are possible. The size of the effect is not established, and a repeat after abstinence would separate it from chronic disease.' },
      { id: 'vaping-little-cohb', weight: 'minor', requires: 'dlco', text: 'An e-cigarette does not burn tobacco and delivers little carbon monoxide, so carboxyhemoglobin is not expected to rise and no carboxyhemoglobin adjustment of the DLCO is called for on this history alone.' },
    ],
    decoyCaveats: [{ id: 'decoy-vaping-cohb', text: 'Vaping raises carboxyhemoglobin enough to lower the measured DLCO.' }],
    confidence: 'low', source: 'PRE-05 (vape named); S1 (1 h, smoke or vapor); no COHb effect (e-cigarettes burn no tobacco; mem, unverified)',
  }),
  scenario({
    id: 'sub-smoked-hours-ago', category: 'Smoking', exclusive: 'smoking',
    variants: [
      'Last cigarette about {h} h before the DLCO; co-oximetry not done.',
      'Patient last smoked {h} h before testing and denies smoking since.',
      'Intake: smoker, last cigarette roughly {h} h ago; no carboxyhemoglobin measurement available.',
    ],
    applies: fullPanel,
    weight: byArchetype({ obstruction: 2, 'low-dlco': 2 }, 1),
    effects: { preTest: { lastSmokingHours: [2.5, 6] }, dlco: { coHbPercent: [2.5, 5] } },
    vars: (fx) => ({ h: fx.hours(fx.preTest.lastSmokingHours) }),
    caveats: [
      { id: 'smoking-cohb-dlco-hours', weight: 'major', text: 'Carboxyhemoglobin remains raised for hours after smoking and lowers the measured DLCO and KCO while VA is unchanged. The standard asks for the time of the last cigarette, and an elevated or suspected carboxyhemoglobin above the endogenous level calls for an adjustment, which the report does not apply.' },
    ],
    decoyCaveats: [{ id: 'decoy-smoking-spirometry', text: 'Smoking several hours earlier invalidates the spirometry.' }],
    confidence: 'medium', source: 'PRE-06; S2 search summary; S21',
  }),
  scenario({
    id: 'sub-cohb-measured', category: 'Smoking', exclusive: 'smoking',
    variants: [
      'Current smoker. Co-oximetry carboxyhemoglobin {cohb}%; last cigarette about {h} h ago. DLCO not adjusted for COHb.',
      'COHb {cohb}% on the pre-test finger co-oximeter (smoker, last cigarette {h} h ago).',
      'Pt smokes daily; measured COHb {cohb}%, last cigarette {h} h before the test.',
    ],
    applies: fullPanel,
    weight: byArchetype({ obstruction: 2, 'low-dlco': 2 }, 1),
    effects: { preTest: { lastSmokingHours: [1.5, 5] }, dlco: { coHbPercent: [5, 12], coHbMeasured: true } },
    vars: (fx) => ({ h: fx.hours(fx.preTest.lastSmokingHours), cohb: fx.dlco.coHbPercent.toFixed(1) }),
    caveats: [
      { id: 'cohb-measured-unadjusted', weight: 'major', text: 'The measured carboxyhemoglobin is above the endogenous level that the reference data already contain. The reported DLCO is not adjusted for it, so the DLCO and KCO are lower than they would be with a normal carboxyhemoglobin. Earlier standards gave a correction for carboxyhemoglobin; this project has not verified the current one, so none is applied here.' },
    ],
    decoyCaveats: [{ id: 'decoy-cohb-va', text: 'The raised carboxyhemoglobin lowers the VA.' }],
    confidence: 'medium', source: 'SPEC-22; S2 search summary; S22',
  }),
  scenario({
    id: 'sub-alcohol', category: 'Alcohol',
    variants: [
      'Drank wine with lunch about {h} h before the test.',
      'Smell of alcohol; pt reports several beers {h} h ago. Coordination poor.',
      'Intake: two drinks the same afternoon, last about {h} h earlier.',
    ],
    weight: 0.7,
    effects: { preTest: { lastAlcoholHours: [3, 6] }, maneuver: { faultProb: { 'variable-effort': 0.55, 'slow-start': 0.25 } } },
    deviation: 'intoxicant inside the 8 h exclusion',
    vars: (fx) => ({ h: fx.hours(fx.preTest.lastAlcoholHours) }),
    verifiedNumbers: ['8'],
    caveats: [
      { id: 'alcohol-effort-variable', weight: 'major', text: 'Intoxicants within 8 h of testing (ATS/ERS 2019) impair coordination and effort, giving variable and lower flows and weaker repeatability. A low grade lowers confidence in the numbers and does not by itself indicate disease.' },
    ],
    decoyCaveats: [{ id: 'decoy-alcohol-dlco', text: 'Alcohol raises the DLCO through increased capillary volume.' }],
    confidence: 'medium', source: 'PRE-07; S1',
  }),
  scenario({
    id: 'sub-caffeine', category: 'Caffeine',
    variants: [
      'Two cups of coffee this morning, the last about {h} h ago.',
      'Had a large energy drink {h} h before arrival.',
      'Intake: strong coffee at {h} h before the appointment.',
    ],
    applies: (d) => ['obstruction', 'mixed', 'normal', 'nonspecific'].includes(d.archetype),
    weight: byArchetype({ obstruction: 2 }, 0.8),
    effects: { preTest: { lastCaffeineHours: [1, 3] }, physiology: { fev1Mult: [1.01, 1.04] } },
    vars: (fx) => ({ h: fx.hours(fx.preTest.lastCaffeineHours) }),
    caveats: [
      { id: 'caffeine-small-bronchodilation', weight: 'minor', text: 'Caffeine is a weak bronchodilator in people with asthma and can slightly raise the baseline FEV1 for a few hours. It is not on the ATS/ERS 2019 avoid list. The effect is small and mainly relevant when baseline obstruction is near the limit.' },
    ],
    decoyCaveats: [{ id: 'decoy-caffeine-invalid', text: 'Caffeine within the last few hours makes the study invalid.' }],
    confidence: 'medium', source: 'PRE-10; S18 Cochrane summary',
  }),

  scenario({
    id: 'prep-exercise-recent', category: 'Exercise',
    variants: [
      'Walked briskly from the parking structure and climbed two flights; exercised about {m} min ago.',
      'Cycled to the appointment, arrived {m} min before testing.',
      'Pt came straight from a workout about {m} min before the test.',
    ],
    weight: 0.8,
    effects: { preTest: { lastExerciseHours: [0.25, 0.75] }, physiology: { fev1Mult: [0.97, 1.0] } },
    deviation: 'vigorous exercise inside the 1 h exclusion',
    vars: (fx) => ({ m: String(Math.round((fx.preTest.lastExerciseHours * 60) / 5) * 5) }),
    verifiedNumbers: ['1'],
    caveats: [
      { id: 'exercise-airway-lability', weight: 'minor', text: 'Vigorous exercise within 1 h of testing (ATS/ERS 2019) can lower FEV1 in people with exercise-sensitive airways and otherwise changes little. A short rest before the test is part of preparation.' },
    ],
    decoyCaveats: [{ id: 'decoy-exercise-volumes', text: 'The recent exercise raised the lung volumes.' }],
    confidence: 'low', source: 'PRE-08; S1 (1 h); effect mem',
  }),
  scenario({
    id: 'prep-exercise-yesterday', category: 'Exercise', noncontributory: true,
    variants: [
      'Ran a long distance yesterday; no exercise today.',
      'Heavy gym session the previous evening; rested this morning.',
      'Intake: very active, hiked the day before; sat in the waiting room for a while.',
    ],
    weight: 0.6,
    effects: { preTest: { notes: 'exercise the previous day only' } },
    caveats: [
      { id: 'exercise-yesterday-no-change', weight: 'minor', text: 'Exercise on the previous day lies outside the preparation window of the ATS/ERS 2019 statement (vigorous exercise within 1 h) and does not change the interpretation.' },
    ],
    decoyCaveats: [{ id: 'decoy-exercise-fatigue', text: 'Residual muscle fatigue from yesterday lowers the FVC.' }],
    verifiedNumbers: ['1'],
    confidence: 'high', source: 'PRE-08; S1',
  }),
  scenario({
    id: 'prep-heavy-meal', category: 'Meal',
    variants: [
      'Large breakfast about {m} min before the test.',
      'Ate a full lunch {m} min ago; abdomen distended.',
      'Pt had a heavy meal shortly before arrival (about {m} min).',
    ],
    weight: (d) => (BMI(d) >= 30 ? 2 : 0.8),
    effects: { preTest: { lastMealMinutes: [20, 60] }, physiology: { fvcMult: [0.96, 0.99], fev1Mult: [0.98, 1.0] }, volumes: { icMult: [0.95, 0.99] } },
    vars: (fx) => ({ m: String(Math.round(fx.preTest.lastMealMinutes / 5) * 5) }),
    caveats: [
      { id: 'meal-abdominal-distension', weight: 'minor', text: 'A full stomach limits diaphragmatic descent, which can lower FVC, VC and inspiratory capacity slightly, more so with obesity. A heavy meal is not on the ATS/ERS 2019 avoid list and the evidence for the effect is weak.' },
    ],
    decoyCaveats: [{ id: 'decoy-meal-dlco', text: 'The meal lowers the diffusing capacity through reduced capillary volume.' }],
    confidence: 'low', source: 'PRE-09; S17; effect mem',
  }),
  scenario({
    id: 'prep-binder', category: 'Clothing',
    variants: [
      'Wearing a chest binder under the shirt; not removed for the test.',
      'Abdominal binder in place after recent care; patient reluctant to loosen it.',
      'Tight corset-style garment worn to the appointment.',
    ],
    weight: 0.7,
    effects: { physiology: { fvcMult: [0.93, 0.98], fev1Mult: [0.94, 0.98] }, volumes: { icMult: [0.9, 0.96], vaFollowsTlc: true } },
    caveats: [
      { id: 'binder-restriction-artifact', weight: 'major', text: 'A garment that restricts chest or abdominal expansion lowers FVC, VC and TLC with a preserved FEV1/FVC. A restrictive pattern that disappears when the garment is removed reflects the chest wall mechanics of the garment and not parenchymal disease. The ATS/ERS 2019 statement asks that restrictive clothing be loosened.' },
    ],
    decoyCaveats: [{ id: 'decoy-binder-obstruction', text: 'The binder causes airflow obstruction, which accounts for the low FEV1.' }],
    confidence: 'low', source: 'PRE-11; S1; S27; S28',
  }),
  scenario({
    id: 'prep-oxygen-dlco', category: 'Oxygen',
    variants: [
      'On 2 L/min nasal oxygen until a few minutes before the DLCO.',
      'Supplemental oxygen removed only {m} min before the diffusing capacity test.',
      'Pt arrived on portable oxygen; cannula taken off shortly before the single-breath test.',
    ],
    applies: fullPanel,
    weight: byArchetype({ obstruction: 2, 'restriction-parenchymal': 2 }, 0.8),
    effects: { preTest: { oxygenOffMinutes: [2, 6] }, dlco: { mult: [0.93, 0.98] } },
    vars: (fx) => ({ m: String(Math.round(fx.preTest.oxygenOffMinutes)) }),
    caveats: [
      { id: 'oxygen-dlco-lowered', weight: 'major', text: 'A higher alveolar oxygen tension competes with CO for hemoglobin and lowers the measured DLCO. The 2017 standard asks for no supplemental oxygen for a period before the test where clinically acceptable, and the use of oxygen is recorded with the result.' },
    ],
    decoyCaveats: [{ id: 'decoy-oxygen-spirometry', text: 'Supplemental oxygen raises the FEV1.' }],
    confidence: 'medium', source: 'PRE-12; S2 search summary; S22',
  }),

  scenario({
    id: 'clin-mi-recent', category: 'Contraindication',
    variants: [
      'Myocardial infarction 5 days ago; ordered by cardiology and performed anyway.',
      'Recent heart attack (this week). Patient limits effort because of chest discomfort.',
      'Admitted with an MI last week; physician requested spirometry before discharge.',
    ],
    applies: (d) => d.age >= 40,
    exclusive: 'effort', weight: 0.6,
    effects: { preTest: { notes: 'relative contraindication: acute myocardial infarction within 1 wk' }, maneuver: { effort: { fvc: [0.88, 0.95], fev1: [0.86, 0.94], r: [0.06, 0.1] } } },
    deviation: 'relative contraindication',
    verifiedNumbers: ['1'],
    caveats: [
      { id: 'mi-contraindication-effort', weight: 'major', text: 'An acute myocardial infarction within 1 wk is a relative contraindication to forced maneuvers (ATS/ERS 2019, Table 2). Effort is limited by discomfort and caution, so FVC, FEV1 and peak flow are not representative of the patient\'s best.' },
    ],
    decoyCaveats: [{ id: 'decoy-mi-dlco', text: 'The recent infarction explains the low DLCO.' }],
    confidence: 'high', source: 'PRE-13; S1 Table 2',
  }),
  scenario({
    id: 'clin-abdominal-surgery', category: 'Contraindication',
    variants: [
      'Abdominal surgery 2 weeks ago; splinting the incision on deep inspiration.',
      'Post-operative day 12 after laparotomy. Pain with deep breath, shallow inspirations before the blast.',
      'Pt had thoracic or abdominal surgery recently and guards the incision.',
    ],
    exclusive: 'effort', weight: 0.7,
    effects: {
      preTest: { notes: 'relative contraindication: abdominal or thoracic surgery within 4 wk' },
      physiology: { fvcMult: [0.8, 0.92], fev1Mult: [0.82, 0.93] },
      volumes: { icMult: [0.8, 0.9], vaFollowsTlc: true },
      maneuver: { faultProb: { 'early-termination': 0.3 } },
    },
    deviation: 'relative contraindication',
    verifiedNumbers: ['4'],
    caveats: [
      { id: 'surgery-splinting-restriction', weight: 'major', text: 'Abdominal or thoracic surgery within 4 wk is a relative contraindication (ATS/ERS 2019, Table 2). Pain and splinting limit inspiration, lowering FVC, VC and TLC with a preserved or raised FEV1/FVC, a restrictive-looking pattern from reduced effort and chest-wall mechanics and not from parenchymal disease.' },
    ],
    decoyCaveats: [{ id: 'decoy-surgery-obstruction', text: 'The postoperative state accounts for airflow obstruction.' }],
    confidence: 'high', source: 'PRE-14; S1 Table 2; pattern mem',
  }),
  scenario({
    id: 'clin-uri', category: 'Respiratory infection',
    variants: [
      'Cough and runny nose for 3 days; possible viral URI. Frequent cough on forced expiration.',
      'Patient reports a head cold this week, productive cough at times.',
      'Intake: sore throat, congestion and cough since the weekend; afebrile.',
    ],
    weight: 0.8,
    effects: { preTest: { notes: 'suspected transmissible respiratory infection' }, physiology: { fev1Mult: [0.92, 0.98], fvcMult: [0.95, 0.99] }, maneuver: { faultProb: { cough: 0.3 } }, dlco: { mult: [0.95, 1.0] } },
    deviation: 'suspected transmissible respiratory infection',
    caveats: [
      { id: 'uri-transient-narrowing', weight: 'major', text: 'An active or suspected transmissible respiratory infection is a relative contraindication (ATS/ERS 2019, Table 2). Transient bronchial narrowing and cough lower FEV1 and FVC and can lower the ratio, so the values may overstate chronic impairment.' },
    ],
    decoyCaveats: [{ id: 'decoy-uri-restriction', text: 'The infection indicates parenchymal restriction.' }],
    confidence: 'medium', source: 'PRE-17; S1; effect mem',
  }),
  scenario({
    id: 'clin-fev1-falls-each-blow', category: 'Maneuver-induced bronchospasm',
    variants: [
      'FEV1 fell with each blow ({trend}); stopped after blow {n} for tightness.',
      'Progressive drop in FEV1 across the session; patient wheezy after repeated forced expirations, test stopped.',
      'Each forced expiration was worse than the one before (chest tightness); stopped per protocol.',
    ],
    applies: (d) => ['obstruction', 'mixed', 'normal', 'nonspecific'].includes(d.archetype),
    weight: byArchetype({ obstruction: 3 }, 0.7),
    effects: { maneuver: { decline: { perBlow: [0.05, 0.08] } } },
    vars: (fx, c) => ({ trend: c.fev1Trend, n: String(c.nBlows) }),
    verifiedNumbers: ['80'],
    caveats: [
      { id: 'serial-decline-best-early', weight: 'major', text: 'A progressive fall in FEV1 across maneuvers indicates maneuver-induced airway narrowing or fatigue. The standard stops testing when FEV1 falls below 80% of the starting value (ATS/ERS 2019); the best values come from the early blows, and airway hyperreactivity is possible.' },
    ],
    decoyCaveats: [{ id: 'decoy-decline-restriction', text: 'The falling FVC across blows shows restriction.' }],
    confidence: 'high', source: 'PRE-19; S1',
  }),
  scenario({
    id: 'clin-syncope-cough', category: 'Safety',
    variants: [
      'History of fainting with cough; light-headed on the third blow, effort eased after a few seconds.',
      'Pt felt dizzy at the end of long expirations and cut the effort short to avoid fainting; session limited to three blows.',
      'Syncope with forced expiration in the past; technologist limited the blows and asked for a gentler finish.',
    ],
    exclusive: 'effort', weight: 0.5,
    effects: { preTest: { notes: 'syncope with forced expiration reported' }, maneuver: { effort: { fvc: [0.9, 0.96], fev1: [0.95, 0.99], r: [0.05, 0.08] }, maxManeuvers: 3 } },
    caveats: [
      { id: 'syncope-fvc-understated', weight: 'major', text: 'Easing the effort late in expiration to avoid syncope means the maneuver is no longer a maximal expiration. FVC is understated, FEV1 less so, and fewer than the usual number of acceptable maneuvers limits the grade.' },
    ],
    decoyCaveats: [{ id: 'decoy-syncope-cardiac', text: 'The reduced FVC reflects cardiac disease.' }],
    confidence: 'high', source: 'PRE-20; S1',
  }),
];

