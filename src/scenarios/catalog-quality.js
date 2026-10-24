/**
 * Scenarios about the quality of the measurements themselves: spirometry maneuver faults,
 * bronchodilator-study problems, single-breath DLCO technique, and plethysmography. Faults are
 * injected through the maneuver generator (leak, mouthpiece obstruction, pause at TLC and
 * submaximal effort are new) and the stated text names the blows that actually carry the fault.
 */
import { scenario, hasBdStudy, fullPanel, OBSTRUCTIVE, byArchetype } from './define.js';

const BLOWS = (fault) => (fx, c) => ({ blows: c.blows(fault) });

export const QUALITY_SCENARIOS = [
  scenario({
    id: 'qs-submaximal-effort', category: 'Effort', exclusive: 'effort',
    variants: [
      'Patient not blasting; effort submaximal on every blow despite coaching.',
      'Effort looks the same low level on all blows; encouragement did not change it.',
      'Rounded, low-peak blows throughout; patient reports fear of coughing.',
    ],
    weight: 1.2,
    // Peak flow is the effort-dependent quantity: a slower rise (r) lowers and delays the peak. FEV1 is largely effort independent after the peak, so it
    // falls little. FVC falls when the lungs are normal; in airflow obstruction a gentler blow compresses the airways less and the FVC can rise (unverified sizes).
    effects: { maneuver: { effort: { fvc: [0.9, 0.97], fev1: [0.93, 0.98], r: [0.16, 0.3], fvcObstructed: [0.98, 1.06] } } },
    finalize: (fx, d) => {
      const { fvcObstructed, ...effort } = fx.maneuver.effort;
      return { ...fx, maneuver: { ...fx.maneuver, effort: OBSTRUCTIVE.includes(d.archetype) ? { ...effort, fvc: fvcObstructed } : effort } };
    },
    caveats: [
      { id: 'submaximal-effort-mimics', weight: 'major', text: 'Consistently low effort lowers peak flow most and delays and rounds the peak. FEV1 is relatively effort independent after the peak, so it falls less than peak flow. FVC may fall, which can mimic restriction, or in airflow obstruction may even rise because a gentler blow compresses the airways less. Repeatability can remain good when the effort is consistently low, so a good grade does not exclude it; a low, late, rounded peak flow is the clue.' },
    ],
    decoyCaveats: [{ id: 'decoy-submax-restriction', text: 'The reduced FVC with a preserved ratio establishes restriction.' }],
    confidence: 'medium', source: 'QS-02; S1; S25',
  }),
  scenario({
    id: 'qs-slow-start', category: 'Start of test',
    variants: [
      'Slow, hesitant start on blows {blows}.',
      'Patient started the blast late and gently on blows {blows}; back-extrapolated volume flagged.',
      'Hesitation before the blast on blows {blows}.',
    ],
    weight: 1.2,
    effects: { maneuver: { forced: [{ fault: 'slow-start', p: 0.5, first: [0, 2] }] } },
    vars: BLOWS('slow-start'),
    verifiedNumbers: ['5', '0.100'],
    caveats: [
      { id: 'slow-start-bev-fev1-unusable', weight: 'major', text: 'A slow start enlarges the back-extrapolated volume. When it exceeds 5% of the FVC or 0.100 L, whichever is greater, the FEV1 is neither acceptable nor usable. The error in the FEV1 has no fixed direction, so it cannot be assumed to mask or to exaggerate obstruction; the loop shows a delayed, rounded rise.' },
    ],
    decoyCaveats: [{ id: 'decoy-slow-start-fvc', text: 'The slow start makes the FVC unusable.' }],
    confidence: 'high', source: 'QS-01; S1',
  }),
  scenario({
    id: 'qs-early-termination', category: 'End of test',
    variants: [
      'Stopped blowing early on blows {blows}; the lungs were not emptied.',
      'Early stop on blows {blows}; patient took a breath in before expiration was complete.',
      'Blows {blows} ended abruptly; patient came off the mouthpiece early.',
    ],
    weight: 1.2,
    effects: { maneuver: { forced: [{ fault: 'early-termination', p: 0.45, first: [0, 2] }] } },
    vars: BLOWS('early-termination'),
    caveats: [
      { id: 'early-termination-fvc-low', weight: 'major', text: 'Early termination lowers the FVC while the FEV1 is little changed when the stop follows the first second, so the ratio rises. A low FVC with a normal or raised ratio can mimic restriction and can mask obstruction. The FVC is acceptable only if an end-of-forced-expiration indicator is met, and an abrupt end of the curve at nonzero flow identifies the problem.' },
    ],
    decoyCaveats: [{ id: 'decoy-early-termination-fev1', text: 'The early stop spoils the FEV1 as well as the FVC.' }],
    confidence: 'high', source: 'QS-04; S1; S25',
  }),
  scenario({
    id: 'qs-no-plateau', category: 'End of test',
    variants: [
      'No plateau on blows {blows}: expiration was stopped while flow was still present.',
      'Patient gave up after several seconds on blows {blows} though volume was still rising.',
      'Volume-time curve still climbing when the patient stopped on blows {blows}.',
    ],
    applies: (d) => OBSTRUCTIVE.includes(d.archetype),
    weight: 2,
    effects: { maneuver: { forced: [{ fault: 'no-plateau', p: 0.5, first: [0, 2] }] } },
    vars: BLOWS('no-plateau'),
    verifiedNumbers: ['0.025', '1', '15'],
    caveats: [
      { id: 'no-plateau-eofe', weight: 'major', text: 'The FVC needs one end-of-forced-expiration indicator: a volume change of less than 0.025 L in the last 1 s, an expiratory time of 15 s or more, or an FVC within the repeatability tolerance of the largest FVC in the set (ATS/ERS 2019). Without one the FVC is not acceptable, the ratio is overestimated and obstruction is understated. No minimum expiratory time is required.' },
    ],
    decoyCaveats: [{ id: 'decoy-min-fet-6s', text: 'Expiration shorter than a fixed minimum time makes the maneuver unacceptable.' }],
    confidence: 'high', source: 'QS-04, QS-05; S1',
  }),
  scenario({
    id: 'qs-cough-first-second', category: 'Cough',
    variants: [
      'Cough during the first second on blows {blows}.',
      'Coughed at the start of the blast on blows {blows}.',
      'Tickle in the throat; cough at the peak of expiration on blows {blows}.',
    ],
    weight: 1.2,
    effects: { maneuver: { forced: [{ fault: 'cough', p: 0.5, first: [0, 2] }] } },
    vars: BLOWS('cough'),
    caveats: [
      { id: 'cough-first-second', weight: 'major', text: 'A cough in the first second makes the FEV1 neither acceptable nor usable, while the FVC may remain acceptable. The error in the FEV1 has no fixed direction, and the loop shows spikes or a notch in the early descending limb.' },
    ],
    decoyCaveats: [{ id: 'decoy-cough-fvc', text: 'The cough in the first second makes the FVC unacceptable.' }],
    confidence: 'high', source: 'QS-07; S1; S25',
  }),
  scenario({
    id: 'qs-glottic-closure', category: 'Glottic closure',
    variants: [
      'Throat closed during expiration on blows {blows}; flow stopped abruptly.',
      'Glottic closure noted on blows {blows} (flow cut off before the lungs emptied).',
      'Patient stopped the airflow with the throat on blows {blows}.',
    ],
    weight: 1,
    effects: { maneuver: { forced: [{ fault: 'glottic-closure', p: 0.4, first: [0, 2] }] } },
    vars: BLOWS('glottic-closure'),
    caveats: [
      { id: 'glottic-closure-fvc', weight: 'major', text: 'Glottic closure ends expiration abruptly. After the first second it makes the FVC unacceptable and leaves the FEV1 valid; in the first second both are lost. The FVC is lowered and the ratio is raised.' },
    ],
    decoyCaveats: [{ id: 'decoy-glottis-always-fev1', text: 'Glottic closure always invalidates the FEV1.' }],
    confidence: 'high', source: 'QS-09; S1; S25',
  }),
  scenario({
    id: 'qs-leak', category: 'Leak', exclusive: 'interface',
    variants: [
      'Air leaking at the corners of the mouth on blows {blows}.',
      'Poor lip seal on blows {blows}; air escaped around the mouthpiece.',
      'Leak at the lips on blows {blows}; seal re-coached.',
    ],
    weight: 1,
    effects: { maneuver: { forced: [{ fault: 'leak', p: 0.45, first: [0, 2] }] } },
    vars: BLOWS('leak'),
    caveats: [
      { id: 'leak-unacceptable', weight: 'major', text: 'A leak makes the FEV1 and FVC unacceptable and lowers the measured FEV1, FVC and peak flow, with an irregular early fall-off of the loop. The ATS/ERS 2019 statement points to a flange mouthpiece or operator assistance.' },
    ],
    decoyCaveats: [{ id: 'decoy-leak-only-fvc', text: 'A leak affects only the FVC and leaves the FEV1 acceptable.' }],
    confidence: 'high', source: 'QS-10; S1',
  }),
  scenario({
    id: 'qs-tongue-teeth', category: 'Mouthpiece obstruction', exclusive: 'interface',
    variants: [
      'Tongue in front of the mouthpiece on blows {blows}.',
      'Teeth partly blocked the mouthpiece opening on blows {blows}.',
      'Flow suddenly cut on blows {blows}: the tongue moved into the mouthpiece.',
    ],
    weight: 0.9,
    effects: { maneuver: { forced: [{ fault: 'mouthpiece-obstruction', p: 0.4, first: [0, 2] }] } },
    vars: BLOWS('mouthpiece-obstruction'),
    caveats: [
      { id: 'mouthpiece-obstruction', weight: 'major', text: 'A tongue or teeth in front of the mouthpiece makes the FEV1 and FVC unacceptable (ATS/ERS 2019). Peak flow and FEV1 are lowered, and the loop is expected to show a sudden drop or an erratic step in flow.' },
    ],
    decoyCaveats: [{ id: 'decoy-mouthpiece-fvc-only', text: 'Mouthpiece obstruction affects only the peak flow and leaves the FEV1 and FVC acceptable.' }],
    confidence: 'high', source: 'QS-11; S1 (criterion); loop shape mem',
  }),
  scenario({
    id: 'qs-pause-at-tlc', category: 'Start of test',
    variants: [
      'Held the breath at full inspiration for about {pause} s before blasting on blows {blows}.',
      'Long pause at the top of the breath on blows {blows} (about {pause} s).',
      'Patient hesitated at full lungs for several seconds on blows {blows}.',
    ],
    weight: 0.9,
    effects: { maneuver: { forced: [{ fault: 'pause-at-TLC', p: 0.5, first: [0, 2] }] } },
    vars: (fx, c) => ({ blows: c.blows('pause-at-TLC'), pause: c.pauseSeconds.toFixed(0) }),
    verifiedNumbers: ['2', '4', '6'],
    caveats: [
      { id: 'pause-at-tlc', weight: 'major', text: 'A pause at total lung capacity lowers peak flow and FEV1; the ATS/ERS 2019 statement documents the effect for pauses of 4 to 6 s and asks that any pause be 2 s or less. This prompts coaching and review; a pause alone does not make the affected FEV1 unacceptable under Table 7. Other maneuver faults still determine acceptability.' },
    ],
    decoyCaveats: [{ id: 'decoy-pause-raises-fvc', text: 'The pause at full inspiration raises the FVC and makes the maneuver more reliable.' }],
    confidence: 'high', source: 'QS-14; S1',
  }),
  scenario({
    id: 'qs-variable-effort', category: 'Repeatability',
    variants: [
      'Variable effort: peak flows differed widely between blows ({pef}).',
      'Loops differ in shape from blow to blow; effort inconsistent.',
      'FEV1 differed across blows ({fev1}); patient coached but effort varied.',
    ],
    weight: 1.2,
    effects: { maneuver: { forced: [{ fault: 'variable-effort', p: 0.6, first: [0, 1] }], faultProb: { 'variable-effort': 0.7 } } },
    vars: (fx, c) => ({ pef: c.pefList, fev1: c.fev1List }),
    caveats: [
      { id: 'variable-effort-grade', weight: 'major', text: 'Poor repeatability between blows lowers the grade, which is set by the spread of the two largest acceptable values, and lowers confidence that a repeat would give the same number. Peak flow and FEF25-75 vary more than FEV1 and FVC, and variable early effort does not indicate a change in the airways.' },
    ],
    decoyCaveats: [{ id: 'decoy-variable-effort-airway', text: 'The variability between blows shows airway lability.' }],
    confidence: 'high', source: 'QS-03, QS-16; S1 Table 10',
  }),

  scenario({
    id: 'qs-bd-set-small', category: 'Bronchodilator study', exclusive: 'bd-quality',
    variants: [
      'Post-bronchodilator set limited to two blows; patient too tired for more.',
      'Only two post-bronchodilator maneuvers recorded.',
      'Post-BD testing stopped after two blows because of coughing.',
    ],
    applies: (d) => hasBdStudy(d),
    weight: byArchetype({ obstruction: 2, mixed: 1.5 }, 0.8),
    effects: { maneuver: { postMaxManeuvers: 2 }, report: { forcePostBd: true } },
    caveats: [
      { id: 'post-bd-set-small', weight: 'major', text: 'Grades apply separately to the pre- and post-bronchodilator sets. A post set of two maneuvers reaches grade B at best, so the change in FEV1 and FVC is less reliable than with three acceptable maneuvers.' },
    ],
    decoyCaveats: [{ id: 'decoy-post-bd-invalid', text: 'A post-bronchodilator set of two maneuvers cannot be used at all.' }],
    confidence: 'high', source: 'QS-17; S1',
  }),
  scenario({
    id: 'qs-bd-timing-short', category: 'Bronchodilator study', exclusive: 'bd-quality',
    variants: [
      'Post-bronchodilator maneuvers started {m} min after the dose; the facility protocol asks for a longer wait.',
      'Pressed for time: post-BD spirometry done {m} min after albuterol.',
      'Post-dose wait shortened to {m} min.',
    ],
    applies: (d) => hasBdStudy(d),
    weight: byArchetype({ obstruction: 2, mixed: 1.5 }, 0.8),
    effects: { preTest: { postBdWaitMinutes: [5, 9] }, physiology: { postResponseMult: [0.5, 0.8] }, report: { forcePostBd: true } },
    vars: (fx) => ({ m: String(Math.round(fx.preTest.postBdWaitMinutes)) }),
    caveats: [
      { id: 'bd-timing-short', weight: 'major', text: 'A post-bronchodilator maneuver taken before the wait that the facility protocol requires underestimates the response. The ATS/ERS 2019 statement requires the system to warn when the elapsed time is shorter than the protocol allows.' },
    ],
    decoyCaveats: [{ id: 'decoy-bd-timing-overestimate', text: 'The short wait overestimates the bronchodilator response.' }],
    confidence: 'high', source: 'QS-18; S1',
  }),
  scenario({
    id: 'qs-bd-better-effort', category: 'Bronchodilator study', exclusive: 'bd-quality',
    variants: [
      'Post-bronchodilator blows were clearly stronger than the baseline blows (better effort).',
      'Patient understood the blast better after the dose; post-BD loops larger and sharper.',
      'Baseline blows were hesitant; post-BD blows well coached.',
    ],
    applies: (d) => hasBdStudy(d),
    weight: 1,
    effects: { physiology: { preOnlyMult: { fvc: [0.93, 0.97], fev1: [0.93, 0.97] } }, report: { forcePostBd: true } },
    caveats: [
      { id: 'bd-effort-artifact', weight: 'major', text: 'Better effort after the bronchodilator raises the apparent response. Comparing peak flow and loop shape before and after separates a change in effort from bronchodilation, and a rise in FVC can reflect a longer expiratory time and not airway dilation.' },
    ],
    decoyCaveats: [{ id: 'decoy-bd-effort-true', text: 'Any rise after the bronchodilator reflects bronchodilation.' }],
    confidence: 'medium', source: 'QS-19; S1; S4',
  }),

  scenario({
    id: 'dlco-low-inspired-volume', category: 'DLCO technique', exclusive: 'dlco-technique', applies: fullPanel,
    variants: [
      'Inspired volume only {vi}% of VC on the DLCO maneuvers.',
      'Patient did not take a full breath for the single-breath test (VI about {vi}% of VC).',
      'Incomplete inhalation on the diffusing capacity test: inspired volume {vi}% of VC.',
    ],
    weight: 1.2,
    // The scenario draws VI/VC and forces the fault; src/core/dlco-trace.js alone turns it into VA and DLCO (docs/scenarios-model.md).
    effects: { dlco: { viFraction: [0.7, 0.86] }, traceFaults: { dlco: ['incomplete-inhalation'] } },
    vars: (fx) => ({ vi: String(Math.round(fx.dlco.viFraction * 100)) }),
    caveats: [
      { id: 'dlco-low-vi', weight: 'major', text: 'An incomplete inhalation lowers the VA and the DLCO and raises the KCO artifactually. The 2017 standard sets a minimum fraction of the largest VC for the inspired volume. A low VA with a raised KCO can be technique and not chest-wall or extraparenchymal disease, which is why the report shows the VA.' },
    ],
    decoyCaveats: [{ id: 'decoy-low-vi-kco-low', text: 'The low VA is accompanied by a lowered KCO, indicating diffuse parenchymal disease.' }],
    confidence: 'medium', source: 'DLC-01; S2 search summary; S21',
  }),
  scenario({
    id: 'dlco-valsalva', category: 'DLCO technique', exclusive: 'dlco-technique', applies: fullPanel,
    variants: [
      'Cheeks bulging and straining during the breath-hold (Valsalva) on the DLCO.',
      'Patient bore down during the hold on the single-breath test.',
      'Valsalva noted on the diffusing capacity maneuver.',
    ],
    weight: 0.8,
    // The tracing applies the fall in DLCO (valsalvaDlcoFall in dlco-trace.js, unverified); the scenario adds no multiplier of its own.
    effects: { traceFaults: { dlco: ['valsalva'] } },
    caveats: [
      { id: 'dlco-valsalva', weight: 'major', text: 'Straining during the breath-hold reduces pulmonary capillary blood flow and volume and lowers the measured DLCO. The 2017 standard requires no evidence of a Valsalva or Mueller maneuver, so the maneuver is not acceptable.' },
    ],
    decoyCaveats: [{ id: 'decoy-valsalva-raises', text: 'Straining during the hold raises the DLCO.' }],
    confidence: 'high', source: 'DLC-04; S2; S21; direction mem',
  }),
  scenario({
    id: 'dlco-mueller', category: 'DLCO technique', exclusive: 'dlco-technique', applies: fullPanel,
    variants: [
      'Inspiratory effort against a closed glottis during the hold (Mueller) on the DLCO.',
      'Patient tried to suck in against the closed throat during the breath-hold.',
      'Mueller maneuver noted on the diffusing capacity test.',
    ],
    weight: 0.6,
    // The tracing applies the rise in DLCO (muellerDlcoRise in dlco-trace.js, unverified); the scenario adds no multiplier of its own.
    effects: { traceFaults: { dlco: ['mueller'] } },
    caveats: [
      { id: 'dlco-mueller', weight: 'major', text: 'Inspiratory effort against a closed glottis raises capillary blood volume and spuriously raises the measured DLCO, which could mask interstitial disease or emphysema. The 2017 standard does not accept the maneuver.' },
    ],
    decoyCaveats: [{ id: 'decoy-mueller-lowers', text: 'The inspiratory effort during the hold lowers the DLCO.' }],
    confidence: 'high', source: 'DLC-05; S2; S21; direction mem',
  }),
  scenario({
    id: 'dlco-leak', category: 'DLCO technique', exclusive: 'dlco-technique', applies: fullPanel,
    variants: [
      'Leak around the mouthpiece during the breath-hold on the diffusing capacity test.',
      'Volume loss during the hold; seal at the lips poor on the single-breath maneuver.',
      'Air escaped at the lips during the DLCO breath-hold.',
    ],
    weight: 0.7,
    effects: { dlco: { mult: [0.85, 0.95], vaMult: [0.88, 0.96] }, traceFaults: { dlco: ['leak'] } },
    caveats: [
      { id: 'dlco-leak', weight: 'major', text: 'A leak during the breath-hold makes the VA and DLCO unreliable with no fixed direction of error, and the 2017 standard requires the test to be free of leaks. The VA is the more visible clue.' },
    ],
    decoyCaveats: [{ id: 'decoy-dlco-leak-kco', text: 'The leak raises the KCO and is therefore harmless to the interpretation.' }],
    confidence: 'low', source: 'DLC-06; S2; S21; direction mem',
  }),

  scenario({
    id: 'pleth-pant-fast', category: 'Plethysmography', applies: (d) => d.panel === 'full' && OBSTRUCTIVE.includes(d.archetype),
    variants: [
      'Panting rate high (about {hz} Hz) in severe airflow limitation; coaching to slow down did not help.',
      'Technologist note: pant frequency above target on the shutter maneuver.',
      'Fast panting on the FRC maneuvers, {hz} Hz by the box software.',
    ],
    weight: 2,
    effects: { preTest: { pantHz: [1.6, 2.4] }, volumes: { frcMult: [1.06, 1.16] }, traceFaults: { pleth: ['pant-too-fast'] } },
    vars: (fx) => ({ hz: fx.preTest.pantHz.toFixed(1) }),
    caveats: [
      { id: 'pant-fast-frc-over', weight: 'major', text: 'Panting faster than the recommended rate lets mouth pressure underestimate alveolar pressure, so FRC, RV and TLC are overestimated, more so with airflow obstruction. Overestimated gas volumes can look like air trapping.' },
    ],
    decoyCaveats: [{ id: 'decoy-pant-fast-underestimate', text: 'Fast panting underestimates the FRC.' }],
    confidence: 'medium', source: 'PLE-02; S3 slides; S21',
  }),
  scenario({
    id: 'pleth-thermal-drift', category: 'Plethysmography', applies: fullPanel,
    variants: [
      'Thermal drift on the shutter loops; stacked parallel lines on the screen.',
      'Cabin temperature still settling after the door closed; loops slope across the screen.',
      'Drift noted on the pant loops of the FRC maneuvers.',
    ],
    weight: 1,
    effects: { volumes: { frcMult: [0.94, 1.06] }, traceFaults: { pleth: ['thermal-drift'] } },
    caveats: [
      { id: 'pleth-thermal-drift', weight: 'minor', text: 'Thermal drift from body heat in the cabin shifts successive panting loops off one another. Large drift makes the FRC unstable, and the direction of the error is not fixed, so RV and TLC carry extra uncertainty.' },
    ],
    decoyCaveats: [{ id: 'decoy-drift-raises-frc', text: 'Thermal drift always raises the FRC.' }],
    confidence: 'medium', source: 'PLE-01; S3 search summaries',
  }),
  scenario({
    id: 'pleth-incomplete-ic', category: 'Plethysmography', applies: fullPanel,
    variants: [
      'Linked slow vital capacity did not reach full inspiration; small IC.',
      'Patient did not take a full breath after the FRC maneuver (inspiratory capacity short).',
      'IC maneuver limited by poor effort; TLC derived from FRC plus a short IC.',
    ],
    weight: 1,
    // The plethysmographic IC error lowers IC, VC and TLC; RV (FRC minus ERV) is unchanged, so RV/TLC rises. The single-breath VA comes from a separate maneuver and does not follow the artifactual TLC.
    effects: { volumes: { icMult: [0.82, 0.92] } },
    caveats: [
      { id: 'pleth-ic-short-tlc-low', weight: 'major', text: 'TLC is the sum of FRC and inspiratory capacity, so a linked maneuver that does not reach total lung capacity lowers IC, VC and TLC. RV is unchanged, so RV/TLC rises artifactually. The single-breath VA comes from a separate maneuver and does not share the error, so an unusually high VA relative to the plethysmographic TLC points to the TLC as the low measurement. A TLC below the lower limit may be a technique artifact.' },
    ],
    decoyCaveats: [{ id: 'decoy-ic-short-frc', text: 'The short inspiratory capacity lowers the FRC.' }],
    confidence: 'medium', source: 'PLE-06; S3; effect mem',
  }),
];
