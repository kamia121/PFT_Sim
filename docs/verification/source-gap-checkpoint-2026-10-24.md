# Source-gap correction checkpoint

Continuation completed 25 October 2026 UTC, from reviewed base `8507c25`, branch `feature/advanced-case-puzzlers`. Local implementation only; no push, merge or deployment. No browser/Mac UI interaction or blocked publisher/calculator retry occurred.

## Changes ready for review

- Default generator v5 uses the 2017 Jones–Meade time convention coherently in forward gas decay, analyzer, markers, full-precision acceptability metrics and figures. The normalized analytic tangent zero is 5/48; independent polynomial root and asymmetric collection fixtures verify the endpoints. Inspired time ends at 90% VI. t85 <4 s remains separate. Gas sample concentrations retain their volume averaging.
- Explicit v2/v3/v4 links retain numeric acquisition fixtures generated from `8507c25`. Interpretation corrections remain shared. Report metadata, footer object, HTML print rules and CSV identify the actual descriptor version.
- Incomplete/leaked expirations that do not reach the requested sample endpoint retain an attempted trace with no VA/DLCO/KCO result. They cannot enter a reporting pool; no sample completion is fabricated. This edge case was exposed by broader scenario tests and has a seed-15949 regression.
- Legacy BDR retains inclusive 2005 Table 9 thresholds, with the table/prose equality discrepancy explicitly documented. Machine-equality tolerance fixes decimal 200 mL/12% boundaries without clinical rounding; just-below fixtures remain negative. The 2022 criterion is still strictly >10% of predicted.
- An explicitly assessed zero-flow error now invalidates FEV1 and FVC acceptability AND usability, with readable reasons and F-only set behavior. This is an assessment input, not automatic waveform fault detection.
- Clinical reference resolution fails closed outside supported ages. Raw measurements remain; predictions, limits, z-scores and classifications for affected indices are unavailable. An explicitly named synthetic anchor clamp preserves constructive physiology only. Concise/long/fallback prose and answer wording distinguish unavailable classification from missing raw measurements.
- Hall/TLCO JSON metadata and extraction/checking tools now describe prior-transcription and archived-workbook agreement. A direct comparison with `8507c25` confirms numerical coefficient/spline arrays are unchanged.

## Evidence and conventions

Graham et al. 2017, DOI 10.1183/13993003.00016-2016, Figure 5 printed p14 and timing text p15: back-extrapolated zero, 0.3 inspiratory time and arithmetic sample-time midpoint. The original journal PDF was reopened; no blocked resource was retried. Independent R arithmetic checks the 10.7-second endpoint fixture, the analytic tangent and 90% polynomial root. Tests do not establish clinical waveform validation.

Pellegrino et al. 2005, DOI 10.1183/09031936.05.00035205, Table 9 printed p960 versus nearby prose: equality convention remains ambiguous, so group 11 stays partial. Graham et al. 2019 Table 7 supports the explicit zero-flow matrix. Existing BEV/plateau table-based equality conventions remain documented.

BTPS-to-STPD uptake conversion is unchanged. The November 2018 correction, DOI 10.1183/13993003.50016-2016, addresses separate ATPD-to-BTPS syringe QA and deletes an erroneous PAO2 expression. Those instrument paths are not simulated; no replacement or double correction was introduced.

## Verification

- Eight new source-gap regressions cover independent timing, asymmetric collection, legacy numeric hashes, BDR boundaries, zero-flow rejection, older-patient missing references and incomplete-sample SVG/reporting behavior.
- Focused integration: 43/43 passed; final targeted quiz/report/source checks: 27/27 passed. Additional scenario/report integration: 52/52 passed before final prose-only reconciliation. Independent R arithmetic passed.
- Full suite: 801/804 passed; the same three previously reproduced baseline failures remain: numerical identity across 2230 cases; 50 level-none byte identities; explicit level-none identity. Historical baseline fixtures were not regenerated. Only the separately identified source-corrected markup snapshot was refreshed for intentional v5 content.
- Build passed. Content/SVG/export tests exercise missing/qualified states. Native print-preview/download and interactive browser QA remain pending because Mac UI use is blocked by the locked machine and parent instruction. No unlock or download retry was attempted.

## Remaining scope

Current 41-group inventory: 20 source-text verified, 8 partial, 8 modeled, 5 coefficient/output blocked; 24 groups corrected on an overlapping axis. Groups 16 and 22 advance within their narrow source-backed scope; this does not promote synthetic waveform models. Eight partial groups remain: missing FRC/TLC ratio reference; legacy BDR equality; BEV equality; pediatric EOFE scope; ambiguous mixed DLCO grade rows/engineering tie policies; minimal/significant obstruction context for panting; corrected TLCO applicability; transgender reference choice.

Fixable measurement additions remain outside this checkpoint: post-expiratory FIVC quality assessment, pediatric support if the adult-only cohort is expanded, and a real instrument ATPD/temperature/humidity/CO2-removal/syringe QA pipeline if instrument inputs are added. A source-defined fault matrix does not validate a detector. Undefined mixed-failure mappings, tie/KCO aggregation policies and synthetic waveform/population parameters remain transparently modeled rather than mislabeled society algorithms.

Five numerical reference groups remain blocked by missing independently checked original coefficient resources and official-output fixtures; archived spline workbooks already exist and need not be requested again. The exact missing original resources are listed in `coefficient-source-request.md`. No official GLI output has been fabricated and no scientific population/model limitation has been removed.
