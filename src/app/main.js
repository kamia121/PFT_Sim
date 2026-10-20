import { loadDatasets } from '../reference/load.js';
import { createReference } from '../reference/gli.js';
import { buildCase } from '../core/case.js';
import { ARCHETYPES, serializeDescriptor, parseDescriptor } from '../core/descriptor.js';
import { encodeCase, decodeCase } from '../core/code.js';
import { interpret, compareEquations } from '../interpret/interpret.js';
import { scoreAnswers } from './answers.js';
import * as R from './render.js';
import { GENERATOR_VERSION } from '../core/standards.js';

const $ = (sel) => document.querySelector(sel);
const state = { datasets: null, resolve: null, case: null, spirometryEquation: 'GLIglobal', answers: {}, revealed: false, scored: false, showSchematic: false, tally: { answered: 0, matched: 0, items: 0 } };

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
  return { seed: randomUint32(), archetype, severity: 1 + Math.floor(u() * 3), technique, panel };
}

function currentQuery() {
  return serializeDescriptor(state.case.descriptor);
}
function setUrl(query, mode) {
  try {
    const url = new URL(location.href);
    url.search = mode === 'plain' ? `?${query}` : `?c=${encodeCase(query)}`;
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

function render() {
  const c = state.case;
  const { a, b, cmp } = interpretations();
  const revealed = state.revealed;
  const spiroNames = ['fev1', 'fvc', 'fev1_fvc'];
  const eqOptions = [['GLIglobal', 'GLI Global 2022 (group-neutral)'], ['GLI2012', 'GLI-2012 (selected by the group on the requisition)']]
    .map(([v, l]) => `<label><input type="radio" name="eq" value="${v}" ${state.spirometryEquation === v ? 'checked' : ''}> ${l}</label>`).join(' ');
  const html = [
    R.renderPatient(c),
    `<section class="card" aria-labelledby="h-spiro"><h2 id="h-spiro">Spirometry</h2>
      ${R.renderManeuvers(c.spirometry.pre, 'Pre-bronchodilator forced maneuvers', { revealed, id: 'pre-maneuvers' })}
      <p><fieldset class="inline"><legend class="muted">Reference equation for spirometry</legend>${eqOptions}</fieldset></p>
      ${R.renderReport(a, spiroNames, 'Reported spirometry', 'spiro-table')}
      <label><input type="checkbox" id="schematic" ${state.showSchematic ? 'checked' : ''}> Show schematic predicted and lower-limit curves</label>
      ${R.renderFigures(c, a, { revealed, showSchematic: state.showSchematic })}</section>`,
    R.renderBronchodilator(c, a),
    R.renderVolumes(c, a),
    R.renderDlco(c, a),
    R.renderAnswerForm(c, state.answers, state.scored),
    revealed ? R.renderReveal(c, a, cmp, scoreAnswers(state.answers, a.key, b.key), state.scored) : '',
  ].join('');
  $('#case').innerHTML = html;
  $('#tally').textContent = state.tally.answered ? `Cases checked: ${state.tally.answered}. Items matching the key: ${state.tally.matched} of ${state.tally.items}.` : '';
  $('#caseCode').value = location.href;
}

function loadCase(descriptorLike, mode = 'code') {
  state.case = buildCase(descriptorLike, state.datasets);
  state.answers = {};
  state.revealed = false;
  state.scored = false;
  setUrl(currentQuery(), mode);
  render();
  $('#case').scrollIntoView?.({ block: 'start' });
}

function newCase() {
  loadCase(randomCase({ technique: $('#technique').value, panel: $('#panel').value }));
}

function check(scored) {
  if (scored) {
    const form = new FormData($('#answer-form'));
    for (const [k, v] of form.entries()) state.answers[k] = v;
  }
  state.scored = scored;
  state.revealed = true;
  if (scored) {
    const { a, b } = interpretations();
    const s = scoreAnswers(state.answers, a.key, b.key);
    state.tally.answered += 1;
    state.tally.items += s.length;
    state.tally.matched += s.filter((x) => x.status === 'correct' || x.status === 'other-equation').length;
  }
  render();
  $('#reveal')?.scrollIntoView?.({ block: 'start' });
}

function showTab(name) {
  for (const t of document.querySelectorAll('.tabs [role=tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `panel-${name}`;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('pft-theme', theme); } catch { /* storage may be unavailable */ }
  $('#theme-toggle').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
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

  const params = new URLSearchParams(location.search);
  try {
    if (params.has('c')) loadCase(parseDescriptor(decodeCase(params.get('c'))), 'code');
    else if (params.has('s')) loadCase(parseDescriptor(params.toString()), 'plain');
    else newCase();
  } catch (e) {
    const msg = String(e.message).replace(/[<>&"']/g, '');
    $('#case').innerHTML = `<section class="card"><h2>This case link cannot be opened</h2><p>${msg}</p><p>Start a new case with the button above.</p></section>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'new-case') newCase();
    else if (t.id === 'check-answers') check(true);
    else if (t.id === 'show-key') check(false);
    else if (t.id === 'theme-toggle') setTheme(document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'light' : 'dark');
    else if (t.id === 'copy-link') navigator.clipboard?.writeText(location.href).then(() => { t.textContent = 'Copied'; setTimeout(() => (t.textContent = 'Copy case link'), 1500); }).catch(() => $('#caseCode').select());
    else if (t.dataset.tab) showTab(t.dataset.tab);
  });
  document.addEventListener('change', (e) => {
    if (e.target.name === 'eq') { state.spirometryEquation = e.target.value; render(); }
    else if (e.target.id === 'schematic') { state.showSchematic = e.target.checked; render(); }
    else if (e.target.closest?.('#answer-form')) state.answers[e.target.name] = e.target.value;
  });
}

boot();
