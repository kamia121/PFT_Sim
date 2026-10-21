/**
 * CSV exports and the class summary computed from pasted results codes.
 */
import { SKILLS, SKILL_LABELS } from './codes.js';
import { summarize, scoreItem } from './scoring.js';
import { ITEM_NAMES } from './items.js';
import { lettered } from './exam.js';
import { ARCHETYPES } from '../core/descriptor.js';

/** Quotes a CSV cell and neutralizes a leading character that a spreadsheet would read as a formula. */
export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const labelOf = (item, id) => item.options.find((o) => o.id === id)?.label ?? id;
const labels = (item, v) => (Array.isArray(v) ? v.map((x) => labelOf(item, x)).join(' | ') : v ? labelOf(item, v) : '');

/** Learner CSV: one row per item with the response, the key, and the score. */
export function learnerCsv(cases, responses) {
  const rows = [['case', 'item', 'skill', 'response', 'key', 'score', 'max', 'status']];
  cases.forEach((c, i) => {
    for (const it of c.items) {
      const r = scoreItem(it, responses[i]?.[it.id]);
      rows.push([i + 1, ITEM_NAMES[it.id], SKILL_LABELS[it.skill], labels(it, responses[i]?.[it.id]), labels(it, it.key.correct), r.score, r.max, r.status]);
    }
  });
  return toCsv(rows);
}

/** Answer key CSV for the instructor, with the letters of the printed sheet. */
export function keyCsv(def, cases) {
  const rows = [['case', 'archetype', 'technique', 'panel', 'item', 'skill', 'key letters', 'key', 'also accepted (other equation)', 'also accepted (at a cut point)']];
  cases.forEach((c, i) => {
    for (const it of c.items) {
      const opts = lettered(it, def, i);
      const keys = [].concat(it.key.correct);
      const letters = keys.map((k) => opts.find((o) => o.id === k)?.letter).filter(Boolean).sort().join('');
      const alt = it.key.alt ? `${opts.find((o) => o.id === it.key.alt)?.letter ?? ''} ${labelOf(it, it.key.alt)}` : '';
      // A band accepted because the z-score is at a cut point of the 2022 scale: a separate column from the other equation's key, since the two are different reasons.
      const cut = (it.key.also ?? []).map((a) => `${opts.find((o) => o.id === a)?.letter ?? ''} ${labelOf(it, a)}`).join('; ');
      rows.push([i + 1, c.descriptor.archetype, c.descriptor.technique, c.descriptor.panel, ITEM_NAMES[it.id], SKILL_LABELS[it.skill], letters, labels(it, it.key.correct), alt, cut]);
    }
  });
  return toCsv(rows);
}

/**
 * @param {object[]} cases built exam cases (with keys)
 * @param {import('./codes.js').Results[]} results decoded results codes, all for this exam
 */
export function classSummary(cases, results) {
  const learners = results.map((r) => {
    const s = summarize(cases.map((c, i) => ({ items: c.items, responses: r.responses[i] ?? {} })));
    return { name: r.name, learnerSeed: r.learnerSeed, elapsed: r.elapsed, total: s.total, max: s.max, pct: s.pct, bySkill: s.bySkill, perCase: s.perCase, responses: r.responses };
  });
  const n = learners.length;
  const perItem = [];
  const wrongTotals = new Map();
  cases.forEach((c, i) => {
    for (const it of c.items) {
      let sum = 0, answered = 0;
      const dist = new Map();
      for (const L of learners) {
        const res = scoreItem(it, L.responses[i]?.[it.id]);
        sum += res.score;
        if (res.status !== 'unanswered') answered += 1;
        const picks = Array.isArray(res.response) ? res.response : res.response ? [res.response] : [];
        const keySet = new Set([].concat(it.key.correct));
        if (it.key.alt) keySet.add(it.key.alt);
        for (const a of it.key.also ?? []) keySet.add(a);
        for (const p of picks) if (!keySet.has(p)) dist.set(p, (dist.get(p) ?? 0) + 1);
      }
      const wrong = [...dist.entries()].sort((x, y) => y[1] - x[1]).map(([id, count]) => ({ id, label: labelOf(it, id), count }));
      perItem.push({ caseIndex: i, itemId: it.id, name: ITEM_NAMES[it.id], skill: it.skill, mean: n ? sum / n : 0, answered, wrong });
      for (const w of wrong) wrongTotals.set(`${i}|${it.id}|${w.id}`, { caseIndex: i, itemId: it.id, name: ITEM_NAMES[it.id], label: w.label, count: w.count });
    }
  });
  const perCase = cases.map((c, i) => {
    const items = perItem.filter((x) => x.caseIndex === i);
    return { caseIndex: i, archetype: c.descriptor.archetype, mean: items.length ? items.reduce((s, x) => s + x.mean, 0) / items.length : 0 };
  });
  const perItemName = {};
  for (const x of perItem) { const b = (perItemName[x.itemId] ??= { name: x.name, sum: 0, n: 0 }); b.sum += x.mean; b.n += 1; }
  const perSkill = Object.fromEntries(SKILLS.map((s) => {
    const rows = perItem.filter((x) => x.skill === s);
    return [s, rows.length ? rows.reduce((t, x) => t + x.mean, 0) / rows.length : null];
  }));
  return {
    n,
    learners,
    meanPct: n ? learners.reduce((s, L) => s + L.pct, 0) / n : 0,
    perItem, perCase,
    perItemType: Object.entries(perItemName).map(([id, b]) => ({ id, name: b.name, mean: b.sum / b.n })),
    perSkill,
    commonWrong: [...wrongTotals.values()].sort((x, y) => y.count - x.count).slice(0, 12),
  };
}

export function classCsv(cases, summary) {
  const rows = [['learner', 'learner seed', 'total', 'max', 'percent', 'seconds']];
  for (const L of summary.learners) rows.push([L.name || '(no name)', L.learnerSeed, L.total.toFixed(2), L.max, L.pct.toFixed(1), L.elapsed]);
  rows.push([], ['case', 'archetype', 'item', 'mean score', 'answered', 'most common wrong answers']);
  for (const x of summary.perItem) {
    rows.push([x.caseIndex + 1, cases[x.caseIndex].descriptor.archetype, x.name, x.mean.toFixed(2), x.answered, x.wrong.slice(0, 3).map((w) => `${w.label} (${w.count})`).join(' | ')]);
  }
  return toCsv(rows);
}

export const ARCHETYPE_NAMES = ARCHETYPES;
