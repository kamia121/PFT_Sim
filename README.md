# PFT Sim

Creation of a PFT generator to help display the differences of reference equations and how these changes change how one can interpret PFTs. Seeded simulated cases with a known ground truth, a recorded maneuver set with acceptability and quality grading, and, in later versions, the same measured values interpreted under different reference equations with every reclassification attributed to the measurement that caused it.

This is an uncalibrated educational tool. It does not provide patient-treatment recommendations. `SPEC.md` is the contract for the data model and interpretation logic; `CLAUDE.md` holds the project rules.

## Run locally

Install Node.js 22 or newer. In this folder:

```sh
npm test
npm start
```

Open http://127.0.0.1:5173. Do not open `index.html` with `file://`. `npm run build` writes the static site to `dist/`.

## Licensing

The code is MIT licensed. GLI reference-equation tables are not included, and when they are added they may carry their own license and notice; see `SPEC.md`.
