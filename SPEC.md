# PFT_Sim specification

Revision 2. This revision replaces the scope memo with an implementable specification. Every clinical threshold, criterion and coefficient in it carries a source column and a verification state. Nothing marked "unverified" may be coded until someone has read the primary source and recorded the check next to the value.

## Status

Implemented: the project scaffold (build, serve, workflows, local fonts), the seeded PRNG with named streams, the case descriptor and URL codec, the volume-time curve family, the maneuver-set generator, and the acceptability, repeatability and grading module, each with tests (`npm test`). Not implemented: latent physiology and archetype sampling, reference equations, the interpretation engine, the report and figures, and the learner flow. The research scaffold in `research/` is not imported by anything in the product.

The curve and maneuver modules take true FVC and FEV1 in liters as inputs. They do not depend on any reference equation, which is why they could be built before the GLI terms were settled.

## Purpose

PFT_Sim generates simulated pulmonary function reports with a known ground truth, lets a learner write an interpretation, and then breaks the case down. Its distinguishing feature is that the same measured values are interpreted under more than one reference equation, and every change in classification is shown, attributed to the measurement that caused it. It is an educational and research tool. It is explicitly uncalibrated, makes no validation claim that has not been run and recorded, and gives no treatment recommendation.

## Stack and repository conventions

The stack matches ARDS_sim so that the two projects build, test, deploy and look alike. This supersedes the TypeScript, Vite and vitest wording in earlier drafts of `CLAUDE.md`. Source is plain ES modules under `src/` with JSDoc typedefs for the data contracts. Tests run with `node --test tests/*.test.mjs`. Node 22 or newer. There are no production dependencies, and the only development dependency is a pinned Playwright for browser harnesses under `benchmarks/`. `scripts/build.mjs` copies `index.html`, styles, local fonts, `src/` and a `.nojekyll` file into `dist/`, and `scripts/serve.mjs` serves it on port 5173 (files are never opened over `file://`, because module workers require HTTP). The two workflows are copies of ARDS_sim's `check.yml` and `pages.yml`, including the pinned runner image and the Node 22 setup. Fonts are local Source Sans 3 and Source Code Pro, copied from ARDS_sim with their OFL notices. Colors come only from `src/styles/tokens.css`; the diastolic grade ramp (`--g0` to `--g4`) belongs to the heart project and is removed.

## Case model

A case is a pure function of a descriptor. The descriptor is `{ v, seed, archetype, severity, technique, age, sex, heightCm, weightKg, hbGdl, group }`, where `v` is the generator version, `seed` is an unsigned 32-bit integer, `severity` is an archetype-specific ordinal, `technique` is the quality modifier described below, and `group` is the self-reported group as it would appear on a requisition. The URL encodes the version, seed and archetype, plus any demographic or severity field the user has overridden. Fields that are not overridden are derived from the seed, so a shared link reproduces the case exactly, and a link with a retired generator version loads under that version's code or states that it cannot. The generator version increments whenever any sampling code, stream order, archetype table or curve family changes.

The pseudo-random generator is a specified, implemented algorithm (sfc32 seeded through a splitmix32 expansion of the seed) with a documented stream order: demographics, then latent physiology, then each maneuver in turn, then measurement noise. `Math.random` is never used. A test asserts that a fixed set of seeds yields byte-identical serialized cases, and that inserting a draw in one stream does not shift the draws of another.

### Ground truth

The ground truth of a case is the set of physical-unit values (liters, liters per second, mL/min/mmHg), the archetype, the severity and the technique modifier. It is not a set of z-scores, because z-scores exist only relative to an equation. The generator needs a reference to anchor latent physiology, and that anchor is a declared, versioned choice stored in the case as `genRef` (GLI Global for spirometry, the volume and TLCO families described below for the others). The interface states plainly that archetypes such as "normal" are normal with respect to the anchor, and that a difference seen under another equation therefore partly reflects the anchor. The anchor is never presented as one of the neutral lenses in the comparison view. The thoracic model in `research/` is not the generator and supplies no reference values.

### Latent physiology and exact constraints

Latent standardized deviations are drawn per archetype from a multivariate normal with a stated correlation matrix, then transformed to physical values through the inverse LMS of the anchor, `value = M(1 + L·S·z)^(1/L)` (with the log form when L = 0). Derived quantities are computed, never sampled independently, so the following hold to within floating-point error and are enforced by property tests over at least 100,000 seeds per archetype:

FEV1 ≤ FVC for every maneuver and for the reported values. TLC = RV + VC. FRC = RV + ERV. IC = TLC − FRC and VC = IC + ERV. VA ≤ TLC, with VA/TLC lower in obstruction as a modeled effect, not an accident. DLCO = KCO × VA before hemoglobin correction. FVC may differ from slow VC, with FVC ≤ VC permitted and larger gaps in obstruction. The flow-volume loop, the volume-time curve and the tabulated FEV1, FVC, PEF and FEF25-75 come from one curve per maneuver: the tabulated numbers are computed from the curve, not sampled beside it. The curve family has a rise-time and a shape parameter, and a bisection on the rate parameter fixes the curve so that the volume 1.000 s after the back-extrapolated time zero equals the target FEV1 within 1 mL while the volume at the end of the maneuver equals FVC. The curve is `V(t) = A(1 − exp(−a·s(t)^k))` with `s(t) = t − r(1 − exp(−t/r))`; the exponent `k` sets scooping of the loop and `r` the speed of the start. The back-extrapolated zero is the intercept of the tangent at maximum flow. A ratio the family cannot represent is clamped and flagged, never silently altered.

### Maneuver set

A spirometry case contains between three and eight maneuvers, each with FVC, FEV1, PEF, forced expiratory time, back-extrapolated volume (BEV), end-of-test plateau, and flags for the usual technical faults (slow start, early termination, cough in the first second, variable effort, glottic closure). The `technique` modifier, independent of archetype, sets the probability and size of faults. A learner therefore has to decide which maneuvers are acceptable, whether the acceptable ones are repeatable, and whether the grade supports the interpretation, before any equation enters.

Acceptability, repeatability and the quality grade follow the ATS/ERS 2019 spirometry standardization. The reported FVC and FEV1 are the largest values among acceptable maneuvers, taken separately, and FEV1/FVC is computed from those two numbers. The criteria follow Tables 7 and 10 and the end-of-forced-expiration text of Graham et al. 2019, checked line by line against the statement. FEV1 and FVC are judged and graded separately. Both need a BEV below 5% of FVC or 0.100 L, whichever is greater, and no glottic closure in the first second. FEV1 additionally needs no cough in the first second and needs no end-of-test indicator. FVC additionally needs no glottic closure after the first second and needs one of three end-of-forced-expiration indicators: a plateau (under 0.025 L change in the last second), a forced expiratory time of at least 15 s, or an FVC within 0.150 L of, or greater than, the largest FVC in the set. A maneuver that is usable but not acceptable can still supply a value when no maneuver is acceptable, and then the grade is U. Repeatability is the difference between the two largest acceptable values, at most 0.150 L for people older than 6 years, applied to FEV1 and FVC separately. Grades: A for three or more acceptable maneuvers within 0.150 L; B for two within 0.150 L; C for two or more within 0.200 L; D for two or more within 0.250 L; E for a spread above 0.250 L or a single acceptable maneuver; U for none acceptable and at least one usable; F for neither. Up to eight maneuvers are recorded in adults. Not implemented: the criteria for children aged 6 years or younger, leaks, obstructed mouthpieces, faulty zero flow, and the FIVC check after the maneuver. An earlier draft of this section graded the pair of variables together and treated a cough as spoiling both; both were wrong and have been corrected. Constants and their verification states are in `src/core/standards.js`.

Lung volumes carry replicate FRC determinations and DLCO carries replicate tests, each with a repeatability rule from the corresponding ATS/ERS standard (verification state: unverified), so the same logic of reviewing replicates before reading the report applies to all three sections. The shutter-closure panel and the single-breath gas tracings remain later features, but the data model already stores a breath-hold time and an inspired volume for DLCO so that adding the tracing does not change the case schema.

### Archetypes

Each archetype is a row in `src/archetypes.js` with latent means, a covariance, a severity ladder, and the modifiers it implies. The v0.01 set is normal, obstruction, restriction, mixed, preserved ratio with impaired spirometry (PRISm), isolated low DLCO, obesity with low ERV, and discordant bronchodilator response in FEV1 and FVC. A first set of proposed latent means follows. Every number is a proposal for physician review, not a source-backed value, and the ladder boundaries use the severity breakpoints in the interpretation section so that the intended severity and the computed severity agree.

| Archetype | FEV1/FVC z | TLC z | RV z (or RV/TLC) | DLCO z | Other |
|---|---|---|---|---|---|
| Normal | N(0,1) truncated to −1.2 and above in each measure | N(0,1) | N(0,1) | N(0,1) | none |
| Obstruction | −1.8 to −5 by severity | −0.5 to +2.5 with severity | +1 to +4 | 0 to −4 (emphysema-like branch, optional) | bronchodilator response optional |
| Restriction | ≥ −1.0 | −1.8 to −5 | −0.5 to −3 | 0 to −3 | KCO preserved or raised in extraparenchymal branch |
| Mixed | −1.8 to −4 | −1.8 to −4 | free | 0 to −4 | |
| PRISm | ≥ −1.0 | ≥ −1.0 (TLC normal) | free | free | FVC and FEV1 z −1.8 to −4 |
| Isolated low DLCO | ≥ −1.0 | ≥ −1.0 | ≥ −1.0 | −2 to −5 | KCO low; VA preserved |
| Obesity with low ERV | ≥ −1.0 | ≥ −1.0 or mildly low | RV z near 0 | normal to raised | ERV z −1.5 to −4 with FRC low and weight consistent with BMI ≥ 35 |
| Discordant bronchodilator response | variable | ≥ −1.0 | free | free | FVC and FEV1 change in opposite directions or one without the other |

A technique modifier is applied after the archetype. A case that is technically poor stays physiologically what its archetype says, and the report shows that the measured values are degraded, which is the teaching point.

## Reference equations

### Per-measurement resolution

Reference values are resolved per measurement, which matches routine laboratory practice. Spirometry is read against a spirometry equation, static volumes against a volume equation, and TLCO against a TLCO equation, and when no equation matching the requested group exists for a measurement, the laboratory uses the closest available one and says so on the report. The interface is therefore:

`resolveReference(measure, { age, sex, heightCm, group }, requestedFamily) → { equationId, matched, fallbackReason, predicted, lln, uln, z, percentPredicted }`

`measure` is one of FEV1, FVC, FEV1/FVC, FEF25-75, TLC, RV, RV/TLC, FRC, ERV, VC, DLCO, KCO and VA. `matched` is false whenever the requested group or family could not be honored, and `fallbackReason` is a fixed-vocabulary string such as `no-group-specific-equation` or `age-outside-range`. Every report line shows its equation identifier, and every fallback is visible on the line, not in a footnote.

### Families

The spirometry families are GLI-2012 (group-specific), GLI Global 2022 (group-neutral) and NHANES III. Static volumes use GLI-2021 and TLCO uses GLI-2017. The published titles of the GLI-2021 static volume standard and the GLI-2017 TLCO standard restrict both to people of European ancestry, because data from other groups were insufficient (confirmed from titles and abstracts returned by search, not from the full texts). The fallback is therefore the usual path for lung volumes and TLCO in any case whose requisition group is not White: the European equation is applied, the line says so, and the report states that the equation was not derived in the patient's group. The group coverage, age range and sex handling of each family are still entered in `src/reference/coverage.json` from the primary publications, with a verification state, before the fallback table is written.

### Comparison and reclassification

The comparison view evaluates the same measured values under each selected combination. Reclassification is computed per family and attributed: the output records which measurements changed their low, normal or high label, the resulting change in the overall pattern, and the equation change responsible. A change in the final pattern label is never shown without the measurement-level cause. Borderline cases, defined as a z-score within a configurable band of the lower limit (default 0.25 z, to be confirmed), are flagged whether or not they flipped.

The interpretation logic accepts z-scores from different sources. A pattern built from spirometry under one family and TLC under another is a legitimate laboratory output, and the report states that the pattern rests on more than one reference.

### Implementation and test vectors

Reference values are implemented from the published equations and published lookup tables, not by translating the `rspiro` source. `rspiro` is licensed GPL (version 0.5 on CRAN lists GPL-2 or GPL-3), and copying its code into this MIT-licensed repository would create a licensing problem, whereas using it only to generate numeric test vectors does not. `scripts/make-vectors.R` generates CSV vectors with `rspiro` over a grid of age, sex, height and group (including edge ages), and `tests/reference.test.mjs` asserts agreement of predicted value, LLN and z-score. The tolerance is set when the tables are ported, because it depends on the precision of the shipped coefficients and spline tables. It is recorded in the test, not guessed here. The R script prints `sessionInfo()` into the vector file header so that the vectors are reproducible, and each argument convention of `rspiro` is checked against its documentation before the vectors are trusted.

### Terms of use for the GLI tables

The terms are not yet settled, and this is what is known. The summary supplied for this project states that the equations and lookup tables are freely available for implementation, that official GLI software is restricted to research, education, training and validation and is not approved for direct patient treatment, that distribution is under a CC BY-NC license, and that the programmatic API needs keys from the ERS. That summary rests partly on vendor and aggregator pages, and the claim that matters most (the license that governs the lookup tables) is the one that could not be confirmed: the ERS pages were unreachable from the build environment when this revision was written, and a web search surfaced only a CC BY-NC license on an unrelated 2025 paper and the statement that the equations need spline tables, not the terms for the tables. Treat the CC BY-NC statement as unverified until someone reads the ERS terms directly. A second attempt in this revision to reach `gli-calculator.ersnet.org/docs.html` and the ERS pages also failed (the environment's network policy does not resolve those hosts), so the status is unchanged. The `docs.html` page is an API reference and, as the project physician noted, is not the license.

If the tables are CC BY-NC with attribution, three consequences follow. The public repository can host them only with attribution and a notice that they are non-commercial, the repository's MIT license cannot be allowed to read as covering them, and the tables belong in their own directory with their own `NOTICE` file. Anyone who reuses the tool commercially would need ERS permission, which the README must say. No browser code may call the ERS API, because the site is static and a key shipped to the client would be exposed, so the tool uses ported tables only. Until the primary terms are read and recorded here, no table is committed; only vector files generated by `rspiro`, containing derived numbers and no coefficients, are acceptable, and even those should be confirmed with the same terms in hand. The educational disclaimer in the footer already matches the restriction against direct patient treatment.

Update, 2026-10-20: the project physician has read the ERS terms and confirmed that the summary above holds. The exact wording is not yet recorded in this repository and must be pasted into `src/reference/NOTICE` when the first table is added. This does not unblock the port by itself: the published coefficients and spline tables must still be obtained from the GLI sources, and R with `rspiro` is needed for the test vectors. Neither CRAN nor the ERS hosts are reachable from the current build environment, and R is not installed in it; the tables were supplied by the project physician instead (see Port status below).

The 2019 spirometry constants in `src/core/standards.js` were compared with Tables 7 and 10 of Graham et al., Am J Respir Crit Care Med 2019;200:e70-e88, doi 10.1164/rccm.201908-1590ST, using the copy the project physician supplied.

Vectors received, 2026-10-20: `tests/vectors/rspiro-vectors.csv` holds 2,664 rows from rspiro 0.5 on R 4.6.1 (GLI-2012 for ethnicity codes 1 to 5 and GLI Global, each for FEV1, FVC and FEV1/FVC, 148 grid points for each combination of equation, ethnicity code and measurement, covering both sexes), validated by the project physician against vectorized package calls to about 5e-15. The package places the lower limit at z = -1.645, matching the cutoff used here. The vectors cover spirometry only. NHANES III, GLI-2021 volumes and GLI-2017 TLCO vectors are still needed, together with the GLI lookup tables, before any reference module can be written.

### Port status, 2026-10-20

The reference module is implemented in `src/reference/gli.js` over JSON extracted by `tools/extract-gli.py` from the five GLI workbooks the project physician supplied (URLs, sizes and sha256 values in `src/reference/sources.json`; the script refuses inputs whose hash differs). Covered: GLI-2012 spirometry for ethnicity codes 1 to 5, GLI Global 2022 spirometry, GLI-2021 volumes (TLC, RV, VC, IC, ERV, FRC, RV/TLC) and GLI-2017 TLCO in traditional units (DLCO, KCO, VA). Not covered: FEF25-75 and the other GLI-2012 flow measures, TLCO in SI units, NHANES III, and the hemoglobin correction for DLCO.

Agreement with rspiro 0.5 on the 2,664 spirometry vectors: GLI Global matches to floating-point precision (about 1e-15 relative for predicted value and LLN). GLI-2012 differs by up to 2.07e-4 relative in predicted value, 2.40e-4 in LLN, and 1.70e-3 in z-score at 80% of predicted, uniformly across ethnicity codes. The pattern (a constant offset in ln M independent of height and age) is consistent with the workbook's coefficients being rounded, for example a0 = -10.342 for male FEV1, while rspiro appears to carry more digits; this explanation is inferred, not confirmed against rspiro's source. Both are far inside the 2% ceiling, and the test fails if either exceeds these recorded values.

Cross-check against the independent implementation in pft_interpreter (`tools/crosscheck-interpreter.mjs`): all 24 Global spirometry coefficient sets (M and S, six measure-sex pairs) are identical, and every spline table agrees to within 5e-5, which is the rounding of its 4-decimal tables. pft_interpreter also selects the nearest whole-year row of the table, where this module interpolates linearly between the 0.25-year rows, so its values at non-integer ages differ slightly from the published tables.

Open items for the port. The regression coefficients for GLI-2021 volumes and GLI-2017 TLCO are not in the supplied workbooks; they were read from pft_interpreter and have no independent check, so rspiro vectors for TLCO and volumes (if the package provides them), or the coefficient tables from Hall 2021 and Stanojevic 2017, are still needed. The vectors cover whole-year ages only, so linear interpolation at fractional ages is untested against rspiro; the next vector grid should include fractional ages such as 33.4 and 61.75. The exact ERS license wording is still to be pasted into `src/reference/NOTICE`.

## Interpretation module

`src/interpret.js` implements ATS/ERS 2022 interpretive strategy with the lower limit of normal at z = −1.645 (the fifth percentile) and the upper limit at +1.645. It is a function of measured values and the resolved references, with no hidden state, and it returns a structured key: pattern, severity, per-measurement labels, bronchodilator result, DLCO result, flags, and the equation provenance of every input.

The decision table below is the contract. It is data in `tests/fixtures/interpretation-cases.json`, one or more cases per branch with the expected output, and it is written and reviewed by the clinician before the engine is coded. Branch order matters because earlier branches take precedence.

| Branch | Condition | Output |
|---|---|---|
| S0 | FEV1/FVC, FVC and FEV1 present, none below LLN | Normal spirometry |
| S1 | FEV1/FVC below LLN, FVC at or above LLN | Obstruction |
| S2 | FEV1/FVC below LLN, FVC below LLN, TLC unavailable | Obstruction with low FVC; volumes needed to separate air trapping from coexisting restriction |
| S3 | FEV1/FVC at or above LLN, FVC below LLN, TLC unavailable | Low FVC with preserved ratio; restriction not excluded; volumes needed |
| V1 | FEV1/FVC at or above LLN, TLC below LLN | Restriction |
| V2 | FEV1/FVC below LLN, TLC below LLN | Mixed obstruction and restriction |
| V3 | FEV1/FVC below LLN, TLC at or above LLN | Obstruction; add hyperinflation if TLC above ULN, add air trapping if RV or RV/TLC above ULN |
| V4 | FEV1/FVC at or above LLN, FVC below LLN, TLC at or above LLN | Preserved ratio impaired spirometry (nonspecific pattern) |
| V5 | Low ERV with normal TLC and normal ratio | Reduced ERV, report with BMI context |
| D1 | DLCO below LLN | Reduced diffusing capacity; subtype from KCO and VA/TLC relation |
| D2 | DLCO above ULN | Raised diffusing capacity |
| B1 | Post-bronchodilator FEV1 or FVC rises by more than 10% of predicted | Significant response under ATS/ERS 2022 |
| B2 | Same change fails B1 but meets the older criterion (at least 12% and 200 mL over baseline) | Not significant under 2022, would be significant under the older rule |

Severity of an obstructive or restrictive pattern is graded from the FEV1 z-score with the 2022 breakpoints (mild above −2.5, moderate −2.5 to −4.0, severe below −4.0). DLCO severity uses the grading from the same standard. Verification state of the table, the severity breakpoints and the bronchodilator criteria: unverified until compared with the standard line by line. The bronchodilator result is displayed under both rules because the difference between them is itself a reclassification lesson.

## Report and figures

The report table lists every measurement with measured value, units, predicted, LLN, z-score, percent predicted, equation identifier and flag. Flag color is text only, never a fill. Figures sit on the dark monitor panels (`--mon-*`) in both themes: the flow-volume loop with predicted and LLN envelopes and the color-coded trace, the volume-time curve with the FEV1 mark and the extrapolated-volume construction, and an overlay of all maneuvers with the accepted ones distinguished. Series color encodes the quantity or equation, and dash style encodes the relation (measured, predicted, LLN). Figures are drawn from the same curve data as the table, and a test recomputes the table values from the plotted arrays.

## Learner flow

v0.01 shows the case and the report with the interpretation hidden until the learner reveals it, and the comparison view after that. Structured learner answers (pattern, severity, quality grade, bronchodilator result, DLCO) ship in every version, stored only in the page, scored against the deterministic key. Server-side capture and instructor dashboards stay out of scope until a backend is justified.

## Acceptance criteria for v0.01

The same descriptor yields byte-identical serialized cases on repeated runs and across the supported Node versions. Over at least 100,000 seeds per archetype and technique level, zero constraint violations. The volume 1.000 s after the back-extrapolated zero on every maneuver curve equals the tabulated FEV1 within 1 mL, and the curve integral equals FVC within 1 mL. Reference outputs agree with the `rspiro` vectors within the tolerance recorded at port time. Every branch of the decision table has at least one fixture case, and the engine reproduces the expected key for all of them. Reclassification output for a hand-built pair of equations changes only the measurements it should and attributes each change correctly. The build is deterministic, `npm test` and `npm run build` pass in CI, and browser QA harnesses pass in both themes and at a phone width.

## Later features

Full laboratory report layout. Body plethysmography with the shutter-closure panel (box pressure against mouth pressure for thoracic gas volume, and the airway resistance loop). Single-breath DLCO tracing with inspired and expired tracer gas and CO over time, the breath-hold interval and the washout sample. Raw-value export for statistics teaching. Instructor mode with assigned seeds. Learner response capture and scoring on a server.

## Research track

`research/thorax_sim.py` and its design document remain as an unreferenced research scaffold. They are not used for reference equations, not imported by the product, and not a source for any value in it. The prior-predictive run with placeholder priors reproduced neither the direction nor the age pattern of the between-group differences in GLI predicted values, and because every group-specific chest offset is an unsourced placeholder, the reported interval describes the priors and not anatomy. Anthropometric differences between self-reported groups are also shaped by early-life nutrition, altitude, air pollution and socioeconomic position, so a gap the model fails to explain cannot be attributed to ancestry. The defensible output is the portion of a difference in predicted values that body proportions fail to account for. Moving this track to its own repository is recommended and is listed as an open decision.

## Decisions

Settled by the project physician. The self-reported group is shown to learners as it would appear on a requisition. The borderline band keeps its default of 0.25 z. Structured learner answers ship in every version. The research track stays in this repository, unreferenced by the product. Agreement with `rspiro` on predicted values has a ceiling of 2% relative difference. A correctly ported equation should match `rspiro` to within rounding of the published coefficients, so a 2% tolerance would also pass a transcription error in a spline table or coefficient; the test therefore records the observed maximum difference per equation and fails on any increase over the value recorded when the port was verified, with 2% as the outer limit.

## Open items

The primary-source GLI terms and the resulting licensing arrangement for the tables. Physician review of the archetype latent means and of the interpretation decision table, which gates the interpretation engine. Comparison of the 2022 interpretation constants in `src/core/standards.js` with the ERS/ATS 2022 statement (the 2019 spirometry constants are verified). Wording of the requisition group labels in `src/core/descriptor.js`, which are placeholders.
