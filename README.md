# PFT Sim

Simulated pulmonary function reports for interpretation practice. Each case has a known ground truth, a recorded set of forced maneuvers with ATS/ERS 2019 quality grading, lung volumes and diffusing capacity, and a key computed from the values on the report. The same values are shown under GLI-2012 and GLI Global so that reclassification between reference equations is visible.

This is an uncalibrated educational tool. It does not provide patient-treatment recommendations and must not be used for clinical decisions. `SPEC.md` is the contract for the data model, archetypes, reference-equation resolution and interpretation logic, and lists every rule that has not been checked against its primary source. `CLAUDE.md` holds the project rules.

## Run locally

Install Node.js 22 or newer. In this folder:

```sh
npm test
npm start
```

Open http://127.0.0.1:5173. Do not open `index.html` with `file://`, because the page loads its reference tables over HTTP. `npm run build` writes the static site to `dist/`.

Browser check (Chromium; set `PFT_CHROMIUM` to an executable if Playwright's own download is not installed):

```sh
npm install
node benchmarks/ui-smoke.mjs
node benchmarks/report-smoke.mjs
node benchmarks/quiz-smoke.mjs
node benchmarks/interaction-smoke.mjs   # real pointer and keyboard input, phone width, printed PDFs (pdftotext is used when installed)
```

Other tools: `tools/constraint-sweep.mjs` checks the exact constraints over many seeds, `tools/extract-gli.py` rebuilds the reference JSON from the GLI workbooks, `tools/crosscheck-interpreter.mjs` compares it with another implementation, and `scripts/make-vectors.R` regenerates the rspiro test vectors.

## Experimental written-impression check (off by default)

An opt-in prototype reads the optional written impression locally and lists, after a scored check, which short standard statements match the key, which are contradicted or not mentioned, and which need review. It is **experimental, unreliable and not for trainee assessment**: it failed a fresh independent phrasing set (see `docs/written-grader/EVALUATION.md`), it abstains often, it gives no score, and nothing leaves the page. It is off unless the address carries `written=1`; with the switch off the page, its label and its network requests are unchanged. `docs/written-grader/SUPPORTED.md` lists the bounded grammar; `node tools/eval-written.mjs <set.json>` evaluates a labelled phrasing set; `PFT_SERVE_DIR=dist node benchmarks/written-smoke.mjs` is the browser privacy and event check.

## Licensing

The code is MIT licensed. The reference data in `src/reference/data/` derive from the Global Lung Function Initiative lookup tables and are covered by the notice in `src/reference/NOTICE`, not by the MIT license. Commercial use of the GLI data requires permission from the European Respiratory Society.
