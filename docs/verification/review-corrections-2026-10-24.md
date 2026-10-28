# Review corrections after 12524db

Local only, no push, merge or deployment. Source findings were supplied by the parent's primary-source research audit; source-text verification is distinct from verification of this code or GLI outputs.

## Four independent-review findings

1. `narrative.js` uses the engine's qualified RV/TLC flag across final text, volume sections and findings. Seed 2, extraparenchymal restriction, good technique, full panel, severity 2 retains TLC z −3.874768753 and RV/TLC z 1.838998396. Weakness, suboptimal effort and parenchymal restriction are tested over 24 narrative seeds each. No definite trapping statement is generated from the ratio alone.
2. `interpret.js` uses `possible-hyperinflation` for high TLC plus high RV/TLC. Missing FRC/TLC prevents completion of the 2022 Table 7 classification. Concise and quiz fallback text are qualified too.
3. `renderMethod` states coefficients match the prior transcription and spline arrays match archived workbooks. Neither authenticates publisher origin or independently verifies printed coefficients. No source-validation caveat was removed.
4. BEV/plateau source equality conflict is recorded in `standards.js` and SPEC. Inclusive Table 7 comparisons were selected following the final source handoff; adjacent prose is strict. Exact equality and ±1e−10 tests cover both BEV branches and plateau, without an EOFE rescue masking the plateau assertion.

## Additional feasible corrections

- 2019 spirometry Table 6 pause limit is coaching, not a separate Table 7 veto. Acceptability reasons and warnings are separate. Other independent faults still override an EOFE pass.
- Final-set EOFE maximum comparison is retained. A singleton lacking plateau/long FET stays unconfirmed. The simulator uses adult criteria and separate pre/post sets; no pediatric rules were fabricated.
- DLCO t85 at or above 4 s fails. The small classical sample exception is VC <1.0 L with confirmed clearance. Reduced washout at VC <2 L remains separate. RGA virtual-sample checks are method-specific, with no claim of a full RGA acquisition model.
- Low-VI VA concordance needs a caller-supplied other-acceptable comparator; no comparator leaves an unknown criterion. The generator provides one test and cannot establish repeatability or this alternative.
- DLCO letters and pleth FRC letters are labeled simulator rubrics in reports and figures. The source's overlapping DLCO interim grades were not replaced by a falsely authoritative catch-all mapping.
- No-TLC terminology now says preserved-ratio spirometric impairment. The internal `prism` ID is retained only for compatibility.

## Primary locators

- Graham BL et al. *Standardization of Spirometry 2019 Update.* AJRCCM 2019;200:e70–e88. DOI [10.1164/rccm.201908-1590ST](https://pmc.ncbi.nlm.nih.gov/articles/PMC6794117/), Tables 6, 7 and 10, Maximal inspiration, EOFE text and Figure 2. No relevant correction located by parent research.
- Graham BL et al. *2017 ERS/ATS standards for single-breath carbon monoxide uptake in the lung.* ERJ 2017;49:1600016. DOI [10.1183/13993003.00016-2016](https://doi.org/10.1183/13993003.00016-2016), printed pp10–12 and pp21–22/Table 3. [Readable journal PDF](https://www.sogapar.info/wp-content/uploads/2016/12/5.-Normativa-difusi%C3%B3n-ATS-2017.pdf). The [2018 correction](https://doi.org/10.1183/13993003.50016-2016) concerns syringe VA and oxygen equations, not these quality thresholds.
- Bhakta NR et al. *ERS/ATS technical standard on standardisation of the measurement of lung volumes, 2023 update.* ERJ 2023;62:2201519. DOI [10.1183/13993003.01519-2022](https://doi.org/10.1183/13993003.01519-2022), corrected Tables 3–4 p18 and reporting/selection pp18–19. [Corrected journal PDF](https://vvlr-afp.be/wp-content/uploads/2025/03/Standardisatie-rapport-long-volumes-2023.pdf). [November 2023 correction](https://doi.org/10.1183/13993003.51519-2022) replaces Table 3, not Table 4.
- Stanojevic S et al. *ERS/ATS technical standard on interpretive strategies for routine lung function tests.* ERJ 2022;60:2101499. DOI [10.1183/13993003.01499-2021](https://doi.org/10.1183/13993003.01499-2021), Table 5 p18/non-specific pattern p19, Table 7 p22. [Readable journal PDF](https://vvlr-afp.be/wp-content/uploads/2025/03/ERS-ATS-technical-standard-on-interpretive-strategies-for-routine-lung-function-tests_ERJ_2021.pdf).

## Genuine remaining implementation gaps

The following are not solved by the local rule corrections:

- DLCO replicate collection, confirmation that VC is the same-session maximum, identification of other *acceptable* VA, repeatability within 2 mL/min/mmHg (0.67 SI), A-only reporting preference and qualified B–D fallback. F-only sessions are not represented because no session model exists. Simulated contamination ≤3% is a teaching assumption, not a published clearance threshold. Full corrected 2018 measurement-equation audit remains open.
- Pleth retained FRC AND SVC quality, corrected adult linkage (SVC ≥FVC−0.150 L acceptable; ≥FVC−0.250 L usable), matched FRC+IC averaging and TLC minus largest eligible VC for RV. Current synthetic IC/VC are assumed linked; their acceptability is not measured. The code can average all acceptable FRC trials even when a smaller best subset earned the rubric, and can average rejected trials if none is usable (flagged). These are simulation limitations, not standard-compliant reporting. Corrected overall A–F/U grades and method-specific selection need a dedicated measurement-model change, not relabeling.
- Pediatric spirometry/linked-volume grading, zero-flow errors, washout/helium dilution acquisition and unsupported model calibration remain absent. No additions were made merely because the standards discuss them.
- Complete original coefficient provenance and independent official numerical fixtures remain blocked as described in `coefficient-source-request.md`. No fresh original files or calculator outputs were obtained this turn. The previous reCAPTCHA Enterprise quota block was not retried.

The 41-group JSON inventory is the current source-status count. Historical baseline matrix rows in `rule-source-audit.md` intentionally preserve what was found, rather than silently rewriting history. Corrected is an overlapping axis and includes explicit removal of unsupported attribution; it is not a count of fully verified algorithms.

## Verification actually completed

`npm test`: 758 tests, 755 pass, 3 fail. The failures have the same names as the separately reproduced `9822a77` baseline: (1) numerical identity of 2230 non-resistance case objects; (2) 50 scenario-none cases byte-identical to `2ac98e3`; (3) asking for level none changes nothing. Their old generator hash fixtures were not regenerated. The source-corrected display snapshot was deliberately updated for the changed labels and qualifications. Full current output: `review-tests-2026-10-24.txt`; baseline reproduction remains in `baseline-reproduction-2026-10-24.json` and `/tmp/pft-baseline-reproduced.log`.

`npm run build`: passes (`review-build-2026-10-24.txt`). `git diff --check`: passes. `node tools/check-measured-isolation.mjs ../PFT_Sim-baseline9822`: all 100 good-technique report objects (10 seeds × 10 archetypes) still match; this is not an exhaustive guarantee about summaries of poor maneuvers after quality-rule corrections. Chrome QA checked current method disclosures, main navigation and puzzler answer locking/reveal. The earlier mobile and keyboard checks are recorded in `puzzlers-local-qa-2026-10-24.md`; no new mobile layout change was made in this follow-up.

## Focused learner-feedback re-review

All three requested contradictions were corrected without changing measurement algorithms:

- Seed 2, normal, good technique, `qs-pause-at-tlc`: affected FEV1 values remain acceptable with coaching warnings, and the scenario caveat now describes that behavior. Other faults still control acceptability.
- Seed 3, normal, fair technique: rubric A comes from a qualifying three-trial subset of five acceptable closures, while the displayed acceptable set spans 9.35%. The challenge now asks only whether a subset qualifies under the simulator rubric; its options no longer claim “Acceptable and repeatable.” The explanation discloses that reporting averages all acceptable trials and that retained linked SVC/full reporting selection are absent. An overall ATS/ERS verdict is expressly withheld. The qualification is retained even after a correct answer and in an unscored reveal; the quality summary uses the same rubric scope.
- Both advanced challenge and quiz feedback now state BEV “at or below” the larger limit and disclose the Table 7/prose equality conflict. Feedback assertions sit beside the existing exact boundary engine tests.

A related browser issue was found during this verification: on the wide desktop layout, the sticky answer pane covered the key's explanation column. The feedback section now paints above that pane. In the user's Chrome, the seed-3 unscored reveal showed the 9.35% qualification, and the target's center changed from covered to unobstructed in a rendered-DOM occlusion check. No changes to reference data, measured values, FRC subset selection or reporting arithmetic were made.

Final feedback-follow-up verification: `npm test` reports 760 total, 757 pass and the same three reproduced baseline failures; full output is `feedback-review-tests-2026-10-24.txt`. `npm run build` and `git diff --check` pass. The focused feedback/practice/challenge run passed 69/69. No historical generator/hash fixtures were regenerated; the source-corrected display snapshot was updated for the deliberate feedback changes.
