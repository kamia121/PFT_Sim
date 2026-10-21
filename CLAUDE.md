# Project instructions

PFT_Sim is an explicitly uncalibrated educational tool. It generates simulated pulmonary function reports for interpretation practice and shows how the same measured values are classified under different reference equations. It does not provide patient-treatment recommendations, and no validation claim is made that has not been run and recorded.

## Stack

Static site matching ARDS_sim: plain ES modules with JSDoc typedefs, `node --test` for tests, Node 22 or newer, no production dependencies, a pinned Playwright as the only development dependency for browser harnesses, `scripts/build.mjs` to `dist/`, and the same two GitHub Actions workflows deployed to GitHub Pages. Every case is a pure function of a descriptor (generator version, seed, archetype and any overridden inputs), and the descriptor is encoded in the URL so a case can be shared and reproduced without storage. A backend is considered only for saved learner responses or instructor dashboards. `SPEC.md` is the contract for the data model, archetypes, reference-equation resolution and interpretation table.

## Theme

Use the shared MCW green and navy tokens in `src/styles/tokens.css`, copied from ARDS_sim `theme.css`, which matches VA_coupling_sim `site/css/tokens.css`. All colors come from that file, in light and dark, including the dark monitor panels (`--mon-*`) used for flow-volume loops, volume-time traces and gas tracings. On screen the report sheets and figures follow the chosen theme through the `--paper-*` and `--fig-*` tokens (figures are drawn with `PAGE_PALETTE`, whose colors are those variables, so a theme change needs no redraw); in print the same tokens return to black on white, and exports and downloads use the named white palette. The theme script `src/ui/theme-boot.js` is a classic head script that owns the toggle, so the toggle works while the modules load and when a case cannot be built. Font is Source Sans 3. Series color encodes the quantity or reference equation, dash style encodes the relation (measured, predicted, LLN). Flag color is text only, never a fill, with one exception that the project physician requested on 2026-10-21: the z-score graphic follows the ATS 2017 sample report and is filled with a red-to-green gradient whose colors are the `--z-severe`, `--z-moderate`, `--z-mild` and `--z-ok` tokens; the band labels and the star carry the meaning without the color.

## Reference equations

Reference equations are resolved per measurement behind one interface, so GLI-2012 (group-specific), GLI Global (2022), GLI-2017 TLCO, GLI-2021 volumes and NHANES III can be swapped, and a measurement with no matching equation falls back to the closest available one with the fallback shown on the report line, as in routine laboratory practice. Port every table from the published coefficients and tables, never from `rspiro` source (GPL), and assert agreement in `node --test` against test vectors generated in R with `rspiro`. The GLI-derived data live in `src/reference/data/` under the notice in `src/reference/NOTICE` and are not covered by this repository's MIT license; regenerate them with `tools/extract-gli.py` and check them with `tools/crosscheck-interpreter.mjs`. The exact ERS license wording still has to be pasted into the notice.

## Interpretation logic

Coded ATS/ERS 2022 logic with the lower limit of normal at z = -1.645. Interpretation keys are deterministic functions of the values and the chosen equation. Classification flips between equations are reported explicitly, including borderline z-scores.

## Writing rules for site text

Follow the VA_coupling_sim `CLAUDE.md` writing rules. Paragraphs open on physiology, name each variable precisely with units, keep one formal register, and avoid meta-commentary about the page, aphoristic summaries, anthropomorphized instruments, and recitation of model outputs in prose. Values belong in tables and figures.

## Workflow

Run `npm test` and `npm run build` before committing, and browser QA after UI changes. Keep equations, parameters, test vectors and UI labels consistent. Changes to physiology require a stated source, a recorded numerical check, and an updated `SPEC.md`. For substantive physiology, interpretation, or learner-interaction changes, consult the actual Claude Opus 5.5 model with high reasoning and discuss the implementation plan before coding. Assess its recommendations critically and record which are accepted. Never commit credentials or patient data.
