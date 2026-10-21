import { loadDatasets } from '../reference/load.js';
import { createReference } from '../reference/gli.js';
import { buildCase } from '../core/case.js';
import { serializeDescriptor, parseDescriptor } from '../core/descriptor.js';
import { decodeCase } from '../core/code.js';
import { interpret, compareEquations } from '../interpret/interpret.js';
import * as R from './render.js';
import { bindFigureDownloads } from './figure-downloads.js';
import { GENERATOR_VERSION } from '../core/standards.js';
import { buildReportModel, allTables } from '../report/model.js';
import { renderReportHtml, reportPageHref } from '../report/html.js';
import { toCsv, reportFilename, downloadCsv, copyTable, printReport, downloadReportHtml } from '../report/export.js';
import { interpretationFor } from '../report/statement.js';
import { PALETTES } from '../ui/palettes.js';
import { loadOptionalModules } from './modules.js';
import { createStage, showStatement, canCheck, check as checkStage, openDetails, setQualityChallenge, fallbackVisibility } from './stage.js';
import { parseAddress, buildSearch } from './address.js';
import { emptyResponses, applyChange } from './collect.js';
import { buildFeedback, addToTally } from './feedback.js';
import { renderPractice } from './practice-view.js';

const $ = (sel) => document.querySelector(sel);
const state = {
  datasets: null, resolve: null, mods: null,
  case: null, mode: 'code', rt: null,
  spirometryEquation: 'GLIglobal', flags: 'lln',
  stage: createStage(), responses: emptyResponses(), detailsOpen: false, feedback: null,
  showSchematic: false, figView: {},
  modelCache: null, itemsCache: null,
  reportModel: null, reportDark: false, reportInterp: false, printing: false,
  tally: { answered: 0, matched: 0, items: 0 },
};

/** Practice mix: weights are teaching choices, not prevalence. */
const MIX = [['normal', 14], ['obstruction', 22], ['restriction-parenchymal', 10], ['restriction-extraparenchymal', 6], ['mixed', 8], ['nonspecific', 8], ['low-dlco', 7], ['anemia', 4], ['obesity-low-erv', 7], ['bd-discordant', 8]];

function randomUint32() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
function randomCase(options) {
  const total = MIX.reduce((s, [, w]) => s + w, 0);
  let r = (randomUint32() / 4294967296) * total, archetype = MIX[0][0];
  for (const [a, w] of MIX) { r -= w; if (r <= 0) { archetype = a; break; } }
  const u = () => randomUint32() / 4294967296;
  const technique = options.technique === 'varies' ? (u() < 0.6 ? 'good' : u() < 0.7 ? 'fair' : 'poor') : options.technique;
  const panel = options.panel === 'varies' ? (u() < 0.8 ? 'full' : 'spirometry') : options.panel;
  const level = options.scenario === 'varies' ? (() => { const r = u(); return r < 0.25 ? 'none' : r < 0.65 ? 'light' : r < 0.9 ? 'moderate' : 'heavy'; })() : options.scenario;
  // About one case in twelve is a patient above 80 years, so that the upper age limit of the volume and TLCO equations is met in practice.
  const old = u() < 1 / 12 ? { age: 81 + Math.floor(u() * 15) } : {};
  return { seed: randomUint32(), archetype, severity: 1 + Math.floor(u() * 3), technique, panel, ...old, ...(level && level !== 'none' ? { scenarioLevel: level } : {}) };
}

function setUrl() {
  try {
    const url = new URL(location.href);
    url.search = buildSearch({ query: serializeDescriptor(state.case.descriptor), mode: state.mode, equation: state.spirometryEquation, qualityChallenge: state.stage.qualityChallenge, flags: state.flags });
    history.replaceState(null, '', url);
  } catch { /* the address bar is a convenience */ }
}

function interpretations() {
  const a = interpret(state.case.report, state.resolve, state.spirometryEquation);
  const other = state.spirometryEquation === 'GLIglobal' ? 'GLI2012' : 'GLIglobal';
  const b = interpret(state.case.report, state.resolve, other);
  const cmp = compareEquations(state.case.report, state.resolve, 'GLI2012', 'GLIglobal');
  return { a, b, cmp };
}

const visibilityNow = () => (state.mods.visibility ?? fallbackVisibility)({ qualityChallenge: state.stage.qualityChallenge, stage: state.stage.stage });

/** Challenge items for the case under the displayed equation; recomputed only when the case, equation or challenge setting changes. */
function itemsNow(a) {
  if (!state.mods.buildChallenges || !state.rt) return [];
  const key = `${state.spirometryEquation}|${state.stage.qualityChallenge}`;
  if (state.itemsCache?.case === state.case && state.itemsCache.key === key) return state.itemsCache.items;
  let items = [];
  try { items = state.mods.buildChallenges(state.case, { rt: state.rt, interp: a, qualityChallenge: state.stage.qualityChallenge }) ?? []; } catch { items = []; }
  state.itemsCache = { case: state.case, key, items };
  return items;
}

/** Report model for the sheets, rebuilt only when the case, equation, grade visibility or palette changes. */
function modelNow(a, vis, { palette = PALETTES.white, interpretation = null } = {}) {
  const key = `${state.spirometryEquation}|${vis.showGradeColumns}|${palette.id}|${interpretation?.text ?? ''}`;
  if (state.modelCache?.case === state.case && state.modelCache.key === key) return state.modelCache.model;
  const model = buildReportModel(state.case, a, {
    equation: state.spirometryEquation, includeGrades: vis.showGradeColumns, resolve: state.resolve, palette,
    interpretationText: interpretation?.text ?? null, interpretationNotes: interpretation?.notes ?? [],
  });
  state.modelCache = { case: state.case, key, model };
  return model;
}

function announce(text) {
  const el = $('#status');
  if (el) el.textContent = text;
}

/** Draws the practice area from the state. `focus` is a selector to focus afterwards, because the markup is replaced. */
function render({ focus = null } = {}) {
  if (!$('#panel-report').hidden) { renderReportView(); return; }
  const c = state.case;
  const { a, b, cmp } = interpretations();
  const vis = visibilityNow();
  const stage = state.stage.stage;
  const sheetsWanted = Boolean(state.mods.summarySheetHtml || state.mods.detailsSheetHtml);
  const model = sheetsWanted ? modelNow(a, vis) : null;
  const items = itemsNow(a);
  state.feedback = stage === 3
    ? buildFeedback({ caseData: c, interp: a, interpOther: b, equation: state.spirometryEquation, responses: state.responses, items, scoreChallenge: state.mods.scoreChallenge, rt: state.rt, detailsOpened: state.stage.detailsOpened })
    : null;
  $('#case').innerHTML = renderPractice({
    caseData: c, interp: a, cmp, equation: state.spirometryEquation, flags: state.flags,
    qualityChallenge: state.stage.qualityChallenge, stage, scored: state.stage.scored, detailsOpen: state.detailsOpen,
    vis, canCheck: canCheck(state.stage), rt: state.rt, items, responses: state.responses,
    model, sheets: { summarySheetHtml: state.mods.summarySheetHtml, detailsSheetHtml: state.mods.detailsSheetHtml },
    palette: PALETTES.white, figView: state.figView, showSchematic: state.showSchematic, resolve: state.resolve, feedback: state.feedback,
  });
  $('#tally').textContent = state.tally.answered ? `Cases checked: ${state.tally.answered}. Items matching the key: ${state.tally.matched} of ${state.tally.items}.` : '';
  $('#caseCode').value = location.href;
  if (focus) $(focus)?.focus?.({ preventScroll: true });
}

/** Redraws only the page-2 area (a figure view or chip change, or opening it), so the answers and the scroll position stay as they are. */
function renderDetailsOnly() {
  const slot = $('#details-slot');
  if (!slot) return render();
  const { a } = interpretations();
  const vis = visibilityNow();
  const figs = $('#figs');
  if (figs && !state.mods.detailsSheetHtml) { figs.innerHTML = R.renderFigures(state.case, a, { revealed: vis.showGradeColumns, showSchematic: state.showSchematic, figView: state.figView, resolve: state.resolve }); return; }
  render({ focus: document.activeElement?.id ? `#${CSS.escape(document.activeElement.id)}` : null });
}

function loadCase(descriptorLike, { mode = 'code', qualityChallenge = false } = {}) {
  state.case = buildCase(descriptorLike, state.datasets);
  state.mode = mode;
  state.rt = null;
  if (state.mods.buildRtReport) { try { state.rt = state.mods.buildRtReport(state.case); } catch { state.rt = null; } }
  state.figView = {};
  state.responses = emptyResponses();
  // The quality challenge needs the technologist's report; without it the page runs as with the challenge off.
  state.stage = createStage({ qualityChallenge: qualityChallenge && Boolean(state.rt) });
  state.detailsOpen = false;
  state.feedback = null;
  state.itemsCache = null;
  setUrl();
  render();
  announce('A new case is ready.');
  $('#case').scrollIntoView?.({ block: 'start' });
}

/** The quality challenge for a new case: the toolbar setting, with Varies drawn at random. */
function chosenQualityChallenge() {
  const v = $('#qc').value;
  return v === 'on' || (v === 'varies' && randomUint32() / 4294967296 < 0.5);
}

function newCase() {
  loadCase(randomCase({ technique: $('#technique').value, panel: $('#panel').value, scenario: $('#scenario').value }), { qualityChallenge: chosenQualityChallenge() });
}

function checkAnswers(scored) {
  const next = checkStage(state.stage, { scored });
  if (next === state.stage) return;
  state.stage = next;
  render();
  if (scored) {
    state.tally = addToTally(state.tally, state.feedback);
    $('#tally').textContent = `Cases checked: ${state.tally.answered}. Items matching the key: ${state.tally.matched} of ${state.tally.items}.`;
    announce(`Answers checked: ${state.feedback.matched} of ${state.feedback.total} matched the key.`);
  } else announce('The key is shown.');
  $('#reveal')?.scrollIntoView?.({ block: 'start' });
}

function releaseStatement() {
  const next = showStatement(state.stage);
  if (next === state.stage) return;
  state.stage = next;
  render({ focus: '#statement-note' });
  announce('The technologist’s statement is shown in the comment box on page 1.');
}

function toggleDetails() {
  state.detailsOpen = !state.detailsOpen;
  if (state.detailsOpen) state.stage = openDetails(state.stage);
  render({ focus: '#toggle-details' });
}

/** Lab report view: the same case and spirometry equation as the summary and details sheets, for printing and download. Nothing from the key appears before the visibility rule releases it. */
function renderReportView() {
  if (!state.case) return;
  const { a, cmp } = interpretations();
  const vis = visibilityNow();
  const revealed = state.stage.stage === 3;
  const interpretation = revealed && state.reportInterp ? interpretationFor(state.case, a, cmp) : null;
  const sheets = state.mods.summarySheetHtml || state.mods.detailsSheetHtml;
  const palette = state.reportDark && !state.printing ? PALETTES.dark : PALETTES.white;
  const model = buildReportModel(state.case, a, {
    equation: state.spirometryEquation, includeGrades: vis.showGradeColumns, resolve: state.resolve,
    palette: sheets ? palette : (state.reportDark && !state.printing ? 'dark' : 'white'),
    interpretationText: interpretation?.text ?? null, interpretationNotes: interpretation?.notes ?? [],
  });
  state.reportModel = model;
  if (sheets) {
    const common = { rt: state.rt, caseData: state.case, interp: a, equation: state.spirometryEquation, palette };
    const summary = state.mods.summarySheetHtml ? state.mods.summarySheetHtml(model, { ...common, flags: state.flags, showQualityLines: vis.showQualityLines }) : `<p class="muted">${'Summary sheet not available in this build.'}</p>`;
    const details = state.mods.detailsSheetHtml ? state.mods.detailsSheetHtml(model, { ...common, showGrades: vis.showGradeColumns, view: state.figView }) : `<p class="muted">${'Details sheet not available in this build.'}</p>`;
    const link = model.meta.caseToken ? `<p class="no-print"><a href="${reportPageHref(model)}">Open the printable report page</a></p>` : '';
    $('#report-root').innerHTML = `${link}<div class="sheet-wrap">${summary}${details}</div>`;
  } else {
    $('#report-root').innerHTML = renderReportHtml(model, { interactive: true });
  }
  $('#report-eq').value = state.spirometryEquation;
  $('#report-interp').disabled = !revealed;
  $('#report-interp').checked = revealed && state.reportInterp;
  $('#report-hint').hidden = revealed;
}

function showTab(name) {
  for (const t of document.querySelectorAll('.tabs [role=tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `panel-${name}`;
  document.body.classList.toggle('report-active', name === 'report');
  // The sheets of the practice and report views are never in the page together, so that figure definitions with the same ids do not collide.
  if (name === 'report') { $('#case').innerHTML = ''; renderReportView(); }
  else { $('#report-root').innerHTML = ''; if (state.case) render(); }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('pft-theme', theme); } catch { /* storage may be unavailable */ }
  $('#theme-toggle').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}

function addSheetStyles() {
  if (document.querySelector('link[data-sheets-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './src/sheets/sheets.css';
  link.dataset.sheetsCss = '1';
  document.head.appendChild(link);
}

async function boot() {
  try {
    const saved = localStorage.getItem('pft-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch { /* ignore */ }
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('#theme-toggle').textContent = dark ? 'Light mode' : 'Dark mode';
  $('#version').textContent = String(GENERATOR_VERSION);
  $('#method').innerHTML = R.renderMethod(GENERATOR_VERSION);
  state.datasets = await loadDatasets();
  state.resolve = createReference(state.datasets).resolveReference;
  // The sheets, the technologist's report and the challenge list come from other modules; a build without one still works.
  state.mods = await loadOptionalModules({
    summary: () => import('../sheets/summary.js'),
    details: () => import('../sheets/details.js'),
    rt: () => import('../core/rt-report.js'),
    challenges: () => import('../challenges/index.js'),
    visibility: () => import('../challenges/visibility.js'),
  });
  if (state.mods.summarySheetHtml || state.mods.detailsSheetHtml) addSheetStyles();
  bindFigureDownloads($('#case'), () => R.figureCaseData(state.case, interpretations().a, { revealed: state.stage.stage === 3, showSchematic: state.showSchematic, figView: state.figView, resolve: state.resolve }));

  // The practice page and the report page share the equation in the address; the quality challenge and the flag setting ride beside the case.
  const addr = parseAddress(location.search);
  if (addr.equation) state.spirometryEquation = addr.equation;
  state.flags = addr.flags;
  $('#flags').value = state.flags;
  if (addr.kind) $('#qc').value = addr.qualityChallenge ? 'on' : 'off';
  try {
    if (addr.kind === 'code') loadCase(parseDescriptor(decodeCase(addr.code)), { mode: 'code', qualityChallenge: addr.qualityChallenge });
    else if (addr.kind === 'plain') loadCase(parseDescriptor(addr.plainQuery), { mode: 'plain', qualityChallenge: addr.qualityChallenge });
    else newCase();
  } catch (e) {
    const msg = String(e.message).replace(/[<>&"']/g, '');
    $('#case').innerHTML = `<section class="card"><h2>This case link cannot be opened</h2><p>${msg}</p><p>Start a new case with the button above.</p></section>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'new-case') newCase();
    else if (t.id === 'check-answers') checkAnswers(true);
    else if (t.id === 'show-key') checkAnswers(false);
    else if (t.id === 'show-statement') releaseStatement();
    else if (t.id === 'toggle-details') toggleDetails();
    else if (t.id === 'theme-toggle') setTheme(document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'light' : 'dark');
    else if (t.id === 'copy-link') navigator.clipboard?.writeText(location.href).then(() => { t.textContent = 'Copied'; setTimeout(() => (t.textContent = 'Copy case link'), 1500); }).catch(() => $('#caseCode').select());
    else if (t.dataset.tab) showTab(t.dataset.tab);
    else if (t.id === 'report-print') printReport();
    else if (t.id === 'report-csv') downloadCsv(reportFilename(state.reportModel, 'csv'), toCsv(state.reportModel));
    else if (t.id === 'report-csv-wide') downloadCsv(reportFilename(state.reportModel, 'csv', 'wide'), toCsv(state.reportModel, { layout: 'wide' }));
    else if (t.id === 'report-html') downloadReportHtml(state.reportModel);
    else if (t.dataset.copyTable) {
      const table = allTables(state.reportModel).find((x) => x.id === t.dataset.copyTable);
      copyTable(table).then((how) => { t.textContent = how ? 'Copied' : 'Copy failed'; setTimeout(() => (t.textContent = 'Copy table'), 1500); });
    }
  });
  document.addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('input', (e) => {
    if (e.target.id === 'impression') state.responses = applyChange(state.responses, { name: 'impression', value: e.target.value });
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'report-eq') { state.spirometryEquation = t.value; setUrl(); render({ focus: '#report-eq' }); }
    else if (t.id === 'report-interp') { state.reportInterp = t.checked; renderReportView(); }
    else if (t.id === 'report-dark') { state.reportDark = t.checked; renderReportView(); }
    else if (t.name === 'eq') { state.spirometryEquation = t.value; setUrl(); render({ focus: `input[name=eq][value=${t.value}]` }); }
    else if (t.id === 'flags') { state.flags = t.value === 'none' ? 'none' : 'lln'; setUrl(); render(); }
    else if (t.id === 'qc') {
      // On and Off apply to the case on the page until its answers are checked; Varies is drawn at the next new case.
      if (t.value !== 'varies' && state.case) { state.stage = setQualityChallenge(state.stage, t.value === 'on'); state.itemsCache = null; setUrl(); render(); }
    }
    else if (t.id === 'schematic') { state.showSchematic = t.checked; render(); }
    else if (t.dataset?.figView) {
      const id = t.dataset.figView;
      state.figView[id] = { ...state.figView[id], view: t.value };
      renderDetailsOnly();
    } else if (t.dataset?.figChip) {
      const id = t.dataset.figChip;
      const boxes = [...document.querySelectorAll(`input[data-fig-chip="${id}"]`)];
      const selected = boxes.filter((b) => b.checked).map((b) => Number(b.value));
      state.figView[id] = { ...state.figView[id], selected: selected.length ? selected : [Number(t.value)] };
      renderDetailsOnly();
    } else if (t.closest?.('#answer-form') && t.name) {
      const checkedValues = t.type === 'checkbox' ? [...document.querySelectorAll(`#answer-form input[name="${CSS.escape(t.name)}"]:checked`)].map((x) => x.value) : [];
      state.responses = applyChange(state.responses, { name: t.name, type: t.type, value: t.value, checkedValues });
    }
  });
}

// Figures print on white whatever the on-screen panel choice.
window.addEventListener('beforeprint', () => { if (state.reportModel && !$('#panel-report').hidden && state.reportDark) { state.printing = true; renderReportView(); } });
window.addEventListener('afterprint', () => { if (state.printing) { state.printing = false; renderReportView(); } });

boot();
