/**
 * The case as a laboratory chart: demographics with the sex used for the reference, height and its
 * source, weight, requisition group, the reference equation for each index, smoking status,
 * technologist and intake notes, the maneuver table, the figures, lung volumes, DLCO and the
 * bronchodilator study. The existing renderers in src/app/render.js are reused as they are.
 */
import * as R from '../app/render.js';
import { esc, num, EQUATION_NAMES } from '../app/format.js';
import { createStream } from '../core/prng.js';
import { figuresFor } from './adapters.js';
import { fallbackStatements } from './fallbacks.js';
import { pick } from './shuffle.js';

const HEIGHT_SOURCE = { measured: 'measured', 'arm-span': 'estimated from arm span', ulna: 'estimated from ulna length', reported: 'patient-reported' };
const SEX_NAME = { M: 'Male', F: 'Female' };
const SPIRO_FIGS = ['flow-volume', 'volume-time', 'z-strip'];
const VOLUME_FIGS = ['pleth-shutter', 'pleth-raw'];
const DLCO_FIGS = ['dlco-trace'];

/** Requisition group as it might read on a chart; the "other" set is also what a blank field falls to. */
export function groupDisplay(group, seed) {
  if (group === 'Other or mixed') return pick(['Other or mixed', 'Other', 'Not recorded (the “other or mixed” reference set applies)'], seed, 'quiz-group-display');
  return group;
}

/** Smoking status for context. It is drawn independently of the simulated physiology. */
export function smokingStatus(age, seed, lastSmokingHours = null) {
  const rng = createStream(seed, 'quiz-chart');
  const u = rng.uniform();
  const cap = Math.max(3, Math.round((age - 16) * 1.2));
  const packs = rng.int(2, Math.min(45, cap));
  const quit = rng.int(1, Math.max(1, Math.min(30, age - 20)));
  if (u < 0.5) return 'Never smoker';
  if (u < 0.8) return `Former smoker, ${packs} pack-years, stopped ${quit} year${quit === 1 ? '' : 's'} ago`;
  return `Current smoker, ${packs} pack-years${Number.isFinite(lastSmokingHours) ? `; last smoked ${lastSmokingHours} h before the test` : ''}`;
}

function equationRows(a) {
  const rows = [];
  const line = (names, label) => {
    const have = names.map((n) => a.measures[n]).filter(Boolean);
    if (!have.length) return;
    const m = have[0];
    const name = EQUATION_NAMES[m.equationId] ?? m.equationId;
    const fallback = have.some((x) => x.available !== false && x.matched === false);
    rows.push(`<tr><th scope="row" class="l">${label}</th><td class="l">${esc(name)}</td><td class="l">${fallback ? '<span class="flag">European equation applied</span> (no equation exists for the group on the requisition)' : 'matches the patient'}</td></tr>`);
  };
  line(['fev1', 'fvc', 'fev1_fvc'], 'FEV₁, FVC, FEV₁/FVC');
  line(['tlc', 'rv', 'rv_tlc', 'vc', 'frc', 'erv', 'ic'], 'TLC, RV, RV/TLC, VC, FRC, ERV, IC');
  line(['dlco', 'va', 'kco'], 'DLCO, VA, KCO');
  return `<div class="scroll"><table class="data"><caption>Reference equation for each index</caption><thead><tr><th class="l">Index</th><th class="l">Equation</th><th class="l">Applicability</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function preTestLines(pt) {
  if (!pt) return [];
  const out = [];
  if (Number.isFinite(pt.lastSabaHours)) out.push(`Short-acting bronchodilator taken ${pt.lastSabaHours} h before the test`);
  if (Number.isFinite(pt.lastLabaHours)) out.push(`Long-acting bronchodilator taken ${pt.lastLabaHours} h before the test`);
  if (Number.isFinite(pt.lastExerciseHours)) out.push(`Vigorous exercise ${pt.lastExerciseHours} h before the test`);
  if (pt.notes) out.push(String(pt.notes));
  return out;
}

export function renderHeader(prep, { equation = prep.equation } = {}) {
  const c = prep.caseData, p = c.report.patient, d = c.descriptor, sc = c.scenario ?? null;
  const seed = d.seed;
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  const sexNote = sc?.referenceSex && sc.referenceSex.birth !== sc.referenceSex.used
    ? `<div><dt>Sex assigned at birth</dt><dd>${SEX_NAME[sc.referenceSex.birth] ?? esc(sc.referenceSex.birth)}${sc.referenceSex.note ? `<br><span class="muted">${esc(sc.referenceSex.note)}</span>` : ''}</dd></div>` : '';
  const hs = sc?.height ? (HEIGHT_SOURCE[sc.height.source] ?? esc(sc.height.source)) : 'measured, stadiometer';
  const heightNote = sc?.height?.note ? `<br><span class="muted">${esc(sc.height.note)}</span>` : '';
  const level = prep.descriptor.scenarioLevel ?? 'none';
  const statements = Array.isArray(sc?.statements) && sc.statements.length ? sc.statements.map((s) => s.text) : fallbackStatements(seed, level).map((s) => s.text);
  const comments = Array.isArray(sc?.technologistComments) ? sc.technologistComments : [];
  const notes = [...statements, ...comments, ...preTestLines(sc?.preTest)];
  const tests = d.panel === 'full' ? `Spirometry${c.spirometry.post ? ' with bronchodilator' : ''}, lung volumes, DLCO` : `Spirometry${c.spirometry.post ? ' with bronchodilator' : ''}`;
  const groupNote = equation === 'GLI2012' ? 'selects the GLI-2012 group equation' : 'not an input to GLI Global';
  return `<section class="card" aria-labelledby="h-patient"><h2 id="h-patient">Patient and requisition</h2>
  <dl class="demo">
    <div><dt>Age</dt><dd>${p.age} years</dd></div>
    <div><dt>Sex used for the reference</dt><dd>${SEX_NAME[p.sex]}</dd></div>
    ${sexNote}
    <div><dt>Height used</dt><dd>${num(p.heightCm, 1)} cm<br><span class="muted">${hs}</span>${heightNote}</dd></div>
    <div><dt>Weight</dt><dd>${p.weightKg} kg (BMI ${num(bmi, 1)} kg/m²)</dd></div>
    <div><dt>Group on requisition</dt><dd>${esc(groupDisplay(p.group, seed))}<br><span class="muted">${groupNote}</span></dd></div>
    <div><dt>Smoking</dt><dd>${esc(smokingStatus(p.age, seed, sc?.preTest?.lastSmokingHours))}</dd></div>
    ${c.dlco ? `<div><dt>Hemoglobin</dt><dd>${num(p.hbGdl, 1)} g/dL${Number.isFinite(sc?.coHbPercent) ? `<br><span class="muted">COHb ${num(sc.coHbPercent, 1)}%</span>` : ''}</dd></div>` : ''}
    <div><dt>Tests performed</dt><dd>${tests}</dd></div>
  </dl>
  ${notes.length ? `<h3>Intake and technologist notes</h3><ul class="notes">${notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  ${equationRows(prep.a)}
  </section>`;
}

const figureGrid = (figs, ids) => {
  const list = figs.filter((f) => ids.includes(f.id));
  return list.length ? `<div class="grid2 qfigs">${list.map((f) => `<figure class="card qfig" data-figure="${esc(f.id)}"><figcaption><strong>${esc(f.title)}</strong></figcaption>${f.svg}</figure>`).join('')}</div>` : '';
};

/** Replaces element ids (and the attributes that point at them) so several cases can share a page. */
export function scopeIds(html, prefix) {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  return html
    .replace(/(\sid=")([^"]+)(")/g, (m, a, id, b) => `${a}${prefix}${id}${b}`)
    .replace(/(\saria-labelledby=")([^"]+)(")/g, (m, a, id, b) => (ids.has(id) ? `${a}${prefix}${id}${b}` : m))
    .replace(/url\(#([^)]+)\)/g, (m, id) => (ids.has(id) ? `url(#${prefix}${id})` : m))
    .replace(/(\s(?:xlink:)?href="#)([^"]+)(")/g, (m, a, id, b) => (ids.has(id) ? `${a}${prefix}${id}${b}` : m));
}

/**
 * @param {ReturnType<import('./prepare.js').prepareCase>} prep
 * @param {{ adapters: object, index?: number, palette?: 'dark'|'white', idPrefix?: string }} opts
 */
export function renderChart(prep, { adapters, index = 0, palette = 'dark', idPrefix = `c${index}-` }) {
  const c = prep.caseData, a = prep.a;
  const figs = figuresFor(adapters, c, palette);
  let spiroFigs = figureGrid(figs, SPIRO_FIGS);
  if (!figs.some((f) => f.id === 'flow-volume' || f.id === 'volume-time') && typeof R.renderFigures === 'function') {
    try { spiroFigs = R.renderFigures(c, a, { revealed: false, showSchematic: false }) + figureGrid(figs, ['z-strip']); } catch { /* the tables carry the numbers */ }
  }
  const html = [
    renderHeader(prep),
    `<section class="card" aria-labelledby="h-spiro"><h2 id="h-spiro">Spirometry</h2>
      ${R.renderManeuvers(c.spirometry.pre, 'Pre-bronchodilator forced maneuvers', { revealed: false, id: 'pre-maneuvers' })}
      ${R.renderReport(a, ['fev1', 'fvc', 'fev1_fvc'], `Reported spirometry (${EQUATION_NAMES[prep.equation]})`, 'spiro-table')}
      ${spiroFigs}</section>`,
    R.renderBronchodilator(c, a),
    R.renderVolumes(c, a),
    figureGrid(figs, VOLUME_FIGS),
    R.renderDlco(c, a),
    figureGrid(figs, DLCO_FIGS),
  ].join('');
  return scopeIds(html, idPrefix);
}
