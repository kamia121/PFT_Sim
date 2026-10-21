import { loadDatasets } from '../reference/load.js';
import { GENERATOR_VERSION } from '../core/standards.js';
import { ARCHETYPES, serializeDescriptor, parseDescriptor } from '../core/descriptor.js';
import { encodeCase, decodeCase } from '../core/code.js';
import { esc, num, EQUATION_NAMES } from '../app/format.js';
import { loadAdapters } from './adapters.js';
import {
  SKILLS, SKILL_LABELS, TOPICS, TECHNIQUE_MIXES, PANEL_MIXES, SCENARIO_LEVELS, EQUATIONS, MAX_CASES,
  encodeExam, decodeExam, encodeResults, decodeResults, splitCodes, validateExam, extractToken,
} from './codes.js';
import { drawDescriptor } from './mix.js';
import { makeContext, buildExamCases } from './exam.js';
import { prepareCase } from './prepare.js';
import { buildItems, publicItem, displayOptions, ITEM_NAMES } from './items.js';
import { scoreItem, summarize } from './scoring.js';
import { feedbackHtml } from './explain.js';
import { renderChart } from './chart.js';
import { orderSeedFor } from './exam.js';
import { learnerCsv, keyCsv, classSummary, classCsv } from './export.js';
import { studentSheetHtml, keySheetHtml, resultSheetHtml, rubricTable } from './print.js';

const $ = (sel, root = document) => root.querySelector(sel);
const app = { datasets: null, adapters: null };

const randomUint32 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; };
const uniform = () => randomUint32() / 4294967296;

// ---------------------------------------------------------------------------------------------
// Shared helpers

function copyText(text, button) {
  const done = () => { if (button) { const old = button.textContent; button.textContent = 'Copied'; setTimeout(() => (button.textContent = old), 1500); } };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const t = document.createElement('textarea');
  t.value = text; document.body.append(t); t.select();
  try { document.execCommand('copy'); done(); } catch { /* the code stays visible in its box */ }
  t.remove();
}
function download(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const ctxFor = (def) => makeContext(app.datasets, app.adapters, def);
const ALL_SKILLS = SKILLS.slice();
const errMsg = (e) => String(e?.message ?? e).replace(/[<>&"']/g, '');

/** Fieldset markup for one item. `feedback` maps item id to feedback html in review and practice. */
function itemsHtml(items, { caseIndex, orderSeed, responses = {}, locked = false, checkButtons = false, feedback = {} }) {
  return items.map((it, k) => {
    const name = `q-${caseIndex}-${it.id}`;
    const multi = it.type === 'multi';
    const cur = responses[it.id];
    const isLocked = locked || Boolean(feedback[it.id]);
    const opts = displayOptions(it, orderSeed, caseIndex).map((o) => {
      const checked = multi ? Array.isArray(cur) && cur.includes(o.id) : cur === o.id;
      return `<label><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${esc(o.id)}" ${checked ? 'checked' : ''} ${isLocked ? 'disabled' : ''}><span>${esc(o.label)}</span></label>`;
    }).join('');
    return `<fieldset class="qitem${isLocked ? ' locked' : ''}" data-item="${esc(it.id)}" data-type="${it.type}" data-case="${caseIndex}">
      <legend><span class="qnum">${k + 1}</span>${esc(it.stem)}${multi && !/select all/i.test(it.stem) ? ' <span class="muted">(select all that apply)</span>' : ''}</legend>
      <div class="qopts">${opts}</div>
      ${checkButtons && !isLocked ? `<div class="actions"><button type="button" class="secondary check-item" data-item="${esc(it.id)}">Check answer</button></div>` : ''}
      <div class="qfb" data-fb="${esc(it.id)}">${feedback[it.id] ?? ''}</div></fieldset>`;
  }).join('');
}

function readFieldset(fs) {
  const inputs = [...fs.querySelectorAll('input')];
  if (fs.dataset.type === 'multi') return inputs.filter((i) => i.checked).map((i) => i.value);
  return inputs.find((i) => i.checked)?.value;
}
const answeredCount = (responses) => responses.reduce((s, r) => s + Object.values(r).filter((v) => (Array.isArray(v) ? v.length : v)).length, 0);

// ---------------------------------------------------------------------------------------------
// Practice

const P = { prep: null, items: [], responses: {}, feedback: {}, orderSeed: 0, equation: 'GLIglobal', scenario: 'none', tally: { bySkill: {}, total: 0, max: 0, cases: 0 } };

function practiceChoices() {
  const topic = $('#p-topic').value;
  const t = $('#p-technique').value, pn = $('#p-panel').value;
  return {
    archetypes: topic === 'all' ? ARCHETYPES : TOPICS[topic].archetypes,
    technique: t === 'varies' ? [60, 30, 10] : t === 'good' ? [100, 0, 0] : t === 'fair' ? [0, 100, 0] : [0, 0, 100],
    panel: pn === 'varies' ? [80, 20] : pn === 'full' ? [100, 0] : [0, 100],
    scenario: $('#p-scenario').value,
    equation: $('#p-equation').value,
  };
}

function loadPractice(descriptor, choices) {
  P.equation = choices.equation;
  const ctx = ctxFor({ equation: choices.equation, skills: ALL_SKILLS });
  P.prep = prepareCase(descriptor, ctx);
  P.items = buildItems(P.prep, ctx);
  P.responses = {};
  P.feedback = {};
  P.orderSeed = randomUint32();
  try {
    const url = new URL(location.href);
    url.search = `?c=${encodeCase(serializeDescriptor(P.prep.caseData.descriptor))}&eq=${choices.equation}${descriptor.scenarioLevel ? `&sc=${descriptor.scenarioLevel}` : ''}`;
    history.replaceState(null, '', url);
  } catch { /* the address bar is a convenience */ }
  renderPractice();
}

function newPracticeCase() {
  const choices = practiceChoices();
  loadPractice(drawDescriptor(uniform, choices), choices);
}

function renderPractice() {
  const chart = renderChart(P.prep, { adapters: app.adapters, index: 0, idPrefix: 'pr-' });
  const items = itemsHtml(P.items.map(publicItem), { caseIndex: 0, orderSeed: P.orderSeed, responses: P.responses, checkButtons: true, feedback: P.feedback });
  $('#p-case').innerHTML = `${chart}<section class="card" aria-labelledby="h-qp"><h2 id="h-qp">Questions</h2>
    <p class="muted">Answer from the chart above and check each question for feedback. The key is scored under ${esc(EQUATION_NAMES[P.equation])}; an answer that matches the other spirometry equation is accepted for borderline values and labeled.</p>
    ${items}<div id="p-summary"></div></section>`;
  updatePracticeSummary();
  updatePracticeStatus();
}

function updatePracticeStatus() {
  const t = P.tally;
  $('#p-status').textContent = t.cases || t.max ? `Items scored this session: ${num(t.total, 1)} of ${t.max}.` : '';
}

/** Address of the report page (student copy) for a case; the code is the opaque one used on the practice page. */
const reportUrl = (descriptor, equation) => `./report.html?c=${encodeCase(serializeDescriptor(descriptor))}&eq=${equation}`;

function updatePracticeSummary() {
  const done = P.items.filter((it) => P.feedback[it.id]);
  const box = $('#p-summary');
  if (!box) return;
  if (done.length < P.items.length) { box.innerHTML = ''; return; }
  const sum = summarize([{ items: P.items, responses: P.responses }]);
  const learnerUrl = `./?c=${encodeCase(serializeDescriptor(P.prep.caseData.descriptor))}`;
  box.innerHTML = `<h3>This case: ${num(sum.total, 1)} of ${sum.max}</h3>${rubricTable(sum.bySkill)}
    <p class="muted">Session rubric, all cases checked so far:</p>${rubricTable(P.tally.bySkill)}
    <p><a href="${esc(learnerUrl)}">Open this case on the case practice page</a>, which also shows the ground truth and the equation comparison. <a href="${esc(reportUrl(P.prep.caseData.descriptor, P.equation))}">Open the laboratory report for this case</a> (student copy, three printable pages).</p>`;
}

function checkPracticeItem(fs) {
  const id = fs.dataset.item;
  const item = P.items.find((x) => x.id === id);
  const response = readFieldset(fs);
  P.responses[id] = response;
  const result = scoreItem(item, response);
  P.feedback[id] = feedbackHtml(item, P.prep, result, { idPrefix: 'pr-' });
  // The session tally counts an item once, when it is checked.
  const b = (P.tally.bySkill[item.skill] ??= { score: 0, max: 0, n: 0 });
  b.score += result.score; b.max += result.max; b.n += 1;
  P.tally.total += result.score; P.tally.max += result.max;
  fs.classList.add('locked');
  fs.querySelectorAll('input').forEach((i) => (i.disabled = true));
  $('.actions', fs)?.remove();
  $('.qfb', fs).innerHTML = P.feedback[id];
  if (P.items.every((it) => P.feedback[it.id])) P.tally.cases += 1;
  updatePracticeSummary();
  updatePracticeStatus();
}

// ---------------------------------------------------------------------------------------------
// Exam (learner)

const E = { phase: 'setup', code: '', def: null, name: '', learnerSeed: 0, startedAt: 0, deadline: 0, timer: null, cases: [], responses: [], idx: 0, confirm: false, result: null, error: '', urlLearnerSeed: null, review: null };

const examSummaryHtml = (def) => `<p>${def.n} case${def.n === 1 ? '' : 's'}; spirometry reference ${esc(EQUATION_NAMES[def.equation])}; ${def.timeLimit ? `time limit ${def.timeLimit} minutes` : 'no time limit'}; skills: ${def.skills.map((s) => esc(SKILL_LABELS[s])).join(', ')}.</p>`;

function renderExamSetup() {
  $('#exam-root').innerHTML = `<section class="card"><h2>Take an exam</h2>
    <p>Enter the exam code or the link from your instructor. Every learner with the code receives the same cases; the order of the answer options differs between learners. No feedback is shown until you submit. Answers are kept in this page only, so reloading it discards them.</p>
    <div class="formgrid"><label class="field">Exam code or link<input type="text" id="e-code" class="code" autocomplete="off" spellcheck="false" value="${esc(E.code)}"></label>
    <label class="field">Name (optional; included in your results code)<input type="text" id="e-name" maxlength="60" autocomplete="off" value="${esc(E.name)}"></label></div>
    <div id="e-summary" class="status-line" aria-live="polite"></div>
    <div class="toolbar"><button type="button" class="primary" id="e-start" disabled>Start exam</button></div></section>`;
  updateExamSummary();
}

function updateExamSummary() {
  const box = $('#e-summary');
  if (!box) return;
  const text = $('#e-code').value.trim();
  E.error = ''; E.def = null;
  if (text) {
    try { E.def = decodeExam(text); E.code = extractToken(text); box.innerHTML = examSummaryHtml(E.def); }
    catch (e) { E.error = errMsg(e); box.innerHTML = `<span class="error">${esc(E.error)}</span>`; }
  } else box.textContent = '';
  $('#e-start').disabled = !E.def;
}

function startExam() {
  const def = E.def;
  if (!def || !app.datasets) return;
  E.name = $('#e-name').value.trim();
  E.learnerSeed = E.urlLearnerSeed ?? (randomUint32() || 1);
  const ctx = ctxFor(def);
  const built = buildExamCases(def, ctx);
  // Only what is shown is kept: the rendered chart and the question text. The key is recomputed from
  // the code at submission, and no interpretation object is held in page state while the exam runs.
  E.cases = built.map((c, i) => ({ html: renderChart(c.prep, { adapters: app.adapters, index: i, idPrefix: 'ex-' }), items: c.items.map(publicItem) }));
  E.responses = built.map(() => ({}));
  E.idx = 0; E.confirm = false; E.phase = 'running'; E.result = null;
  E.startedAt = Date.now();
  E.deadline = def.timeLimit ? E.startedAt + def.timeLimit * 60000 : 0;
  clearInterval(E.timer);
  E.timer = setInterval(tick, 1000);
  renderExamRunning();
}

function tick() {
  const el = $('#e-timer');
  if (E.phase !== 'running') { clearInterval(E.timer); return; }
  if (E.deadline) {
    const left = Math.max(0, Math.round((E.deadline - Date.now()) / 1000));
    if (el) { el.textContent = `Time left ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; el.classList.toggle('low', left <= 60); }
    if (left <= 0) finalizeExam('time');
  } else if (el) {
    const s = Math.round((Date.now() - E.startedAt) / 1000);
    el.textContent = `Elapsed ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
}

function caseNav(current, doneFn) {
  return `<div class="casenav" role="group" aria-label="Cases">${E.cases.map((_, i) => `<button type="button" data-goto="${i}" ${i === current ? 'aria-current="true"' : ''} class="${doneFn(i) ? 'done' : ''}" aria-label="Case ${i + 1}${doneFn(i) ? ', answered' : ''}">${i + 1}</button>`).join('')}</div>`;
}
const caseDone = (i) => E.cases[i].items.every((it) => { const v = E.responses[i][it.id]; return Array.isArray(v) ? v.length : v; });
const totalItems = () => E.cases.reduce((s, c) => s + c.items.length, 0);

function renderExamRunning() {
  const i = E.idx, c = E.cases[i];
  $('#exam-root').innerHTML = `<div class="examBar"><div><strong>Case ${i + 1} of ${E.cases.length}</strong> · <span id="e-answered"></span></div><div class="timer" id="e-timer"></div><div><button type="button" class="primary" id="e-submit">Submit exam</button></div></div>
    ${caseNav(i, caseDone)}<div id="e-confirm"></div>
    <div id="e-case">${c.html}<section class="card" aria-labelledby="h-qe"><h2 id="h-qe">Questions</h2>${itemsHtml(c.items, { caseIndex: i, orderSeed: orderSeedFor(E.def, E.learnerSeed), responses: E.responses[i] })}</section></div>
    <div class="toolbar"><button type="button" class="secondary" id="e-prev" ${i === 0 ? 'disabled' : ''}>Previous case</button><button type="button" class="secondary" id="e-next" ${i === E.cases.length - 1 ? 'disabled' : ''}>Next case</button></div>`;
  updateExamBar();
  tick();
  window.scrollTo?.({ top: 0 });
}

function updateExamBar() {
  const a = $('#e-answered');
  if (a) a.textContent = `${answeredCount(E.responses)} of ${totalItems()} questions answered`;
  document.querySelectorAll('.casenav button').forEach((b) => b.classList.toggle('done', caseDone(Number(b.dataset.goto))));
}

function requestSubmit() {
  const open = totalItems() - answeredCount(E.responses);
  if (open > 0) {
    $('#e-confirm').innerHTML = `<div class="confirm" role="alert"><p>${open} question${open === 1 ? ' is' : 's are'} unanswered. Submit now? Unanswered questions score zero and answers cannot be changed afterwards.</p><div class="row"><button type="button" class="primary" id="e-confirm-yes">Submit</button><button type="button" class="secondary" id="e-confirm-no">Keep working</button></div></div>`;
  } else finalizeExam('submitted');
}

function finalizeExam(reason) {
  clearInterval(E.timer);
  E.phase = 'done';
  const def = E.def;
  let elapsed = Math.round((Date.now() - E.startedAt) / 1000);
  if (def.timeLimit) elapsed = Math.min(elapsed, def.timeLimit * 60);
  // The key is computed here, from the code, for the first time.
  const full = buildExamCases(def, ctxFor(def));
  const responses = E.responses.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => (Array.isArray(v) ? v.length : v))));
  const summary = summarize(full.map((c, i) => ({ items: c.items, responses: responses[i] })));
  const code = encodeResults({ exam: E.code, learnerSeed: E.learnerSeed, name: E.name, elapsed, responses });
  E.result = { full, summary, code, elapsed, reason, responses };
  E.review = 0;
  renderExamResult();
}

function renderExamResult() {
  const { summary, code, reason } = E.result;
  const perCase = summary.perCase.map((pc, i) => `<tr><th scope="row" class="l">Case ${i + 1}</th><td>${num(pc.score, 1)} of ${pc.max}</td><td class="l"><button type="button" class="secondary" data-review="${i}">Review</button></td></tr>`).join('');
  $('#exam-root').innerHTML = `<section class="card"><h2>${reason === 'time' ? 'Time expired: your answers were submitted' : 'Exam submitted'}</h2>
    <p class="bigscore" id="e-total">${num(summary.total, 1)} of ${summary.max} (${num(summary.pct, 0)}%)</p>
    <p class="muted">Partial credit is a convention of this tool: a severity band or quality grade one step from the key earns half a point, and the limitations question is chance-corrected: the weighted share of applicable statements selected minus the share of non-applicable statements selected, and not below 0.</p>
    ${rubricTable(summary.bySkill)}
    <div class="scroll"><table class="data"><caption>Score by case</caption><tbody>${perCase}</tbody></table></div>
    <h3>Your results code</h3><p class="muted">Give this code to your instructor. It holds your answers, not your score, and the instructor tool scores it against the exam.</p>
    <div class="codebox"><input type="text" class="code" id="e-results-code" readonly value="${esc(code)}" aria-label="Results code"><button type="button" class="secondary" id="e-copy-results">Copy</button></div>
    <div class="sheetbar"><button type="button" class="secondary" id="e-csv">Download CSV of responses and scores</button><button type="button" class="secondary" id="e-print-result">Print result sheet</button><button type="button" class="primary" data-review="0">Review the cases with feedback</button></div></section>`;
}

function renderExamReview() {
  const i = E.review, { full, responses } = E.result;
  const c = full[i];
  const scores = c.items.map((it) => scoreItem(it, responses[i][it.id]));
  const feedback = Object.fromEntries(c.items.map((it, k) => [it.id, feedbackHtml(it, c.prep, scores[k], { idPrefix: 'rv-' })]));
  const nav = `<div class="casenav" role="group" aria-label="Cases">${full.map((_, k) => `<button type="button" data-review="${k}" ${k === i ? 'aria-current="true"' : ''}>${k + 1}</button>`).join('')}</div>`;
  $('#exam-root').innerHTML = `<div class="examBar"><div><strong>Review: case ${i + 1} of ${full.length}</strong> · ${num(E.result.summary.perCase[i].score, 1)} of ${E.result.summary.perCase[i].max}</div><div><button type="button" class="secondary" id="e-back-results">Back to results</button></div></div>${nav}
    ${renderChart(c.prep, { adapters: app.adapters, index: i, idPrefix: 'rv-' })}
    <section class="card" aria-labelledby="h-qr"><h2 id="h-qr">Questions with feedback</h2>${itemsHtml(c.items.map(publicItem), { caseIndex: i, orderSeed: orderSeedFor(E.def, E.learnerSeed), responses: responses[i], locked: true, feedback })}</section>
    <p class="muted">Case ${i + 1} was generated as ${esc(c.descriptor.archetype)} with ${esc(c.descriptor.technique)} technique. <a href="${esc(reportUrl(c.descriptor, E.def.equation))}">Open the laboratory report for this case</a>.</p>`;
  window.scrollTo?.({ top: 0 });
}

// ---------------------------------------------------------------------------------------------
// Instructor

const I = { def: null, code: '', cases: null, summaryCases: null, summary: null };

function topicBoxes() {
  return Object.entries(TOPICS).map(([k, t]) => `<label><input type="checkbox" name="topic" value="${k}" checked> ${esc(t.label)}</label>`).join('');
}

function renderInstructor() {
  const options = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
  $('#instructor-root').innerHTML = `<section class="card"><h2>Build an exam</h2>
    <p class="note"><strong>Not tamper-proof.</strong> An exam code is only encoded, not encrypted. Anyone who opens this page with the code can recompute every case and its answer key, and the key is present in the page code. A server that holds the key and scores submissions would be needed for a secure assessment. Use these exams for teaching and low-stakes assessment.</p>
    <div class="formgrid">
      <label class="field">Number of cases (1 to ${MAX_CASES})<input type="number" id="i-n" min="1" max="${MAX_CASES}" value="10"></label>
      <label class="field">Difficulty: scenario level<select id="i-scenario">${SCENARIO_LEVELS.map((l) => `<option value="${l}" ${l === 'moderate' ? 'selected' : ''}>${l[0].toUpperCase()}${l.slice(1)}</option>`).join('')}</select></label>
      <label class="field">Technique mix<select id="i-technique">${options(TECHNIQUE_MIXES, 'mostly')}</select></label>
      <label class="field">Panel mix<select id="i-panel">${options(PANEL_MIXES, 'mixed')}</select></label>
      <label class="field">Spirometry reference on the chart<select id="i-equation"><option value="GLIglobal">GLI Global 2022</option><option value="GLI2012">GLI-2012 (group on the requisition)</option></select></label>
      <label class="field">Time limit in minutes (0 for none)<input type="number" id="i-time" min="0" max="300" value="0"></label>
      <label class="field">Exam seed<input type="number" id="i-seed" min="0" max="4294967295" value="${randomUint32()}"></label>
      <label class="field">Shuffle seed (option order on printed sheets)<input type="number" id="i-shuffle" min="0" max="4294967295" value="${randomUint32()}"></label>
    </div>
    <fieldset class="group"><legend>Topics (case types)</legend>${topicBoxes()}</fieldset>
    <fieldset class="group"><legend>Skills asked</legend>${SKILLS.map((s) => `<label><input type="checkbox" name="skill" value="${s}" checked> ${esc(SKILL_LABELS[s])}</label>`).join('')}</fieldset>
    <div class="toolbar"><button type="button" class="primary" id="i-build">Generate exam code</button></div>
    <div id="i-error" class="error" role="alert"></div>
    <div id="i-output"></div></section>
    <section class="card" id="i-sheets-card" hidden><h2>Sheets and answer key</h2>
      <div class="sheetbar"><button type="button" class="secondary" id="i-show-student">Preview student question sheet</button><button type="button" class="secondary" id="i-show-key">Preview answer key sheet</button><button type="button" class="secondary" id="i-key-csv">Download answer key CSV</button></div>
      <p class="muted">Printing uses the browser print dialog; choose “Save as PDF” to produce a file. The question sheet and the answer key use the same option letters.</p>
      <div id="i-sheet-status" class="muted" aria-live="polite"></div><div id="sheet-preview"></div></section>
    <section class="card"><h2>Class summary</h2>
      <p>Paste one or more learner results codes, separated by spaces or new lines. The summary rebuilds the exam from the code inside them.</p>
      <label class="field wide">Results codes<textarea id="i-results" class="code" spellcheck="false"></textarea></label>
      <div class="toolbar"><button type="button" class="primary" id="i-summarize">Summarize</button><button type="button" class="secondary" id="i-class-csv" disabled>Download summary CSV</button></div>
      <div id="i-summary" aria-live="polite"></div></section>`;
}

function readInstructorDef() {
  const topics = [...document.querySelectorAll('input[name=topic]:checked')].map((b) => b.value);
  const archetypes = [...new Set(topics.flatMap((t) => TOPICS[t].archetypes))];
  const skills = [...document.querySelectorAll('input[name=skill]:checked')].map((b) => b.value);
  const int = (id) => Number($(id).value);
  return validateExam({
    n: int('#i-n'), seed: int('#i-seed') >>> 0, archetypes, scenario: $('#i-scenario').value,
    technique: TECHNIQUE_MIXES[$('#i-technique').value].weights, panel: PANEL_MIXES[$('#i-panel').value].weights,
    timeLimit: int('#i-time'), shuffleSeed: int('#i-shuffle') >>> 0, equation: $('#i-equation').value, skills,
  });
}

function buildInstructorExam() {
  $('#i-error').textContent = '';
  try {
    const def = readInstructorDef();
    I.def = def; I.code = encodeExam(def); I.cases = null;
    const link = new URL(location.href);
    link.search = `?x=${I.code}`; link.hash = '';
    $('#i-output').innerHTML = `<h3>Exam code</h3><div class="codebox"><input type="text" class="code" id="i-code" readonly value="${esc(I.code)}" aria-label="Exam code"><button type="button" class="secondary" id="i-copy-code">Copy code</button></div>
      <h3>Exam link</h3><div class="codebox"><input type="text" class="code" id="i-link" readonly value="${esc(link.toString())}" aria-label="Exam link"><button type="button" class="secondary" id="i-copy-link">Copy link</button></div>
      ${examSummaryHtml(def)}`;
    $('#i-sheets-card').hidden = false;
    $('#sheet-preview').innerHTML = '';
  } catch (e) { $('#i-error').textContent = errMsg(e); }
}

function instructorCases() {
  if (!I.cases) I.cases = buildExamCases(I.def, ctxFor(I.def));
  return I.cases;
}

function showSheet(kind) {
  if (!I.def) return;
  $('#i-sheet-status').textContent = 'Preparing the sheet…';
  setTimeout(() => {
    const cases = instructorCases();
    const html = kind === 'student' ? studentSheetHtml(I.def, I.code, cases, app.adapters) : keySheetHtml(I.def, I.code, cases);
    $('#sheet-preview').innerHTML = `<div class="sheetbar"><button type="button" class="primary" id="i-print">Print this sheet</button></div><div id="sheet-body" data-kind="${kind}">${html}</div>`;
    $('#i-sheet-status').textContent = kind === 'student' ? 'Student question sheet. It carries no answer key.' : 'Answer key sheet. Instructor copy.';
  }, 20);
}

/** Prints html through the page's print root, in the light theme whatever the screen theme is. */
function printHtml(html) {
  const root = document.documentElement;
  const prev = root.dataset.theme;
  $('#print-root').innerHTML = html;
  document.body.classList.add('printing');
  root.dataset.theme = 'light';
  const restore = () => {
    document.body.classList.remove('printing');
    if (prev === undefined) delete root.dataset.theme; else root.dataset.theme = prev;
    $('#print-root').innerHTML = '';
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  try { window.print(); } catch { restore(); }
}

function summarizeClass() {
  const box = $('#i-summary');
  const codes = splitCodes($('#i-results').value);
  if (!codes.length) { box.innerHTML = '<p class="error">Paste at least one results code.</p>'; return; }
  const results = [], problems = [];
  codes.forEach((c, k) => { try { results.push(decodeResults(c)); } catch (e) { problems.push(`Code ${k + 1}: ${errMsg(e)}`); } });
  if (!results.length) { box.innerHTML = `<p class="error">${problems.map(esc).join('<br>')}</p>`; return; }
  const examCode = results[0].exam;
  const mismatched = results.filter((r) => r.exam !== examCode);
  const same = results.filter((r) => r.exam === examCode);
  if (mismatched.length) problems.push(`${mismatched.length} code${mismatched.length === 1 ? ' belongs' : 's belong'} to a different exam and ${mismatched.length === 1 ? 'was' : 'were'} left out.`);
  let def;
  try { def = decodeExam(examCode); } catch (e) { box.innerHTML = `<p class="error">${esc(errMsg(e))}</p>`; return; }
  const cases = buildExamCases(def, ctxFor(def));
  const s = classSummary(cases, same);
  I.summaryCases = cases; I.summary = s;
  const pct = (x) => `${num(100 * x, 0)}%`;
  const skillRows = SKILLS.filter((k) => s.perSkill[k] !== null).map((k) => `<tr><th scope="row" class="l">${esc(SKILL_LABELS[k])}</th><td>${pct(s.perSkill[k])}</td></tr>`).join('');
  const itemRows = s.perItemType.map((x) => `<tr><th scope="row" class="l">${esc(x.name)}</th><td>${pct(x.mean)}</td></tr>`).join('');
  const caseRows = s.perCase.map((x) => `<tr><th scope="row" class="l">Case ${x.caseIndex + 1}</th><td class="l">${esc(x.archetype)}</td><td>${pct(x.mean)}</td></tr>`).join('');
  const wrongRows = s.commonWrong.map((w) => `<tr><td class="l">Case ${w.caseIndex + 1}</td><td class="l">${esc(w.name)}</td><td class="l">${esc(w.label)}</td><td>${w.count}</td></tr>`).join('');
  const learnerRows = s.learners.map((L) => `<tr><th scope="row" class="l">${esc(L.name || '(no name)')}</th><td>${num(L.total, 1)} of ${L.max}</td><td>${pct(L.pct / 100)}</td></tr>`).join('');
  box.innerHTML = `${problems.length ? `<p class="error">${problems.map(esc).join('<br>')}</p>` : ''}
    <p class="bigscore" id="i-class-mean">${s.n} learner${s.n === 1 ? '' : 's'}; mean score ${num(s.meanPct, 0)}%</p>
    <div class="grid2"><div class="scroll"><table class="data"><caption>Accuracy by skill</caption><tbody>${skillRows}</tbody></table></div>
    <div class="scroll"><table class="data"><caption>Accuracy by question type</caption><tbody>${itemRows}</tbody></table></div></div>
    <div class="scroll"><table class="data"><caption>Accuracy by case</caption><tbody>${caseRows}</tbody></table></div>
    <div class="scroll"><table class="data"><caption>Most common wrong answers</caption><thead><tr><th class="l">Case</th><th class="l">Question</th><th class="l">Answer</th><th>Learners</th></tr></thead><tbody>${wrongRows || '<tr><td class="l" colspan="4">No wrong answers.</td></tr>'}</tbody></table></div>
    <div class="scroll"><table class="data"><caption>Learners</caption><tbody>${learnerRows}</tbody></table></div>`;
  $('#i-class-csv').disabled = false;
}

// ---------------------------------------------------------------------------------------------
// Method and limits

function renderAbout() {
  const st = app.adapters.status;
  $('#about-root').innerHTML = `<section class="card explain"><h2>Method and limits</h2>
    <p>Each case is generated from a seed by the same generator as the case practice page, so a case is a pure function of its descriptor and the generator version. Continuous values differ with every seed. The chart shows what a laboratory report carries: demographics with the sex used for the reference, the height used and how it was obtained, weight, the group on the requisition, the reference equation for each index, smoking status, technologist and intake notes, the maneuvers, the figures, lung volumes, diffusing capacity and the bronchodilator study.</p>
    <h3>Questions and scoring</h3>
    <p>Each case asks up to nine questions generated from the interpretation engine and shuffled: pattern, severity of obstruction, FEV₁ and FVC quality grades, bronchodilator response, diffusing capacity, the statements that limit or qualify the interpretation, the most appropriate final interpretation, and, when the spirometry equation changes a classification, the factor that most affects the result. Severity is not asked for mixed disease, because the engine leaves it unscored. Each question is worth one point. An answer that matches the key under the other spirometry equation is accepted and labeled. Half credit for a severity band or an A to E grade one step from the key, and the chance-corrected score of the limitations question (the weighted share of applicable statements selected minus the share of non-applicable statements selected, not below 0), are conventions of this tool and not rules from a statement. An answer that matches only the key under the other spirometry equation is accepted and labeled with the equation it matches; GLI Global is the default key, and the GLI-2012 key is the earlier, race-specific convention.</p>
    <h3>Assessment security</h3>
    <p>Exam codes carry the case definitions as encoded text. They are not secret and not tamper-proof, because the page that renders the cases can also compute the key. The key is not rendered or held in page state while an exam is running, and scoring is recomputed from the code at submission. A server would be needed for secure assessment. Progress is held in the page only; reloading discards it.</p>
    <h3>Context fields</h3>
    <p>Smoking status and the wording of the requisition group are context drawn independently of the simulated physiology. A group recorded as “other” or as not recorded selects the same reference set. Intake notes in the built-in pool are neutral and do not change any measurement; richer notes, caveats, sex and height assumptions appear when the scenario module is installed.</p>
    <h3>Optional modules in this build</h3>
    <p>Scenarios: ${st.scenarios ? 'installed' : 'not installed; built-in intake notes and caveats are used'}. Narrative: ${st.narrative ? 'installed' : 'not installed; a rule-based final-statement generator is used'}. Figures: ${st.figures} of 6 registered${st.figures ? '; figures that return no data are skipped' : ''}.</p>
    <h3>Rules that have not been checked against their primary source</h3>
    <p>The severity band edges (z of −2.5 and −4.0), the 10%-of-predicted bronchodilator threshold and the hemoglobin and carboxyhemoglobin adjustments of the DLCO reference were compared with the 2022 ERS/ATS statement and the 2017 ERS/ATS DLCO standard. The definitions of air trapping and hyperinflation, and severity grading of a reduced DLCO and of the other patterns, have not been compared with the statements. Feedback text states this wherever a rule is used. No validation claim is made that has not been run and recorded.</p>
    </section>`;
}

// ---------------------------------------------------------------------------------------------
// Wiring

function showTab(name) {
  for (const t of document.querySelectorAll('.tabs [role=tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `panel-${name}`;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('pft-theme', theme); } catch { /* storage may be unavailable */ }
  $('#theme-toggle').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);

function onClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const id = t.id;
  if (t.dataset.tab) return showTab(t.dataset.tab);
  if (id === 'theme-toggle') return setTheme(isDark() ? 'light' : 'dark');
  // practice
  if (id === 'p-new') return newPracticeCase();
  if (id === 'p-copy') return copyText(location.href, t);
  if (t.classList.contains('check-item')) return checkPracticeItem(t.closest('fieldset'));
  // exam
  if (id === 'e-start') return startExam();
  if (t.dataset.goto !== undefined && E.phase === 'running') { E.idx = Number(t.dataset.goto); E.confirm = false; return renderExamRunning(); }
  if (id === 'e-prev') { E.idx = Math.max(0, E.idx - 1); return renderExamRunning(); }
  if (id === 'e-next') { E.idx = Math.min(E.cases.length - 1, E.idx + 1); return renderExamRunning(); }
  if (id === 'e-submit') return requestSubmit();
  if (id === 'e-confirm-yes') return finalizeExam('submitted');
  if (id === 'e-confirm-no') { $('#e-confirm').innerHTML = ''; return; }
  if (id === 'e-copy-results') return copyText($('#e-results-code').value, t);
  if (id === 'e-csv') return download('pft-quiz-results.csv', learnerCsv(E.result.full, E.result.responses));
  if (id === 'e-print-result') return printHtml(resultSheetHtml(E.def, E.code, E.result.full, E.result.summary, { name: E.name, learnerSeed: E.learnerSeed, elapsed: E.result.elapsed }));
  if (t.dataset.review !== undefined && E.result) { E.review = Number(t.dataset.review); return renderExamReview(); }
  if (id === 'e-back-results') return renderExamResult();
  // instructor
  if (id === 'i-build') return buildInstructorExam();
  if (id === 'i-copy-code') return copyText($('#i-code').value, t);
  if (id === 'i-copy-link') return copyText($('#i-link').value, t);
  if (id === 'i-show-student') return showSheet('student');
  if (id === 'i-show-key') return showSheet('key');
  if (id === 'i-print') return printHtml($('#sheet-body').innerHTML);
  if (id === 'i-key-csv') return download('pft-quiz-answer-key.csv', keyCsv(I.def, instructorCases()));
  if (id === 'i-summarize') return summarizeClass();
  if (id === 'i-class-csv' && I.summary) return download('pft-quiz-class-summary.csv', classCsv(I.summaryCases, I.summary));
}

function onChange(e) {
  const el = e.target;
  if (el.id === 'e-code' || el.id === 'e-name') return;
  const fs = el.closest?.('fieldset.qitem');
  if (fs && E.phase === 'running' && el.closest('#exam-root')) {
    const i = Number(fs.dataset.case);
    E.responses[i][fs.dataset.item] = readFieldset(fs);
    updateExamBar();
  } else if (fs && el.closest('#p-case')) {
    P.responses[fs.dataset.item] = readFieldset(fs);
  }
}

async function boot() {
  try {
    const saved = localStorage.getItem('pft-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch { /* ignore */ }
  $('#theme-toggle').textContent = isDark() ? 'Light mode' : 'Dark mode';
  $('#version').textContent = String(GENERATOR_VERSION);
  $('#p-topic').innerHTML = `<option value="all">All topics</option>${Object.entries(TOPICS).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}`;
  renderInstructor();
  renderExamSetup();
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', (e) => { if (e.target.id === 'e-code') updateExamSummary(); });

  app.adapters = await loadAdapters();
  renderAbout();
  app.datasets = await loadDatasets();

  const params = new URLSearchParams(location.search);
  if (params.has('l')) { const l = Number(params.get('l')); if (Number.isInteger(l) && l > 0 && l <= 0xffffffff) E.urlLearnerSeed = l; }
  if (params.has('x')) {
    E.code = params.get('x');
    renderExamSetup();
    showTab('exam');
  }
  if (params.has('c')) {
    try {
      const eq = EQUATIONS.includes(params.get('eq')) ? params.get('eq') : 'GLIglobal';
      const sc = SCENARIO_LEVELS.includes(params.get('sc')) ? params.get('sc') : 'none';
      $('#p-equation').value = eq; $('#p-scenario').value = sc;
      const d = parseDescriptor(decodeCase(params.get('c')));
      if (sc !== 'none') d.scenarioLevel = sc;
      loadPractice(d, { ...practiceChoices(), equation: eq });
      return;
    } catch (e) {
      $('#p-case').innerHTML = `<section class="card"><h2>This case link cannot be opened</h2><p>${esc(errMsg(e))}</p><p>Start a new case with the button above.</p></section>`;
      return;
    }
  }
  newPracticeCase();
}

boot().catch((e) => { $('#p-case').innerHTML = `<section class="card"><h2>The quiz could not start</h2><p>${esc(errMsg(e))}</p></section>`; });
