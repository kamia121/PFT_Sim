# Local case-puzzler verification

## Final continuation verification

Four authored cases now pass the progressive-session tests. The last two are explicitly qualitative conditional exercises, not fabricated numerical GLI fixtures. Seven focused engine regressions test the source-corrected severity/volume/input rules and decimal boundary behavior. The full suite after core corrections is749 tests,746 pass,3 fail; the final run after the mobile-nearby-values change is also749 total,746 pass,3 fail. The exact three failures were independently reproduced in a **fresh detached checkout at9822a77**, with732 tests,729 pass,3 fail. `baseline-reproduction-2026-10-24.json` records that comparison. No failing generator baseline fixture was regenerated.

Current-source markup snapshots are separate in `tests/fixtures/source-corrected-markup.json`. Their deliberate changes are the corrected severity question/options, source-specific explanations and population notes. The original historical markup fixture remains untouched; so do the failing generator fixtures. These snapshots are not evidence of clinical validity.

`node tools/check-measured-isolation.mjs ../PFT_Sim-baseline9822` compared100 complete measured report objects across ten seeds and ten archetypes, all identical to the detached baseline. `measured-isolation-2026-10-24.txt` records the result; corrected interpretation keys/prose are intentionally outside that comparison. It is a representative isolation check, not an exhaustive numerical calibration claim.

Chrome continuation QA: the existing practice page loads, its new puzzler link is present, the revised severity options appear, and unconditional volume/DLCO derivation notes render. The new low-TLC case was completed through all stages using Space/Tab/Enter, with correct locked feedback, heading/feedback focus and final metadata/uncertainty/interpretation scores. The 390×844 mobile view was inspected after reload; data were repeated immediately above the question so learners do not have to scroll back past disclosures. Screenshot inspection showed the table, complete answer labels and both buttons within the narrow layout without visible horizontal clipping. Temporary viewport override reset. Desktop light and earlier dark layouts were inspected. Native case selection, versioned URL updates, restart and reload were verified. This is manual browser QA, not a claim of full assistive-technology or print certification.

CAPTCHA approval was received and ordinary authorized interaction attempted in Chrome. The official form returned `general_error: no recaptcha supplied. please complete the recaptcha check`; after normal reload its widget showed a site free-quota warning and returned unchecked after both AX and visible-coordinate clicks. No usable token/challenge or numerical output was obtained. This is a technical service blocker; permission is no longer pending. Exact synthetic attempted inputs and source requirements are in `coefficient-source-request.md`. No new publisher PDF/supplement was obtained during continuation.

## Initial prototype record (historical)

Branch `feature/advanced-case-puzzlers`, base `9822a77`; Node24.4.0. No push, PR, merge or deployment. Current remote main was inspected at `01fe8bc`, already containing PR17; no work from PR16/17 was imported.

* Unmodified base: `npm test`, 732 total,729 pass,3 fail.
* Feature: `npm test`,742 total,739 pass,3 fail. Exact same failure names: `numerical identity: every non-resistance value of 2230 cases (220 seeds x 10 archetypes, plus scenarios) is unchanged`; `50 cases built with scenario level none are byte-identical to the baseline commit (2ac98e3)`; `asking for level none explicitly changes nothing`. No fixtures regenerated. Baseline causes not repaired here.
* New tests:10/10 pass (`puzzlers.test.mjs`, `rule-boundaries.test.mjs`). Cover progression, scoring, denied transitions, immutable values, current and future feedback omission, source gates, unknown claims, rejection of authored reference outputs, HTML escaping, LMS inverse examples, strict BDR denominator/boundary, Hb/COHb and low-TLC despite normal-FVC regression.
* `npm run build`:pass, includes `puzzlers.html`.
* `git diff --check`:pass.
* `node tools/audit-rules.mjs`:reproduces `rule-inventory.json`, containing exported numeric criteria, source/status statements, comparison-line inventory and source hashes. It is an inventory, not a clinical oracle.
* Existing primary workbook script:exit0 against the locally available original workbook packet; details and hashes in `rule-source-audit.md` and `gli-workbook-rerun-2026-10-24.txt`.

Chrome manual QA, local `http://127.0.0.1:5173/puzzlers.html`:both cases completed through all three stages; correct feedback, locked answers, domain-specific final scores, fixed raw values, reset on case selection and restart. Keyboard semantic controls and focus movement on reveal/feedback checked through accessibility snapshots. Desktop dark screenshot inspected; mobile390×844 screenshot inspected with stacked data above questions and no visible horizontal overflow. Light mode toggle works. Temporary viewport reset to default. Earlier native-key selector attempts did not change selection; direct native select setValue succeeded and visibly updated URL/case, so that control was verified by native selection rather than a keyboard-only end-to-end run.

The feature makes no numerical GLI classification claim. Official calculator output verification remains pending; Chrome's form visibly requires CAPTCHA and reports a quota warning. No CAPTCHA attempt or API-key purchase. The original printed coefficient-table PDFs are not in the local verification zip. Remaining broad-rule discrepancies are listed in the audit, not silently called fixed.

Actual Claude consultation completed with Opus5.5/High under PFT Simulator in Chrome: https://claude.ai/code/session_01GZTU9WWmPzxJrqNfXkLgQ7 . No desktop PFT project was available per parent registry lookup, so the local checkout is in the delegated task workspace rather than another desktop project.

## Follow-up review QA

Used the user's **Chrome**, browser 3, against the same local server. The main practice page loads and shows the revised preserved-ratio option. The Method tab shows the inclusive Table 7 convention, procedural pause warning, explicit DLCO/FRC simulator-rubric limitations, and the accurate distinction between prior-transcription/archived-array agreement and independent printed-table verification. The Advanced case puzzlers link opens the authored cases. Choosing the reference-header check and checking the answer locks all choices, focuses the Supported explanation, and offers Reveal next context. No external publication or official calculator attempt was performed in this follow-up.

### Learner-feedback follow-up

Chrome, local seed 3/normal/fair/advanced review: opened the unscored key and confirmed “Subset qualifies (simulator rubric)” plus the displayed 9.35% reporting-set spread, missing linked-SVC/full-selection limitation and withheld overall ATS/ERS verdict. Fixed a desktop stacking issue that previously let the sticky answer pane cover this explanation; rendered-DOM center occlusion changed from true to false and the screenshot showed the complete qualification. Unit regressions also verify the qualification remains in correct-answer and unscored rendering paths. No temporary viewport override was used.
