# Clinical PFT report formats: research notes for PFT_Sim

Teaching simulator only; not for patient care. Compiled 2026-10-20 by a research thread; saved here by the main thread because the thread could not write the file. Every statement carries a source number; "(unverified)" marks anything not seen in a source text.

Evidence base: the only full, citable report layout is the ATS 2017 standardized-report statement (S1). The 2019 spirometry statement (S2) names it the default report form, and the 2022 interpretation standard (S3) recommends it. A real vendor printout (Vitalograph, S5) and a Canadian residency template (S4) corroborate it. No printouts from CareFusion/Vyaire, nSpire/MGC, COSMED, ndd or Morgan could be obtained.

## 1. Header fields

The ATS layout (S1 Fig 1) has a laboratory identity box on the left (name, address, phone, e-mail) and a ruled field grid on the right. S1: all reports begin with unambiguous identification (name, medical record number, sex, date of birth). Height to the nearest cm, weight, ethnicity and test date are essential. Smoking history, reason for test and referring physician are useful. SpO2 and barometric pressure are optional.

| Field | ATS 2017 sample (S1) | Vitalograph printout (S5) | Rules (S2, S3) |
|---|---|---|---|
| Name, ID/MRN | Name, ID | Patient name, Alternate ID | S1: required |
| Sex | Sex | "Sex at Birth" | S2: birth sex, not gender, drives prediction; if not disclosed, state the default used |
| Birth date, age | Birth date, Age (51) | Date of Birth, Age 40.90 | S2: age from dates, years to 1 decimal |
| Height | "69 in; 175 cm" | 186.0cm; 73.2in | S2: cm to 1 decimal, no shoes; S3: report must state any assumed height |
| Weight, BMI | 202 lb; 91.8 kg; BMI 30.0 kg/m2 | 96.0kg; 211.6lb; BMI 27.7 | S2: weight to nearest 0.5 kg |
| Reference group | "Ethnicity: Caucasian" | "Population: Caucasian"; "Predicted Set: GLI Caucasian" | S2 lists GLI categories; S3: report must name the equation per index |
| Smoking | Ex-smoker | Non Smoker | S1: useful |
| Referrer, reason | Referred by, Reason | not shown | S1: useful |
| Test date | Date of test with time | PERFORMED date and time, operator, SITE | S2: date and time of every maneuver recorded |
| Ambient conditions | Barometric pressure in DLCO footnote (Pb 721 mmHg) | Temperature 17.5 C; correction factor | S2: temperature to 1 C, results at BTPS; S1: pressure reported and corrected to 760 mmHg |
| Device, QC | not shown | Device name, serial, calibration date-time | none |
| SpO2 | SpO2 at rest 99% | not shown | S1: optional |

Altitude has no dedicated field in any source read. Technologist identity appears only as the operator under "PERFORMED" in S5.

## 2. Section order, columns, flags, footnotes

Section order (S1): spirometry, slow vital capacity and/or lung volumes, DLCO, then comments and interpretation.

| Block | Columns (in order) | Rows |
|---|---|---|
| Spirometry (S1) | Pre: Best, LLN, z-score, %Pred. Post: Best, z-score, %Pred, Change, %Chng | FVC (L), FEV1 (L), FEV1/FVC (decimal; %Pred cell blank), FET (s) |
| Spirometry (S5) | Best, LLN, Z-Score, %Pred, then per-maneuver columns with clock times | FVC, FEV1, FEV1/FVC, FEV1/VC, FET, PEF; then VC and IC |
| Lung volumes (S1) | Result, LLN, ULN, z-score, %Pred | TLC, VC, IC, FRC, ERV, RV, RV/TLC (%), Vtg (plethysmography) |
| DLCO (S1) | Result, LLN, z-score, %Pred | DLCO (unadjusted), DLCO at standard Pb, DLCO pred adj Hb, VA, TLCsb, VI/VC (%), KCO |

S1 design rules: measured value first, then LLN, then optional z-score, then %Pred; the predicted value itself is omitted; LLN is not repeated post-bronchodilator; change columns appear only for FEV1 and FVC; the word "percent" is reserved for percent predicted; the ratio is a decimal. S2 adds two-decimal reporting in liters and both absolute and percent change. S3 recommends the bronchodilator response as change expressed as a percentage of the predicted value (greater than 10%); its worked example gives 12.1% for FEV1 2.0 to 2.4 L with predicted 3.32 L.

Flagging: S1 says bold or colored fonts for values below LLN impose a binary decision on a continuous variable; its sample bolds the Best column and shows abnormality only on the z-score graphic. S5 prints no flags in the table.

Footnotes are one line under each block: spirometry (S1) "Reference values: GLI 2012 Test quality: Pre: FEV1 - A, FVC - A; Post: FEV1 - A, FVC - B"; slow VC "Reference values: VC - Gutierrez 2004; FEV1/VC - GLI 2012"; lung volumes "Test quality: QA met"; DLCO "Reference values: GLI 2017; Test quality: one grade A test; Pb: 721 mmHg". S5 adds a quality panel: FVC and FEV1 repeatability in L and %, letter grades, and counts of cough in the first second, slow start, no plateau, EOFE failures, FIVC-FVC failures and rejected blows.

## 3. Graph conventions

Flow-volume loop (S2, S1): expiratory flow is plotted upward and expiratory volume to the right, with a 2 L/s to 1 L aspect ratio; flow at least 5 mm per L/s (S1). The inspiratory limb is the lower, negative-flow half. In S1 the axes run about -6 to 8 L/s and -1 to 5 L, with a heavy vertical line at volume 0 marking the start. In S5 flow runs -4 to 14 L/s and volume -1 to 9 L, with tidal loops inside the main loop.

Volume-time (S2, S1): time on x, beginning at maximal inspiration or 1 s before time zero; volume scale at least 10 mm/L and time scale at least 20 mm/s. S1 shows -1 to 15 s; S5 shows -6 to 14 s with pre-maneuver tidal breathing.

Pre/post overlay: S1 draws pre in blue and post in red on both plots, with a legend. S2 notes that overlaying flow-volume curves aligned at maximal inspiration helps judge repeatability.

Predicted and LLN markers: S1 and S5 use a horizontal z-score strip per index, axis about -5 to +3, shaded red to yellow to green, heavy vertical lines at LLN (-1.64) and predicted (0). The result is a star, deliberately large to signal uncertainty near the LLN (S1). S1 stacks pre and post strips.

Slow VC (S1): volume vs time from -14 to 16 s with a tidal baseline, maximal inspiration and full expiration.

Lung volumes (S1 Fig 2): multibreath washout is plotted as N2 concentration (log scale) against expired volume. Plethysmography shows a box-pressure panel (converted to volume, 20 mL per division) as overlapping lines. Both are followed by stacked bars (RV, ERV, IC, normal range) for predicted and measured values. S1 shows no separate Raw loop. A 2023 lung-volume training deck (S8, secondary) gives: panting 0.5 to 1 Hz, closed overlapping straight-line loops with minimal thermal drift, three TGV values within 5% of the mean, Raw measured in a separate maneuver. The shutter-closure axes (box pressure on y against mouth pressure on x) are general knowledge, not read in a source (unverified).

DLCO (S1 Fig 3): CO and tracer (CH4) concentration on y against time (about 10 to 16 s) on x, with the sample window shaded; the caption says the 2017 standard requires concentration against exhaled volume instead. A z-score strip for DLCO, VA and KCO sits below the table.

## 4. Interpretation and technologist comments

Physician text: S1's sample is one line, "Moderately severe, partially reversible airflow obstruction.", followed by signer and an interpretation date that differs from the test date. S6 (2005) says an interpretation begins with a comment on test quality, then compares with reference values, patterns and prior results, and ends by answering the clinical question; a mere statement of which values are normal or low is unhelpful; DLCO reports should state any adjustment (VA, Hb, COHb, altitude). S3 moves to physiological classification rather than diagnosis; severity by z-score: mild -1.65 to -2.5, moderate -2.51 to -4, severe below -4.1; pattern names: obstruction, restriction, mixed, non-specific/PRISm, dysanapsis, hyperinflation, simple versus complex restriction; it also requires documenting the LLN used, caution near the LLN, and explicit notice when a reference equation changes (prior predicted values re-calculated and raw values compared). A pre-2022 template (S10) uses a fixed sentence: "There is a mild/moderate/severe obstructive ventilatory defect. The response to inhaled bronchodilator is significant with incomplete reversibility of airflow limitation."

Technologist comments: S2: operators pick from a drop-down plus free text (list in supplement E11, not opened). S1 sample: "No medications in past 24 hr. 400 mcg albuterol given for reversibility testing." S1 also requires comments to state whether reference values are race-adjusted and to flag extrapolation beyond the equation age range. A training deck (S9, probably paraphrasing E11, unverified) lists: "ATS repeatability standards for spirometry met"; "Early termination of expiration and no expiratory plateau"; "Very abrupt early termination of expiration; likely to be glottis closure"; "Cough in 1st second despite repeated efforts; FEV1 quality is suspect"; "Extrapolated volume greater than ATS allows; FEV1 may not be valid"; "The patient did not appear to understand spirometry instructions despite repeated attempts"; "The two largest FVCs/FEV1s were not repeatable". S9 advises against vague phrases ("poor effort", "gave good efforts and cooperation").

Grades (S1, S2): FVC and FEV1 are graded separately, pre and post separately: A at least 3 acceptable with the two largest within 0.150 L; B two acceptable within 0.150 L; C within 0.200 L; D within 0.250 L; E one acceptable (2019 also uses E for a difference above 0.250 L); U usable only; F none. S1 DLCO grades A to D use VI/VC (above 90% for A, above 85% B, above 80% C and D), breath-hold 8 to 12 s and sample collection under 4 to 5 s. S2: the operator should tell patients the grade reflects consistency of the blows, not lung health.

## 5. Page layout and export

S1: simple testing fits one page for the medical record, with a two-page option for longer interpretation. S5 is one page: logo and title banner with patient name box, field grid, loop and volume-time plots side by side with the z-score strip, tables, interpretation rows, and a footer with software version, SIGNATURE line, DATE line, "PAGE 1 / 1" and a printed timestamp; it prints "Computer interpretations cannot be relied upon for diagnosis" beside the automatic text. S1's sample ends with a boxed comments area (technician left, interpretation right) and a signer with an interpretation date. S2: the interpreter must be able to see all maneuvers; exports should include a PDF of the printed report and discrete data (HL7 CDA R2 or FHIR, LOINC-coded). Design inferences (not sourced) for a slide-ready export: keep the 2:1 flow-volume aspect, one figure per panel, the footnote line per block, and the equation, LLN and quality statements on the same page as the numbers.

## 6. What the 2019 and 2022 statements say a report must state

| Requirement | Source |
|---|---|
| Results at BTPS; ambient temperature recorded; pressure reported and corrected for DLCO | S2, S1 |
| Age, height, weight, birth sex, ethnicity; if sex or ethnicity undisclosed, state the default used for prediction | S2 |
| Largest FVC and FEV1 pre and post; FEV1/FVC from those; absolute and percent change post | S2 |
| FEV1, FVC graded separately, pre and post; operator comments; date and time of each maneuver | S2 |
| Default report form is the ATS standard form; default reference set GLI | S2 |
| Reference equation named for each index; caution when equations are mixed across indices | S3 |
| Equation change documented; prior predicted values re-calculated; unknown height, sex or ancestry stated as an assumption | S3 |
| LLN definition documented (5th percentile default; z = -1.645) | S3 |
| Quality described; poorer tests interpreted with more uncertainty | S3 |
| DLCO predicted adjusted for Hb, and the adjustment stated | S1, S6 |
| Race-neutral approach (GLI Global) recommended; standard scripts on reports when the equation changes | S7 (2023 ATS statement) |

## Unverified or conflicting

- No vendor printouts were obtained for Vyaire/CareFusion SentrySuite, nSpire/MGC Breeze, COSMED Omnia, ndd EasyOne or Morgan. Vitalograph (S5) is the only vendor sample read.
- S1 internal inconsistency: pre FVC 3.90 L to post 4.70 L is printed as a change of "600 mL", but the difference is 800 mL (the printed 20% matches 800 mL). Do not copy that cell.
- S1 reports change as a percentage of baseline; S3 recommends percentage of predicted. Show both.
- S1 uses "moderately severe"; S3 replaced the five-level FEV1 %pred scheme with three z-score levels. Use S3.
- Race and ethnicity: S1 and S2 require a group field and GLI group equations; S3 still uses ancestry-specific GLI equations when known; S7 recommends race-neutral GLI Global. A "reference group" header field plus an explicit equation label serves all three.
- ULN: S1's z-strip and S3 imply ULN near +1.645; a Brazilian explainer (S11) uses +-1.96 for two-sided variables. Choose one and state it.
- Plethysmography panel axes and any Raw loop display are not shown in any source read. Altitude as a header field is not sourced. Blue pre and red post come from S1 only.
- The E11 comment list and S1 Figs E1, E2 were not accessible. S8 and S9 are training decks, not standards. The 0.12 s time-to-peak-flow cut in S9 does not appear in the 2019 text; treat it as lab-specific. S10 uses pre-2022 criteria; use only for phrasing.
- The 2017 ERS/ATS DLCO standard was not opened. The exhaled-volume tracing claim comes from the S1 caption.

## Sources

- S1. Culver BH et al. Recommendations for a Standardized Pulmonary Function Report. Am J Respir Crit Care Med 2017;196:1463-72. https://panafricanthoracic.org/wp-content/uploads/2024/04/Culver_standardized-pulmonary-function-report_erj2017.pdf (DOI 10.1164/rccm.201710-1981ST). Header fields, columns, graphs, grading, footnotes, sample interpretation.
- S2. Graham BL et al. Standardization of Spirometry 2019 Update. Am J Respir Crit Care Med 2019;200:e70. https://pmc.ncbi.nlm.nih.gov/articles/6794117 (DOI 10.1164/rccm.201908-1590ST). Required report content, display rules, grading, export.
- S3. Stanojevic S et al. ERS/ATS technical standard on interpretive strategies for routine lung function tests. Eur Respir J 2022;60:2101499. https://www.aarc.org/wp-content/uploads/2026/06/ers-ats-pft-interpretation-statement.pdf (DOI 10.1183/13993003.01499-2021). Reporting must-states, severity, bronchodilator response, patterns.
- S4. Royal College of Physicians and Surgeons of Canada, adult PFT template. https://royalcollege.ca/content/dam/documents/ibd/respirology/respirology_adult_pft_template_e.pdf. Header and column layout.
- S5. Vitalograph sample FVC Full Report (Pneumotrac). https://vitalograph.com/storage/uploads/64292ee5-b4e5-46e8-a449-4a8b0c11fe02/FVCFullReport.pdf. Vendor header, plots, quality panel, footer.
- S6. Pellegrino R et al. Interpretative strategies for lung function tests. Eur Respir J 2005;26:948-68. https://dme.childrenshospital.org/wp-content/uploads/2019/06/Interpretative-strategies-for-lung-function-tests.pdf. Interpretation structure; DLCO adjustment statement.
- S7. Bhakta NR et al. Race and Ethnicity in Pulmonary Function Test Interpretation: An Official ATS Statement. https://pmc.ncbi.nlm.nih.gov/articles/PMC10112445/. Race-neutral recommendation and report scripts.
- S8. Lung Volume Updates 2023 (training deck). https://respiratoryassociates.com/wp-content/uploads/2026/05/Lung-Volume-Updates-2023.pdf. Plethysmography acceptability (secondary).
- S9. Bedside Spirometry slide handout. https://respiratoryassociates.com/wp-content/uploads/2026/03/Bedside-Spirometry-Slide-Handout.pdf. Operator comment examples (secondary).
- S10. Liang J et al., MJA 2018 appendix 1. https://www.mja.com.au/sites/default/files/issues/208_01/10.5694mja17.00664_Appendix%201.pdf. Template interpretation sentences (pre-2022).
- S11. Calculating the statistical limits of normal and Z-scores for pulmonary function tests. J Bras Pneumol 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9262439. LLN and ULN z cutoffs.
