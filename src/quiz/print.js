/**
 * Printable sheets: the student question sheet, the instructor answer key, and a learner's result sheet.
 * The question sheet uses the option order fixed by the exam code's shuffle seed, so the key sheet
 * letters match the printed sheet. Figures use the white palette to save ink.
 */
import { esc, num, EQUATION_NAMES } from '../app/format.js';
import { renderChart } from './chart.js';
import { lettered } from './exam.js';
import { ITEM_NAMES } from './items.js';
import { SKILLS, SKILL_LABELS, checksum } from './codes.js';
import { scoreItem } from './scoring.js';

const examId = (code) => checksum(code).toUpperCase().slice(0, 6);
const limitText = (def) => (def.timeLimit ? `Time allowed: ${def.timeLimit} minutes.` : 'No time limit.');

function sheetHead(title, def, code, extra = '') {
  return `<header class="sheet-head"><h1>${esc(title)}</h1>
    <p class="muted">Exam ${examId(code)} · ${def.n} case${def.n === 1 ? '' : 's'} · spirometry reference ${esc(EQUATION_NAMES[def.equation])} · ${limitText(def)} Educational use only; the cases are simulated.</p>${extra}</header>`;
}

/** @param {object} def @param {string} code @param {object[]} cases built cases @param {object} adapters */
export function studentSheetHtml(def, code, cases, adapters) {
  const body = cases.map((c, i) => {
    const items = c.items.map((it) => {
      const opts = lettered(it, def, i);
      const multi = it.type === 'multi';
      return `<li class="sheet-item"><p class="sheet-stem">${esc(it.stem)}${multi && !/select all/i.test(it.stem) ? ' <em>Select all that apply.</em>' : ''}</p>
        <ul class="sheet-opts">${opts.map((o) => `<li><span class="bubble${multi ? ' sq' : ''}" aria-hidden="true"></span><strong>${o.letter}.</strong> ${esc(o.label)}</li>`).join('')}</ul></li>`;
    }).join('');
    return `<section class="sheet-case"><h2>Case ${i + 1} of ${def.n}</h2>${renderChart(c.prep, { adapters, index: i, palette: 'white', idPrefix: `sh${i}-` })}
      <h3>Questions</h3><ol class="sheet-items">${items}</ol></section>`;
  }).join('');
  return `<div class="sheet">${sheetHead('Pulmonary function interpretation: question sheet', def, code, '<p class="sheet-name">Name: ______________________________ &nbsp; Date: ______________</p><p class="muted">Mark one answer for each question unless the question says to select all that apply. Each question carries one point.</p>')}${body}</div>`;
}

export function keySheetHtml(def, code, cases) {
  const body = cases.map((c, i) => {
    const rows = c.items.map((it) => {
      const opts = lettered(it, def, i);
      const keys = [].concat(it.key.correct);
      const letters = keys.map((k) => opts.find((o) => o.id === k)?.letter).filter(Boolean).sort().join(', ');
      const text = keys.map((k) => opts.find((o) => o.id === k)?.label).filter(Boolean).join(' / ');
      const alt = it.key.alt ? `${opts.find((o) => o.id === it.key.alt)?.letter ?? ''}: ${opts.find((o) => o.id === it.key.alt)?.label ?? ''}` : '';
      return `<tr><th scope="row" class="l">${esc(ITEM_NAMES[it.id])}</th><td class="l"><strong>${esc(letters)}</strong></td><td class="l">${esc(text)}</td><td class="l">${esc(alt)}</td></tr>`;
    }).join('');
    const d = c.descriptor;
    return `<section class="sheet-case"><h2>Case ${i + 1}</h2><p class="muted">Archetype ${esc(d.archetype)}; technique ${esc(d.technique)}; panel ${esc(d.panel)}; severity ${d.severity}.</p>
      <div class="scroll"><table class="data"><thead><tr><th class="l">Item</th><th class="l">Letter</th><th class="l">Key</th><th class="l">Also accepted (other equation)</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }).join('');
  return `<div class="sheet">${sheetHead('Pulmonary function interpretation: answer key', def, code, '<p class="note"><strong>Instructor copy.</strong> Do not distribute with the question sheet. Partial credit: a severity band or an A to E grade one step from the key earns half a point; the limitations question earns the harmonic mean of precision and weighted recall.</p>')}${body}</div>`;
}

export function rubricRows(bySkill) {
  return SKILLS.filter((s) => bySkill[s]?.n).map((s) => {
    const b = bySkill[s];
    return `<tr><th scope="row" class="l">${esc(SKILL_LABELS[s])}</th><td>${b.n}</td><td>${num(b.score, 1)} of ${b.max}</td><td>${num((100 * b.score) / b.max, 0)}%</td></tr>`;
  }).join('');
}

export const rubricTable = (bySkill) => `<div class="scroll"><table class="data rubric"><caption>Rubric by skill</caption><thead><tr><th class="l">Skill</th><th>Items</th><th>Score</th><th>Percent</th></tr></thead><tbody>${rubricRows(bySkill)}</tbody></table></div>`;

export function resultSheetHtml(def, code, cases, summary, { name, learnerSeed, elapsed }) {
  const rows = summary.perCase.map((pc, i) => `<tr><th scope="row" class="l">Case ${i + 1}</th><td>${num(pc.score, 1)} of ${pc.max}</td></tr>`).join('');
  const detail = cases.map((c, i) => `<h3>Case ${i + 1}</h3><div class="scroll"><table class="data"><thead><tr><th class="l">Item</th><th class="l">Your answer</th><th class="l">Key</th><th>Score</th></tr></thead><tbody>${summary.perCase[i].scores.map((s, k) => {
    const it = c.items[k];
    const lab = (v) => [].concat(v ?? []).map((x) => it.options.find((o) => o.id === x)?.label ?? x).join('; ') || '—';
    return `<tr><th scope="row" class="l">${esc(ITEM_NAMES[it.id])}</th><td class="l">${esc(lab(s.response))}</td><td class="l">${esc(lab(it.key.correct))}</td><td>${num(s.score, s.score % 1 ? 2 : 0)}</td></tr>`;
  }).join('')}</tbody></table></div>`).join('');
  return `<div class="sheet">${sheetHead('Pulmonary function interpretation: result sheet', def, code, `<p><strong>${esc(name || 'Learner')}</strong> · learner seed ${learnerSeed} · time used ${Math.floor(elapsed / 60)} min ${elapsed % 60} s</p>`)}
    <h2>Total ${num(summary.total, 1)} of ${summary.max} (${num(summary.pct, 0)}%)</h2>${rubricTable(summary.bySkill)}
    <div class="scroll"><table class="data"><caption>Score by case</caption><tbody>${rows}</tbody></table></div>${detail}</div>`;
}

export { scoreItem };
