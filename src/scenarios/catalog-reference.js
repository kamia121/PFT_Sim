/**
 * Scenarios about the inputs to the reference equations (height, sex, requisition group), the
 * mouthpiece interface, cooperation, and body habitus or setting. Rows refer to
 * docs/research/scenarios.md. Where the laboratory enters a value that differs from the true one
 * (estimated height, reference sex), the lungs were generated from the true value.
 */
import { scenario, BMI, fullPanel, byArchetype } from './define.js';

const ARMSPAN_ERROR = { id: 'height-estimated-armspan-error', weight: 'major', text: 'Predicted values depend on the height entered, and here the height is estimated from arm span with a fixed ratio. The ratio varies with sex, age and ancestry, so the estimate carries an error of several centimeters in either direction that shifts every predicted value and z-score.' };
const ARMSPAN_RATIO = { id: 'armspan-ratio-sources-differ', weight: 'minor', text: 'Published fixed arm-span ratios differ between sources, and regression equations are preferred over a fixed ratio when they are available.' };

export const REFERENCE_SCENARIOS = [
  scenario({
    id: 'height-kyphoscoliosis', category: 'Height estimate', exclusive: 'height',
    variants: [
      'Kyphoscoliosis: standing height ({standing} cm) unreliable. Arm span {span} cm; height for the reference taken as span divided by {divisor}, {stated} cm.',
      'Spinal curvature prevents accurate standing height (measured {standing} cm). Height estimated from arm span ({span} cm, ratio {divisor}): {stated} cm.',
      'Cannot stand straight (scoliosis). Arm span {span} cm used; estimated height {stated} cm entered on the report.',
    ],
    applies: (d) => d.archetype === 'restriction-extraparenchymal',
    weight: byArchetype({ 'restriction-extraparenchymal': 6 }, 0),
    effects: { height: { method: 'kyphoscoliosis' } },
    vars: (fx, c) => ({ standing: c.result.standingCm.toFixed(1), span: c.result.spanCm.toFixed(1), divisor: c.result.divisor.toFixed(2), stated: c.result.statedCm.toFixed(1) }),
    caveats: [
      { id: 'kyphoscoliosis-standing-height', weight: 'major', text: 'In kyphoscoliosis the measured standing height understates skeletal height. Using it would lower the predicted volumes and make restriction look milder than it is, so arm span is the usual substitute.' },
      ARMSPAN_ERROR, ARMSPAN_RATIO,
    ],
    decoyCaveats: [
      { id: 'decoy-standing-height-correct', text: 'The measured standing height is the correct input and the arm-span estimate adds bias.' },
      { id: 'decoy-restriction-height-artifact', text: 'The low TLC is explained entirely by the height error.' },
    ],
    confidence: 'medium', source: 'SPEC-01; S12, S13, S16 (conversion factors from search summaries)',
  }),
  scenario({
    id: 'height-no-legs', category: 'Height estimate', exclusive: 'height',
    variants: [
      'Bilateral lower-limb amputation; standing height cannot be measured. Arm span {span} cm, converted as span/{divisor}; height entered {stated} cm.',
      'No lower limbs (wheelchair user). Height for the predicted values estimated from arm span ({span} cm) with a ratio of {divisor}: {stated} cm.',
      'Standing height not obtainable (double amputee). Arm span used: {span} cm, estimated height {stated} cm.',
    ],
    weight: 1,
    effects: { height: { method: 'arm-span' } },
    vars: (fx, c) => ({ span: c.result.spanCm.toFixed(1), divisor: c.result.divisor.toFixed(2), stated: c.result.statedCm.toFixed(1) }),
    caveats: [
      ARMSPAN_ERROR, ARMSPAN_RATIO,
      { id: 'height-method-stated', weight: 'minor', text: 'Standing height is not defined without leg length, so arm span avoids the missing segment, and the report states the method used for height.' },
    ],
    decoyCaveats: [{ id: 'decoy-amputee-lung-volume', text: 'The missing legs reduce the lung volumes, so the predicted values should be lowered.' }],
    confidence: 'medium', source: 'SPEC-01, SPEC-04; S13 (conversion factors from search summaries)',
  }),
  scenario({
    id: 'height-unable-stand-ulna', category: 'Height estimate', exclusive: 'height',
    variants: [
      'Unable to stand. Ulna length {ulna} cm by calipers; height estimated as {stated} cm.',
      'Height from ulna length ({ulna} cm) because standing was not possible: {stated} cm.',
      'Ulna length measured with calipers at {ulna} cm; estimated height {stated} cm entered for the reference.',
    ],
    weight: 1,
    effects: { height: { method: 'ulna' } },
    vars: (fx, c) => ({ ulna: c.result.ulnaCm.toFixed(1), stated: c.result.statedCm.toFixed(1) }),
    caveats: [
      { id: 'height-estimated-ulna-error', weight: 'major', text: 'Height is estimated from ulna length, and the conversion depends on sex, age and ancestry. The error of the estimate moves the predicted values and the z-scores in either direction.' },
      { id: 'height-method-stated', weight: 'minor', text: 'Standing height is not defined without leg length, so arm span avoids the missing segment, and the report states the method used for height.' },
    ],
    decoyCaveats: [{ id: 'decoy-ulna-exact', text: 'Ulna length gives the same height as standing, so the predicted values are unaffected.' }],
    confidence: 'medium', source: 'SPEC-02; S1 (ulna preferred in children); S14',
  }),
  scenario({
    id: 'height-one-forearm-halfspan', category: 'Height estimate', exclusive: 'height',
    variants: [
      'Left forearm amputee: right half arm span ({half} cm) doubled; height entered {stated} cm.',
      'Height taken as twice the right half-span ({half} cm) because of the missing left forearm: {stated} cm.',
      'Unilateral forearm amputation; full arm span not measurable. Half-span method, estimated height {stated} cm.',
    ],
    weight: 0.6,
    effects: { height: { method: 'half-span' } },
    vars: (fx, c) => ({ half: (c.result.spanCm / 2).toFixed(1), stated: c.result.statedCm.toFixed(1) }),
    caveats: [
      ARMSPAN_ERROR,
      { id: 'halfspan-less-precise', weight: 'minor', text: 'Doubling a half-span is less precise than a measured full arm span, and the direction of its error is not fixed.' },
    ],
    decoyCaveats: [{ id: 'decoy-halfspan-exact', text: 'Doubling the half-span removes the arm-span ratio uncertainty.' }],
    confidence: 'low', source: 'SPEC-03; S15 (single study, search summary)',
  }),
  scenario({
    id: 'height-old-chart', category: 'Height estimate', exclusive: 'height',
    variants: [
      'Height taken from the chart ({stated} cm, measured at an earlier visit); not remeasured today.',
      'Patient could not stand straight today, so the height on file ({stated} cm) was used.',
      'Height entered from the previous visit record: {stated} cm.',
    ],
    applies: (d) => d.age >= 60,
    weight: 1.2,
    effects: { height: { method: 'chart' } },
    vars: (fx, c) => ({ stated: c.result.statedCm.toFixed(1) }),
    verifiedNumbers: ['25', '1'],
    caveats: [
      { id: 'chart-height-too-tall', weight: 'major', text: 'Height falls with age, so a height carried over from an old record is likely to be too tall. A taller height raises the predicted values and lowers the z-scores, which can make normal values look falsely low. Remeasurement is waived only at age 25 y or older with a reliable measurement in the same facility within 1 y (ATS/ERS 2019).' },
    ],
    decoyCaveats: [{ id: 'decoy-chart-height-fine', text: 'Height does not change with age in adults, so the chart value is acceptable.' }],
    confidence: 'medium', source: 'SPEC-05; S1; mechanism mem',
  }),

  scenario({
    id: 'sex-birth-default', category: 'Sex and gender', exclusive: 'sex',
    variants: [
      'Sex assigned at birth: {birth}. Patient identifies as {identity}. Predicted values calculated with sex assigned at birth, the laboratory default (ATS/ERS 2019).',
      'Registration lists gender identity {identity}; sex assigned at birth {birth}. Operator note: reference values use birth sex by default.',
      'Patient was told that predicted lung size follows sex assigned at birth and agreed to this; identity {identity}, reference sex used {birth}.',
    ],
    weight: 0.6,
    effects: { referenceSex: { use: 'birth', identityDraw: [0, 1] } },
    vars: (fx, c) => ({ birth: c.result.birthWord, identity: c.result.identityWord }),
    caveats: [
      { id: 'sex-birth-used-default', weight: 'major', text: 'Predicted lung size follows sex assigned at birth in the ATS/ERS 2019 standard, and the operator note states the default used, which here is the birth sex. The standard gives no rule for patients on hormone therapy, for nonbinary patients or for intersex patients.' },
      { id: 'sex-evidence-limited', weight: 'minor', text: 'The evidence on which reference equations fit patients on long-term hormone therapy is limited to small retrospective series, and prospective studies are in progress. The sex used can move z-scores across the lower limit of normal without any change in the lungs, so the values under the other sex are shown for contrast.' },
    ],
    decoyCaveats: [
      { id: 'decoy-sex-identity-required', text: 'Reference values should have been calculated with gender identity, so the z-scores are invalid.' },
      { id: 'decoy-hormones-change-lungs', text: 'Hormone therapy has changed the true lung volumes enough to explain the findings.' },
    ],
    confidence: 'medium', source: 'SPEC-12; S1; S7 (abstract); S8-S11 not read',
  }),
  scenario({
    id: 'sex-identity-entered', category: 'Sex and gender', exclusive: 'sex',
    variants: [
      'Sex assigned at birth: {birth}. Patient identifies as {identity}; registration entered {identity}, and reference values were calculated with {identity}.',
      'Requisition sex field: {identity} (patient\'s identity). Chart shows sex assigned at birth {birth}. Predicted values use the requisition sex.',
      'Registration entered identity {identity}; birth sex {birth} is on file. The operator did not change the reference sex.',
    ],
    weight: 0.6,
    effects: { referenceSex: { use: 'identity' } },
    vars: (fx, c) => ({ birth: c.result.birthWord, identity: c.result.identityWord }),
    caveats: [
      { id: 'sex-identity-used-nondefault', weight: 'major', text: 'The reference sex on this report is the sex the patient identifies with and not the sex assigned at birth that the ATS/ERS 2019 standard specifies for predicted lung size. Predicted values, z-scores and classification can differ from those under birth sex, and the report names the reference sex it used.' },
      { id: 'sex-evidence-limited', weight: 'minor', text: 'The evidence on which reference equations fit patients on long-term hormone therapy is limited to small retrospective series, and prospective studies are in progress. The sex used can move z-scores across the lower limit of normal without any change in the lungs, so the values under the other sex are shown for contrast.' },
    ],
    decoyCaveats: [{ id: 'decoy-sex-no-effect', text: 'The choice of reference sex does not alter the classification.' }],
    confidence: 'medium', source: 'SPEC-13; S1; S7 (abstract)',
  }),
  scenario({
    id: 'sex-not-recorded', category: 'Sex and gender', exclusive: 'sex',
    variants: [
      'Sex not recorded on the requisition and the patient declined to answer; the laboratory default ({used}) was applied.',
      'Registration left the sex field blank. Operator note: reference values calculated with the default, {used}.',
      'Patient did not disclose sex. Default reference sex {used} used per laboratory procedure.',
    ],
    weight: 0.5,
    effects: { referenceSex: { use: 'default', defaultDraw: [0, 1] } },
    vars: (fx, c) => ({ used: c.result.usedWord }),
    caveats: [
      { id: 'sex-default-applied', weight: 'major', text: 'Sex was not disclosed, so the predicted values rest on the laboratory default stated in the operator note (ATS/ERS 2019). Predicted values and z-scores depend on that default and shift with the alternative.' },
    ],
    decoyCaveats: [{ id: 'decoy-sex-irrelevant', text: 'Sex does not enter the GLI equations, so the missing field has no effect.' }],
    confidence: 'high', source: 'SPEC-14; S1',
  }),
  scenario({
    id: 'race-field-missing', category: 'Race and ethnicity',
    variants: [
      'Race and ethnicity field blank on the requisition; laboratory default "Other or mixed" entered.',
      'Patient declined to state race; entered as "Other or mixed".',
      'Requisition race marked "other"; the "Other or mixed" category was used for the reference.',
    ],
    weight: 1,
    effects: { group: 'Other or mixed' },
    caveats: [
      { id: 'race-field-default-group', weight: 'major', text: 'The group-specific GLI-2012 equation is chosen by the requisition field. With the field missing or marked other, the "other or mixed" composite is used, an average of the other groups that was intended as an interim solution. A classification that differs between GLI-2012 and GLI Global reflects the equation and not a change in the patient.' },
      { id: 'race-global-no-field', weight: 'minor', text: 'GLI Global does not use the field, so the same measured values give a group-independent result under that equation.' },
    ],
    decoyCaveats: [{ id: 'decoy-race-volumes', text: 'The missing race field changes the predicted lung volumes.' }],
    confidence: 'medium', source: 'SPEC-14, SPEC-16; S1; S5; S29',
  }),
  scenario({
    id: 'ref-european-only', category: 'Equation coverage',
    variants: [
      'Reference for TLC, RV and DLCO: GLI equations derived in people of European ancestry; no group-specific set is configured.',
      'Report note: lung-volume and diffusing-capacity references are the European-ancestry GLI sets for every patient.',
      'Laboratory policy: TLC and TLCO use the GLI sets without an ancestry adjustment (none is available).',
    ],
    applies: (d) => d.panel === 'full' && d.group !== 'White',
    weight: 1.5,
    caveats: [
      { id: 'volumes-dlco-european-only', weight: 'minor', text: 'The GLI lung-volume and TLCO equations were derived in people of European ancestry, and the ATS 2023 statement advises against ancestry adjustment factors for volumes and DLCO. Spirometry and the volumes or DLCO therefore rest on different reference populations, and discordance between them calls for extra caution.' },
    ],
    decoyCaveats: [{ id: 'decoy-volumes-adjust-group', text: 'The volume and DLCO references should be adjusted by a group-specific factor before classification.' }],
    confidence: 'high', source: 'SPEC-17; S5; S29',
  }),

  scenario({
    id: 'iface-tracheostomy', category: 'Interface', exclusive: 'interface',
    variants: [
      'Tracheostomy: tested through an adapter on the cuffed tube.',
      'Patient has a tracheostomy; seal checked with the cuff inflated, flows measured through a connector.',
      'Trach in place, adapter used; some air escape heard on the second blow.',
    ],
    weight: 0.4,
    effects: { preTest: { notes: 'tracheostomy interface' }, maneuver: { forced: [{ fault: 'leak', p: 0.45, first: [0, 1] }] }, physiology: { fvcMult: [0.9, 0.97] } },
    caveats: [
      { id: 'trach-interface-unreliable', weight: 'major', text: 'A tracheostomy adapter changes dead space and may leak, so flows and volumes are less reliable than with a mouthpiece. The ATS/ERS 2019 statement allows connectors and requires the interface to be recorded, and the result is usable at best.' },
    ],
    decoyCaveats: [{ id: 'decoy-trach-dlco', text: 'The tracheostomy improves gas mixing and raises the DLCO.' }],
    confidence: 'medium', source: 'SPEC-07; S1; effect mem',
  }),
  scenario({
    id: 'iface-dentures-loose', category: 'Interface', exclusive: 'interface',
    variants: [
      'Dentures left in; poorly fitting, slipping on forced expiration.',
      'Upper plate loose, patient props it with the tongue; mouthpiece seal inconsistent.',
      'Ill-fitting dentures; air escaped at the lips on blows {blows}.',
    ],
    applies: (d) => d.age >= 55,
    weight: 1,
    effects: { maneuver: { forced: [{ fault: 'mouthpiece-obstruction', p: 0.3, first: [0, 2] }, { fault: 'leak', p: 0.3, first: [0, 2] }] } },
    vars: (fx, c) => ({ blows: c.blows('leak') }),
    caveats: [
      { id: 'dentures-poor-fit-leak', weight: 'major', text: 'Poorly fitting dentures cause air escape or an obstructed mouthpiece, which makes the affected blows unacceptable. Well-fitting dentures are usually left in, and the studies on removal conflict.' },
    ],
    decoyCaveats: [{ id: 'decoy-dentures-removed', text: 'Dentures should always be removed because they raise the FVC.' }],
    confidence: 'medium', source: 'SPEC-08; S1',
  }),
  scenario({
    id: 'iface-dentures-ok', category: 'Interface', exclusive: 'interface', noncontributory: true,
    variants: [
      'Well-fitting dentures left in for the test; good lip seal.',
      'Denture wearer: dentures kept in and the fit checked, no leak on any blow.',
      'Dentures in place, patient comfortable with the mouthpiece.',
    ],
    applies: (d) => d.age >= 55,
    weight: 0.8,
    effects: { preTest: { notes: 'well-fitting dentures left in' } },
    caveats: [
      { id: 'dentures-ok-no-change', weight: 'minor', text: 'Well-fitting dentures that stay in place for the test do not change the interpretation; they are usually left in (ATS/ERS 2019).' },
    ],
    decoyCaveats: [{ id: 'decoy-dentures-invalid-fvc', text: 'The dentures should have been removed, which invalidates the FVC.' }],
    confidence: 'medium', source: 'SPEC-08; S1',
  }),
  scenario({
    id: 'iface-facial-weakness', category: 'Interface', exclusive: 'interface',
    variants: [
      'Facial weakness (Bell\'s palsy): cannot seal the lips; flange mouthpiece with operator assistance.',
      'Bulbar weakness; lip seal poor, air escape on blows {blows}.',
      'Unable to purse the lips; assisted seal held for each blow.',
    ],
    weight: byArchetype({ 'restriction-extraparenchymal': 4 }, 0.5),
    effects: { maneuver: { forced: [{ fault: 'leak', p: 0.6, first: [0, 1] }], faultProb: { 'slow-start': 0.4 } }, physiology: { fvcMult: [0.9, 0.97] } },
    vars: (fx, c) => ({ blows: c.blows('leak') }),
    caveats: [
      { id: 'facial-weakness-leak', weight: 'major', text: 'A leak at the lips makes the affected maneuvers unacceptable and lowers FVC, FEV1 and peak flow. Neuromuscular weakness also slows the rise to peak flow, so the back-extrapolated volume may exceed its limit, a situation in which the operator may override the automatic flag (ATS/ERS 2019).' },
    ],
    decoyCaveats: [{ id: 'decoy-weakness-parenchymal', text: 'The low FVC indicates parenchymal lung disease.' }],
    confidence: 'medium', source: 'SPEC-09; S1; S24',
  }),

  scenario({
    id: 'coop-language-cognitive', category: 'Cooperation', exclusive: 'effort',
    variants: [
      'Interpreter used; patient cognitively impaired and did not follow the command to blast out.',
      'Language barrier: instructions relayed by a family member; effort inconsistent.',
      'Patient confused about the instructions; coached repeatedly, short blows.',
    ],
    weight: 0.8,
    effects: { maneuver: { effort: { fvc: [0.85, 0.93], fev1: [0.83, 0.92], r: [0.07, 0.12] }, faultProb: { 'variable-effort': 0.5, 'early-termination': 0.3 } } },
    caveats: [
      { id: 'coop-submaximal-unreliable', weight: 'major', text: 'Inability to understand or follow directions usually leads to submaximal and variable results (ATS/ERS 2019). FEV1, FVC and peak flow are lowered and the ratio is unreliable. A low grade lowers confidence in the numbers and does not establish disease.' },
    ],
    decoyCaveats: [{ id: 'decoy-coop-airflow', text: 'The low flows demonstrate severe airflow obstruction.' }],
    confidence: 'high', source: 'SPEC-11; S1',
  }),
  scenario({
    id: 'coop-anxiety', category: 'Cooperation', exclusive: 'effort',
    variants: [
      'Anxious and hyperventilating before the test; coaching needed between blows.',
      'Patient visibly nervous, held breath at the top and started late.',
      'Worried about the mouthpiece; short, hesitant efforts.',
    ],
    weight: 0.9,
    effects: { maneuver: { effort: { fvc: [0.94, 0.98], fev1: [0.94, 0.98], r: [0.05, 0.09] }, faultProb: { 'variable-effort': 0.5, 'slow-start': 0.35, 'early-termination': 0.25 } } },
    caveats: [
      { id: 'anxiety-variable-effort', weight: 'major', text: 'Anxiety produces hesitant starts, early stops and variable effort, lowering flows and repeatability. When the loops differ from blow to blow, the values reflect technique and not airway disease.' },
    ],
    decoyCaveats: [{ id: 'decoy-anxiety-dlco', text: 'The hyperventilation raised the DLCO.' }],
    confidence: 'low', source: 'SPEC-11; S1; thin evidence beyond S1',
  }),
  scenario({
    id: 'coop-pain-chest-wall', category: 'Pain', exclusive: 'effort',
    variants: [
      'Rib fracture last week; pain limits full inspiration.',
      'Pleuritic chest pain on a deep breath; patient stops short of a full inspiration before the blast.',
      'Guards the left side because of musculoskeletal chest pain.',
    ],
    weight: 0.6,
    effects: { preTest: { notes: 'chest-wall pain' }, maneuver: { effort: { fvc: [0.86, 0.94], fev1: [0.88, 0.95], r: [0.06, 0.1] }, faultProb: { 'early-termination': 0.35 } } },
    caveats: [
      { id: 'pain-limits-inspiration', weight: 'major', text: 'Pain on deep inspiration limits inflation before the blast and shortens expiration, lowering FVC and FEV1 with a preserved ratio. Restrictive-looking spirometry from pain does not establish a low TLC, which needs lung volumes.' },
    ],
    decoyCaveats: [{ id: 'decoy-pain-obstruction', text: 'The low FEV1 reflects airway obstruction caused by the injury.' }],
    confidence: 'low', source: 'PRE-14 pain mechanism; S1; mem',
  }),

  scenario({
    id: 'env-altitude', category: 'Altitude', applies: fullPanel,
    variants: [
      'Laboratory elevation {elev} m; patient has lived at altitude for years. No altitude adjustment applied to DLCO.',
      'Testing site at moderate altitude ({elev} m); DLCO reported without altitude correction.',
      'Note: laboratory is {elev} m above sea level; DLCO not corrected for barometric pressure.',
    ],
    weight: 0.6,
    effects: { preTest: { elevationM: [1400, 2000] }, dlco: { mult: [1.02, 1.08] } },
    vars: (fx) => ({ elev: String(Math.round(fx.preTest.elevationM / 50) * 50) }),
    caveats: [
      { id: 'altitude-dlco-unadjusted', weight: 'minor', text: 'DLCO depends on the inspired oxygen tension, and an altitude adjustment is expected. Chronic residents at altitude tend to have a higher DLCO, so an unadjusted value can sit higher than at sea level; the evidence is limited and partly conflicting. No source was found for adjusting the spirometry reference values.' },
    ],
    decoyCaveats: [{ id: 'decoy-altitude-spirometry', text: 'The altitude invalidates the spirometry because the flows are not corrected.' }],
    confidence: 'low', source: 'SPEC-18; S23 (search summaries)',
  }),
  scenario({
    id: 'body-obesity', category: 'Obesity',
    variants: [
      'BMI {bmi} kg/m2. Difficulty with a deep breath out to residual volume.',
      'Weight {weight} kg, BMI {bmi} kg/m2; tidal breathing shallow while seated.',
      'Anthropometry: BMI {bmi} kg/m2; pt short of breath on exertion.',
    ],
    applies: (d) => BMI(d) >= 30 && d.archetype !== 'obesity-low-erv',
    weight: 3,
    exclusive: 'bmi',
    effects: { volumes: { ervMult: [0.8, 0.92], frcMult: [0.9, 0.97] }, physiology: { fvcMult: [0.97, 1.0] } },
    vars: (fx, c) => ({ bmi: c.bmi.toFixed(1), weight: String(c.d.weightKg) }),
    caveats: [
      { id: 'obesity-low-erv-not-restriction', weight: 'major', text: 'Obesity lowers ERV and FRC while TLC is preserved except in severe obesity. Low ERV with a normal TLC is an obesity pattern and not restriction, and a low FVC with a normal ratio needs TLC before restriction is named.' },
    ],
    decoyCaveats: [{ id: 'decoy-obesity-raises-dlco-artifact', text: 'The obesity makes the diffusing capacity unreliable.' }],
    confidence: 'medium', source: 'SPEC-19; S19',
  }),
  scenario({
    id: 'body-obesity-note', category: 'Obesity',
    variants: [
      'BMI {bmi} kg/m2. Difficulty with a deep breath out to residual volume.',
      'Weight {weight} kg, BMI {bmi} kg/m2; tidal breathing shallow while seated.',
      'Anthropometry: BMI {bmi} kg/m2; short of breath on exertion.',
    ],
    applies: (d) => d.archetype === 'obesity-low-erv',
    weight: 4,
    exclusive: 'bmi',
    vars: (fx, c) => ({ bmi: c.bmi.toFixed(1), weight: String(c.d.weightKg) }),
    caveats: [
      { id: 'obesity-low-erv-not-restriction', weight: 'major', text: 'Obesity lowers ERV and FRC while TLC is preserved except in severe obesity. Low ERV with a normal TLC is an obesity pattern and not restriction, and a low FVC with a normal ratio needs TLC before restriction is named.' },
    ],
    decoyCaveats: [{ id: 'decoy-obesity-raises-dlco-artifact', text: 'The obesity makes the diffusing capacity unreliable.' }],
    confidence: 'medium', source: 'SPEC-19; S19',
  }),
  scenario({
    id: 'body-anemia-note', category: 'Anemia', exclusive: 'hb',
    variants: [
      'Hb {hb} g/dL from today\'s draw; DLCO adjusted for hemoglobin.',
      'Hemoglobin {hb} g/dL (blood count this morning). The reported DLCO includes the hemoglobin adjustment.',
      'CBC: Hb {hb} g/dL; adjustment applied by the laboratory software.',
    ],
    applies: (d) => d.panel === 'full' && d.hbGdl < (d.sex === 'M' ? 13 : 12),
    weight: 3,
    vars: (fx, c) => ({ hb: c.hb.toFixed(1) }),
    caveats: [
      { id: 'anemia-dlco-adjusted', weight: 'major', text: 'Low hemoglobin lowers the measured DLCO and KCO while VA is unchanged. The reported DLCO is adjusted for hemoglobin, so a low measured value can be normal after the adjustment. The adjustment formula used in this tool has not been checked against the 2017 standard.' },
    ],
    decoyCaveats: [{ id: 'decoy-anemia-va', text: 'The anemia lowers the VA.' }],
    confidence: 'medium', source: 'SPEC-20; S22',
  }),
  scenario({
    id: 'dlco-hb-missing', category: 'Anemia', exclusive: 'hb', applies: fullPanel,
    variants: [
      'Hemoglobin not available at the time of the test; DLCO reported uncorrected.',
      'No blood count on file in the last month; hemoglobin adjustment skipped.',
      'Hb unknown (no blood drawn); DLCO reported without hemoglobin adjustment.',
    ],
    weight: byArchetype({ anemia: 5 }, 0.5),
    effects: { dlco: { hbAvailable: false } },
    caveats: [
      { id: 'hb-missing-dlco-unadjusted', weight: 'major', text: 'The DLCO is reported without hemoglobin adjustment. Low hemoglobin lowers the unadjusted DLCO and high hemoglobin raises it, so an abnormal value cannot be read as parenchymal or vascular disease until the hemoglobin is known.' },
    ],
    decoyCaveats: [{ id: 'decoy-hb-missing-va', text: 'The missing hemoglobin makes the VA unreliable.' }],
    confidence: 'medium', source: 'DLC-10; S2; S22',
  }),
];

