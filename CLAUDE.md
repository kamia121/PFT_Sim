# Project instructions

PFT_Sim is an explicitly uncalibrated educational tool. It generates simulated pulmonary function reports for interpretation practice and shows how the same measured values are classified under different reference equations. It does not provide patient-treatment recommendations, and no validation claim is made that has not been run and recorded.

## Stack

Static site. TypeScript, Vite, vitest, no backend, no production dependencies without a clear need. Deployed to GitHub Pages. Every case is a pure function of a seed and archetype, and both are encoded in the URL so a case can be shared and reproduced without storage. A backend is considered only for saved learner responses or instructor dashboards.

## Theme

Use the shared MCW green and navy tokens in `src/styles/tokens.css`, copied from ARDS_sim `theme.css`, which matches VA_coupling_sim `site/css/tokens.css`. All colors come from that file, in light and dark, including the dark monitor panels (`--mon-*`) used for flow-volume loops, volume-time traces and gas tracings. Font is Source Sans 3. Series color encodes the quantity or reference equation, dash style encodes the relation (measured, predicted, LLN). Flag color is text only, never a fill. The diastolic grade ramp (`--g0` to `--g4`) in the file is specific to the heart project and can be removed or repurposed.

## Reference equations

Reference equations sit behind one interface so GLI-2012 (race-specific), GLI Global (2022), GLI-2017 TLCO, GLI-2021 volumes and NHANES III can be swapped. The shipped placeholder is labelled in the UI as a demonstration reference and must be replaced by the ported GLI tables before any release. Port every table from the published coefficients, and assert agreement to several decimal places in vitest against test vectors generated in R with `rspiro`. Check the GLI terms of use before redistributing tables in the public repository.

## Interpretation logic

Coded ATS/ERS 2022 logic with the lower limit of normal at z = -1.645. Interpretation keys are deterministic functions of the values and the chosen equation. Classification flips between equations are reported explicitly, including borderline z-scores.

## Writing rules for site text

Follow the VA_coupling_sim `CLAUDE.md` writing rules. Paragraphs open on physiology, name each variable precisely with units, keep one formal register, and avoid meta-commentary about the page, aphoristic summaries, anthropomorphized instruments, and recitation of model outputs in prose. Values belong in tables and figures.

## Workflow

Run `npm test` and `npm run build` before committing, and browser QA after UI changes. Keep equations, parameters, test vectors and UI labels consistent. Changes to physiology require a stated source, a recorded numerical check, and an updated `SPEC.md`. For substantive physiology, interpretation, or learner-interaction changes, consult the actual Claude Opus 5.5 model with high reasoning and discuss the implementation plan before coding. Assess its recommendations critically and record which are accepted. Never commit credentials or patient data.
