# Encounter scenarios: model, effect sizes and limits

Educational use only; uncalibrated. This document records how `src/scenarios/` changes a simulated encounter, every effect size and conversion constant that was chosen, the source of each or the word unverified, and every simplification. The research input is `docs/research/scenarios.md`; its section "Unverified or conflicting" is binding on what the simulator may state as fact.

## What a scenario is

A laboratory report is only as good as the encounter that produced it. A scenario changes either the measurement process (a leak at the lips, a pause at total lung capacity, a bronchodilator taken before arrival, carboxyhemoglobin after smoking) or an input the laboratory enters (height estimated from arm span, a reference sex that differs from sex assigned at birth, a missing requisition group). It never edits the lungs. `case.truth` is identical with and without scenarios; the key (`case.anchorKey`) is computed by `interpret()` from the report the laboratory would have produced, so a learner who reads the report critically can reach the key, and one who ignores the encounter cannot.

Each catalog entry (`src/scenarios/library.js`, parts in `catalog-*.js`) has an id, a category, three or more phrasings, an applicability predicate on the descriptor, declarative effects, caveats with weights, decoy caveats, a confidence grade and a source row. There are 63 entries. Phrasings differ in wording, voice and the detail they mention, so no single sentence identifies a scenario; the technologist comment uses a different phrasing of the same fact than the intake statement.

## Descriptor and link

The descriptor gains two optional fields, `scenarioLevel` (`none`, `light`, `moderate`, `heavy`) and `scenarioIds` (sorted list of explicit ids). The link keys are `sc` and `si` (comma-separated). They are written only when set. A link without them reproduces exactly the case it always did, so the generator version stays 1; `tests/scenario-regression.test.mjs` compares SHA-256 hashes of 50 cases generated from the commit before this layer (2ac98e3, fixture `tests/fixtures/baseline-case-hashes.json`, tool `tools/baseline-hashes.mjs`) with cases built now. The hash excludes the additive top-level `scenario` field. Explicit ids with no level imply `light`; explicit ids with level `none` are rejected. Explicit ids are always applied and the level is the target for the total count, so ids can exceed it.

## Selection

`selectScenarios({ seed, level, archetype, panel, forcedIds, descriptor? })` draws from `createStream(seed, 'scenarios')` and from no other stream. Level `light` selects 1 scenario, `moderate` 2, `heavy` 3 or 4 (one uniform decides which). Candidates are the entries whose `applies(descriptor)` is true and that are compatible with everything already chosen; the draw is weighted by `weight` (a number or a function of the descriptor, for example larger for obstruction when a bronchodilator is involved). Two scenarios are incompatible when they share an `exclusive` group (one reference-sex scenario, one height method, one bronchodilator-preparation scenario, one effort scenario, one smoking scenario, one interface problem, one DLCO technique fault, one hemoglobin scenario, one bronchodilator-quality scenario) or name each other in `incompatible`. After the selection, each pick receives its phrasing index and 16 uniforms; every `[lo, hi]` range in its effects is resolved from those uniforms in key order, so the resolved effects are a pure function of the seed. Predicates never read the true physiology, so the same seed, level and demographic overrides give the same picks whatever the physiology generator does.

## Hooks in `buildCase`

| Hook | Where | What changes |
|---|---|---|
| demographics | `plan.demographics()` | stated height (`report.patient.heightCm`), reference sex (`report.patient.sex`), requisition group, hemoglobin availability |
| physiology | `applyAcuteEffects(truth, fx)` in `src/core/physiology.js` | a copy of FVC, FEV1 and the post-bronchodilator values after acute effects; the truth object is untouched |
| maneuver | `generateManeuvers(..., { scenario })` | forced and extra faults, set-wide effort, decline across blows, set size |
| volumes, DLCO | `plan.volumeComponents`, `plan.dlcoParts` | multipliers on FRC, ERV, IC, VA and DLCO, carboxyhemoglobin, incomplete inhalation; TLC, RV and VC are still derived, so every identity stays exact |
| report | `case.js` | the laboratory's hemoglobin factor, `report.caveatIds` |
| description | `plan.describe()` | `case.scenario` |

Fault draws for the maneuvers come from `scn-<prefix>-<i>` streams in `maneuver.js`, drawn after the technique faults of the same maneuver, so removing a scenario restores the plain maneuvers. A test asserts that a scenario with no content leaves the maneuvers byte-identical.

## `case.scenario`

`{ level, ids, statements: [{ id, category, text }], technologistComments, caveats: [{ id, text, weight }], decoyCaveats: [{ id, text }], preTest, height: { statedCm, trueCm, source, note }, referenceSex: { used, birth, note }, coHbPercent }` as in `docs/ARCHITECTURE-NEXT.md`, with these additive fields:

- `height.zAtTrueHeight`: z-scores of FEV1, FVC, FEV1/FVC and TLC under the height the laboratory entered and under the true height, present when height is estimated.
- `referenceSex.alternative`: the other sex, its pattern, the z-scores under both sexes and the labels that change, present when a sex scenario applies.
- `coHbMeasured`: true when the laboratory measured carboxyhemoglobin. `coHbPercent` is the value used by the simulation, or `null` when there is no DLCO.
- `group: { used, selfReported }`, `hbAvailable`, `noncontributoryIds`, `acute` (resolved acute-effect multipliers), `traceFaults` (`{ dlco?: string[], pleth?: string[] }` for the trace builders), `forcedFaults` (fault and blow numbers), `effectSizes: 'unverified'`.
- `preTest` additions: `lastLamaHours`, `lastAlcoholHours`, `lastCaffeineHours`, `lastMealMinutes`, `oxygenOffMinutes`, `postBdWaitMinutes`, `elevationM`, `pantHz`.

A case with no scenarios carries the same shape with empty values.

## Interpretation interplay

`interpret()` gained one additive line: `report.caveatIds`, when present, is copied sorted into `key.caveatIds`. `buildCase` sets it from the caveats that apply to the data present (a carboxyhemoglobin caveat needs a DLCO). Cases without scenarios have neither the report field nor the key field. All other key fields are computed from the report values as before. The key is therefore deterministic and tied to what the laboratory entered; property tests rebuild each case's key from its report.

## Maneuver faults added

`leak`, `mouthpiece-obstruction`, `pause-at-TLC`, `submaximal-effort` are new; `slow-start`, `early-termination`, `no-plateau`, `cough`, `glottic-closure` and `variable-effort` can also be forced. Magnitudes are simulator choices (unverified); directions follow `scenarios.md` QS-01 to QS-14.

| Fault | Effect on the blow | Quality rule in `quality.js` | Rule source |
|---|---|---|---|
| leak | FVC × 0.80 to 0.94, FEV1 × 0.88 to 0.97, half the time stopped at 3.5 to 8 s | FEV1 and FVC not acceptable, still usable | S1 criterion (no leak); usable/acceptable split is a simplification |
| mouthpiece-obstruction | FEV1 × 0.78 to 0.92, FVC × 0.90 to 0.98, slower start | same | S1 criterion; loop shape from memory |
| pause-at-TLC | pause 3.5 to 6.5 s, FEV1 × 0.88 to 0.95, FVC × 0.97 to 1, slower start | FEV1 not acceptable when the pause exceeds 2 s | S1 text (keep the pause to 2 s or less); not a Table 7 row, so this is a simulator rule |
| submaximal-effort | set-wide: FVC × 0.82 to 0.92, FEV1 × 0.80 to 0.90 (scenario dependent), start time r raised | none: effort cannot be seen from one maneuver | S1, S25 |
| slow-start | rounder, delayed rise solved so the back-extrapolated volume exceeds 1.3 times the 2019 limit | existing BEV rule | S1 Table 7 |
| no-plateau | stopped at 5 to 9 s while flow persists | existing end-of-forced-expiration rule | S1 |
| decline | FEV1 × (1 − p·i) for blow i, p 0.05 to 0.08, FVC at half that rate; testing stops below 80% of the first FEV1 and does not stop on grade A | none | S1 (80% rule) |

The existing curve family cannot produce a back-extrapolated volume above the 2019 limit with its own slow-start range (r of 0.14 to 0.3 s gives at most about 2.5% of FVC), which is why the technique-driven slow start is cosmetic; the scenario slow start raises the shape exponent until the limit is exceeded. Peak flow then occurs late (up to 2 s in deep obstruction, the edge of the peak-flow search window), so the loop of such a blow is rounder than a clinical slow start. This is a limitation of the curve family and not a physiological claim.

## Reference inputs the laboratory enters

All constants are in `src/scenarios/constants.js` with a verification field.

- **Arm span.** The patient's measured span is height × (mean ratio + SD × z), with mean ratio 1.03 (male) or 1.01 (female) and SD 0.02 (unverified simulation assumptions; the research document gives only ranges). The laboratory divides by 1.03 or 1.01 (the sex it entered) in 70% of cases and by 1.06 in 30% (the divisors relayed by a search summary of the ERS SpirXpert page, and a Polish review; unverified). The conversion is therefore unbiased in one branch and biased low by about 3% (male) or 5% (female) in the other, which shifts predicted values and z-scores realistically. Half-span (one forearm amputee) uses SD 0.03 (unverified).
- **Kyphoscoliosis.** Same estimation; the measured standing height is true height × (1 − 4 to 10%) (unverified) and is shown only as history. The archetype is restricted to extraparenchymal restriction.
- **Ulna.** Ulna length = height × 0.158 × (1 + 0.025 z); the laboratory divides by 0.158. No verified adult ulna table was obtained (the 0.59 × ulnar length (mm) + 13.1 equation in the research document is a child equation and is not used). Both constants are unverified.
- **Chart height.** Stated height = true height + 2 to 5 cm (unverified), applicable at age 60 or older; the direction (an old height is too tall) is mechanism from memory.
- **Sex.** Three situations: reference sex equals birth sex with the patient identifying differently or as nonbinary (draw above 0.85 gives "nonbinary"); reference sex is the sex the patient identifies with (binary only); sex not recorded and the laboratory default drawn at 50% male. Hemoglobin adjustment uses the laboratory's reference sex while the measured DLCO follows the patient's own sex and hemoglobin; the 10.22 versus 9.38 constants differ, so the adjusted DLCO shifts by about 3.5% when the sexes differ. This is a simplification; the research document found no source on which hemoglobin reference to use. The alternative sex is evaluated by changing only `patient.sex` in the report (the adjusted DLCO is not recomputed).
- **Requisition group.** A missing or "other" field is entered as "Other or mixed", which changes GLI-2012 predicted values only. GLI Global ignores the group, and the volume and DLCO equations are reported as European-ancestry equations for any group other than White, as before.

Wording follows the research document: birth sex is the ATS/ERS 2019 default, the standard gives no rule for hormone therapy, nonbinary or intersex patients, the evidence is small retrospective series, and prospective studies are in progress. No result sizes from the retrospective series are quoted. A test rejects a list of slurs and stereotyped phrases.

## Acute effects and DLCO

Directions come from the research catalog; every multiplier below is unverified and is also listed per scenario in the table.

- Bronchodilator taken before the visit: baseline FVC and FEV1 move a fraction of the way to the post-bronchodilator values, which do not change (SABA 0.35 to 0.80, LABA and LAMA 0.50 to 0.90, usual inhalers 0.15 to 0.45). The study is forced. Excluded for the discordant-bronchodilator archetype, whose teaching point would be altered.
- Short wait before the post-bronchodilator set: the response is multiplied by 0.50 to 0.80. Better effort after the dose: the baseline set is multiplied by 0.93 to 0.97. Post set of two blows: `postMaxManeuvers = 2`.
- Smoking within the hour: FEV1 × 0.93 to 0.98, FVC × 0.96 to 1.00, cough probability 0.3, carboxyhemoglobin 4.0 to 9.0%. Smoking some hours earlier: carboxyhemoglobin 2.5 to 5.0%. Measured carboxyhemoglobin (smoker): 5.0 to 12.0%, reported with the value, DLCO not adjusted.
- Carboxyhemoglobin and DLCO: factor = 1 − 0.01 × (COHb − 1.5), floor 0.5. The research document quotes "about 1% per 1%" as not found in the sources and the endogenous 1 to 2% as a search summary; both constants are unverified teaching values (`COHB` in `physiology.js`).
- Oxygen shortly before DLCO: × 0.93 to 0.98. Altitude without correction: DLCO × 1.02 to 1.08 (direction from low-confidence summaries). Incomplete inhalation (inspired volume 0.70 to 0.86 of VC): VA falls by (0.95 − fraction) × VC, with half the proportional loss in DLCO. Valsalva × 0.84 to 0.95, Mueller × 1.05 to 1.16, DLCO leak × 0.85 to 0.95 with VA × 0.88 to 0.96.
- Plethysmography: fast panting FRC × 1.06 to 1.16 (obstructive archetypes), thermal drift FRC × 0.94 to 1.06 (direction not fixed), short IC × 0.82 to 0.92. The integrator replaces the independent FRC noise with the plethysmography replicate mean; `scenario.traceFaults.pleth` names the faults for the trace builder.
- Others: abdominal surgery FVC × 0.80 to 0.92, FEV1 × 0.82 to 0.93, IC × 0.80 to 0.90; chest binder FVC × 0.93 to 0.98, IC × 0.90 to 0.96; heavy meal FVC × 0.96 to 0.99; caffeine FEV1 × 1.01 to 1.04; infection FEV1 × 0.92 to 0.98; obesity ERV × 0.80 to 0.92, FRC × 0.90 to 0.97 (not applied to the obesity archetype, which already has low ERV); tracheostomy and facial weakness add leaks.

## Caveats, decoys and numbers

Every scenario has real caveats (weight `major` or `minor`) and at least one decoy: a plausible statement that the case does not support, with an id beginning `decoy-`. Decoy ids never coincide with real caveat ids, and a shared real caveat id always carries one text. Non-contributory scenarios (inhaled corticosteroid or leukotriene modifier today, nasal spray or antihistamine, exercise the day before, well-fitting dentures) change no value and their caveat reads "does not change the interpretation". Caveats that need a test the case lacks (the carboxyhemoglobin caveat needs a DLCO) are dropped for spirometry-only panels.

Static text carries only numbers listed in the scenario's `verifiedNumbers`: values stated in the full text of the ATS/ERS 2019 spirometry statement as read for the research document (smoking and exercise 1 h, intoxicants 8 h, withholding times 4 to 6 h for SABA, 24 h LABA, 36 h ultra-LABA, 36 to 48 h LAMA, relative contraindication windows 1 wk and 4 wk, back-extrapolated volume 5% or 0.100 L, plateau 0.025 L, 15 s, 80% stopping rule, pause 2 s with 4 to 6 s documented, height remeasurement at age 25 y and 1 y). A test fails any other number in a caveat or decoy and any percent sign in a statement. Numbers in statements are case values (hours, heights, carboxyhemoglobin, body mass index) filled from the resolved effects.

## Catalog and effects

Rows list the resolved range of every effect. "Confidence" is the research catalog's grade for the direction of the effect, not for the size.

| id | category | confidence | effects (ranges drawn per case) | source row |
|---|---|---|---|---|
| med-saba-recent | Medication | medium | {preTest: {lastSabaHours: [1, 3.5]}, physiology: {baselineShiftToPost: [0.35, 0.8]}, report: {forcePostBd: true}} | PRE-01; S1 Table 8; direction mem |
| med-laba-recent | Medication | medium | {preTest: {lastLabaHours: [8, 20]}, physiology: {baselineShiftToPost: [0.5, 0.9]}, report: {forcePostBd: true}} | PRE-02; S1 Table 8 |
| med-lama-recent | Medication | medium | {preTest: {lastLamaHours: [14, 34]}, physiology: {baselineShiftToPost: [0.5, 0.9]}, report: {forcePostBd: true}} | PRE-02; S1 Table 8 footnote |
| med-usual-inhalers | Medication | high | {preTest: {lastLabaHours: [4, 14]}, physiology: {baselineShiftToPost: [0.15, 0.45]}, report: {forcePostBd: true}} | PRE-03; S1 (do not withhold when the question is response on therapy) |
| med-ics-today | Medication | high | none (caveat only) | PRE-04; S1 |
| med-allergy-spray | Medication | low | none (caveat only) | mem; S1 preparation list (absence) |
| sub-smoked-within-hour | Smoking | medium | {preTest: {lastSmokingHours: [0.25, 0.75]}, physiology: {fev1Mult: [0.93, 0.98], fvcMult: [0.96, 1]}, maneuver: {faultProb: {cough: 0.3}}, dlco: {coHbPercent: [4, 9]}} | PRE-05; S1 (1 h); DLCO part S2 search summary |
| sub-smoked-hours-ago | Smoking | medium | {preTest: {lastSmokingHours: [2.5, 6]}, dlco: {coHbPercent: [2.5, 5]}} | PRE-06; S2 search summary; S21 |
| sub-cohb-measured | Smoking | medium | {preTest: {lastSmokingHours: [1.5, 5]}, dlco: {coHbPercent: [5, 12], coHbMeasured: true}} | SPEC-22; S2 search summary; S22 |
| sub-alcohol | Alcohol | medium | {preTest: {lastAlcoholHours: [3, 6]}, maneuver: {faultProb: {variable-effort: 0.55, slow-start: 0.25}}} | PRE-07; S1 |
| sub-caffeine | Caffeine | medium | {preTest: {lastCaffeineHours: [1, 3]}, physiology: {fev1Mult: [1.01, 1.04]}} | PRE-10; S18 Cochrane summary |
| prep-exercise-recent | Exercise | low | {preTest: {lastExerciseHours: [0.25, 0.75]}, physiology: {fev1Mult: [0.97, 1]}} | PRE-08; S1 (1 h); effect mem |
| prep-exercise-yesterday | Exercise | high | none (caveat only) | PRE-08; S1 |
| prep-heavy-meal | Meal | low | {preTest: {lastMealMinutes: [20, 60]}, physiology: {fvcMult: [0.96, 0.99], fev1Mult: [0.98, 1]}, volumes: {icMult: [0.95, 0.99]}} | PRE-09; S17; effect mem |
| prep-binder | Clothing | low | {physiology: {fvcMult: [0.93, 0.98], fev1Mult: [0.94, 0.98]}, volumes: {icMult: [0.9, 0.96], vaFollowsTlc: true}} | PRE-11; S1; S27; S28 |
| prep-oxygen-dlco | Oxygen | medium | {preTest: {oxygenOffMinutes: [2, 6]}, dlco: {mult: [0.93, 0.98]}} | PRE-12; S2 search summary; S22 |
| clin-mi-recent | Contraindication | high | {maneuver: {effort: {fvc: [0.88, 0.95], fev1: [0.86, 0.94], r: [0.06, 0.1]}}} | PRE-13; S1 Table 2 |
| clin-abdominal-surgery | Contraindication | high | {physiology: {fvcMult: [0.8, 0.92], fev1Mult: [0.82, 0.93]}, volumes: {icMult: [0.8, 0.9], vaFollowsTlc: true}, maneuver: {faultProb: {early-termination: 0.3}}} | PRE-14; S1 Table 2; pattern mem |
| clin-uri | Respiratory infection | medium | {physiology: {fev1Mult: [0.92, 0.98], fvcMult: [0.95, 0.99]}, maneuver: {faultProb: {cough: 0.3}}, dlco: {mult: [0.95, 1]}} | PRE-17; S1; effect mem |
| clin-fev1-falls-each-blow | Maneuver-induced bronchospasm | high | {maneuver: {decline: {perBlow: [0.05, 0.08]}}} | PRE-19; S1 |
| clin-syncope-cough | Safety | high | {maneuver: {effort: {fvc: [0.9, 0.96], fev1: [0.95, 0.99], r: [0.05, 0.08]}, maxManeuvers: 3}} | PRE-20; S1 |
| height-kyphoscoliosis | Height estimate | medium | {height: {method: kyphoscoliosis}} | SPEC-01; S12, S13, S16 (conversion factors from search summaries) |
| height-no-legs | Height estimate | medium | {height: {method: arm-span}} | SPEC-01, SPEC-04; S13 (conversion factors from search summaries) |
| height-unable-stand-ulna | Height estimate | medium | {height: {method: ulna}} | SPEC-02; S1 (ulna preferred in children); S14 |
| height-one-forearm-halfspan | Height estimate | low | {height: {method: half-span}} | SPEC-03; S15 (single study, search summary) |
| height-old-chart | Height estimate | medium | {height: {method: chart}} | SPEC-05; S1; mechanism mem |
| sex-birth-default | Sex and gender | medium | {referenceSex: {use: birth, identityDraw: [0, 1]}} | SPEC-12; S1; S7 (abstract); S8-S11 not read |
| sex-identity-entered | Sex and gender | medium | {referenceSex: {use: identity}} | SPEC-13; S1; S7 (abstract) |
| sex-not-recorded | Sex and gender | high | {referenceSex: {use: default, defaultDraw: [0, 1]}} | SPEC-14; S1 |
| race-field-missing | Race and ethnicity | medium | {group: Other or mixed} | SPEC-14, SPEC-16; S1; S5; S29 |
| ref-european-only | Equation coverage | high | none (caveat only) | SPEC-17; S5; S29 |
| iface-tracheostomy | Interface | medium | {maneuver: {forced: [{fault: leak, p: 0.45, first: [0, 1]}]}, physiology: {fvcMult: [0.9, 0.97]}} | SPEC-07; S1; effect mem |
| iface-dentures-loose | Interface | medium | {maneuver: {forced: [{fault: mouthpiece-obstruction, p: 0.3, first: [0, 2]}, {fault: leak, p: 0.3, first: [0, 2]}]}} | SPEC-08; S1 |
| iface-dentures-ok | Interface | medium | none (caveat only) | SPEC-08; S1 |
| iface-facial-weakness | Interface | medium | {maneuver: {forced: [{fault: leak, p: 0.6, first: [0, 1]}], faultProb: {slow-start: 0.4}}, physiology: {fvcMult: [0.9, 0.97]}} | SPEC-09; S1; S24 |
| coop-language-cognitive | Cooperation | high | {maneuver: {effort: {fvc: [0.85, 0.93], fev1: [0.83, 0.92], r: [0.07, 0.12]}, faultProb: {variable-effort: 0.5, early-termination: 0.3}}} | SPEC-11; S1 |
| coop-anxiety | Cooperation | low | {maneuver: {effort: {fvc: [0.94, 0.98], fev1: [0.94, 0.98], r: [0.05, 0.09]}, faultProb: {variable-effort: 0.5, slow-start: 0.35, early-termination: 0.25}}} | SPEC-11; S1; thin evidence beyond S1 |
| coop-pain-chest-wall | Pain | low | {maneuver: {effort: {fvc: [0.86, 0.94], fev1: [0.88, 0.95], r: [0.06, 0.1]}, faultProb: {early-termination: 0.35}}} | PRE-14 pain mechanism; S1; mem |
| env-altitude | Altitude | low | {preTest: {elevationM: [1400, 2000]}, dlco: {mult: [1.02, 1.08]}} | SPEC-18; S23 (search summaries) |
| body-obesity | Obesity | medium | {volumes: {ervMult: [0.8, 0.92], frcMult: [0.9, 0.97]}, physiology: {fvcMult: [0.97, 1]}} | SPEC-19; S19 |
| body-obesity-note | Obesity | medium | none (caveat only) | SPEC-19; S19 |
| body-anemia-note | Anemia | medium | none (caveat only) | SPEC-20; S22 |
| dlco-hb-missing | Anemia | medium | {dlco: {hbAvailable: false}} | DLC-10; S2; S22 |
| qs-submaximal-effort | Effort | medium | {maneuver: {effort: {fvc: [0.82, 0.92], fev1: [0.8, 0.9], r: [0.08, 0.14]}}} | QS-02; S1; S25 |
| qs-slow-start | Start of test | high | {maneuver: {forced: [{fault: slow-start, p: 0.5, first: [0, 2]}]}} | QS-01; S1 |
| qs-early-termination | End of test | high | {maneuver: {forced: [{fault: early-termination, p: 0.45, first: [0, 2]}]}} | QS-04; S1; S25 |
| qs-no-plateau | End of test | high | {maneuver: {forced: [{fault: no-plateau, p: 0.5, first: [0, 2]}]}} | QS-04, QS-05; S1 |
| qs-cough-first-second | Cough | high | {maneuver: {forced: [{fault: cough, p: 0.5, first: [0, 2]}]}} | QS-07; S1; S25 |
| qs-glottic-closure | Glottic closure | high | {maneuver: {forced: [{fault: glottic-closure, p: 0.4, first: [0, 2]}]}} | QS-09; S1; S25 |
| qs-leak | Leak | high | {maneuver: {forced: [{fault: leak, p: 0.45, first: [0, 2]}]}} | QS-10; S1 |
| qs-tongue-teeth | Mouthpiece obstruction | high | {maneuver: {forced: [{fault: mouthpiece-obstruction, p: 0.4, first: [0, 2]}]}} | QS-11; S1 (criterion); loop shape mem |
| qs-pause-at-tlc | Start of test | high | {maneuver: {forced: [{fault: pause-at-TLC, p: 0.5, first: [0, 2]}]}} | QS-14; S1 |
| qs-variable-effort | Repeatability | high | {maneuver: {forced: [{fault: variable-effort, p: 0.6, first: [0, 1]}], faultProb: {variable-effort: 0.7}}} | QS-03, QS-16; S1 Table 10 |
| qs-bd-set-small | Bronchodilator study | high | {maneuver: {postMaxManeuvers: 2}, report: {forcePostBd: true}} | QS-17; S1 |
| qs-bd-timing-short | Bronchodilator study | high | {preTest: {postBdWaitMinutes: [5, 9]}, physiology: {postResponseMult: [0.5, 0.8]}, report: {forcePostBd: true}} | QS-18; S1 |
| qs-bd-better-effort | Bronchodilator study | medium | {physiology: {preOnlyMult: {fvc: [0.93, 0.97], fev1: [0.93, 0.97]}}, report: {forcePostBd: true}} | QS-19; S1; S4 |
| dlco-low-inspired-volume | DLCO technique | medium | {dlco: {viFraction: [0.7, 0.86]}, traceFaults: {dlco: [incomplete-inhalation]}} | DLC-01; S2 search summary; S21 |
| dlco-valsalva | DLCO technique | high | {dlco: {mult: [0.84, 0.95]}, traceFaults: {dlco: [valsalva]}} | DLC-04; S2; S21; direction mem |
| dlco-mueller | DLCO technique | high | {dlco: {mult: [1.05, 1.16]}, traceFaults: {dlco: [mueller]}} | DLC-05; S2; S21; direction mem |
| dlco-leak | DLCO technique | low | {dlco: {mult: [0.85, 0.95], vaMult: [0.88, 0.96]}, traceFaults: {dlco: [leak]}} | DLC-06; S2; S21; direction mem |
| pleth-pant-fast | Plethysmography | medium | {preTest: {pantHz: [1.6, 2.4]}, volumes: {frcMult: [1.06, 1.16]}, traceFaults: {pleth: [pant-too-fast]}} | PLE-02; S3 slides; S21 |
| pleth-thermal-drift | Plethysmography | medium | {volumes: {frcMult: [0.94, 1.06]}, traceFaults: {pleth: [thermal-drift]}} | PLE-01; S3 search summaries |
| pleth-incomplete-ic | Plethysmography | medium | {volumes: {icMult: [0.82, 0.92], vaFollowsTlc: true}} | PLE-06; S3; effect mem |

## Simplifications and known limitations

- Effect sizes are unverified simulator choices; only directions come from the research catalog. The simulator makes no claim that an effect size reproduces a population.
- The curve family caps the back-extrapolated volume; the scenario slow start works around it with a rounder, later rise (see above).
- A leak or an obstructed mouthpiece leaves the value usable, and a pause longer than 2 s spoils only the FEV1; both are simulator rules about acceptability beyond the verified Table 7 rows.
- FIVC is not modeled, so the start-below-TLC fault (QS-13) is not included; the rise-time criterion is not scored.
- Set-wide submaximal effort stays repeatable and graded A or B, by design; the learner has to use PEF and the loop shape.
- Pregnancy, pneumothorax, hemoptysis, supine testing and helium dilution rows of the research catalog are not implemented.
- Predicates see only the descriptor. A scenario can therefore coexist with a physiology it fits poorly (for example a recent bronchodilator in a normal case, where the response is already small); the effect sizes are scaled to the available response, so the consequence is small.
- A scenario on a pulmonary-function archetype is not checked for clinical plausibility beyond the predicates; the key is whatever the entered values give.
- The hemoglobin adjustment constants (Cotes form) remain unverified against the 2017 standard (SPEC.md).
- The consultation with a second model that CLAUDE.md requires for substantive physiology and learner-interaction changes could not be run in this environment (no model-call tool was available to the thread). The plan was written from the brief and the research document; the integrator or physician should review the effect-size table above, the acceptability simplifications and the sex-model decisions before release.
