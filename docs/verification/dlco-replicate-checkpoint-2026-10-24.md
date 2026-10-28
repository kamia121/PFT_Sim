# Replicate DLCO and pleth review checkpoint

Continues `604ee60` on local `feature/advanced-case-puzzlers`. No push, merge, deployment, PR16/17 import, patient data or security/account change. This is an implementation checkpoint for independent review, not a claim that all reference equations or clinical signals are validated.

## Completed integration

New default cases use generator **4**. Explicit versions 2 and 3 retain their earlier single-test DLCO builder; version 2 retains legacy FRC-only reporting. Versioned case metadata, HTML, CSV, fixed/detail sheet footers, the practice footer and printable-page footer now follow the actual case descriptor. Existing exam codes still require their original generator version; this work does not claim compatibility with old exam-code formats.

`src/core/dlco-session.js` assesses explicit measured VI, DLCO, VA and quality criteria. It retains all matching interim Table 3 rows, selects the best eligible row, and does not invent a letter for unspecified mixed failures. Missing criteria remain unknown. A requires every acceptability criterion; numeric B/C/D columns cannot rescue an unassessed leak, unstable hold, missing clearance or other qualitative condition.

The low-VI A alternative uses the largest VA from OTHER acceptable maneuvers. Candidates must be connected by an acceptance chain to an independently acceptable root; neither a pair alone nor a mutually supporting pair with an unrelated A root can bootstrap acceptance. Final largest-other-VA checks still apply. Different valid acceptance sets are resolved by a documented deterministic policy; unresolved conflicting candidates are reviewed/unclassified. A completed B-only session may use qualified B fallback while explicitly retaining the unconfirmed A alternative; before completion it remains pending.

Session reporting prefers a repeatable A-only subset; inferior grades and A outliers do not enter that mean. After unsuccessful repeat testing, mean nonrepeatable A or a single A take precedence over B–D fallback. With no A, eligible B–D can be averaged with caution. F-only testing reports no DLCO. No session letter grade is asserted. The thresholds are 2 traditional units or the separately printed 0.67 SI units, with exact/adjacent fixtures.

`src/core/dlco-replicates.js` generates two to five deterministic synthetic acquisitions and stops when repeatable A results exist. It preserves each original trace, assessment and eligibility. Same-session VC comes from actual eligible forced or linked slow VC records, not a surrogate FVC adjustment, inspired VI, or latent physiology. Missing VC leaves the session pending without generating a substitute.

Reported DLCO, VA and VI average the same retained pool. Existing interpretation derives KCO as reported DLCO/mean VA; this aggregation convention is explicitly disclosed and is not claimed equivalent to averaging individual KCO. Timing/VI decisions use full precision; display rounding is separate. Individual maneuver values remain distinct from the session mean.

Missing/pending DLCO, VA and KCO remain null. Results print “not reportable”; there is no diffusion z-score, normal/abnormal label or severity. Practice scoring distinguishes attempted/unreportable testing from testing not performed. Reports, concise statements, narrative, session questions, scoring, figures, CSV/HTML and the printable page share the session status and selected measurements. The details page shows replicate values and, after release, interim rows and retained status. Basic review remains one study-level judgment, without mandatory grading of every maneuver.

## Four independent pleth review findings

1. Corrected 2023 Table 2: no-obstruction frequencies >1.5 through 2 Hz are usable with caution. Exact 0.5/1/1.5/2 boundaries and actual seed 10/normal/poor trial 4 at 1.681 Hz are regression-tested. There is no invented universal cutoff defining minimal versus significant obstruction; reduced-input context remains disclosed.
2. Reportable C/D/E/U volumes now receive a domain-specific concise qualification, separate from spirometry quality. Seed 11/normal/fair has pleth D and spirometry A/A and is covered.
3. V3+ linked traces now acquire IC from FRC to TLC, then expiratory SVC from TLC to RV, using the individual measured pair amplitudes. Explicit v2 retains its old diagram order.
4. Case generation version is used throughout artifact metadata and footers. HTML/print-rule/CSV tests cover versions 2, 3 and 4. Main and printable-page footer assignments also use the descriptor.

The parent's primary-source adjudication closed the retained eligible linked SVC pool question for RV. Discarded SVC and unrelated FVC are not substituted. Reduced-input scope and subset/tie preferences remain explicit.

## Evidence and verification

Primary measurement source reopened directly: Graham et al. *2017 ERS/ATS standards for single-breath carbon monoxide uptake in the lung*. Eur Respir J 2017;49:1600016. DOI https://doi.org/10.1183/13993003.00016-2016 . Acceptability/repeatability pp21–22, Table 3 p22 and Reporting values p25; original journal PDF https://www.sogapar.info/wp-content/uploads/2016/12/5.-Normativa-difusi%C3%B3n-ATS-2017.pdf . The 2018 measurement correction https://doi.org/10.1183/13993003.50016-2016 remains distinct from the 2020 GLI reference correction.

Corrected volume source reread: Bhakta et al., DOI https://doi.org/10.1183/13993003.01519-2022 ; Table 2 p17, linked acquisition Figure 2 pp4–5, corrected Tables 3–4/reporting pp18–19. Corrected journal PDF https://vvlr-afp.be/wp-content/uploads/2025/03/Standardisatie-rapport-long-volumes-2023.pdf .

- Full suite: **792 tests, 789 pass, the same three reproduced baseline hash failures**. `dlco-replicate-tests-2026-10-24.txt`.
- Focused pure core, product integration and four pleth regressions: **13/13 pass**. `dlco-replicate-focused-2026-10-24.txt`.
- Build: passes, `dlco-replicate-build-2026-10-24.txt`.
- Independent base-R arithmetic: passes, `tools/verify-dlco-session.R` and `dlco-replicate-r-2026-10-24.txt`. It checks the hand means, inferior/F exclusion arithmetic, other-VA boundary and SI threshold; it is not a second full clinical implementation or GLI oracle.
- Legacy single-trace geometry tests explicitly request v3. The new v4 integration tests cover retained reporting, qualified single A, unavailable classification/scoring/export/figures and missing-VC pending output. Historical baseline hash fixtures were not regenerated. The source-corrected markup snapshot was intentionally refreshed for current text/data.

## Browser QA and exact UI limitation

Used the user's **Chrome**, browser 1. A fresh QA tab loaded after the local preview server restarted (`npm start`, exec session 92638, returned running). No pending approval command is visible here.

V4 seed 3/normal/good showed two retained A records and the individual DLCO/VA/VI/timing values. The replicate table measured 744.8 px inside its 784 px container, without horizontal overflow. Screenshot `/tmp/pft-v4-replicates.png`.

Forced `dlco-valsalva`, seed 3/normal/good, showed DLCO/VA/KCO “not reportable”. “Attempted; not reportable” and “No reportable DLCO” were both graded correctly. Feedback kept the unclassified mixed-failure limitation explicit. Screenshot `/tmp/pft-v4-unavailable-feedback.png`.

The actual printable page loaded successfully, body ready=1, with three “not reportable” results, session unavailable and generator version 4. URL: http://127.0.0.1:5173/report.html?c=dj00JnM9MyZhPW5vcm1hbCZzYz1saWdodCZzaT1kbGNvLXZhbHNhbHZh&eq=GLIglobal&qd=adv .

The visible “Print or save as PDF” button was clicked once to inspect native preview. The mouse-event command timed out. Read-only inspection of Google Chrome then returned **“The Mac is locked and automatic unlock could not unlock it.”** Native preview completion is **uncertain**, not a confirmed pass; no final Print/Save command was issued. Do not repeat the preview action before the Mac is manually unlocked and its current state inspected. This is a technical block, not a permission denial. Code, content tests, static build and printable-page load are completed independently.

The previous CSV-download event remains uncertain. It was not retried; the earlier targeted Downloads check found no PFT artifact. Do not claim a successful native download. Export-content tests pass.

## Remaining review and source scope

- Focused independent review should check rooted alternative-acceptance sets, interim-row precedence, repeatable-subset ties and the disclosed KCO aggregation convention. These are engineering resolutions around source text that does not provide a complete general mixed-failure algorithm.
- Signal fault generation/recognition, clearance proxy, scatter and acquisition stopping probabilities remain synthetic teaching assumptions. The current acquisition model is classical/discrete sampling; criterion-level RGA inputs are supported, but a complete RGA instrument is not modeled.
- Rule group 22 still needs independent source verification of waveform timing and the 2018 gas-conversion assumptions. A published numeric cutoff test does not establish the full signal model.
- Primary coefficients/official outputs remain blocked exactly as in `coefficient-source-request.md`: printed Hall Table 3, corrected Stanojevic Table 2, Global original coefficient/supplement provenance and official calculator fixtures. Archived volume/corrected-TLCO spline workbooks already exist and must not be requested again. No known quota or publisher 403 was retried.
- Current 41-group audit: **18 verified source-text, 10 partial, 8 modeled, 5 blocked; 21 corrected** on the overlapping implementation axis. This is not an “all rules verified” or numerical GLI-validation claim.
- Actual Claude plan consultation for these measurement gaps was already completed in fresh PFT Simulator session https://claude.ai/code/session_01UouK3Nbz2WKgrTxVPfdTnM (Opus 5.5 High, Chrome); prior checkpoint records accepted/rejected recommendations. This commit is now ready for the parent's substantive independent code review; no new Claude review of this final diff is claimed.
