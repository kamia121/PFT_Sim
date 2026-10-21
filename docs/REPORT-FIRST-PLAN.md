# Report-first learner flow: plan and thread contract (draft for consultation)

Teaching simulator only. This file is the contract between the parallel threads. It follows the project physician's request of 2026-10-21 (photo of a vendor printout, "COMPLETE PULMONARY FUNCTION TESTING").

## What was asked

1. The report should look like the vendor printout: a one-page summary with the spirometry, lung volume and diffusing capacity tables on the left (reference, pre, percent predicted, post, percent change; airway resistance rows), a stack of small curves on the right, and the technologist's comment box at the bottom ending with "Official interpretation to follow."
2. The summary page shows the representative curves only: the representative flow-volume loop with pre and post, and the representative plethysmography (and DLCO) record. The other maneuvers, trials and tests go on a second, detailed page together with the plethysmography and DLCO curves.
3. The learner's interpretation goes on the report, not on a separate main page, and the report is presented first. The detailed report is the second page, and the case should sometimes make the learner open it, because the details are sometimes very different from the summary.
4. The technologist reports the grades (A, B, C, D, F and so on). A challenge is added in which the learner determines the quality of the PFT.
5. Possible challenges that would benefit learners are to be proposed, and some built, by parallel threads toward one common goal.

## Critical reading of the request

The vendor printout shows reference and percent predicted but no lower limit and no z-score. The interpretation standard the key follows (ATS/ERS 2022) is z-score based, and a learner who is given only percent predicted cannot apply it. The summary therefore keeps the printout's layout and adds an LLN column and a z-score to the tables; a percent-predicted-only variant is a possible later challenge (the limitation of the 80% rule), not the default. Abnormal values are printed in red bold as on the printout (flag color is text only); the ATS 2017 layout discourages binary flagging, and the summary page says nothing beyond what a laboratory prints.

"Sometimes very different" is the teaching point and also a risk. If the summary were allowed to hold values that differ from the details, the key (computed from the reported values) and the reported values would disagree. The design therefore never alters a reported number: the summary and the details always agree on every value. What differs is what the technologist says and shows: the quality statement can overstate the grade, can be generic ("acceptable and reproducible"), or can be missing; and the representative loop on page 1 can be a flawed maneuver, which a learner can notice because the loop does not reach the tabulated FVC. The details then show the grades and the maneuvers.

A summary page that displays the technologist's grade invites copying it. The quality challenge therefore hides the stated grades and the grade columns until the learner has answered, and scores the learner's grades against the grades the engine computes from the maneuvers.

## Design

### Page 1, the summary sheet

Letter portrait, one sheet. Heading "Complete pulmonary function testing" with the case identity line (age, sex, height, weight, reference equations, date) above it as on a laboratory printout. Left column, three tables: spirometry (FVC, FEV1, FEV1/FVC, PEF; columns Ref, LLN, Pre, Pre % pred, z, Post, Post % pred, % change), lung volumes (TLC, VC, IC, FRC pleth, ERV, RV, RV/TLC, Vtg, Raw, sRaw, Gaw, sGaw; columns Ref, LLN, ULN where relevant, Pre, % pred, z), diffusing capacity (DLCO, KCO, VA or IC_SB; Ref, LLN, Pre, % pred, z). Right column, three compact curves: the representative flow-volume loop (pre and post overlaid, the predicted expiratory curve dashed), the representative plethysmography record, and the DLCO tracing; each caption names the maneuver or trial shown (for example "Pre: maneuver 3 of 5"). Below the tables, the z-score severity strip (decided 2026-10-21 at the project physician's request: the page need not follow the printout exactly, but keeps z-scores and LLN and shows where the patient falls on the severity criteria): every index with a z-score on one axis from -5 to +3, a star for the result (pre and post stacked for the spirometric indices), and the bands of the ERS/ATS 2022 statement marked and labelled along the axis: within limits (z above -1.645), mild (-1.65 to -2.5), moderate (-2.5 to -4.0), severe (below -4.0); for the two-sided indices (TLC, RV, RV/TLC, DLCO, KCO) the upper limit +1.645 is also drawn. The statement applies these bands to all measures and says that severity of impairment is not necessarily disease severity; the strip carries that caption. The bands are drawn as labelled boundary lines with an alternating neutral tint from the page tokens, not as red, amber and green fills, because flag color is text only (CLAUDE.md) and a colored fill would turn a continuous variable into a traffic light. Bottom: the technologist comment box and the line "Official interpretation to follow." 

### Page 2, the detailed report

Every forced maneuver before and after the bronchodilator with its values, faults and (unless the quality challenge is on) its acceptability and grade; the separable flow-volume and volume-time panel (best, overlay, separate); every panting trial with its FRC, frequency and fault text, and the full plethysmography panel; the DLCO test or tests with the validity values and the gas-against-volume plot; the z-score strip; the technologist's detailed notes. The page is reached by a clearly labelled control. Whether the learner opened it before answering is recorded, and the feedback after the answers are checked says whether the details changed the answer for this case.

### The technologist's quality report (new, `src/core/rt-report.js`)

A deterministic function of the seed, the case and the technique level (new random stream `rt-report`; no existing stream is touched) that returns, for the case, the technologist's comment lines and the truth they are measured against. Honesty types: accurate (grades stated and correct), generic ("PFT data acceptable and reproducible" with no grades), optimistic (a good statement over a case whose computed grades are D or worse), and silent (no quality statement). Frequencies depend on the technique level and the encounter-scenario level and are teaching choices, not facts about laboratories. The comment lines also carry the medication line (agent given), the effort line, the hemoglobin availability line already produced by the scenarios, and "Official interpretation to follow."

```js
/** @typedef {object} RtReport
 * @property {1} version
 * @property {'accurate'|'generic'|'optimistic'|'silent'} honesty
 * @property {string[]} lines technologist comment lines in print order, ending with 'Official interpretation to follow.'
 * @property {{ pre: {fev1:string,fvc:string}|null, post: {fev1:string,fvc:string}|null, dlco: 'acceptable'|'not-acceptable'|null, pleth: string|null }} stated what the technologist wrote (null where nothing was stated)
 * @property {{ pre: {fev1:string,fvc:string}, post: {fev1:string,fvc:string}|null, dlco: {acceptable:boolean, reasons:string[]}|null, pleth: {grade:string, acceptable:boolean}|null }} truth the engine's computed grades
 * @property {{ pre: {index:number, kind:'best'|'flawed'}, post: {index:number, kind:'best'|'flawed'}|null, pleth: {trial:number, kind:'best'|'flawed'}|null, dlco: {test:number}|null }} representative maneuver, trial or test shown on page 1 (0-based index into case.spirometry.*.maneuvers and case.pleth.trials)
 * @property {boolean} detailsMatter true when the details change the answer (grades D or worse, an overstated statement, a flawed representative curve, a rejected trial or DLCO test)
 * @property {string[]} detailsReasons plain-language reasons, shown only after the answers are checked
 */
```

`buildCase` attaches the object as `case.rtReport`. DLCO and plethysmography are stated in words (acceptable, not acceptable, the FRC grade) and not with the letters of the 2017 DLCO table, because the simulator's own DLCO classes do not equal that table (see SPEC.md).

### Challenges (new, `src/challenges/`)

A challenge is a pure description of a question for a case: `buildChallenges(caseData, { rt, interp, qualityChallenge })` returns `{ id, title, prompt, options: [value, label][], key, why, needsDetails }[]`, and `scoreChallenge(item, answer)` returns `{ status: 'correct'|'wrong'|'unanswered', note }`. The practice page renders any list of challenges generically. Built in this round: (1) quality grades before the bronchodilator (FEV1, FVC; exists as a structured question and is moved into the challenge list) and after it, a DLCO acceptability question, a plethysmography FRC acceptability question; (2) "Is the technologist's statement consistent with the maneuvers?" (consistent, overstated, not stated); (3) "Is the loop on page 1 the best maneuver?" Proposed in `docs/challenges.md`, not built: the rest.

### The practice page

Report first. The toolbar keeps New case, test quality, technologist notes, tests, and gains "Quality challenge" (off, on, varies). The case area shows the summary sheet, then the control for the detailed page, then the interpretation box (the structured answers, the challenge items, an optional free-text impression, Check answers). After the answers are checked, the existing reveal follows (key, equation comparison, how the case was built), plus the quality feedback and the "did you need the details" line. The old card layout of the case (patient card, maneuver tables, figure cards) is removed from the default view; its tables and figures live on the two sheets. The separate Lab report tab becomes the print and download view of the same two sheets.

### The report page and the quiz

`report.html` prints the same two sheets (summary, then details, flowing); the interpretation box prints blank. The quiz chart adopts the summary sheet in a later round.

## Threads and file ownership

Each thread works in its own git worktree, first merges `origin/claude/tender-davinci-4afrwf`, edits only its files, commits, and does not push. Nobody edits `SPEC.md`, `tests/fixtures/*`, `src/ui/figures/index.js`, `src/core/case.js` (the integrator attaches `rtReport` and regenerates the fixtures) or `src/core/standards.js`.

| Thread | Owns | Does |
|---|---|---|
| RT | `src/core/rt-report.js`, `src/challenges/*`, tests | The technologist's report and its truth (types above), the challenge descriptions and scoring; a pure function of the case, so it runs under Node |
| SUMMARY | `src/sheets/summary.js`, `src/sheets/sheets.css`, `src/ui/figures/representative.js`, `src/ui/figures/z-strip.js` (the severity bands option `bands: true`, default on the summary sheet), tests | The page-1 sheet (tables with LLN, z and red out-of-range values; the three compact curves for the representative maneuver, trial and test named by `rtReport.representative`; the comment box); runs under Node and in the browser |
| DETAILS | `src/sheets/details.js`, `src/report-page/*`, `report.html`, `src/report/*`, tests | The page-2 sheet (all maneuvers, trials and tests; grades hidden when the quality challenge is on; the separable panels), the new page order of `report.html`, the print layout |
| PRACTICE | `index.html`, `src/app/*`, `styles.css`, `benchmarks/ui-smoke.mjs` | The report-first practice page, the interpretation box with the challenge items, the quality challenge toggle, scoring and feedback, the reveal |

The integrator (main thread) attaches `rtReport` in `case.js`, registers any new figure ids, regenerates the baseline fixtures once with the reason recorded, updates `SPEC.md`, and runs the browser checks. Threads develop against stubs of the interfaces above (a stub `rtReport` is in `tests/helpers/rt-stub.mjs`, owned by RT) until the integration.

## Acceptance

`npm test` and `npm run build` pass; the three browser smoke tests pass; a rendered image of page 1 and page 2 for six cases (normal, obstruction with a bronchodilator study, restriction, mixed, a poor-technique case with an overstated technologist statement, a spirometry-only case) is inspected; the summary and details agree on every number; the key is unchanged by the technologist's statement; with the quality challenge on, no grade or acceptability text appears in the page source before the answers are checked; the instructor copy still carries the key.
