#!/usr/bin/env node
/**
 * Cross-checks the ported GLI data against the independent implementation in pft_interpreter.
 *   1. Its lookup tables (spirometry, volumes, DLCO), which are rounded to 4 decimals, against the splines read from the GLI workbooks.
 *   2. Its GLI Global spirometry coefficients (calculations.js) against the coefficient strings in the Global workbook.
 * Volume and TLCO coefficients are not checked here: the workbooks do not contain them, so pft_interpreter is their only source.
 * Usage: node tools/crosscheck-interpreter.mjs PFT_INTERPRETER_DIR
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const data = (f) => JSON.parse(fs.readFileSync(new URL(`../src/reference/data/${f}`, import.meta.url), 'utf8'));
const theirs = (rel) => JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', rel), 'utf8'));
const report = [];

function compareSplines(label, mine, other) {
  const idx = new Map(mine.age.map((a, i) => [a, i]));
  let n = 0, maxM = 0, maxS = 0, missing = 0;
  const entries = Array.isArray(other) ? other.map((e) => [e.age, e.mspline ?? e.m, e.sspline ?? e.s]) : Object.entries(other).map(([a, e]) => [Number(a), e.m, e.s]);
  for (const [age, m, s] of entries) {
    const i = idx.get(Number(age));
    if (i === undefined) { missing++; continue; }
    n++;
    maxM = Math.max(maxM, Math.abs(mine.m[i] - m));
    if (s !== undefined) maxS = Math.max(maxS, Math.abs(mine.s[i] - s));
  }
  report.push({ label, compared: n, notInWorkbook: missing, maxAbsDiffM: maxM, maxAbsDiffS: maxS });
}

const sets = [
  ['gli_global.json', 'spirometry', { fev1: 'fev1', fvc: 'fvc', fev1_fvc: 'fev1_fvc' }],
  ['gli_volumes.json', 'lung-volumes', { tlc: 'tlc', rv: 'rv', vc: 'vc', ic: 'ic', erv: 'erv', frc: 'frc', rv_tlc: 'rv_tlc' }],
  ['gli_tlco.json', 'dlco', { dlco: 'dlco', kco: 'kco', va: 'va' }],
];
for (const [file, dir, measures] of sets) {
  const d = data(file).measures;
  for (const [measure, name] of Object.entries(measures)) for (const sex of ['male', 'female']) {
    const p = path.join(root, 'src', 'data', dir, `${sex}_${name}.json`);
    if (!fs.existsSync(p)) { report.push({ label: `${file} ${measure} ${sex}`, error: 'no table in pft_interpreter' }); continue; }
    compareSplines(`${file} ${measure} ${sex}`, d[measure][sex].splines, JSON.parse(fs.readFileSync(p, 'utf8')));
  }
}

// Global spirometry coefficients: pft_interpreter calculations.js versus workbook-derived coefficients.
const calc = fs.readFileSync(path.join(root, 'src', 'js', 'calculations.js'), 'utf8');
const getlms = calc.slice(calc.indexOf('function getLMS'), calc.indexOf('// Calculate predicted value'));
const predFn = calc.slice(calc.indexOf('function calculatePredicted'), calc.indexOf('// Calculate Z-score'));
const num = (s) => Number(s.replace(/\s/g, ''));
const g = data('gli_global.json').measures;
for (const sex of ['male', 'female']) {
  const sec = sex === 'male' ? predFn.slice(predFn.indexOf("genderLower === 'male'"), predFn.indexOf("genderLower === 'female'")) : predFn.slice(predFn.indexOf("genderLower === 'female'"));
  for (const t of ['fev1', 'fvc', 'fev1_fvc']) {
    const m = sec.match(new RegExp(`case '${t}':\\s*pred = Math\\.exp\\(([-\\d.]+) ([+-] [\\d.]+) \\* Math\\.log\\(height_cm\\) ([+-] [\\d.]+) \\* Math\\.log\\(age\\) \\+ m_spline`));
    const mine = g[t][sex].m;
    const ok = m && num(m[1]) === mine.const && num(m[2]) === mine.htLn && num(m[3]) === mine.ageLn;
    report.push({ label: `global M coefficients ${t} ${sex}`, equal: Boolean(ok), theirs: m && [m[1], m[2], m[3]], mine: [mine.const, mine.htLn, mine.ageLn] });
    const gs = getlms.slice(sex === 'male' ? getlms.indexOf("g === 'male'") : getlms.indexOf('// Female'));
    const sm = gs.match(new RegExp(`type === '${t}'\\) \\{ s = Math\\.exp\\(([-\\d.]+) ([+-] [\\d.]+) \\* Math\\.log\\(age\\) \\+ s_spline`));
    const ms = g[t][sex].s;
    report.push({ label: `global S coefficients ${t} ${sex}`, equal: Boolean(sm && num(sm[1]) === ms.const && num(sm[2]) === ms.ageLn) });
  }
}
console.table(report.map((r) => ({ ...r, theirs: undefined, mine: undefined })));
// pft_interpreter stores its spline tables rounded to 4 decimals, so differences up to 5e-5 are rounding, not disagreement.
const ROUNDING_BOUND = 5e-5 + 1e-9;
const bad = report.filter((r) => r.error || r.equal === false || r.maxAbsDiffM > ROUNDING_BOUND || r.maxAbsDiffS > ROUNDING_BOUND);
console.log(bad.length ? `${bad.length} item(s) need attention` : 'all spline differences are within 4-decimal rounding (5e-5) and all Global coefficient sets are equal');
process.exit(bad.length ? 1 : 0);
