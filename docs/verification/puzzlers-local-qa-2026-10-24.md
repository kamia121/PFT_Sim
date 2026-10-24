# Local case-puzzler verification

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
