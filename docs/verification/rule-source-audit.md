# Interpretation and reference rule audit

Audit started 2026-10-24 against `9822a77`. This is an inventory and verification queue, not a declaration that all rules are verified. Existing comments sometimes disagree about verification status; preserve that uncertainty until the cited primary text has been inspected. No disclaimer is removed by this inventory.

## Evidence gates

1. Primary text/table and version inspected, with locator and provenance recorded.
2. Rule transcribed accurately, including equality, denominator, units, applicability and exceptions.
3. Reproducible tests cover typical and boundary inputs independently of the implementation.
4. For reference tables, coefficients AND splines checked, then LMS/units/interpolation/range checked against authoritative numerical outputs.
5. Population transportability and generator calibration remain separate questions even if 1–4 pass.

## Rule-to-source matrix (baseline behavior; continuation corrections below)

| Rule / implementation | Current behavior and equality | Primary target | Existing tests / remaining gap |
|---|---|---|---|
| Limits, `interpret/interpret.js`, `reference/gli.js` | low z < −1.645; high z > +1.645; equality normal | ERS/ATS 2022 Table 1; GLI LMS definitions | `interpret`, `gli`, `two-sided`; rounded cutoff convention vs exact 5th percentile must be explicit |
| Borderline, `interpret/interpret.js` | within ±0.25 z inclusive of either limit | Project teaching convention | `interpret`; not a society diagnostic band |
| Obstruction | FEV1/FVC below LLN | ERS/ATS 2022 Fig 8 / interpretation algorithm | `interpret`, `quiz-adapters`, interpretation fixture; exact branch/source audit pending |
| Restriction / mixed | TLC below LLN; mixed also ratio low | ERS/ATS 2022 Fig 8 / volume algorithm | `interpret`; no FVC-only diagnosis of restriction |
| Preserved ratio / low spirometry | low FVC OR FEV1; normal TLC → nonspecific; no TLC → PRISm | ERS/ATS 2022 text / Fig 8 | `interpret`; terminology/FEV1-only branch needs primary confirmation |
| Hyperinflation | TLC > ULN | ERS/ATS 2022 volume interpretation | `interpret`; definition explicitly unverified in engine |
| Air trapping | RV > ULN OR RV/TLC > ULN | ERS/ATS 2022 volume interpretation | `interpret`; definition explicitly unverified; do not infer disease from flag alone |
| Severity | mild z ≥ −2.5, moderate ≥ −4, severe below −4 | ERS/ATS 2022 Table 1 / Fig 7, text rounding | `severity-2022`, `severity-boundary-scoring`; obstruction-only score; normal FEV1 not graded |
| Severity accepted alternatives | printed −1.65..−1.64, −2.51..−2.50, −4.10..−4.00 admit neighbor | Project rounding/scoring choice | `severity-boundary-scoring`; wide final interval must not be represented as a physiological boundary |
| BDR 2022 | 100 × (post−pre) / predicted PRE reference; >10 in either FEV1 or FVC; equality negative | ERS/ATS 2022 Table 1 | `interpret`, `bd-2005-display`; dedicated hand fixtures added separately; floating boundary review |
| BDR 2005 | ≥12% baseline AND ≥0.200 L in the same variable; OR across variables | Pellegrino 2005 BDR text | `interpret`, `bd-2005-display`; verify published equality wording before changing |
| BDR discordance marker | opposite signs OR absolute difference >8 percentage points | Project convention | `interpret`; not diagnostic criterion |
| DLCO low/normal/high | z limits; VA/KCO subtype and VA/TLC ratio | ERS/ATS 2022 Fig 11 | `interpret`; subtype/severity rules not fully verified; unscored |
| Quality limits | D/E/U/F qualify interpretation | Project policy grounded in quality standard | `quality-review`, `challenges-items`; grade does not itself prove uninterpretable |
| BEV acceptability | BEV < max(0.100 L, 5% FVC); equality rejected | Graham 2019 Table 7 | `quality`; primary recheck of exact comparison needed |
| Maneuver faults | cough affects FEV1; glottic closure <1 s both; ≥1 s FVC; leak/mouthpiece spoil acceptability but remain usable | Graham 2019 Table 7 | `quality`, `scenarios.apply`; full acceptability vs usability matrix audit pending |
| Pause at TLC | >2 s invalidates FEV1 acceptability | Graham 2019 text; project's scoring extrapolation | `quality`, `scenarios.fixes`; distinguish observation from categorical criterion |
| EOFE | plateau <0.025 L OR FET ≥15 s OR FVC within 0.150 L of largest in set | Graham 2019 EOFE text / Table 7 | `quality`; verify preceding/subsequent-maneuver conditions; 1 s plateau window generated, not passed to evaluator |
| Spirometry grades | A ≥3 acceptable and spread ≤0.150; B ≥2 ≤0.150; C ≤0.200; D ≤0.250; E one or larger spread; U usable only; F none | Graham 2019 Table 10, adult | `quality`; pediatric criteria not implemented |
| Reported maxima | largest acceptable FEV1 and FVC separately, else usable; FVC raised to FEV1 if maxima conflict | Graham 2019 reporting; last clamp is model policy | `quality`, `rt-invariant`; clamp needs explicit provenance, not primary assertion |
| DLCO inspired volume | ≥90% VC; 85–90% fails absent concordant VA; <85% invalid | Graham 2017 acceptability table | `dlco-trace`; alternative VA concordance not implemented; one test, no replicate repeatability |
| DLCO timings | breath hold 8–12 s inclusive; sample complete ≤4 s; t85 ≥4 s noted only | Graham 2017 acceptability table | `dlco-trace`; compare categorical consequences to original table |
| DLCO washout/sample | washout 0.75–1 L, 0.5 L if VC <2; sample 0.5–1 L, allowance VC <1.1 L | Graham 2017 | `dlco-trace`; 1.1 L intentionally differs from cited <1 L; simulated contamination >3% is a convention |
| DLCO grades A–D | A all, B slow inspiration, C failure, D invalid | Project convention, not published 2017 letter table | `dlco-trace`, `challenges-items`; retain limitation |
| Hb adjustment | predicted multiplier 1.7Hb/(10.22+Hb), male ≥15 y; 9.38 otherwise; measured adjustment reciprocal | Graham 2017 eqs 31–33 | `dlco-reference`, `scenarios.fixes`; verify unit g/dL and sex/age input; coefficient sex is not gender identity |
| COHb reference adjustment | above 2%: (102−COHb)/100 on predicted; none at ≤2 | Graham 2017 eq 37 | `dlco-reference`; simulator measured effect uses 1.5% baseline and 1% slope, separate teaching model; eq38 not simulated |
| Pleth panting | 0.5–1 Hz, tolerated to 1.5 if no obstruction; modeled pressure/thermal faults | Bhakta 2023 lung-volume standard | `pleth`; source text/table pending; amplitudes are teaching choices |
| Pleth repeatability | (max−min)/mean ≤5%; best subset; C ≤10%; mean acceptable FRC | Bhakta 2023 grading/reporting table | `pleth`; verify denominator, subset/reporting policy and all grade letters |
| Pleth grades D/E/U/F | one acceptable D; outside 10% E; usable only U; none F | Project placeholders | `pleth`; not verified society grades |
| Resistance | Raw=sRaw/FRC; sRaw upper 1.2 kPa·s; slope fitting and curve morphology | Original resistance references + pleth standard | `pleth-loop`, `panel-pleth`; universal ULN and synthetic morphology unverified |
| GLI LMS | z=((x/M)^L−1)/(LS), L=0 log; inverse limits; linear quarter-year spline interpolation | Quanjer 2012 / Bowerman Global / Hall2021 / corrected Stanojevic2017 | `gli`, `vectors`, `dlco-reference`; authoritative off-grid and inversion outputs still needed |
| GLI2012 group terms | 5 requisition codes; spirometry only | Quanjer 2012 supplement | `gli`, 2664 rspiro vectors; independent agreement is not coefficient provenance |
| GLI Global | race-neutral spirometry only | Bowerman Global original paper and workbook; ATS2023 | `gli`, `vectors`; coefficient version/hash audit pending |
| GLI2021 volumes | European-ancestry derivation; no race multiplier; RV/TLC in percent | Hall2021 Table 3 + workbook | `gli`, `dlco-reference`; original printed table and complete spline recheck needed |
| GLI2017 TLCO | traditional units; corrected2020 both sexes; includes DLCO/KCO/VA | Stanojevic 2020 correction Table 2 + corrected SI/traditional workbooks | `dlco-reference`; original 2017 supplement alone insufficient; provenance JSON records corrected workbook hashes |
| Reference range | below min unavailable; above max clamp to final age; TLCO cap 85 despite workbook to90 | Each source's applicability text | `gli`, `dlco-reference`; clamping is project fallback, not validation outside age range |
| Sex input | M male, every other input female in resolver | Reference tables / ERS/ATS 2022 transgender text | `gli`, `scenarios.fixes`; missing/invalid input guard gap; never infer identity from binary coefficient field |
| Equation comparison | same measured values; only spirometry family changes, TLC/DLCO fixed | ATS2023 + method contract | `interpret`, `scenarios.fixes`; no fictional GLI2012 lung-volume comparison |
| Race-neutral use / discordance | no race multipliers for TLC/DLCO; care when mixed reference populations disagree | ATS2023 https://pmc.ncbi.nlm.nih.gov/articles/PMC10112445/ | Primary supplied by research and opened in this audit; numerical population validation remains distinct |
| Transgender context | appropriate reference equation uncertain; identify actual input and limitations | ERS/ATS2022 reference-equation section | Primary finding supplied by parent research; full locator pending; no hormone-duration switch rule |
| Scenario caveat grades, study judgment, quiz partial credit | weighted caveats; severe-quality/panel policy; neighbor severity partial scores | Project educational conventions | `quiz-scoring`, `challenges-items`, `quality-review`; not society diagnostic rules |

## Reference provenance and reproducibility

`src/reference/sources.json` records source URLs and SHA-256; `tools/extract-gli.py` extracts workbooks. `tools/verify-gli-primary.py` contains a prior printed-table transcription, including the corrected 2020 TLCO coefficients. Its packet folder contains provenance and facts, not the source PDFs/workbooks. A recorded comparison does not close independent visual transcription verification, interpolation, age handling, LMS behavior or official-output checks. `tests/vectors/rspiro-vectors.csv` supplies 2664 independent spirometry outputs, not official calculator outputs and not volume/TLCO coefficient verification.

Required authoritative inputs: Hall2021 Table 3 (PDF page 5) and supplementary workbook; 2020 correction to Stanojevic2017, corrected Table 2 (PDF page 2), both corrected workbooks; official calculator cases for both sexes, boundary/off-grid ages, DLCO/KCO units, volume ratios. No CAPTCHA or access control is bypassed. Record source failure precisely if encountered. The public calculator's information identifies the correction dated 25 September 2020, per the parent research worker.

The pure mathematical fixtures in `tests/fixtures/rule-boundaries.json` test implementation semantics using hand inputs. They are deliberately marked implementation-only; passing them does not upgrade this matrix to verified-primary.

## Dated evidence update and discrepancies still requiring implementation

The parent research worker subsequently delivered a primary-source appendix, reporting direct reading of the original journal PDF and indexed errata. This closes some *rule-text* questions above; it does not make the implementation or numerical references validated. Local Codex also opened the 2022 journal PDF at https://vvlr-afp.be/wp-content/uploads/2025/03/ERS-ATS-technical-standard-on-interpretive-strategies-for-routine-lung-function-tests_ERJ_2021.pdf . Source-status reader attribution must remain explicit.

| Finding | Exact primary location supplied | Current implementation / required work |
|---|---|---|
| Obstruction, restriction, mixed and nonspecific definitions | 2022 Figure8 p17, Table5 p18, pp18–19, Figure10 p21, p22 | Broad branches agree. New regression confirms normal FVC cannot override available low TLC; passes. PRISm terminology still needs careful scope. |
| Volume interpretation uses RV/TLC and FRC/TLC upper limits | 2022 Table7 p22 | Existing TLC-only hyperinflation and RV-or-RV/TLC trapping flags are not a full implementation of the source algorithm. Review with context, not a one-line flag rename; FRC/TLC is not currently resolved. |
| BDR denominator is predicted and strict >10 | 2022 Box1 p11 | Existing rule matches; new hand fixtures cover exact/below/above 10 independently of GLI outputs. |
| Normal FEV1 with low ratio is mild obstructive impairment | Authors' 2024 reply, DOI 10.1183/13993003.00055-2024 | Existing `FEV1_NORMAL` key and its question options/quiz prose/concise and narrative statements conflict. Source worker verified directly in indexed publisher text; local publisher fetch returned 403. A coordinated correction must change engine, scoring, displayed explanations and tests; not silently remove only the disclaimer. |
| FEV1/TLC/DLCO grade obstruction/restriction/diffusion respectively | Same 2024 reply; 2022 Figure7 | Current restriction severity unscored; DLCO severity marked unverified. Must distinguish physiological impairment from disease severity; continuous bin equality is a documented engineering resolution of rounded prose. |
| Separate pre/post and FEV1/FVC quality; lower than A not automatically uninterpretable | Graham2019 Tables7/10 | Existing adult grades mostly match intended cutoffs; exact 3.45−3.30 L is 0.15000000000000036 in JS, which can misgrade B as C. Need decimal/precision policy before changing generated-case behavior. |
| DLCO repeats average ≥2 acceptable measurements within 2 traditional units | Graham2017 Table3 / repeatability p22 | Current model has one trace, so it cannot claim a reportable repeatability assessment; no new replicate algorithm added. |
| Hb uses predicted multiplier with g/dL and sex/age branch | Graham2017 eqs31–32 p23 | Reciprocal measured correction is algebraically equivalent, tested. Do not apply both. Unknown Hb is not invented. |
| 2018 measurement erratum distinct from 2020 GLI reference erratum | DOI 10.1183/13993003.50016-2016 | Audit `dlco-trace.js` syringe-VA ATPD→BTPS and alveolar-oxygen assumptions against the corrected standard; no claim this was completed. |
| Corrected volume linked-spirometry criteria and method-specific repeatability | Bhakta2023 Tables3–4 p18, Table7 p20; November2023 erratum DOI 10.1183/13993003.51519-2022 | Existing FRC grade placeholders and linked TLC/RV reporting do not implement the full corrected scheme. No pediatric/MBW/helium algorithms added merely to enlarge scope. Corrected adult SVC ≥FVC−0.150 L acceptable, ≥FVC−0.250 L usable; pediatric comparison must be transcribed before coding. |
| General obstruction vs COPD-specific fixed post-BD ratio | GOLD/GLI2026 DOI 10.1183/13993003.02574-2025, Box1 | Current general LLN engine should not silently become a COPD diagnostic algorithm. |

### Workbook rerun actually completed

Local packet: `/Users/kurthu/Documents/GLI_primary_verification_packet.zip` (read-only). Extracted into `/tmp/pft-gli-primary-packet`. Temporary Python environment with openpyxl3.1.5; command:

```
/tmp/pft-audit-venv/bin/python tools/verify-gli-primary.py /tmp/pft-gli-primary-packet
```

Exit0. All 14 volume sex/measure spline sheets (301 ages each) and all 6 corrected TLCO sex/measure sheets (341 ages each) matched, maximum absolute difference0. Coefficients matched the *existing transcription*, not a new independent inspection of the printed tables. Log: `gli-workbook-rerun-2026-10-24.txt`. SHA-256 values matched `src/reference/sources.json`:

* Hall workbook: `00552cae54afd5b5342f7749222170235dc528fede365bc2871fb57c07e35742`
* Corrected TLCO SI: `dd0504212540164da6b10f669e27f898b4729c8cff1d558f52b79bc5a2aa0b3d`
* Corrected TLCO traditional: `fb72d9399fc135964d6abdacea4c31e3843ab46889ab37235a9b8564e6c01b11`

Original URLs are under `https://publications.ersnet.org/content/erj/57/3/2000289/DC1/embed/inline-supplementary-material-2.xlsx` and `/content/erj/50/3/1700010/DC1/embed/inline-supplementary-material-2.xlsx` (SI), `-3.xlsx` (traditional). Local workbooks close the previous inability to rerun spline comparison. They do not close print transcription, GLI2012/Global original coefficient provenance, or official-output validation. Current official calculator documentation was opened at https://gli-calculator.ersnet.org/docs.html; the Chrome form at https://gli-calculator.ersnet.org/ visibly requires CAPTCHA, with a quota warning. No challenge was attempted, no API key acquired, no output fixtures invented.

Minimal assistance if public retrieval remains blocked: supply Hall2021 Table3 PDF page5 and worked example; corrected Stanojevic2020 Table2 PDF page2; Bowerman Global TableE3 plus original lookup workbook; official exported calculator fixtures including inputs/units/equation/date/predicted/limits/z. The volume and corrected TLCO spline workbooks themselves are already available locally and need not be requested again.

## Implemented continuation after the source handoff

Ten semantic rule groups now have corrections: volume/hyperinflation flags; trapping context; severity grading; rounded-score alternatives; exact-decimal BDR equality; quality-grade floating boundaries; explicit reference-sex validation; population provenance on every report; transgender reference-input wording; and qualified KCO/VA explanations. Source-rule tests and connected practice, quiz and narrative explanations were updated together. Hb's obsolete “not checked” quiz sentence was replaced only after its specific primary-equation gap was closed; numerical reference and calibration limitations remain. Sources and tests for the corrected rules are in `tests/verified-rule-corrections.test.mjs` and the updated interpretation/severity tests.

The machine-readable status file `rule-audit-status.json` counts **41 semantic groups**: **16 verified-rule-text**, **10 partially verified**, **10 modeled heuristics**, **5 blocked on complete coefficient or official-output validation**. The **10 corrected groups overlap** those source categories. This is not a count of every individual generator constant; `rule-inventory.json` separately records comparison lines, exported criteria and source hashes. Neither artifact permits a claim that all rules or numerical models are fully validated.

Current corrected behavior supersedes the baseline table for these groups: obstruction with normal FEV1 is mild; TLC grades restriction; DLCO grades diffusion impairment; mixed/nonspecific has no single composite grade; only printed −2.50/−4.00 gets a neighbor-scoring allowance; high TLC alone is not hyperinflation; elevated RV/TLC in restriction is qualified; the source's missing FRC/TLC reference is acknowledged. The machine-precision numerical allowance resolves binary subtraction only and does not round reported values or expand clinical limits. A missing/unknown reference-sex field now throws, while a documented M/F coefficient input remains distinct from gender identity.

The old FVC-maxima clamp, individual DLCO letters, single-test DLCO model, pleth placeholder grades, panting/amplitude constants, age fallback policy and some scenario effect sizes remain explicitly modeled or partially verified. No new replicate DLCO, pediatric lung-volume or dilution algorithm was added just because a source discusses it. The normal reference-input guidance cannot validate a transgender individual's physiology; the new authored puzzlers bypass the generator entirely.

Exact source citations/download locations, packet dates, what transcription matching does and does not prove, and the **post-approval CAPTCHA technical error** are in `coefficient-source-request.md`. Permission to solve CAPTCHA is no longer a blocker. No official numerical result was obtained; the widget returned unchecked with its site-quota warning after authorized normal interaction. No new original publisher files were acquired during this continuation.
