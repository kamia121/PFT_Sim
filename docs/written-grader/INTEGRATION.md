# Written-impression check: integration

## What the prototype touches

- `index.html`: one stylesheet link (`src/written/written.css`).
- `src/app/main.js`: imports only `src/written/enable.js`; the rest loads lazily when the address carries `written=1`. One snapshot is taken inside `checkAnswers`, on the scored branch only; `render()` reads the snapshot. No change to `loadCase`, `practiceContext`, `buildFeedback` or the tally. A new case replaces the case object, which retires the snapshot without a reset hook.
- `src/app/practice-view.js`: one hook in `comparisonHtml` (`ctx.writtenHtml`) and the impression label (`ctx.writtenEnabled`).
- Nothing in `src/quiz`, `src/report`, `src/report-page`, `src/challenges`, `src/core` or `src/interpret` imports the grader; tests assert this. Quiz scoring and the structured tally are unchanged, and the quiz has no free-text item.

## Against the other open branches (no edits were made to them)

- **PR9 (Basic/Advanced quality), head `d04cdb75f3b213ed3b87887961797feb3631788f`.** Basic can Check directly at stage 1 with an optional statement; Advanced keeps its statement gate; "Show the key without scoring" locks without adding to the tally. The grader depends on none of that: it needs an explicit scored action (`scored === true` and the check reached stage 3) and ignores which gate allowed the check. The text it reads is `state.responses.impression`, which PR9 leaves untouched. Expected merge friction is textual only: PR9 edits `main.js` near `createStage`/`checkAnswers`/`loadCase` and `practice-view.js` near the quality notes; this branch's hunks are in `render()`, `checkAnswers` (inside the scored branch), the state object, `boot()` (before `loadDatasets`), `comparisonHtml` and the impression label line. A rebase after PR9 merges should need at most trivial conflict resolution; re-run `tests/written-integration.test.mjs`, whose static checks pin the single call site.
- **PR8 (dark mode)**: the stylesheet uses only tokens from `src/styles/tokens.css`, so it follows the theme; no theme code is touched. Changing the theme does not regrade (tested in the browser harness).
- **Mobile overflow**: the feedback section wraps long text (`overflow-wrap:anywhere`) and the harness checks 390 px for horizontal overflow; if the other branch changes the interpretation box layout, re-run `benchmarks/written-smoke.mjs`.

## Requirements for anyone enabling it for learners (not met today)

1. A phrasing evaluation on a fresh set with zero confirmed false credits and false accusations, and independent adjudication, run against code frozen beforehand.
2. A decision on the structured bronchodilator key for a post study that was performed but has a missing post FEV₁: `answers.js` scores "Not performed" correct there, which the written check deliberately does not (found while building this; not changed, to preserve structured grading).
3. The composed summary shown beside the written feedback (`src/report/concise.js`) prints "COHb was not measured; recent smoking could lower the DLCO" after checking; the written check itself never mentions COHb status, so reconcile the two before relying on the "no unmeasured COHb leak" rule.
4. A separately approved model-assisted extraction benchmark, if a model is ever considered (none is used or downloaded here).
