/**
 * Entry module of report.html. Reads the case from the address (same descriptor query as the practice page, plus eq and copy),
 * builds the case, draws the printed pages and drives the toolbar. The practice page and this page share no state: the address
 * is the whole contract.
 */
import { loadDatasets } from '../reference/load.js';
import { createReference } from '../reference/gli.js';
import { buildCase } from '../core/case.js';
import { GENERATOR_VERSION } from '../core/standards.js';
import { esc } from '../report/table.js';
import { parseReportQuery, reportQuery, practiceHref, ReportLinkError } from './query.js';
import { assembleReport } from './assemble.js';
import { loadZInline } from './panels.js';
import { loadSheetModules } from './modules.js';
import { fitPages, scalePages } from './fit.js';

const $ = (sel) => document.querySelector(sel);
const state = { link: null, caseData: null, resolve: null, zInline: null, sheets: {}, equation: 'GLIglobal', copy: 'student', flags: 'lln', qualityChallenge: false, confirmed: false };

function setUrl() {
  try {
    const url = new URL(location.href);
    url.search = reportQuery({ token: state.link.token, equation: state.equation, copy: state.copy, qualityChallenge: state.qualityChallenge, flags: state.flags });
    history.replaceState(null, '', url);
  } catch { /* the address bar is a convenience */ }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('pft-theme', theme); } catch { /* storage may be unavailable */ }
  $('#theme-toggle').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}

/** The summary sheet brings its own stylesheet; it is linked only when that module exists. */
function addStylesheet(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function showError(message) {
  $('#rp-toolbar').hidden = true;
  $('#rp-hint').hidden = true;
  $('#rp-stage').innerHTML = `<section class="card rp-error" role="alert"><h2>This report link cannot be opened</h2><p>${esc(message)}</p><p><a href="./">Start a new case on the practice page</a>.</p></section>`;
  document.body.dataset.ready = 'error';
}

function gate() {
  $('#rp-stage').innerHTML = `<section class="card rp-gate"><h2>Instructor copy</h2>
    <p>The instructor copy adds test-quality grades, the interpretation statement, the notes on the simulation and the answer key after the student pages. Learners should open the student copy.</p>
    <p class="muted">The separation is a presentation choice, not a security measure: the key can be computed in the browser from the case address.</p>
    <label><input type="checkbox" id="rp-confirm"> I am the instructor and I want the copy that includes the answer key.</label>
    <p><button type="button" class="primary" id="rp-show-instructor" disabled>Show the instructor copy</button> <button type="button" class="secondary" id="rp-show-student">Show the student copy instead</button></p></section>`;
  $('#rp-print').disabled = true;
  document.body.dataset.ready = 'gate';
}

async function render() {
  $('#rp-eq').value = state.equation;
  $('#rp-copy').value = state.copy;
  $('#rp-flags').value = state.flags;
  $('#rp-qc').checked = state.qualityChallenge;
  $('#rp-back').href = practiceHref({ token: state.link.token, equation: state.equation, qualityChallenge: state.qualityChallenge, flags: state.flags });
  setUrl();
  if (state.copy === 'instructor' && !state.confirmed) { gate(); return; }
  $('#rp-print').disabled = false;
  const stage = $('#rp-stage');
  const out = assembleReport({ caseData: state.caseData, resolve: state.resolve, equation: state.equation, copy: state.copy, zInline: state.zInline, flags: state.flags, qualityChallenge: state.qualityChallenge, sheets: state.sheets });
  stage.innerHTML = out.html;
  document.title = out.title;
  try { await document.fonts?.ready; } catch { /* fonts are a refinement */ }
  window.__rpFit = fitPages(stage);
  scalePages(stage);
  window.__rpErrors = out.errors;
  document.body.dataset.ready = '1';
}

async function boot() {
  try {
    const saved = localStorage.getItem('pft-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch { /* ignore */ }
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('#theme-toggle').textContent = dark ? 'Light mode' : 'Dark mode';
  $('#version').textContent = String(GENERATOR_VERSION);

  try {
    state.link = parseReportQuery(location.search);
  } catch (e) {
    showError(e instanceof ReportLinkError ? e.message : 'The link could not be read.');
    return;
  }
  state.equation = state.link.equation;
  state.copy = state.link.copy;
  state.flags = state.link.flags;
  state.qualityChallenge = state.link.qualityChallenge;
  try {
    const datasets = await loadDatasets();
    state.resolve = createReference(datasets).resolveReference;
    state.caseData = buildCase(state.link.descriptor, datasets);
    state.zInline = await loadZInline();
    state.sheets = await loadSheetModules();
    if (state.sheets.summarySheetHtml) addStylesheet('./src/sheets/sheets.css');
  } catch (e) {
    showError(`The case could not be built: ${String(e?.message ?? e).slice(0, 200)}`);
    return;
  }
  $('#rp-toolbar').hidden = false;
  $('#rp-hint').hidden = false;
  await render();

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'theme-toggle') setTheme(document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'light' : 'dark');
    else if (t.id === 'rp-print') window.print();
    else if (t.id === 'rp-show-instructor') { state.confirmed = true; render(); }
    else if (t.id === 'rp-show-student') { state.copy = 'student'; render(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'rp-eq') { state.equation = e.target.value; render(); }
    else if (e.target.id === 'rp-copy') { state.copy = e.target.value; render(); }
    else if (e.target.id === 'rp-flags') { state.flags = e.target.value; render(); }
    else if (e.target.id === 'rp-qc') { state.qualityChallenge = e.target.checked; render(); }
    else if (e.target.id === 'rp-confirm') $('#rp-show-instructor').disabled = !e.target.checked;
  });
  let pending = 0;
  new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => { const stage = $('#rp-stage'); if (stage.querySelector('.rp-doc')) scalePages(stage); }); }).observe($('.rp-main'));
}

boot();
