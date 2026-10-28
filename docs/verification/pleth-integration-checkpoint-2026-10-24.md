# Linked pleth product integration checkpoint

Continues clean local branch `feature/advanced-case-puzzlers` from `3fe9974`. This is a local implementation checkpoint for independent review, not a final completion or numerical GLI validation claim. No PR16/17 import, push, merge or deployment.

## Integrated behavior

New cases use generator v3. Explicit v2 links keep the earlier FRC-only measurement builder and disclosed rubric. V3 stores measured FRC with each linked IC/SVC, linkage state, eligibility and observations. `buildMeasuredPleth` consumes `summarizePlethSession`, reports its exact retained FRC mean, matched FRC+IC TLC mean and derived RV, and preserves all original trial measurements. Corrected 2023 component grades constrain the overall grade.

FRC-only, a discordant pending pair, wholly rejected trials, qualified singleton measurements and incomplete linked inspiration flow through interpretation, the concise report, narrative, questions, grading, details, figure fallbacks and HTML/CSV exports. Missing TLC/RV remain null and display “not reportable”; restriction is not inferred from absent values. A failed pleth link does not alter a separately measured DLCO. Physical garment constraints retain their separate modeled effects on both tests. A forced incomplete-IC fault is applied numerically once and rejects the affected links.

The trial display keeps numbers in compact rows and puts long qualifications/observations underneath. CSV, TSV and clipboard exports retain separate fields; export regression tests check both the numeric rows and relocated detail fields. V3 quality answers distinguish A/B, qualified C/D/E/U and unavailable complete TLC/RV. Qualifications remain visible for correct and unscored answers. The limitations quiz matches decoy lengths across the true-option length range and uses at least four substantive decoys to avoid select-all and longest-option cues; scoring itself is unchanged.

## Source decision requiring focused independent review

Bhakta et al., ERS/ATS lung-volume measurement standard, DOI https://doi.org/10.1183/13993003.01519-2022, corrected Table 3, Table 4 and Reporting/Selection pp18–19; derivation pp4–5. Corrected full journal copy: https://vvlr-afp.be/wp-content/uploads/2025/03/Standardisatie-rapport-long-volumes-2023.pdf . Table 3 erratum: https://doi.org/10.1183/13993003.51519-2022 .

Reporting pp18–19 selects measurements and associated spirometry for FRC and other volumes, and Table 4 counts retained measurements. With the derivation of RV from TLC minus largest VC, this implementation uses the largest **eligible retained linked SVC**. That pool scope is an interpretation of source context, not a verbatim exhaustive list. An excluded SVC or separate forced FVC is not silently substituted. Group 28 remains partial pending independent review of this decision and the disclosed engineering selection preferences. Please specifically adjudicate whether another independently eligible same-session VC belongs in that RV pool.

Subset count, smallest spread, acquisition ties, eight-trial cap, last-acquisition outlier tie and preference for full eligible paired reporting over a stronger FRC-only pool remain documented engineering policies. Full-precision comparisons retain the existing scaled machine-epsilon equality allowance. The 5%/10%, corrected adult/pediatric SVC and singleton boundaries were already fixture-tested in the pure core; no new clinical cutoff was invented here. Waveform fault generation/recognition is synthetic, not validated clinical waveform assessment.

## Verification and browser evidence

- Full `npm test`: 779 tests, 776 pass, the same three independently reproduced baseline hash failures. Log: `pleth-integration-tests-2026-10-24.txt`.
- `npm run build`: passes; log: `pleth-integration-build-2026-10-24.txt`.
- Seven new product integration tests cover retained pairing/arithmetic, explicit v2 compatibility, FRC-only, pending, all rejected, incomplete inspiration, qualified singleton and separate physical garment effects. Each unavailable workflow checks model values, HTML/CSV, interpretation, concise/narrative text, question scoring and all available figures for nonfinite output.
- Existing twelve pure-core tests and independent base-R arithmetic check remain; R output: `pleth-integration-r-2026-10-24.txt`. Neither is an official GLI oracle.
- Legacy geometry/scenario arithmetic contracts explicitly request v2; v3 has new integration coverage. Historical generator/hash fixtures were not regenerated. The source-corrected markup snapshot was deliberately refreshed for v3 and changed text.
- User's **Chrome**, browser 1, localhost: v3 seed 2/normal/poor showed FRC 2.45 L with TLC/RV not reportable, separate DLCO and a correctly scored unavailable answer. The detailed retained/link table fits its 784 px report container with scroll width 784 px. Screenshot `/tmp/pft-v3-frc-only.png`.
- V3 seed 3/normal/poor correctly scores “Qualified report (C/D/E/U)”, shows overall E, retained trial 4 and unassessable singleton repeatability. Lab-report export controls and printable-report link were present.
- Native CSV download was attempted once via the visible button while awaiting a download event. Browser tool timed out and reset; no downloaded PFT file was located in Downloads. Completion is **uncertain**, not a confirmed successful download. Subsequent tab access reported “Debugger unattached”; state inspection still listed the local report, but one documented recovery did not restore control. No download retry was made. Native printable-page/print-dialog confirmation remains **technically blocked**; export content tests and static build pass. No permission denial occurred.

## Approval notification and remaining scope

The only escalation requested in this checkpoint was `npm start` in the local worktree to run the preview server. It returned a running server at http://127.0.0.1:5173 (exec session 20514). No pending approval command is visible to this agent. The parent-provided manager notification ID has no additional action description in this context; it is not treated as approval for another action. Local implementation/testing was not blocked.

Replicate DLCO selection is **not started**. Its interim letter-table overlaps, other-maneuver VA comparator, selection/reporting and missing-result gating remain the next task. The current DLCO display still explicitly labels its one-test letter as a simulator rubric.

Rule inventory now reports 41 groups: 15 verified-rule-text, 12 partial, 9 modeled, 5 blocked complete coefficient/output validation; 20 corrected groups overlap those statuses. Group 29 now implements corrected retained component grading. These are semantic groups, not a claim that all constants are validated.

Previously established calculator quota and publisher 403 were not retried. Printed Hall 2021 Table 3, corrected Stanojevic 2020 Table 2, original Global coefficient/supplement provenance and official independent outputs remain open as precisely described in `coefficient-source-request.md`. Archived volume/corrected-TLCO spline workbooks already exist; do not request them again. Actual Claude consultation was completed before the core/adapter work in fresh PFT Simulator session https://claude.ai/code/session_01UouK3Nbz2WKgrTxVPfdTnM (Opus 5.5 High, Chrome); accepted/rejected recommendations remain in the prior checkpoint document.
