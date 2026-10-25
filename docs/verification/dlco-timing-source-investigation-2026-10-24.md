# DLCO source investigation and quiz review checkpoint

Historical investigation at 8507c25. The subsequent implementation and current status are in source-gap-checkpoint-2026-10-24.md; the timing defect documented below has now been corrected in generator v5.

Inspected measurement commit `658c63e` on 24 October 2026. This checkpoint changes quiz feedback only; it deliberately leaves measurement timing and numeric outputs stable for independent review. No browser interaction, publication, deployment or new official GLI output occurred.

## Quiz corrections

An attempted but unreportable/pending DLCO session now retains the unavailable answer and asks about reportability. Fallback final answers carry domain-specific DLCO and lung-volume session qualifications. They cannot declare diffusion normal, reduced or raised when the session is pending/unavailable. Normal spirometry no longer implies normal gas transfer in fallback wording. Regression coverage includes adapters disabled, pending/unavailable sessions, qualified diffusion plus qualified volumes, and categorical key/option consistency.

Focused tests: 21/21 passed. Full suite: 793/796 passed, with the same three previously reproduced baseline failures (numerical identity across 2230 cases; 50 level-none case byte identities; explicit level-none identity). Build passed. Logs accompany this note. Native print/download verification remains blocked by the locked Mac; no unlock attempt was made.

## Definite timing discrepancy: group 22 remains partial

Primary source: Graham et al., 2017 ERS/ATS standards for single-breath carbon monoxide uptake in the lung, DOI [10.1183/13993003.00016-2016](https://doi.org/10.1183/13993003.00016-2016), Figure 5 (printed p14) and timing discussion (p15). [Readable journal PDF](https://www.sogapar.info/wp-content/uploads/2016/12/5.-Normativa-difusi%C3%B3n-ATS-2017.pdf).

The Jones–Meade interval begins at back-extrapolated time zero plus 30% of inspiratory TIME, where inspiration ends at 90% of inspired volume. Its endpoint is the midpoint of sample collection TIME. The current generator instead uses the event at 30% inspired VOLUME and the midpoint of sampled expired VOLUME. With nonlinear flow these differ. `src/core/dlco-trace.js` lines 244–260 construct these markers; its analyzer and tests repeat the same convention. Agreement between those tests and the generator does not verify the standard.

A correction must update the forward CO decay, analyzer, timing markers, figure labels and tests together, with independent nonlinear-flow fixtures. Do not merely move an acceptability threshold. The accompanying synthetic JSON illustrates the discrepancy using the analytic inspiration curve and stored millisecond-rounded markers. For seed 3 normal/good test 1, the existing 9.275 s interval becomes approximately 9.26064 s. Recomputing the SAME gas record changes 27.04282 to approximately 27.08477 mL/min/mmHg. These are synthetic arithmetic illustrations, not patient measurements or official reference-equation validation outputs. The model's signal distributions remain uncalibrated.

## 2018 correction: what applies

Primary correction: Graham et al., DOI [10.1183/13993003.50016-2016](https://doi.org/10.1183/13993003.50016-2016), [original publisher correction](https://publications.ersnet.org/content/erj/52/5/1650016). Publisher-indexed original correction text was readable; direct opening returned 403 and was not retried.

The correction changes the expected alveolar volume for a 3-L syringe QA check to ATPD-to-BTPS conversion: 310/TA × PB/(PB−47), with TA in kelvin. It also removes the erroneous substitution of inspired oxygen fraction for measured alveolar oxygen pressure in supplemental-oxygen adjustment. No syringe QA path, erroneous 863 factor, or FIO2-derived PAO2 adjustment was found in this simulator.

`vaStpdMl` starts with VA already expressed at BTPS and converts it to STPD. That is a different gas-state conversion; replacing it with the syringe correction would introduce an error. Current tracer equations assume VI/dead space are normalized to BTPS. The instrument pipeline for actual ATPD apparatus dead space, temperature, humidity, CO2 removal and device measurements is not implemented. The 2017 equations 12–19 and 2018 syringe correction therefore do not establish validation of such an instrument pipeline. Classical or virtual sample metadata should explicitly state the normalized-volume assumptions. The synthetic oxygen-effect multiplier is a teaching model, not the deleted PAO2 formula.

## Remaining partial groups and feasible next actions

| Group | Finding and disposition |
| --- | --- |
| 6 Hyperinflation | Missing FRC/TLC reference ULN; cannot derive it from separate FRC and TLC limits. Keep qualified interpretation until an authoritative ratio reference is available. |
| 11 Legacy bronchodilator response | ATS/ERS 2005 Table 9 (printed p960) uses inclusive thresholds while adjacent prose uses strict language. Current inclusive convention needs explicit reconciliation and arithmetic boundary tests: 1.0 to 1.2 L yields a binary floating-point delta below 0.2. Existing comparison helper can resolve this engineering issue without changing the chosen convention. Source: DOI 10.1183/09031936.05.00035205, https://www.matheny.info/clinical/PFT_Interpretation_ATS_2005.pdf. Table 6 is severity, not this response table. |
| 15 BEV | Table/prose equality discrepancy already documented and tested; ambiguity is not cured by more code. |
| 16 Zero-flow | A separately assessed zero-flow fault can be modeled explicitly, invalidating both acceptability and usability per 2019 Table 7. Actual fault detection from a waveform would require additional validation. |
| 18 EOFE | Adult completed-set and singleton logic corrected; pediatric criteria remain outside the generated adult cohort. Expanding ages requires age-specific implementation, not an adult threshold extrapolation. |
| 22 DLCO timing | Definite implementation mismatch described above; fix separately with nonlinear timing fixtures. |
| 24 DLCO grading | Source does not allocate all mixed-criterion combinations. Current unknown states, rooted comparator sets, subset ties and KCO aggregation remain disclosed engineering choices. Tests cannot make those universally validated society algorithms. |
| 27 Pleth panting | Frequency boundaries corrected. Source does not define a universal numerical minimal/significant obstruction cutoff; explicit context is preferable to inventing one. |
| 36 Reference ranges | Clamping is project policy, not valid extrapolation. Fail-closed handling is feasible; corrected TLCO applicability needs source clarification. |
| 37 Reference sex | Missing input is rejected. Transgender equation-selection validation remains a scientific limitation; no universal hormone-duration switch is supported. |

Audit counts remain 41 groups: 18 source-text verified, 10 partial, 8 modeled and 5 coefficient/output blocked, with 21 corrected groups overlapping those categories. No status is promoted by this inspection.

## Residual metadata overclaim

The `coefficientSource` strings in `src/reference/data/gli_volumes.json` and `gli_tlco.json` still claim equality to printed Hall Table 3 and corrected Stanojevic Table 2. Actual local evidence is agreement with prior coefficient transcription and archived spline workbooks, not new direct printed-table verification. These metadata strings require a wording correction; numeric coefficients were not changed during this checkpoint. Remaining original-source/calculator access blocks are unchanged and were not retried. The already archived spline workbooks do not need to be requested again.
