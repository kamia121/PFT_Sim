import test from 'node:test';
import assert from 'node:assert/strict';
import { build, sweep } from './quiz-helpers.mjs';
import { publicItem, displayOptions, ITEM_ORDER } from '../src/quiz/items.js';
import { caseFacts, fallbackStatements, INTAKE_POOL, fallbackCaveats } from '../src/quiz/fallbacks.js';
import { scoreAnswers } from '../src/app/answers.js';
import { hbLow } from '../src/app/format.js';
import { flipCount } from '../src/quiz/sensitivity.js';
import { interpret } from '../src/interpret/interpret.js';
import { resolve } from './quiz-helpers.mjs';

const OPAQUE = /^o\d+$|^none$/;

test('every item is well formed for every archetype, technique, panel and equation', () => {
  for (const equation of ['GLIglobal', 'GLI2012']) for (const d of sweep(6)) {
    const { prep, items } = build(d, { equation });
    const ids = items.map((i) => i.id);
    assert.deepEqual(ids, ITEM_ORDER.filter((x) => ids.includes(x)), 'items keep the canonical order');
    for (const id of ['pattern', 'gradeFev1', 'gradeFvc', 'limitations', 'final']) assert.ok(ids.includes(id), `${d.archetype} has ${id}`);
    assert.equal(ids.includes('severity'), !['mixed', 'indeterminate'].includes(prep.a.pattern));
    assert.equal(ids.includes('bronchodilator'), Boolean(prep.caseData.spirometry.post));
    assert.equal(ids.includes('dlco'), Boolean(prep.caseData.dlco));
    for (const it of items) {
      const optIds = it.options.map((o) => o.id);
      assert.equal(new Set(optIds).size, optIds.length, `${it.id}: option ids are unique`);
      assert.equal(new Set(it.options.map((o) => o.label)).size, optIds.length, `${it.id}: option labels are unique`);
      const keys = [].concat(it.key.correct);
      assert.ok(keys.length > 0 && keys.every((k) => optIds.includes(k)), `${it.id}: key is among the options`);
      if (it.type === 'single') assert.equal(keys.length, 1);
      if (['limitations', 'final', 'sensitivity'].includes(it.id)) for (const o of it.options) assert.match(o.id, OPAQUE, `${it.id}: option ids are opaque`);
    }
  }
});

test('categorical keys equal the engine key under the displayed equation, with the other equation as the alternative', () => {
  for (const equation of ['GLIglobal', 'GLI2012']) for (const d of sweep(5)) {
    const { prep, items } = build(d, { equation });
    const scored = scoreAnswers({}, prep.a.key, prep.b.key);
    for (const q of ['pattern', 'severity', 'gradeFev1', 'gradeFvc', 'bronchodilator', 'dlco']) {
      const it = items.find((i) => i.id === q);
      if (!it) continue;
      const s = scored.find((x) => x.id === q);
      assert.equal(it.key.correct, s.expected);
      assert.equal(it.key.alt, s.other !== s.expected ? s.other : null);
    }
  }
});

test('public items carry no key, no explanation payload and no correctness marker', () => {
  for (const d of sweep(3)) {
    const { items } = build(d);
    for (const it of items) {
      const pub = publicItem(it);
      assert.deepEqual(Object.keys(pub).sort(), ['id', 'options', 'ordered', 'skill', 'stem', 'type']);
      const json = JSON.stringify(pub);
      assert.doesNotMatch(json, /"key"|"correct"|"truth"|"flaw"|"why"|"weight"/);
    }
  }
});

test('items are a pure function of the descriptor', () => {
  for (const d of sweep(2)) assert.equal(JSON.stringify(build(d).items), JSON.stringify(build(d).items));
});

test('option order depends on the seed, keeps the same set, and keeps "none" and ordinal scales fixed', () => {
  const { items } = build({ seed: 5, archetype: 'obstruction', technique: 'good' });
  const lim = items.find((i) => i.id === 'limitations');
  const a = displayOptions(lim, 1, 0).map((o) => o.id), b = displayOptions(lim, 2, 0).map((o) => o.id);
  assert.deepEqual(a.slice().sort(), b.slice().sort());
  assert.notDeepEqual(a, b);
  assert.equal(a.at(-1), 'none');
  assert.deepEqual(displayOptions(lim, 1, 0).map((o) => o.id), a, 'reproducible');
  const grade = items.find((i) => i.id === 'gradeFev1');
  assert.deepEqual(displayOptions(grade, 9, 0).map((o) => o.id), ['A', 'B', 'C', 'D', 'E', 'U', 'F']);
  // The pattern item moves with the seed across many seeds.
  const pat = items.find((i) => i.id === 'pattern');
  assert.ok(new Set(Array.from({ length: 20 }, (_, s) => displayOptions(pat, s + 1, 0)[0].id)).size > 3);
});

test('decoy caveats are true statements whose subject is absent from the case, and true caveats follow the case', () => {
  const relevant = {
    'fb-quality': (f, a) => a.qualityLimited, 'fb-early': (f) => f.early, 'fb-cough': (f) => f.cough, 'fb-slow': (f) => f.slow, 'fb-variable': (f) => f.variable,
    'fb-equation': (f) => f.equationFlip, 'fb-borderline': (f) => f.borderline, 'fb-volumes-needed': (f) => !f.hasVolumes, 'fb-european': (f) => f.europeanApplied,
    'fb-hb': (f) => f.hasDlco && hbLow(f.hb), 'fb-hb-missing': (f) => f.hbMissing, 'fb-erv': (f) => f.lowErv,
    'fb-bd-artifact': (f) => Boolean(f.post) && (f.bdVariant === 'artifact' || f.postEarly), 'fb-bd-volume': (f) => Boolean(f.post) && f.bdVariant === 'volume',
    'fb-bd-rules': (f, a) => Boolean(a.bd) && !a.bd.rulesAgree,
    'fb-d-age': (f) => f.unavailable, 'fb-d-saba': (f) => f.medicationNote, 'fb-d-smoke': (f) => f.recentSmoke, 'fb-d-height': (f) => f.estimatedHeight,
    'fb-d-sex': (f) => f.sexAssumption, 'fb-d-vi': (f) => f.lowInspiredVolume, 'fb-d-glottic': (f) => f.glottic,
  };
  let checked = 0, withTrue = 0;
  for (const d of sweep(8)) {
    const { prep } = build(d);
    const f = caseFacts(prep);
    const { caveats, decoyCaveats } = fallbackCaveats(prep);
    for (const dc of decoyCaveats) { assert.equal(Boolean(relevant[dc.id](f, prep.a)), false, `${dc.id} must not apply (${d.archetype}, seed ${d.seed})`); assert.ok(dc.why || dc.why === '', dc.id); checked++; }
    // The same words are never both a true statement and a distractor, and no subject appears on both sides.
    const topics = new Set(caveats.map((c) => c.topic));
    for (const dc of decoyCaveats) assert.ok(!topics.has(dc.topic), `${dc.id} shares a subject with a true statement`);
    assert.equal(caveats.some((c) => c.id === 'fb-quality'), prep.a.qualityLimited);
    assert.equal(caveats.some((c) => c.id === 'fb-equation'), prep.cmp.labelChanges.length > 0 || prep.cmp.patternChanged);
    if (caveats.length) withTrue++;
    assert.ok(decoyCaveats.length >= 3, 'there are always enough decoys');
  }
  assert.ok(checked > 100 && withTrue > 10);
});

test('the limitations key is "none" exactly when no statement applies', () => {
  let none = 0, some = 0;
  for (const d of sweep(8)) {
    const { items } = build(d);
    const lim = items.find((i) => i.id === 'limitations');
    if (lim.key.correct.length === 1 && lim.key.correct[0] === 'none') none++; else { some++; assert.ok(!lim.key.correct.includes('none')); }
    assert.ok(lim.options.length >= 5 && lim.options.length <= 9);
  }
  assert.ok(some > 0);
  void none;
});

test('the equation sensitivity item appears only when a classification changes, and its distractors change nothing', () => {
  let seen = 0;
  for (const equation of ['GLIglobal', 'GLI2012']) for (let seed = 1; seed <= 60; seed++) {
    const d = { seed, archetype: ['normal', 'nonspecific', 'obstruction', 'low-dlco'][seed % 4], technique: 'good', panel: 'full' };
    const { prep, items } = build(d, { equation });
    const it = items.find((i) => i.id === 'sensitivity');
    const flips = prep.cmp.labelChanges.length > 0 || prep.cmp.patternChanged;
    assert.equal(Boolean(it), flips);
    if (!it) continue;
    seen++;
    const correct = it.explain.options.find((o) => o.truth);
    assert.equal(correct.sem, 'equation');
    assert.equal(it.options.length, 4);
    assert.ok(it.explain.options.filter((o) => !o.truth).every((o) => ['weight', 'smoking', 'hb', 'bd-rule', 'height-rounding'].includes(o.sem)));
    // a 1 cm height change must not change a label when "rounding the height" is offered as a distractor
    if (it.explain.options.some((o) => o.sem === 'height-rounding')) {
      const p = prep.caseData.report.patient;
      for (const dh of [-1, 1]) assert.equal(flipCount(prep.a, interpret({ ...prep.caseData.report, patient: { ...p, heightCm: p.heightCm + dh } }, resolve, equation)), 0);
    }
  }
  assert.ok(seen >= 5, `sensitivity item seen ${seen} times`);
});

test('the skills filter removes items', () => {
  const { items } = build({ seed: 3, archetype: 'obstruction', technique: 'good' }, { skills: ['pattern', 'synthesis'] });
  assert.deepEqual(items.map((i) => i.id), ['pattern', 'final']);
});

test('intake notes: a pool of twelve with variants, a seeded subset, level-dependent count', () => {
  assert.equal(INTAKE_POOL.length, 12);
  assert.ok(INTAKE_POOL.every((v) => v.length >= 2));
  assert.equal(fallbackStatements(1, 'none').length, 2);
  assert.equal(fallbackStatements(1, 'heavy').length, 4);
  assert.deepEqual(fallbackStatements(7, 'moderate'), fallbackStatements(7, 'moderate'));
  const seen = new Set();
  for (let s = 0; s < 60; s++) for (const x of fallbackStatements(s, 'heavy')) seen.add(x.text);
  assert.ok(seen.size > 12, 'both phrasings of the notes are used');
  // no note implies a medication, a preparation error or a technique problem
  for (const v of INTAKE_POOL.flat()) assert.doesNotMatch(v, /albuterol|bronchodilator taken|smoked|cough|poor effort/i);
});

test('statements vary between cases with different seeds', () => {
  const finals = new Set();
  for (let s = 1; s <= 12; s++) finals.add(build({ seed: s, archetype: 'obstruction', technique: 'good' }).items.find((i) => i.id === 'final').explain.options.find((o) => o.truth).text);
  assert.ok(finals.size >= 3);
});
