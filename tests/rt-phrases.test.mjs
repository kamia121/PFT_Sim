import test from 'node:test';
import assert from 'node:assert/strict';
import { forEachCase } from './helpers/rt-cases.mjs';
import { buildRtReport, PHRASE_POOL, HONESTY_TYPES, PAGE1_COMMENT_CATEGORIES } from '../src/core/rt-report.js';

const escape = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
/** A template with {slots} as an anchored regular expression. */
const toRegExp = (template) => new RegExp(`^${escape(template).replace(/\{(\w+)\}/g, '(.+?)')}$`);
const MATCHERS = PHRASE_POOL.map((p) => ({ ...p, re: toRegExp(p.template) }));
const templateOf = (line) => MATCHERS.filter((m) => m.re.test(line));

// templates -> the set of honesty types that emitted them (1500 cases)
const emittedBy = new Map(PHRASE_POOL.map((p) => [p.template, new Set()]));
const unmatched = [];
const leaks = [];
const typeCounts = Object.fromEntries(HONESTY_TYPES.map((t) => [t, 0]));
forEachCase(150, (c) => {
  const r = buildRtReport(c);
  typeCounts[r.honesty]++;
  for (const line of r.qualityLines) {
    const hits = templateOf(line);
    if (hits.length === 0) unmatched.push(line);
    for (const h of hits) emittedBy.get(h.template).add(r.honesty);
  }
  // The comment box of the first stage must not carry a phrase of the quality statement.
  for (const line of r.interpretationLines) if (templateOf(line).length) leaks.push(line);
});

test('every quality line is built from one template of the pool', () => {
  assert.deepEqual(unmatched.slice(0, 3), []);
});

test('no phrase of the pool belongs to exactly one honesty type', () => {
  const only = [...emittedBy].filter(([, types]) => types.size === 1).map(([t, types]) => `${[...types][0]}: ${t}`);
  assert.deepEqual(only.slice(0, 5), [], `${only.length} templates are emitted by one type only`);
});

test('every template of the pool is emitted by at least two types in the sample', () => {
  const rare = [...emittedBy].filter(([, types]) => types.size < 2).map(([t, types]) => `${types.size}: ${t}`);
  assert.deepEqual(rare.slice(0, 5), [], `${rare.length} templates emitted by fewer than two types`);
});

test('every honesty type draws on templates shared with another type', () => {
  for (const type of HONESTY_TYPES) {
    if (type === 'silent') continue; // writes no quality line
    const shared = [...emittedBy].filter(([, types]) => types.has(type) && types.size > 1);
    assert.ok(shared.length > 0, `${type} has no shared template (${typeCounts[type]} cases)`);
  }
});

test('the comment box of the first stage carries no phrase of the quality statement', () => {
  assert.deepEqual(leaks.slice(0, 3), []);
});

test('the page-one comment categories are those that say nothing about how the maneuvers went', () => {
  for (const banned of ['Contraindication', 'Respiratory infection', 'Alcohol', 'Obesity', 'Leak', 'Cough', 'Effort', 'DLCO technique', 'Plethysmography']) assert.ok(!PAGE1_COMMENT_CATEGORIES.includes(banned), banned);
  assert.ok(PAGE1_COMMENT_CATEGORIES.includes('Medication') && PAGE1_COMMENT_CATEGORIES.includes('Smoking'));
});
