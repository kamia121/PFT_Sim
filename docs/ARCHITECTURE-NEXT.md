# Feature rollout: interfaces and ownership

This file is the contract between the parallel implementation threads. A thread edits only the files it owns, reads everything, and treats the interfaces below as fixed. Anything that must change in someone else's file is reported in the thread's final message for the integrator.

Research inputs (read before coding): `docs/research/report-formats.md`, `docs/research/scenarios.md`, `docs/research/pleth-dlco.md`. Each marks claims with evidence grades and lists what is unverified; unverified numbers may be used for teaching realism only if the UI or code says so (same rule as `src/core/standards.js`).

## Rules for every thread

Follow `CLAUDE.md` (writing rules for site text: physiology first, units named, formal register, no meta-commentary, values in tables). Plain ES modules, JSDoc typedefs, no production dependencies. Every module gets `node --test` tests under `tests/`; run `npm test` and `npm run build` before committing. The cases are pure functions of the descriptor and seed: use `createStream(seed, name)` from `src/core/prng.js` with a new, unique stream name per feature so existing cases do not change. Do not edit `src/reference/`, `src/core/prng.js`, `src/core/standards.js`, `tests/vectors/`. Mark every clinical constant that was not checked against a primary source (`verification: 'unverified' | 'secondary'`). Educational only: no treatment recommendations. Commit on your own branch in your worktree; do not push and do not open pull requests.

## Existing structure (do not break)

`buildCase(descriptor, datasets)` in `src/core/case.js` returns `{ descriptor, groundTruth, truth, spirometry: { pre, post }, volumes, dlco, report, anchorKey }`. `interpret(report, resolve, equation)` in `src/interpret/interpret.js` returns the key. Figures currently live in `src/ui/figures.js` and use CSS variables; they are being replaced by palette-based figures (below). The learner site is `index.html` with `src/app/`.

## Shared interfaces

### Palettes and figure functions (`src/ui/palettes.js` exists)

Every figure is a pure function `render(data, { palette, width = 640, height = 360, title, description }) => string` returning a complete, self-contained `<svg>` (xmlns, viewBox, `<title>`, `<desc>`, inline `fill`/`stroke` attributes from the palette, font-family from `FONT_STACK`, no CSS variables, no external references). `palette.background === null` means no background rectangle. Registry in `src/ui/figures/index.js`:

```js
export const FIGURES = { 'flow-volume': {...}, 'volume-time': {...}, 'pleth-shutter': {...}, 'pleth-raw': {...}, 'dlco-trace': {...} };
// each entry: { id, title, render(data, opts), dataFor(caseData) -> data | null }
```

`dataFor` returns null when the case lacks that test. The page shows figures with the `dark` palette. `src/ui/svg-export.js` (thread FIG-B): `standaloneSvg(svgString)` (adds XML declaration), `svgVariants(figureId, data) -> { [paletteId]: svgString }` for all four palettes, `downloadSvg(filename, svgString)`; filenames like `pft-flow-volume-<seedcode>-<paletteId>.svg`.

### Case additions

Optional fields added to the case object; consumers must tolerate their absence.

```js
case.scenario = {
  level: 'none' | 'light' | 'moderate' | 'heavy',
  ids: string[],
  statements: [{ id, category, text }],        // technologist or intake notes shown before the report
  technologistComments: string[],              // lines for the report's comment box
  caveats: [{ id, text, weight: 'major' | 'minor' }],     // what a careful interpreter should state
  decoyCaveats: [{ id, text }],                // plausible but not applicable here
  preTest: { lastSabaHours?, lastLabaHours?, lastSmokingHours?, lastExerciseHours?, notes? },
  height: { statedCm, trueCm, source: 'measured' | 'arm-span' | 'ulna' | 'reported', note },
  referenceSex: { used: 'M' | 'F', birth: 'M' | 'F', note },
  coHbPercent: number | null,
}
case.pleth = Pleth            // thread FIG-A; null when no volumes
case.dlcoTrace = DlcoTrace    // thread FIG-A; null when no DLCO
maneuver.inspiratory = { t: number[], v: number[], f: number[], fivc: number, pif: number, flags: string[] }  // thread FIG-B, attached by the integrator
report.patient.heightCm = height used for the reference (stated height); case.scenario.height.trueCm is what the lungs were generated from.
```

### Report model (thread REPORT)

`buildReportModel(caseData, interp, { equation, palette?, includeKey: false }) -> { header: {fields: [{label, value}]}, sections: [{ id, title, tables: [{ id, caption, columns: [{key,label,unit?,align?}], rows: object[], footnote }], figures: string[], notes: string[] }], technologistComments: string[], interpretation: string | null, footer: {...} }`. Plain JSON, no HTML. `src/report/html.js` renders it; `src/report/export.js` renders CSV, TSV and clipboard HTML from the same tables so the three can never disagree.

### Narrative (thread NARR)

`composeNarrative({ caseData, interp, cmp, seed }) -> { sections: [{ id, title, text }], finalStatement: string, findings: [{ id, text }], distractors: [{ id, text, flaw }] }`. `seed` selects among phrasing variants through `createStream(seed, 'narrative')` so wording changes between cases. `finalStatement` is 3 to 6 sentences of physiology-first prose (quality, pattern and severity, volumes, diffusing capacity, bronchodilator response, reference-equation sensitivity near limits, stated limitations from `case.scenario.caveats`). `distractors` are plausible but wrong final statements, each tagged with the flaw (wrong severity, pattern asserted without TLC, ignored quality problem, omitted caveat, reference-equation change ignored, and so on).

### Quiz (thread QUIZ)

Separate page `quiz.html` plus `src/quiz/`. It imports `buildCase`, `interpret`, `compareEquations`, the figure registry and, through `src/quiz/adapters.js`, the scenario and narrative modules when present (dynamic import with graceful fallback until integration).

## Ownership

| Thread | Branch | Owns |
|---|---|---|
| FIG-A | `feat/pleth-dlco` | `src/core/pleth.js`, `src/core/dlco-trace.js`, `src/ui/figures/pleth-shutter.js`, `pleth-raw.js`, `dlco-trace.js`, tests |
| FIG-B | `feat/figures-export` | `src/core/inspiratory.js`, `src/ui/figures/index.js`, `flow-volume.js`, `volume-time.js`, `src/ui/svg-export.js`, `src/app/figure-downloads.js`, the figure block in `src/app/render.js`, removal of `src/ui/figures.js` |
| REPORT | `feat/report` | `src/report/`, `src/export/` if needed, report tab wiring in `index.html`, `src/app/main.js`, `styles.css` (additive only) |
| SCEN | `feat/scenarios` | `src/scenarios/`, `src/core/case.js`, `src/core/descriptor.js`, `src/core/maneuver.js`, `src/core/physiology.js`, `src/core/quality.js` |
| NARR | `feat/narrative` | `src/interpret/narrative.js`, tests |
| QUIZ | `feat/quiz` | `quiz.html`, `quiz.css`, `src/quiz/`, `benchmarks/quiz-smoke.mjs`, `scripts/build.mjs` (add the new files) |

The integrator wires `buildPleth`, `buildDlcoTrace` and `buildInspiratory` into `case.js` after merging, replaces the independent FRC noise with the plethysmography replicate mean, and connects the narrative and scenarios to the quiz.
