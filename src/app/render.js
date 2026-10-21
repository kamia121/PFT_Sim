import { esc, num, signed, MEASURES, EQUATION_NAMES, hbKnown, hbLow, coHbMeasured, sexUndisclosed, showBirthSex } from './format.js';
import { PATTERN_TEXT, DLCO_TEXT, BD_TEXT, GRADE_TEXT, ANCHOR_TEXT, LOW_ERV_TEXT, bdArtifactText, ARCHETYPE_NOTE_OVERRIDES } from './explain.js';
import { QUESTIONS, questionLabel, label as answerLabel } from './answers.js';
import { PATTERNS } from '../interpret/interpret.js';
import { bdPctPredDp, bdPctPredQualifier } from '../interpret/precision.js';
import { FIGURES, PANEL_IDS } from '../ui/figures/index.js';
import { PALETTES } from '../ui/palettes.js';
import { availableFigures, downloadControlsHtml } from './figure-downloads.js';
import { separableCount, figureView, viewControls } from '../ui/fig-view.js';
import { archetypeNote } from '../core/physiology.js';
import { faultWording } from '../core/quality.js';

const bmi = (p) => p.weightKg / (p.heightCm / 100) ** 2;

export function renderPatient(c) {
  const p = c.report.patient, d = c.descriptor, sc = c.scenario ?? {};
  const notes = (sc.statements ?? []).length
    ? `<h3>Technologist and intake notes</h3><ul class="notes">${sc.statements.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ul>` : '';
  return `<section class="card" aria-labelledby="h-patient"><h2 id="h-patient">Patient and requisition</h2>
  <dl class="demo">
    <div><dt>Age</dt><dd>${p.age} years</dd></div>
    <div><dt>Sex used for the reference</dt><dd>${p.sex === 'M' ? 'Male' : 'Female'}${sexUndisclosed(sc) ? ' <span class="muted">(laboratory default; sex not disclosed)</span>' : showBirthSex(sc) ? ` <span class="muted">(assigned at birth: ${sc.referenceSex.birth === 'M' ? 'male' : 'female'})</span>` : ''}</dd></div>
    <div><dt>Height</dt><dd>${p.heightCm} cm${sc.height && sc.height.source !== 'measured' ? ` <span class="muted">(${esc({ 'arm-span': 'estimated from arm span', ulna: 'estimated from ulna length', reported: 'self-reported' }[sc.height.source] ?? sc.height.source)})</span>` : ''}</dd></div>
    <div><dt>Weight</dt><dd>${p.weightKg} kg (BMI ${num(bmi(p), 1)})</dd></div>
    <div><dt>Group on requisition</dt><dd>${esc(p.group)}</dd></div>
    <div><dt>Hemoglobin</dt><dd>${Number.isFinite(p.hbGdl) ? `${num(p.hbGdl, 1)} g/dL` : 'not available'}</dd></div>
    <div><dt>Tests performed</dt><dd>${d.panel === 'full' ? 'Spirometry' + (c.spirometry.post ? ' with bronchodilator' : '') + ', lung volumes, DLCO' : 'Spirometry' + (c.spirometry.post ? ' with bronchodilator' : '')}</dd></div>
  </dl>
  <p class="note">The group on the requisition selects the GLI-2012 reference when that equation is chosen. It is an administrative field, not a measurement.</p>${notes}</section>`;
}

function reasonText(ev, key) {
  return ev[key].reasons.join('; ');
}

export function renderManeuvers(set, title, { revealed, id }) {
  const { maneuvers, summary } = set;
  const best = (key) => summary[key];
  const rows = maneuvers.map((m, i) => {
    const ev = summary.evaluations[i];
    const comments = m.faults.map((f) => faultWording(f, 'label')).join(', ');
    const verdict = (k) => (ev[k].acceptable ? 'acceptable' : ev[k].usable ? 'usable' : 'not usable');
    return `<tr><th scope="row">${i + 1}</th><td>${num(m.fvc)}</td><td>${num(m.fev1)}</td><td>${num(m.fev1 / m.fvc, 3)}</td><td>${num(m.pef, 1)}</td><td>${num(m.fef2575, 2)}</td><td>${num(m.fet, 1)}</td><td>${num(m.bev, 3)}</td><td>${num(m.plateau, 3)}</td><td class="l">${esc(comments || '—')}</td>${revealed ? `<td class="l" title="${esc(reasonText(ev, 'fev1'))}">${verdict('fev1')}</td><td class="l" title="${esc(reasonText(ev, 'fvc'))}">${verdict('fvc')}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="scroll"><table class="data" id="${id}"><caption>${esc(title)}</caption>
  <thead><tr><th>Maneuver</th><th>FVC (L)</th><th>FEV₁ (L)</th><th>FEV₁/FVC</th><th>PEF (L/s)</th><th>FEF₂₅₋₇₅ (L/s)</th><th>FET (s)</th><th>BEV (L)</th><th>Last-second Δvolume (L)</th><th class="l">Technologist comment</th>${revealed ? '<th class="l">FEV₁</th><th class="l">FVC</th>' : ''}</tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><th scope="row">Reported</th><td><strong>${num(best('fvc'))}</strong></td><td><strong>${num(best('fev1'))}</strong></td><td><strong>${num(summary.ratio, 3)}</strong></td><td>${num(summary.pef, 1)}</td><td>${num(summary.fef2575, 2)}</td><td colspan="${revealed ? 6 : 4}" class="l muted">Largest FVC and FEV₁ among the maneuvers selected by the software${summary.fvcAdjusted ? '; FVC set equal to FEV₁ because the best FEV₁ came from a maneuver whose FVC was not acceptable' : ''}</td></tr></tfoot></table></div>`;
}

/** Case data in the form the figure registry reads: the case plus the interpretation and the page state. */
export function figureCaseData(c, interp, { revealed, showSchematic, figView, resolve }) {
  return { ...c, interp, resolve: resolve ?? null, revealed: !!revealed, showSchematic: !!showSchematic, figView: figView ?? {} };
}

const PHENOTYPE_TEXT = { 'airway-predominant': 'asthma-like or chronic bronchitis, with a preserved DLCO', nonemphysematous: 'COPD without emphysema, with a reduced DLCO', emphysema: 'emphysema, with a low DLCO and a low VA' };

const FIGURE_NOTES = {
  'panel-spirometry': (cd) => `Left: the flow-volume loop, with expiratory flow upward against exhaled volume from total lung capacity (volume 0) and the inspiratory limb below zero. The quiet tidal loop sits at the end-expiratory level, which is the inspiratory capacity from total lung capacity. Right: volume against time, with the tick marking one second after the back-extrapolated start.${cd.showSchematic ? ' The dashed predicted curve is constructed from the predicted FEV₁ and FVC with a fixed curve family; it is not a published predicted loop, and no lower-limit loop is drawn because the lower limits of different indices do not describe one person.' : ''} The inspiratory limb and the tidal loop are generated from the case values and are not calibrated against patient data.`,
  'panel-pleth': () => 'A: the plethysmograph record in absolute volume. Tidal breathing, shutter closure with panting (the volume is flat while the shutter is closed, and the pants appear on the mouth-pressure lane), then expiration to residual volume and inspiration to total lung capacity. B: mouth pressure against shift volume for each panting trial; the slope gives the thoracic gas volume, and acceptable trials overlap. C: flow against shift volume during tidal breathing with the shutter open; the slope near zero flow is specific airway resistance. D: residual volume, expiratory reserve volume and inspiratory capacity stacked against the predicted values. Alveolar compression is plotted as positive.',
  'panel-dlco': () => 'Single-breath diffusing capacity: carbon monoxide and tracer gas fractions against expired volume. The washout (discarded) volume and the sample window are shaded. The strip below lists the inspired volume fraction, the time to 85% of the inspired volume, the breath-hold time and the washout and sample volumes. The tracing is generated from the case values and is not calibrated against patient data.',
  'flow-volume': (cd) => `Expiratory flow is plotted upward against exhaled volume and inspiratory flow downward; each trace is one maneuver. A loop whose inspiratory limb returns to zero volume has an inspired volume equal to the exhaled volume.${cd.spirometry.post ? ' Post-bronchodilator maneuvers are overlaid in the second color.' : ''} The inspiratory limb is generated from the exhaled volume and is not calibrated against patient data.${cd.showSchematic ? ' The dashed predicted curve is constructed from the predicted FEV₁ and FVC; it is not a published predicted loop.' : ''}`,
  'volume-time': () => 'Exhaled volume against time from one second before the start of the forced expiration. The tick marks one second after the back-extrapolated start, where FEV₁ is read; the dotted line is the tangent at peak flow that gives the back-extrapolated start.',
  'z-strip': () => 'Each star is the z-score of a measured value against its reference equation. The dashed line is the predicted value (z = 0), the dotted line on the left is the lower limit of normal (z = −1.645), and, for indices that can be abnormal in either direction, the dotted line on the right is the upper limit (z = +1.645).',
};

/**
 * The figure cards: the combined panels and the z-score strip first, each panel with its view switch, then the individual plots
 * they are built from inside a closed disclosure. `figView` holds each panel's { view, selected }.
 */
export function renderFigures(c, interp, { revealed, showSchematic, figView, resolve }) {
  const cd = figureCaseData(c, interp, { revealed, showSchematic, figView, resolve });
  const card = ({ id, title, data }) => {
    const n = separableCount(id, c);
    const view = n ? figureView(id, n, figView) : null;
    const opts = { palette: PALETTES.dark, showQuality: !!revealed, ...(view ? { view: view.view, selected: view.selected } : {}) };
    const note = FIGURE_NOTES[id]?.(cd);
    return `<figure class="card" data-figure="${id}"${id === 'z-strip' || PANEL_IDS.includes(id) ? ' style="max-width:48rem"' : ''}><figcaption><strong>${title}</strong></figcaption>${n > 1 ? viewControls(id, n, view) : ''}${FIGURES[id].render(data, opts)}${note ? `<p class="muted">${note}</p>` : ''}${downloadControlsHtml(id)}</figure>`;
  };
  const figs = availableFigures(cd);
  const primary = figs.filter((f) => PANEL_IDS.includes(f.id) || f.id === 'z-strip').map(card).join('');
  const individual = figs.filter((f) => !PANEL_IDS.includes(f.id) && f.id !== 'z-strip').map(card).join('');
  return `${primary}${individual ? `<details class="card"><summary><strong>Individual plots</strong> <span class="muted">(the plots the panels are built from, for download)</span></summary><div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,30rem),1fr))">${individual}</div></details>` : ''}`;
}

function flagCell(mr) {
  if (!mr || mr.available === false) return '';
  const t = mr.label === 'low' ? '↓ Low' : mr.label === 'high' ? '↑ High' : '';
  const b = mr.borderline ? ' <span class="muted" title="Within 0.25 z of a limit">(borderline)</span>' : '';
  return `${t ? `<span class="flag">${t}</span>` : ''}${b}`;
}

function equationCell(mr) {
  const name = EQUATION_NAMES[mr.equationId] ?? mr.equationId;
  return mr.matched ? esc(name) : `${esc(name)} <span class="flag" title="This equation was derived in people of European ancestry, so its reference population may represent this patient less well; this limits the result, and no ancestry adjustment is applied.">European reference population</span>`;
}

export function renderReport(interp, names, title, id, { labels = {}, flags = 'lln' } = {}) {
  const showFlags = flags !== 'none';
  const rows = names.map((n) => {
    const mr = interp.measures[n];
    if (!mr) return '';
    const meta = { ...MEASURES[n], ...(labels[n] ? { label: labels[n] } : {}) };
    if (mr.available === false) return `<tr><th scope="row" class="l">${meta.label}</th><td>${num(mr.value, meta.dp)}</td><td class="l">${meta.unit}</td><td colspan="${showFlags ? 5 : 4}" class="l muted">No reference value: ${esc(mr.reason ?? 'unavailable')}</td></tr>`;
    return `<tr><th scope="row" class="l">${meta.label}</th><td>${num(mr.value, meta.dp)}</td><td class="l">${meta.unit}</td><td>${num(mr.predicted, meta.dp)}</td><td>${num(mr.lln, meta.dp)}</td><td>${num(mr.z, 2)}</td><td>${num(mr.percentPredicted, 0)}%</td>${showFlags ? `<td class="l">${flagCell(mr)}</td>` : ''}<td class="l">${equationCell(mr)}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table class="data" id="${id}"><caption>${esc(title)}</caption><thead><tr><th class="l">Measure</th><th>Value</th><th class="l">Unit</th><th>Predicted</th><th>LLN</th><th>z-score</th><th>% pred.</th>${showFlags ? '<th class="l">Flag</th>' : ''}<th class="l">Reference</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderBronchodilator(c, interp, { maneuvers = true } = {}) {
  const post = c.spirometry.post;
  if (!post) return '';
  const pre = c.report.spirometry, po = c.report.spirometry.post, bd = interp.bd;
  const rows = [['FEV₁', pre.fev1, po.fev1, bd.dFev1, bd.pctBase.fev1, bd.pctPred.fev1], ['FVC', pre.fvc, po.fvc, bd.dFvc, bd.pctBase.fvc, bd.pctPred.fvc]].map(([n, a, b, d, pb, pp]) =>
    `<tr><th scope="row" class="l">${n}</th><td>${num(a)}</td><td>${num(b)}</td><td>${signed(d, 2)}</td><td>${signed(pb, 1)}%</td><td>${signed(pp, bdPctPredDp(pp))}%${bdPctPredQualifier(pp) ? ` (${bdPctPredQualifier(pp)} 10)` : ''}</td></tr>`).join('');
  return `<section class="card" aria-labelledby="h-bd"><h2 id="h-bd">After bronchodilator</h2>
  ${maneuvers ? renderManeuvers(post, 'Post-bronchodilator maneuvers', { revealed: false, id: 'post-maneuvers' }) : ''}
  <div class="scroll"><table class="data"><caption>Change from baseline</caption><thead><tr><th class="l">Measure</th><th>Before (L)</th><th>After (L)</th><th>Change (L)</th><th>Change, % of baseline</th><th>Change, % of predicted</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="muted">Post-bronchodilator FEV₁/FVC ${num(bd.postRatio, 3)}. Percent of predicted uses the reference equation selected for spirometry.</p></section>`;
}

export function renderVolumes(c, interp, { flags = 'lln' } = {}) {
  if (!c.volumes) return '';
  return `<section class="card" aria-labelledby="h-vol"><h2 id="h-vol">Lung volumes</h2>${renderReport(interp, ['tlc', 'rv', 'rv_tlc', 'vc', 'frc', 'erv', 'ic'], 'Plethysmographic lung volumes (single determination)', 'volumes-table', { flags })}
  <p class="muted">FRC, ERV and IC are the measured quantities; TLC, RV and VC follow from them. The reported FRC is the mean of the acceptable plethysmograph shutter closures shown in the figures.</p></section>`;
}

export function renderDlco(c, interp, { flags = 'lln' } = {}) {
  if (!c.dlco) return '';
  const d = c.dlco;
  const hbOk = hbKnown(d);
  const coHb = coHbMeasured(c.scenario) ? `<div><dt>Carboxyhemoglobin</dt><dd>${num(c.scenario.coHbPercent, 1)}%</dd></div>` : '';
  const tr = c.dlcoTrace;
  const vi = Number.isFinite(tr?.inspired?.viOverVc) ? `<div><dt>Inspired volume, % of VC</dt><dd>${num(100 * tr.inspired.viOverVc, 0)}%</dd></div>` : '';
  const bh = Number.isFinite(tr?.breathHold?.seconds) ? `<div><dt>Breath-hold time</dt><dd>${num(tr.breathHold.seconds, 1)} s</dd></div>` : '';
  const head = hbOk
    ? `<div><dt>Measured DLCO</dt><dd>${num(d.raw, 1)} mL/min/mmHg</dd></div><div><dt>Hemoglobin</dt><dd>${num(d.hbGdl, 1)} g/dL</dd></div><div><dt>Hemoglobin factor</dt><dd>${num(d.hbFactor, 3)}</dd></div><div><dt>Adjusted DLCO</dt><dd>${num(d.adjusted, 1)} mL/min/mmHg</dd></div>`
    : `<div><dt>Measured DLCO</dt><dd>${num(d.raw, 1)} mL/min/mmHg</dd></div><div><dt>Hemoglobin</dt><dd>not available</dd></div><div><dt>Hemoglobin adjustment</dt><dd>not applied</dd></div>`;
  return `<section class="card" aria-labelledby="h-dlco"><h2 id="h-dlco">Diffusing capacity</h2>
  <dl class="demo">${head}${coHb}${vi}${bh}</dl>
  ${renderReport(interp, ['dlco', 'va', 'kco'], hbOk ? 'Single-breath diffusing capacity, compared on the hemoglobin-adjusted value' : 'Single-breath diffusing capacity, compared without hemoglobin adjustment (hemoglobin not available)', 'dlco-table', { flags, labels: hbOk ? {} : { dlco: 'DLCO, unadjusted' } })}
  <p class="muted">${hbOk ? 'The hemoglobin adjustment uses the Cotes formula, which this tool has not yet checked against the 2017 ERS/ATS standard. ' : ''}The inspired volume and the breath-hold time are simulated in the single-breath tracing. One test is simulated, so no replicate-test rule applies.</p></section>`;
}

const STATUS_TEXT = { correct: ['ok', 'Correct'], 'other-equation': ['ok', 'Accepted: matches the other reference equation'], incorrect: ['miss', 'Differs from the key'], unanswered: ['miss', 'Not answered'] };

/** Archetype description for the reveal; a few are reworded where the stored wording goes beyond the sources or contradicts the case. */
function groundTruthNote(c, truth) {
  if (truth.archetype === 'anemia' && c.dlco && !hbKnown(c.dlco)) return 'Low measured DLCO with anemia; no hemoglobin was available to the laboratory, so the DLCO is reported without adjustment.';
  return ARCHETYPE_NOTE_OVERRIDES[truth.archetype] ?? archetypeNote(truth.archetype);
}

/** One row of the feedback list: the item, the learner's answer, the key and the status. */
function resultRow(r, scored) {
  const [cls, base] = STATUS_TEXT[r.status];
  const text = r.status === 'other-equation' ? r.note : base;
  const note = r.kind === 'challenge' && r.note && r.status !== 'other-equation' ? ` <span class="muted">${esc(r.note)}</span>` : '';
  const why = r.why ? `<div class="muted why">${esc(r.why)}</div>` : '';
  return `<div class="result-row"><div class="head">${esc(r.label)}</div><div>${scored ? `You: ${esc(r.answer ?? 'no answer')}` : ''}</div><div>Key: <strong>${esc(r.expected)}</strong>${r.other ? ` <span class="muted">(other equation: ${esc(r.other)})</span>` : ''}${scored ? ` <span class="${cls}">${esc(text)}</span>${note}` : ''}${scored ? why : ''}</div></div>`;
}

/**
 * The reveal. `scores` are the structured answers scored by scoreAnswers; `feedback` (src/app/feedback.js) replaces them with every
 * item of the page (structured questions and challenge items), adds the test-quality section and the line about the detailed report.
 */
export function renderReveal(c, interp, cmp, scores, scored, feedback = null) {
  const k = interp.key;
  const rowsData = feedback ? feedback.rows : scores.map((s) => ({
    kind: 'structured', id: s.id, label: questionLabel(c, QUESTIONS.find((q) => q.id === s.id)), answer: s.status === 'unanswered' ? null : answerLabel(s.id, s.answer),
    expected: answerLabel(s.id, s.expected), other: s.other !== s.expected ? answerLabel(s.id, s.other) : null, status: s.status, note: s.otherLabel, why: '',
  }));
  const tally = scored ? rowsData.filter((s) => s.status === 'correct' || s.status === 'other-equation').length : null;
  const rows = rowsData.map((r) => resultRow(r, scored)).join('');
  const paras = (arr) => arr.map((t) => `<p>${esc(t)}</p>`).join('');
  const parts = [];
  parts.push(`<h3>${esc(PATTERNS[interp.pattern])}</h3>${paras(PATTERN_TEXT[interp.pattern] ?? [])}`);
  if (interp.severity?.notGraded) parts.push(`<p>The FEV₁ z-score (${num(interp.severity.z, 2)}) is within the normal range of the 2022 scale (z above −1.645), so the obstruction is <strong>not graded</strong> by FEV₁: the ratio establishes obstruction, and the statement defines severity bands only for z-scores below the lower limit of normal. A low ratio with a normal FEV₁ and FVC is listed in its Table 5 as a possible dysanaptic pattern that may be a normal variant. Severity of impairment is not disease severity.</p>`);
  else if (interp.severity) parts.push(interp.severity.scored ? `<p>Severity by the FEV₁ z-score (${num(interp.severity.z, 2)}) is <strong>${interp.severity.id}</strong>. The three bands (mild to z −2.5, moderate to −4.0, severe below) follow Table 1 and the Figure 7 caption of the 2022 statement; its text prints the edges as −2.51 and −4.1, read here as reporting precision, so a z-score that prints as a cut point is accepted in either adjacent band.</p>` : `<p class="note">Severity is not scored for this pattern because the rule has not been checked against the statement. By z-score: ${Object.entries(interp.severity.perMeasure).map(([m, v]) => `${MEASURES[m].label} ${v}`).join('; ')}.</p>`);
  for (const f of interp.flags) parts.push(f.id === 'low-erv' ? `<p>${esc(LOW_ERV_TEXT)}</p>` : `<p><strong>${esc(f.text)}</strong> The definition used here has not been checked against the statement.</p>`);
  if (interp.dlco) {
    parts.push(`<h3>Diffusing capacity</h3><p>${esc(hbKnown(c.dlco) ? DLCO_TEXT[interp.dlco.category] : DLCO_TEXT.unadjusted)}</p>`);
    if (interp.dlco.subtype) parts.push(`<p>${esc(DLCO_TEXT.subtype[interp.dlco.subtype])}</p>`);
    if (hbLow(c.dlco.hbGdl)) parts.push(`<p>${esc(DLCO_TEXT.hb)}</p>`);
  }
  if (interp.bd) {
    const b = interp.bd;
    parts.push(`<h3>Bronchodilator response</h3><p>Under the 2022 rule the response is <strong>${b.rule2022.significant ? 'significant' : 'not significant'}</strong>${b.rule2022.which.length ? ` (${b.rule2022.which.map((w) => (w === 'FEV1' ? 'FEV₁' : w)).join(' and ')} above 10% of predicted)` : ''}. Under the earlier rule it is <strong>${b.rule2005.significant ? 'significant' : 'not significant'}</strong>${b.rulesAgree ? '' : ', so the two rules disagree for this patient'}.</p><p>${esc(BD_TEXT.rules)}</p>`);
    if (c.groundTruth.bdVariant === 'volume') parts.push(`<p>${esc(BD_TEXT.volume)}</p>`);
    if (c.groundTruth.bdVariant === 'artifact') parts.push(`<p>${esc(bdArtifactText(b))}</p>`);
  }
  const sc = c.scenario ?? {};
  if ((sc.caveats ?? []).length) {
    parts.push(`<h3>Limits on this interpretation</h3><ul>${sc.caveats.map((v) => `<li>${esc(v.text)}</li>`).join('')}</ul>`);
  } else if ((sc.statements ?? []).length) {
    parts.push('<h3>Limits on this interpretation</h3><p>None of the notes changes the interpretation.</p>');
  }
  if (feedback?.quality) {
    parts.push(`<h3 id="h-quality">Test quality</h3><ul class="notes">${feedback.quality.lines.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>${interp.qualityLimited ? '<p>With these grades the interpretation is qualified: the values may understate the patient’s best effort.</p>' : ''}`);
  } else {
    const gr = c.spirometry.pre.summary.grades;
    parts.push(`<h3>Session quality</h3><p>FEV₁ grade <strong>${gr.fev1}</strong>: ${esc(GRADE_TEXT[gr.fev1])} FVC grade <strong>${gr.fvc}</strong>: ${esc(GRADE_TEXT[gr.fvc])} FEV₁ and FVC are graded separately because a cough in the first second spoils FEV₁ but not FVC, and an early end of expiration spoils FVC but not FEV₁.${interp.qualityLimited ? ' With these grades the interpretation is qualified: the values may understate the patient’s best effort.' : ''}</p>`);
  }
  if (feedback?.detailsLine) parts.push(`<p class="details-line">${esc(feedback.detailsLine)}</p>`);

  const cmpRows = ['fev1', 'fvc', 'fev1_fvc'].map((n) => {
    const a = cmp.a.measures[n], b = cmp.b.measures[n];
    if (!a || !b || a.available === false || b.available === false) return '';
    const changed = a.label !== b.label;
    return `<tr><th scope="row" class="l">${MEASURES[n].label}</th><td>${num(a.value, MEASURES[n].dp)}</td><td>${num(a.z, 2)}</td><td class="l">${a.label}${a.borderline ? ' (borderline)' : ''}</td><td>${num(b.z, 2)}</td><td class="l">${b.label}${b.borderline ? ' (borderline)' : ''}</td><td class="l">${changed ? `<span class="flag">${a.label} → ${b.label}</span>` : 'no change'}</td></tr>`;
  }).join('');
  const truth = c.groundTruth;
  return `<section class="card explain" id="reveal" aria-labelledby="h-key"><h2 id="h-key">${scored ? `Result: ${tally} of ${rowsData.length} matched the key` : 'The key'}</h2>
  ${rows}
  ${parts.join('')}
  <h3>Same values under the other reference equations</h3>
  <div class="scroll"><table class="data"><caption>Spirometry under GLI-2012 (group on requisition: ${esc(c.report.patient.group)}) and GLI Global 2022</caption><thead><tr><th class="l">Measure</th><th>Value</th><th>z, GLI-2012</th><th class="l">Label</th><th>z, GLI Global</th><th class="l">Label</th><th class="l">Reclassified</th></tr></thead><tbody>${cmpRows}</tbody></table></div>
  <p>${cmp.patternChanged ? `<span class="flag">The pattern changes:</span> ${esc(PATTERNS[cmp.a.pattern])} under GLI-2012 and ${esc(PATTERNS[cmp.b.pattern])} under GLI Global.` : `The pattern is the same under both equations (${esc(PATTERNS[cmp.b.pattern])}).`}${cmp.bronchodilatorChanged ? ' The 2022 bronchodilator result also changes, because it uses the predicted value.' : ''} Volumes and diffusing capacity use the same equations in both columns, so every change shown comes from the spirometry equation.</p>
  <h3>How this case was built</h3>
  <p><strong>Ground truth:</strong> ${truth.bdVariant ? `Obstruction with air trapping and a discordant bronchodilator response; this case is the ${truth.bdVariant === 'volume' ? 'volume-response' : 'post-bronchodilator technique-artifact'} variant.` : esc(groundTruthNote(c, truth))}${truth.phenotype && !truth.bdVariant ? ` Phenotype: ${esc(PHENOTYPE_TEXT[truth.phenotype] ?? truth.phenotype)}.` : ''} Technique: ${esc(c.descriptor.technique)}.</p>
  <p>${esc(ANCHOR_TEXT)}</p></section>`;
}

export function renderMethod(version) {
  return `<section class="card explain" aria-labelledby="h-method"><h2 id="h-method">Method and limits</h2>
  <p>PFT Sim is an educational tool for practicing the interpretation of pulmonary function tests. Every case is generated from a seed, and it is not calibrated against patient data. It gives no treatment recommendation and must not be used for clinical decisions. Generator version ${version}.</p>
  <h3>What is simulated</h3>
  <p>The generator draws a lung from a stated archetype, converts standardized deviations to liters with the GLI Global (spirometry), GLI-2021 (volumes) and GLI-2017 (diffusing capacity) equations, and derives the remaining quantities so that physical constraints hold exactly: FEV₁ does not exceed FVC, TLC equals RV plus VC, FRC equals RV plus ERV, IC equals TLC minus FRC, VA does not exceed TLC, and DLCO equals KCO times VA. Forced maneuvers are produced from one volume–time curve per attempt, so the tabulated FEV₁, FVC and PEF come from the plotted trace. Three to eight maneuvers are recorded, with technical faults whose frequency depends on the technique level.</p>
  <p>The key is computed from the values that appear on the report, after maneuver variability and technique faults, so a poor session can change the key. The archetype is shown as ground truth after the answers are checked.</p>
  <h3>Limits that matter when reading a case</h3>
  <p>The anchor equations are fixed and are not offered as a comparison, so a case that is normal for the anchor can be borderline under another equation. The GLI-2021 volume and GLI-2017 diffusing capacity equations were derived in people of European ancestry; for any other group on the requisition the European equation is applied and labeled, and the limit is the reference population, not a call for a race-specific equation: the 2023 ATS statement advises against race adjustment for volumes and DLCO. The predicted flow-volume curve, when shown, is constructed from the predicted FEV₁ and FVC with a fixed curve family, and no lower-limit loop is drawn. FEF₂₅₋₇₅ is displayed without a reference value. The inspiratory limb, the tidal loop, the plethysmograph tracings and the single-breath DLCO tracing are generated from the case values with fixed models and are not calibrated against patient data. The inspired volume and the breath-hold time of the single-breath DLCO are simulated in its tracing; replicate DLCO tests and the criteria for children are not simulated. TLC is by plethysmography.</p>
  <h3>Technologist and intake notes</h3>
  <p>Some cases carry notes of the kind a technologist or an intake form records: estimated height, a reference sex that differs from the patient’s gender identity (the 2019 standard names sex assigned at birth as the determinant of predicted lung size), recent smoking or inhaler use, and technical problems. Each note has a stated effect on the data and a stated effect on the interpretation, and some notes change nothing, so that irrelevant information is not mistaken for a finding. The effect sizes are teaching values and are not verified against primary sources.</p>
  <h3>Rules that have not been checked against their primary source</h3>
  <p>The spirometry acceptability, repeatability and grading rules were compared line by line with the 2019 ATS/ERS statement. The 2022 interpretation statement was read for the severity scale (Table 1 and its Figure 7 caption: mild to z −2.5, moderate to −4.0, severe below), the bronchodilator threshold (a change above 10% of the predicted value, a strict comparison) and the recommendation to adjust the DLCO reference for hemoglobin, and the 2017 DLCO standard for the hemoglobin and carboxyhemoglobin adjustments (its equations 31, 32 and 37). The following were not compared: the definitions of air trapping and hyperinflation; severity grading for restriction, mixed disease and a preserved ratio, which this tool leaves unscored (the 2022 scale grades every measure by z-score and defines no band for an obstruction whose FEV₁ is within normal limits, which is therefore not graded); the severity of a reduced DLCO; and the archetype parameters used to generate cases. Those were compared with published cohorts (COPD, interstitial lung disease, neuromuscular and obesity studies), mostly from abstracts and from cohorts that used other reference equations, which limits the comparison to about half a z-score for spirometry and more for diffusing capacity; some parameters have no source at all (the phenotype mix, the asthma-like bronchodilator response, the body-mass bands, the hemoglobin range for anemia, the correlations between indices and the weights of the practice mix) and are teaching choices. All are proposals for physician review. The regression coefficients and spline tables for the GLI-2021 volume and GLI-2017 diffusing capacity equations match the printed tables of the publications (Hall 2021, Table 3; Stanojevic 2017 as corrected in 2020, Table 2, transcribed by the project) and the ERS lookup workbooks. That is a comparison of numbers. The units, the interpolation between table rows, the behavior at the age limits and the LMS calculation have not been compared with an official calculator. A separate audit matched all 120 coefficient values and 100 recomputed measurements from the stored tables, but could not rerun the workbook comparison.</p>
  <h3>Reference equations and attribution</h3>
  <p>The reference data derive from the Global Lung Function Initiative lookup tables and are distributed under their own terms (Creative Commons Attribution-NonCommercial, per the project’s reading of the ERS terms). Commercial use requires permission from the European Respiratory Society. Sources: Quanjer et al., Eur Respir J 2012 (GLI-2012); Bowerman et al., Am J Respir Crit Care Med 2023 (GLI Global); Hall et al., Eur Respir J 2021 (volumes); Stanojevic et al., Eur Respir J 2017 (diffusing capacity). Quality criteria: Graham et al., Am J Respir Crit Care Med 2019. Interpretation: Stanojevic et al., Eur Respir J 2022.</p>
  </section>`;
}
