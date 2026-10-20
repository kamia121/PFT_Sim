# Report page and figure redesign: plan and thread contract

Status: draft for consultation. Teaching simulator only.

## Why

The individual figures read as stand-alone plots, not as parts of a laboratory printout. Reviewing the deployed site against `docs/research/report-formats.md` (ATS 2017 standardized report, Vitalograph printout) found these defects.

Flow-volume loop: all 3 to 8 replicate expiratory curves are overlaid with inspiratory limbs that end in vertical spikes; predicted and LLN curves are schematic only; the curve fills a 6.4 by 1 aspect so the shape is not the 2 L/s : 1 L shape that real printouts use; there is no tidal loop, PEF marker or FEV1 tick. Volume-time: the FEV1 and plateau annotations overlap the curve, and the pre-test tidal trace is a decoy wave, not tidal breathing.
Plethysmography: the shutter display overlays every trial on one line so the trial numbers collide and the slope is not readable; the Raw (flow against box pressure) loop has kinks at the zero crossings and an upper-limit line that dominates the plot; no figure shows what a plethysmograph report is built around, the volume-time record (tidal breathing, shutter closure with panting, open shutter, slow expiration to RV, inspiration to TLC) from which FRC, ERV, IC and TLC are read; the lung-volume partition (RV, ERV, IC against predicted and LLN) is missing. Z-score strip: the result is a filled circle; the ATS 2017 sample uses a deliberately large star, and shows pre and post stacked.
Report: one long column inside the practice page; no figures beside the tables they belong to; not a separate page that can be opened, printed and shared.

## Deliverables

1. `report.html`: a separate page (built to `dist/report.html`, linked from the practice page and the quiz) that renders one case as a laboratory printout on Letter pages. Address: the same descriptor query as the practice page (`?c=<code>` or `?v=1&s=..&a=..`), plus `eq=` for the spirometry equation and `copy=student|instructor`. The student copy carries no answer key; the instructor copy adds quality grades, the interpretation statement and the verification notes. Screen layout is paper-like; print layout is exactly three pages (page 1 identification, spirometry table beside the spirometry panel, z-score summary; page 2 lung volumes and DLCO with their panels; page 3 technologist comments, interpretation box, signature lines). Buttons: print or save as PDF, CSV, standalone HTML, per-panel SVG in four palettes, copy table. No scripts or external resources in the standalone HTML download.
2. Combined figure panels (registry entries, same `{ id, title, render, dataFor }` contract as `src/ui/figures/index.js`, four palettes, self-contained SVG):
   - `panel-spirometry`: flow-volume loop (left, 2 L/s per 1 L aspect) and volume-time curve (right), pre and post best curves only, the other acceptable maneuvers as a faint overlay when requested, predicted and LLN loops as dashed and dotted, tidal loop, PEF and FEV1 markers, back-extrapolation and plateau annotation placed outside the curve.
   - `panel-pleth`: (A) volume-time record of the whole maneuver with the shutter-closure segment marked and TLC, FRC, ERV, IC, RV read from it; (B) shutter-closure shift loops, one line per trial, slopes labelled outside the plot; (C) Raw loop, flow against box pressure, with the zero-flow tangent; (D) stacked partition bars (RV, ERV, IC) for measured, predicted and LLN, as in ATS 2017 Fig 2. Layout adapts when the case has no pleth.
   - `panel-dlco`: the existing two-plot single-breath display, cleaned up, with the validity values (VI/VC, breath-hold time, sample volume) in a table strip below.
   - `z-strip`: star marker for the result as in ATS 2017, pre and post stacked where a post-bronchodilator study exists.
   The existing individual figures stay registered for the practice page and for download.
3. The practice page's Lab report tab becomes a preview plus an "Open full report" link; the quiz item review links the same page.

## Physiology constraints

The reported numbers do not change: `src/core/pleth.js` may gain a tidal and closure timeline trace and smoother Raw loops, but FRC from the shutter slopes, sRaw and Raw, and every value in `case.report`, must be reproduced exactly (the baseline hashes in `tests/fixtures/baseline-case-hashes.json` stay valid, or are regenerated with a stated reason). Raw loop morphology follows resistance: near-linear and narrow when airway resistance is normal, open and scooped (S-shaped, higher slope at low flow) with flow limitation, with a phase-lag opening that depends on panting frequency. Source for each morphology rule is stated in `docs/pleth-dlco-model.md` and marked verified, secondary or unverified, as in `src/core/standards.js`.

## Threads and file ownership

Each thread works in its own git worktree, merges `claude/tender-davinci-4afrwf` first, edits only its files, does not edit `src/ui/figures/index.js` (the integrator registers panels), commits, does not push.

| Thread | Owns | Does |
|---|---|---|
| SPIRO | `src/ui/figures/panel-spirometry.js`, `flow-volume.js`, `volume-time.js`, tests `tests/panel-spirometry.test.mjs` | Spirometry panel; repairs the flow-volume and volume-time defects above |
| PLETH | `src/ui/figures/panel-pleth.js`, `pleth-shutter.js`, `pleth-raw.js`, `src/core/pleth.js`, `docs/pleth-dlco-model.md`, tests | Pleth panel; timeline trace; Raw loop morphology; numerical identity check |
| SUMMARY | `src/ui/figures/panel-dlco.js`, `dlco-trace.js`, `z-strip.js`, `src/ui/figures/volume-bars.js` | DLCO panel, z-strip stars and pre/post stacking, partition bars (exported for PLETH to call: `volumeBars(data, { palette, width, height })` returns an SVG fragment string and its size) |
| PAGE | `report.html`, `report.css` (new page chrome), `src/report-page/*`, `src/report/html.js`, `src/report/report.css`, `scripts/build.mjs`, `benchmarks/report-smoke.mjs`, tests | The separate page, print layout, instructor and student copies, downloads, links from `index.html` and `quiz.html` (the links are the only edits to those files) |

Interface for panels: `render(data, { palette, width = 960, height, title, description, showQuality = false, showReplicates = false })`; `dataFor(caseData)` returns null when the case lacks the test. Panel SVGs are one `<svg>`; their sub-plots are `<g>` groups with `data-subplot` attributes. PAGE develops against the existing figures first and swaps panels in at integration.

## Acceptance

`npm test` and `npm run build` pass; `benchmarks/report-smoke.mjs` loads `report.html` for six cases (normal, obstruction with post-BD, restriction, mixed, a spirometry-only case, a full-panel case with a heavy scenario) at desktop and 390 px widths with no overflow, prints to a three-page PDF, and contains no answer-key text in the student copy; the four palettes of every panel are well formed and self-contained; a visual check of rendered PNGs by the integrator.
