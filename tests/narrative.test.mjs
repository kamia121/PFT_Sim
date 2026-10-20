import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';
import { createStream } from '../src/core/prng.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { createReference } from '../src/reference/gli.js';
import { composeNarrative, extractFacts, applicableFlaws, sentenceTypes, caveatCore, FLAWS, BANNED_PHRASES } from '../src/interpret/narrative.js';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);

// ------------------------------------------------------------------ helpers

const SECTION_ORDER = ['quality', 'reference', 'pattern', 'volumes', 'dlco', 'bronchodilator', 'sensitivity', 'limitations'];
const RANK = { A: 0, B: 1, C: 2, D: 3, E: 4, U: 5, F: 6 };
const FAMILY = { normal: 'normal', obstruction: 'obstruction', 'obstruction-low-fvc': 'obstruction', restriction: 'restriction', mixed: 'mixed', nonspecific: 'nonspecific', prism: 'prism', indeterminate: 'indeterminate' };
const DISPLAY_TO_KEY = { FEV1: 'fev1', FVC: 'fvc', TLC: 'tlc', DLCO: 'dlco' };
const sentencesOf = (t) => t.split(/(?<=\.)\s+(?=[A-Z])/);
const allText = (n) => [n.finalStatement, ...n.sections.map((s) => s.text), ...n.findings.map((f) => f.text)].join('\n');
const has = (facts, ...tokens) => tokens.every((t) => facts.includes(t));
const lacks = (facts, re) => !facts.some((t) => re.test(t));

const POOL = {
  major: ['Height was estimated from arm span and not measured', 'The patient smoked 30 minutes before testing', 'Albuterol was taken 2 hours before testing', 'The patient could not take a full inspiration before several maneuvers', 'Barometric pressure was not recorded for the diffusing capacity'],
  minor: ['The patient reported a recent cold', 'Ambient temperature was recorded at 22 C', 'Dentures were left in place'],
  noEffect: ['The patient wore a loose cardigan; this does not change the interpretation', 'A different technologist ran the second half of the session, which does not change the interpretation'],
  decoy: ['Decoy: testing was performed supine', 'Decoy: supplemental oxygen was in use'],
};

/** Scenario object following the contract in docs/ARCHITECTURE-NEXT.md; the scenario module is not on this branch. */
function synthScenario(c, seed, level) {
  if (level === 'none') return seed % 2 ? undefined : { level: 'none', ids: [], statements: [], technologistComments: [], caveats: [], decoyCaveats: [{ id: 'dec', text: POOL.decoy[0] }], preTest: {}, height: null, referenceSex: null, coHbPercent: null };
  const rng = createStream(seed, 'test-scenario');
  const take = (arr, n) => { const a = arr.slice(); const out = []; while (out.length < n && a.length) out.push(a.splice(rng.int(0, a.length - 1), 1)[0]); return out; };
  const nMajor = { light: 0, moderate: 1, heavy: rng.int(2, 3) }[level];
  const caveats = [
    ...take(POOL.major, nMajor).map((text, i) => ({ id: `maj${i}`, text, weight: 'major' })),
    ...take(POOL.minor, level === 'light' ? 1 : rng.int(1, 2)).map((text, i) => ({ id: `min${i}`, text, weight: 'minor' })),
    ...(level === 'light' ? [] : take(POOL.noEffect, 1).map((text, i) => ({ id: `ne${i}`, text, weight: 'minor' }))),
  ];
  const heavy = level === 'heavy';
  return {
    level, ids: caveats.map((x) => x.id), statements: [], technologistComments: [], caveats,
    decoyCaveats: POOL.decoy.map((text, i) => ({ id: `dec${i}`, text })),
    preTest: {},
    height: heavy ? { statedCm: c.report.patient.heightCm, trueCm: c.report.patient.heightCm + 4, source: ['arm-span', 'ulna', 'reported'][seed % 3], note: 'stated height differs from true height' } : null,
    referenceSex: heavy && seed % 2 ? { used: c.report.patient.sex === 'M' ? 'F' : 'M', birth: c.report.patient.sex, note: '' } : null,
    coHbPercent: heavy ? 4 + (seed % 5) : null,
  };
}

function expectedQualityToken(interp, c) {
  const g = c.report.grades;
  const letters = [interp.key.gradeFev1, interp.key.gradeFvc, ...(interp.bd ? [g.postFev1, g.postFvc] : [])];
  const worst = Math.max(...letters.map((x) => RANK[x]));
  return { letters, token: worst <= 1 ? 'quality:adequate' : worst === 2 ? 'quality:reduced' : 'quality:qualified', limited: worst >= 3 };
}

function makeCase(i) {
  const archetype = ARCHETYPES[i % ARCHETYPES.length];
  const technique = TECHNIQUE_LEVELS[Math.floor(i / ARCHETYPES.length) % TECHNIQUE_LEVELS.length];
  const panel = i % 7 === 3 ? 'spirometry' : 'full';
  const seed = 1000 + i * 7;
  const c = buildCase({ seed, archetype, technique, panel, severity: 1 + (i % 3) }, ds);
  const level = ['none', 'light', 'moderate', 'heavy'][i % 4];
  c.scenario = synthScenario(c, seed, level);
  const cmp = compareEquations(c.report, resolveReference);
  const interp = i % 2 ? cmp.a : cmp.b;
  return { c, cmp, interp, seed, archetype, level };
}

/** Facts the key and the engine output require in a correct final statement. */
function assertFinalMatchesKey({ c, cmp, interp }, final, label, { caveats = true } = {}) {
  const f = extractFacts(final);
  const key = interp.key;
  const m = interp.measures;
  const tag = (s) => `${label}: ${s}\n${final}`;

  // pattern
  const patTokens = f.filter((t) => t.startsWith('pattern:'));
  assert.deepEqual(patTokens, [`pattern:${FAMILY[key.pattern]}`], tag('pattern'));
  if (key.pattern === 'prism' || key.pattern === 'obstruction-low-fvc') assert.ok(has(f, 'volumes:needed'), tag('volumes needed'));
  else assert.ok(!f.includes('volumes:needed'), tag('volumes needed only for low FVC without volumes'));
  if (!m.tlc || m.tlc.available === false) assert.ok(!['restriction', 'mixed'].includes(FAMILY[key.pattern]) && !f.includes('pattern:restriction') && !f.includes('pattern:mixed'), tag('restriction without TLC'));

  // severity: stated only where the engine scores it
  const sevTokens = f.filter((t) => t.startsWith('severity:'));
  if (key.severity) assert.deepEqual(sevTokens, [`severity:${key.severity}`], tag('severity scored'));
  else if (key.pattern === 'normal' || key.pattern === 'indeterminate') assert.deepEqual(sevTokens, [], tag('no severity'));
  else assert.deepEqual(sevTokens, ['severity:not-graded'], tag('severity unscored'));

  // bronchodilator
  if (key.bronchodilator === null) assert.ok(!/bronchodilator/i.test(final), tag('bronchodilator mentioned without a study'));
  else {
    assert.ok(has(f, `bd:2022:${key.bronchodilator === 'significant' ? 'significant' : 'not-significant'}`), tag('bd 2022'));
    assert.ok(has(f, `bd:earlier:${interp.bd.rule2005.significant ? 'significant' : 'not-significant'}`), tag('bd earlier'));
    assert.equal(f.includes('bd:discordant'), Boolean(interp.bd.discordant), tag('bd discordance'));
  }

  // diffusing capacity
  if (key.dlco === null) assert.ok(lacks(f, /^dlco:/), tag('no dlco'));
  else assert.ok(has(f, `dlco:${key.dlco}`, 'dlco:hb-adjusted'), tag('dlco category'));

  // quality and confidence
  const q = expectedQualityToken(interp, c);
  assert.ok(has(f, q.token, `grades:${q.letters.join('')}`), tag('quality'));
  for (const other of ['quality:adequate', 'quality:reduced', 'quality:qualified'].filter((x) => x !== q.token)) assert.ok(!f.includes(other), tag(`unexpected ${other}`));

  // borderline defining measures are named borderline
  const defining = { obstruction: ['fev1_fvc'], 'obstruction-low-fvc': ['fev1_fvc'], restriction: ['tlc'], mixed: ['fev1_fvc', 'tlc'], nonspecific: ['fvc', 'fev1'], prism: ['fvc', 'fev1'], normal: [], indeterminate: [] }[key.pattern];
  for (const k of defining) if (m[k]?.available !== false && m[k]?.borderline && (m[k].label === 'low' || ['obstruction', 'obstruction-low-fvc', 'restriction', 'mixed'].includes(key.pattern))) assert.match(final, /borderline/, tag(`borderline ${k}`));
  if (m.dlco?.available !== false && m.dlco?.borderline && m.dlco.label !== 'normal') assert.match(final, /marginally/, tag('borderline dlco'));

  // reference equation sensitivity
  const sensitive = cmp.labelChanges.length > 0 || cmp.patternChanged || cmp.severityChanged || cmp.bronchodilatorChanged;
  assert.equal(f.includes('equation:sensitive'), sensitive, tag('equation sensitivity'));
  for (const ch of cmp.labelChanges) assert.ok(f.includes(`equation:differs:${{ fev1: 'FEV1', fvc: 'FVC', fev1_fvc: 'FEV1/FVC ratio' }[ch.measure]}`), tag(`flip ${ch.measure}`));
  assert.equal(f.includes('equation:pattern-changes'), cmp.patternChanged, tag('pattern change'));

  // caveats
  const sc = caveats ? c.scenario : null;
  for (const cv of sc?.caveats ?? []) {
    const core = caveatCore(cv.text);
    if (cv.weight === 'major' && !/does not change the interpretation/i.test(cv.text)) assert.ok(final.includes(core), tag(`major caveat missing: ${core}`));
    if (/does not change the interpretation/i.test(cv.text)) assert.ok(final.includes(core) && f.includes('caveat:no-effect'), tag(`no-effect caveat: ${core}`));
  }
  return f;
}

// ------------------------------------------------------------------ structure

test('every sentence type has at least three phrasing variants', () => {
  const types = sentenceTypes();
  assert.ok(Object.keys(types).length > 50);
  for (const [id, n] of Object.entries(types)) assert.ok(n >= 3, `${id} has ${n} variants`);
});

test('output has the contracted shape, ordered sections and a bounded final statement', () => {
  const x = makeCase(5);
  const n = composeNarrative({ caseData: x.c, interp: x.interp, cmp: x.cmp, seed: 3 });
  assert.deepEqual(Object.keys(n).sort(), ['distractors', 'finalStatement', 'findings', 'sections']);
  const ids = n.sections.map((s) => s.id);
  assert.deepEqual(ids, SECTION_ORDER.filter((id) => ids.includes(id)));
  assert.equal(ids[0], 'quality');
  assert.equal(ids[1], 'reference');
  assert.equal(ids[2], 'pattern');
  assert.equal(new Set(ids).size, ids.length);
  for (const s of n.sections) { assert.ok(s.title && s.text.length > 20); assert.ok(!/\s{2,}/.test(s.text)); }
  assert.equal(new Set(n.findings.map((f) => f.id)).size, n.findings.length);
  for (const d of n.distractors) assert.deepEqual(Object.keys(d).sort(), ['flaw', 'id', 'text']);
});

test('the composer does not read the descriptor, the ground truth or the generator truth', () => {
  const x = makeCase(12);
  const trap = (name) => ({ get() { throw new Error(`composer read ${name}`); }, enumerable: true });
  const guarded = { report: x.c.report, spirometry: x.c.spirometry, volumes: x.c.volumes, dlco: x.c.dlco, scenario: x.c.scenario };
  for (const name of ['descriptor', 'groundTruth', 'truth', 'anchorKey']) Object.defineProperty(guarded, name, trap(name));
  const a = composeNarrative({ caseData: guarded, interp: x.interp, cmp: x.cmp, seed: 9 });
  const b = composeNarrative({ caseData: x.c, interp: x.interp, cmp: x.cmp, seed: 9 });
  assert.deepEqual(a, b);
});

test('a narrative composes without a comparison, a scenario or a bronchodilator study', () => {
  const x = makeCase(1);
  const bare = { ...x.c, scenario: undefined };
  const n = composeNarrative({ caseData: bare, interp: x.interp, seed: 1 });
  assert.ok(!n.sections.some((s) => s.id === 'sensitivity'));
  assert.ok(n.finalStatement.length > 100);
  assert.ok(n.distractors.length >= 5);
});

// ------------------------------------------------------------------ 600 random cases

test('600 random cases: final statements agree with the key, name the caveats and avoid banned content', () => {
  const stats = { cases: 0, flaws: Object.fromEntries(FLAWS.map((f) => [f, 0])), levels: {}, patterns: {} };
  for (let i = 0; i < 600; i++) {
    const x = makeCase(i);
    const { c, cmp, interp, seed } = x;
    const n = composeNarrative({ caseData: c, interp, cmp, seed });
    const label = `case ${i} (${x.archetype}, seed ${seed}, ${x.level})`;
    stats.cases++; stats.levels[x.level] = (stats.levels[x.level] ?? 0) + 1; stats.patterns[interp.pattern] = (stats.patterns[interp.pattern] ?? 0) + 1;

    assertFinalMatchesKey(x, n.finalStatement, label);
    // The sections, read together, assert the same pattern, severity, bronchodilator, diffusing capacity, quality and equation facts.
    assertFinalMatchesKey(x, n.sections.map((s) => s.text).join(' '), `${label} (sections)`, { caveats: false });
    if (!interp.measures.tlc || interp.measures.tlc.available === false) {
      const sf = extractFacts(n.sections.map((s) => s.text).join(' '));
      assert.ok(!sf.includes('pattern:restriction') && !sf.includes('pattern:mixed') && sf.includes('volumes:not-measured'), `${label}: restriction named without a TLC`);
    }

    // length bounds: three to six sentences, bounded characters
    const sentences = sentencesOf(n.finalStatement);
    assert.ok(sentences.length >= 3 && sentences.length <= 6, `${label}: ${sentences.length} sentences\n${n.finalStatement}`);
    assert.ok(n.finalStatement.length >= 150 && n.finalStatement.length <= 2300, `${label}: ${n.finalStatement.length} characters`);
    assert.ok(!/\s{2,}|\.\.|;;|,,| ,|\.\s*\./.test(n.finalStatement), `${label}: punctuation`);

    // banned phrases and hidden case metadata, in every text the composer returns
    const text = allText(n);
    for (const re of BANNED_PHRASES) assert.ok(!re.test(text), `${label}: banned ${re}`);
    for (const a of ARCHETYPES.filter((a) => a.includes('-'))) assert.ok(!text.includes(a), `${label}: archetype ${a}`);
    if (c.groundTruth.phenotype) assert.ok(!new RegExp(`\\b${c.groundTruth.phenotype}\\b`, 'i').test(text), `${label}: phenotype`);
    assert.ok(!/\b(clearly|markedly|definitely|unequivocally|severely)\b/i.test(text), `${label}: intensifier`);
    if (c.scenario?.height) assert.ok(!text.includes(`${c.scenario.height.trueCm} cm`), `${label}: true height disclosed`);
    for (const d of c.scenario?.decoyCaveats ?? []) assert.ok(!text.includes(d.text) && !text.includes(caveatCore(d.text)), `${label}: decoy caveat stated`);
    if (!interp.bd) assert.ok(!/bronchodilator/i.test(text), `${label}: bronchodilator mentioned without a study: ${text.match(/.{0,80}bronchodilator.{0,80}/i)?.[0]}`);
    if (interp.pattern === 'prism') assert.match(n.finalStatement, /PRISm/);

    // limitations section: major first, then minor, no-effect items stated as such
    const lim = n.sections.find((s) => s.id === 'limitations').text;
    const cav = c.scenario?.caveats ?? [];
    const majors = cav.filter((v) => v.weight === 'major' && !/does not change/i.test(v.text)).map((v) => caveatCore(v.text));
    const minors = cav.filter((v) => v.weight === 'minor' && !/does not change/i.test(v.text)).map((v) => caveatCore(v.text));
    for (const t of majors) assert.ok(lim.includes(t), `${label}: major caveat missing from limitations`);
    for (const t of minors) assert.ok(lim.includes(t), `${label}: minor caveat missing from limitations`);
    if (majors.length && minors.length) assert.ok(lim.indexOf(majors[0]) < lim.indexOf(minors[0]), `${label}: major caveats come first`);
    if (cav.some((v) => /does not change the interpretation/i.test(v.text))) assert.match(lim, /do not change the interpretation/);

    // assumptions stated in the reference section
    const ref = n.sections.find((s) => s.id === 'reference').text;
    if (c.scenario?.height && c.scenario.height.source !== 'measured') assert.ok(ref.includes(`${c.scenario.height.statedCm} cm`), `${label}: height assumption`);
    if (c.scenario?.referenceSex && c.scenario.referenceSex.used !== c.scenario.referenceSex.birth) assert.match(ref, /differs from the sex recorded at birth|not the (?:male|female) sex recorded at birth|differs from the recorded sex at birth/);
    if (Number.isFinite(c.scenario?.coHbPercent) && interp.dlco) assert.match(n.sections.find((s) => s.id === 'dlco').text, /[Cc]arboxyhemoglobin/);

    // sections: every present test appears, none invented
    const ids = n.sections.map((s) => s.id);
    assert.equal(ids.includes('dlco'), Boolean(interp.dlco), `${label}: dlco section`);
    assert.equal(ids.includes('bronchodilator'), Boolean(interp.bd), `${label}: bronchodilator section`);
    assert.deepEqual(ids, SECTION_ORDER.filter((s) => ids.includes(s)));
    const q = n.sections[0].text;
    assert.match(q, /grade[d]? [A-FU]/);
    if (interp.bd) assert.ok(extractFacts(q).some((t) => /^grades:[A-FU]{4}$/.test(t)), `${label}: pre and post grades`);

    // determinism
    assert.deepEqual(composeNarrative({ caseData: c, interp, cmp, seed }), n, `${label}: determinism`);

    for (const d of n.distractors) stats.flaws[d.flaw]++;
  }
  // The sample must exercise every branch the checks above depend on.
  for (const flaw of FLAWS) assert.ok(stats.flaws[flaw] > 0, `no distractor with flaw ${flaw} in 600 cases`);
  for (const p of ['normal', 'obstruction', 'obstruction-low-fvc', 'restriction', 'mixed', 'nonspecific', 'prism']) assert.ok(stats.patterns[p] > 0, `no case with pattern ${p}`);
});

test('wording varies with the seed and is stable for a fixed seed', () => {
  for (const i of [20, 41, 77]) {
    const x = makeCase(i);
    const finals = new Set();
    for (let seed = 0; seed < 16; seed++) finals.add(composeNarrative({ caseData: x.c, interp: x.interp, cmp: x.cmp, seed }).finalStatement);
    assert.ok(finals.size >= 4, `case ${i}: only ${finals.size} distinct final statements in 16 seeds`);
  }
});

test('phrasing variants of every sentence type carry identical facts', () => {
  let compared = 0;
  for (let i = 0; i < 600; i += 4) {
    const x = makeCase(i);
    const base = composeNarrative({ caseData: x.c, interp: x.interp, cmp: x.cmp, seed: 5, forceVariant: 0 });
    const baseFacts = {
      final: extractFacts(base.finalStatement),
      sections: base.sections.map((s) => [s.id, extractFacts(s.text)]),
      distractors: base.distractors.map((d) => [d.id, d.flaw, extractFacts(d.text)]),
    };
    const texts = new Set([base.finalStatement]);
    for (const k of [1, 2, 3]) {
      const v = composeNarrative({ caseData: x.c, interp: x.interp, cmp: x.cmp, seed: 5, forceVariant: k });
      texts.add(v.finalStatement);
      assert.deepEqual(extractFacts(v.finalStatement), baseFacts.final, `case ${i} variant ${k}: final\n${base.finalStatement}\n${v.finalStatement}`);
      assert.deepEqual(v.sections.map((s) => [s.id, extractFacts(s.text)]), baseFacts.sections, `case ${i} variant ${k}: sections`);
      assert.deepEqual(v.distractors.map((d) => [d.id, d.flaw, extractFacts(d.text)]), baseFacts.distractors, `case ${i} variant ${k}: distractors`);
      assert.deepEqual(v.findings, base.findings, `case ${i} variant ${k}: findings are canonical`);
    }
    assert.ok(texts.size >= 2, `case ${i}: variants did not change the wording`);
    compared++;
  }
  assert.equal(compared, 150);
});

// ------------------------------------------------------------------ distractors

/** Does the distractor contradict the engine key in the way its flaw tag states? */
function assertContradicts(x, d, correctFacts) {
  const { c, cmp, interp } = x;
  const f = extractFacts(d.text);
  const key = interp.key, m = interp.measures;
  const why = `${d.flaw} [${d.id}]\n${d.text}`;
  switch (d.flaw) {
    case 'wrong-severity': {
      const sev = f.filter((t) => /^severity:(mild|moderate|severe)$/.test(t));
      assert.equal(sev.length, 1, why);
      assert.notEqual(sev[0], `severity:${key.severity}`, why);
      break;
    }
    case 'restriction-without-tlc':
      assert.ok(!m.tlc || m.tlc.available === false, why);
      assert.ok(f.includes('pattern:restriction') || f.includes('pattern:mixed'), why);
      assert.ok(!['restriction', 'mixed'].includes(key.pattern), why);
      assert.ok(!f.includes('volumes:needed'), why);
      break;
    case 'ignores-quality': {
      const q = expectedQualityToken(interp, c);
      assert.ok(q.limited, why);
      assert.ok(f.includes('quality:adequate') && !f.includes('quality:qualified'), why);
      break;
    }
    case 'omits-major-caveat': {
      const majors = (c.scenario?.caveats ?? []).filter((v) => v.weight === 'major').map((v) => caveatCore(v.text));
      assert.ok(majors.length > 0 && majors.every((t) => !d.text.includes(t)), why);
      break;
    }
    case 'ignores-equation-change':
      assert.ok(cmp.labelChanges.length || cmp.patternChanged || cmp.severityChanged || cmp.bronchodilatorChanged, why);
      assert.ok(f.includes('equation:robust') && !f.includes('equation:sensitive'), why);
      break;
    case 'wrong-bronchodilator-rule':
      assert.ok(interp.bd && !interp.bd.rulesAgree, why);
      assert.ok(lacks(f, /^bd:2022:/), why);
      assert.ok(f.includes(`bd:earlier:${interp.bd.rule2005.significant ? 'significant' : 'not-significant'}`), why);
      assert.notEqual(interp.bd.rule2005.significant, interp.bd.rule2022.significant, why);
      assert.equal(key.bronchodilator, interp.bd.rule2022.significant ? 'significant' : 'not-significant', why);
      break;
    case 'reads-percent-predicted-as-normal-range': {
      const claims = f.filter((t) => t.startsWith('pctpred:'));
      assert.equal(claims.length, 1, why);
      const [, name, status] = claims[0].split(':');
      const k = DISPLAY_TO_KEY[name];
      assert.ok(status === 'normal' ? m[k].label === 'low' : m[k].label === 'normal', `${why}\nlabel ${m[k].label}, ${m[k].percentPredicted}% predicted`);
      break;
    }
    case 'dlco-unadjusted-for-hb': {
      const claim = f.find((t) => t.startsWith('dlco:unadjusted:'));
      assert.ok(claim, why);
      assert.notEqual(claim.split(':')[2], key.dlco, why);
      assert.ok(!f.includes('dlco:hb-adjusted') && lacks(f, /^dlco:(reduced|raised|normal)$/), why);
      assert.ok(c.dlco.hbGdl !== undefined && Math.abs(c.dlco.hbFactor - 1) > 0, why);
      break;
    }
    case 'over-diagnoses':
      assert.ok(f.includes('diagnosis'), why);
      assert.ok(!correctFacts.includes('diagnosis'), why);
      break;
    default:
      assert.fail(`unknown flaw ${d.flaw}`);
  }
}

test('distractors: at least five per case, only applicable flaws, each contradicting the key as tagged', () => {
  const seen = Object.fromEntries(FLAWS.map((f) => [f, 0]));
  for (let i = 0; i < 600; i++) {
    const x = makeCase(i);
    const n = composeNarrative({ caseData: x.c, interp: x.interp, cmp: x.cmp, seed: x.seed });
    const label = `case ${i}`;
    assert.ok(n.distractors.length >= 5, `${label}: ${n.distractors.length} distractors`);
    assert.equal(new Set(n.distractors.map((d) => d.id)).size, n.distractors.length, `${label}: ids`);
    assert.equal(new Set(n.distractors.map((d) => d.text)).size, n.distractors.length, `${label}: duplicate distractors`);
    const applicable = applicableFlaws(x.c, x.interp, x.cmp);
    const produced = [...new Set(n.distractors.map((d) => d.flaw))];
    assert.deepEqual(produced.sort(), [...applicable].sort(), `${label}: flaws produced match flaws applicable`);
    const correctFacts = extractFacts(n.finalStatement);
    for (const d of n.distractors) {
      assert.ok(FLAWS.includes(d.flaw), `${label}: ${d.flaw}`);
      assert.notEqual(d.text, n.finalStatement, `${label}: distractor equals the correct statement`);
      assertContradicts(x, d, correctFacts);
      seen[d.flaw]++;
    }
  }
  // Rule disagreement is rare in the generated cases, so its floor is lower.
  for (const f of FLAWS) assert.ok(seen[f] >= (f === 'wrong-bronchodilator-rule' ? 3 : 20), `flaw ${f} exercised only ${seen[f]} times`);
});

// ------------------------------------------------------------------ hand-written golden cases

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/interpretation-cases.json', import.meta.url), 'utf8'));
const EQ = { fev1: 'GLIglobal', fvc: 'GLIglobal', fev1_fvc: 'GLIglobal', tlc: 'GLI2021vol', rv: 'GLI2021vol', rv_tlc: 'GLI2021vol', vc: 'GLI2021vol', frc: 'GLI2021vol', erv: 'GLI2021vol', ic: 'GLI2021vol', dlco: 'GLI2017tlco', va: 'GLI2017tlco', kco: 'GLI2017tlco' };

/** Linear reference with exact z-scores; shift moves the FEV1/FVC predicted value under the second spirometry equation. */
function fakeResolve(measure, patient, family) {
  const { pred, sd } = fx.reference[measure];
  const shift = measure === 'fev1_fvc' && family === 'GLI2012' ? 0.03 : 0;
  const p = pred + shift;
  const out = { measure, equationId: EQ[measure] === 'GLIglobal' ? family : EQ[measure], matched: true, fallbackReason: null, available: true, predicted: p, lln: p - 1.645 * sd, uln: p + 1.645 * sd, z: null, percentPredicted: null };
  if (patient.measured !== undefined) { out.z = (patient.measured - p) / sd; out.percentPredicted = (100 * patient.measured) / p; }
  return out;
}

const PATIENT = { age: 50, sex: 'M', heightCm: 178, group: 'White', weightKg: 80, hbGdl: 14.6 };
const VOL = { tlc: 7.0, rv: 1.8, vc: 5.2, frc: 3.4, erv: 1.6, ic: 3.6 };
const DL = { dlcoAdjusted: 30, va: 6.5 };

function golden({ patient = {}, fev1 = 4.0, fvc = 5.0, post = null, volumes = VOL, dlco = DL, grades = {}, raw, hbFactor = 1, hbGdl, scenario, nAcc = [3, 3], spread = [0.05, 0.06] }) {
  const pat = { ...PATIENT, ...patient };
  const report = { patient: pat, spirometry: { fev1, fvc, post }, volumes, dlco, grades: { fev1: 'A', fvc: 'A', ...(post ? { postFev1: 'A', postFvc: 'A' } : {}), ...grades } };
  const caseData = {
    report,
    spirometry: { pre: { maneuvers: [{}, {}, {}], summary: { nAcceptable: { fev1: nAcc[0], fvc: nAcc[1] }, spread: { fev1: spread[0], fvc: spread[1] }, evaluations: [], fvcAdjusted: false } } },
    volumes,
    dlco: dlco ? { raw: raw ?? dlco.dlcoAdjusted, hbGdl: hbGdl ?? pat.hbGdl, hbFactor, adjusted: dlco.dlcoAdjusted, va: dlco.va } : null,
    scenario,
  };
  const cmp = compareEquations(report, fakeResolve, 'GLI2012', 'GLIglobal');
  return { caseData, cmp, interp: cmp.b, report };
}

const GOLDEN = [
  {
    name: 'normal spirometry, volumes and diffusing capacity',
    build: () => golden({}),
    final: [/adequate/, /consistent with normal spirometry/, /within the reference range/],
    forbid: [/obstruction/, /restriction/, /bronchodilator/, /mild|moderate|severe/],
    key: { pattern: 'normal', severity: null, dlco: 'normal', bronchodilator: null },
  },
  {
    name: 'obstruction with air trapping and hyperinflation',
    build: () => golden({ fev1: 1.9, fvc: 5.0, volumes: { tlc: 8.8, rv: 3.2, vc: 5.6, frc: 4.6, erv: 1.4, ic: 4.2 } }),
    final: [/consistent with airflow obstruction/, /of severe severity/, /consistent with hyperinflation/, /consistent with air trapping/],
    forbid: [/consistent with restriction/, /diagnos/],
    key: { pattern: 'obstruction', severity: 'severe' },
  },
  {
    name: 'mixed obstruction and restriction',
    build: () => golden({ fev1: 2.0, fvc: 3.4, volumes: { tlc: 5.2, rv: 1.8, vc: 3.4, frc: 3.0, erv: 1.2, ic: 2.2 }, dlco: null }),
    final: [/consistent with mixed obstruction and restriction/, /severity not graded/],
    forbid: [/of (?:mild|moderate|severe) severity/],
    key: { pattern: 'mixed', severity: null },
  },
  {
    name: 'nonspecific pattern: low FVC, preserved ratio, normal TLC',
    build: () => golden({ fev1: 3.0, fvc: 3.7, volumes: { tlc: 6.8, rv: 3.1, vc: 3.7, frc: 3.6, erv: 0.5, ic: 3.2 }, dlco: null }),
    final: [/consistent with a nonspecific pattern/, /severity not graded/],
    forbid: [/consistent with restriction/],
    key: { pattern: 'nonspecific', severity: null },
  },
  {
    name: 'restriction with raised KCO and reduced alveolar volume',
    build: () => golden({ fev1: 3.0, fvc: 3.7, volumes: { tlc: 5.2, rv: 1.5, vc: 3.7, frc: 2.9, erv: 1.4, ic: 2.3 }, dlco: { dlcoAdjusted: 26, va: 4.0 } }),
    final: [/consistent with restriction/, /the KCO is raised/, /incomplete expansion/],
    forbid: [/consistent with mixed/],
    key: { pattern: 'restriction', severity: null, dlco: 'normal' },
    sections: { dlco: [/KCO/, /alveolar volume is reduced/] },
  },
  {
    name: 'low hemoglobin with a low measured DLCO that is normal after adjustment',
    build: () => golden({ patient: { hbGdl: 8.4 }, dlco: { dlcoAdjusted: 29, va: 6.5 }, raw: 22, hbFactor: 29 / 22 }),
    final: [/adjusted for hemoglobin|hemoglobin-adjusted DLCO/, /within the reference range/, /(?:without hemoglobin adjustment the measured DLCO would be classified as reduced|before hemoglobin adjustment the measured DLCO appears reduced|unadjusted DLCO would be read as reduced)/],
    forbid: [/consistent with obstruction/],
    key: { pattern: 'normal', dlco: 'normal' },
    sections: { dlco: [/low hemoglobin concentration lowers the measured DLCO|lowers the measured DLCO|lowered by a low hemoglobin/, /8\.4 g\/dL/, /22\.0 mL\/min\/mmHg/] },
    flaws: ['dlco-unadjusted-for-hb'],
  },
  {
    name: 'borderline ratio reclassified between GLI-2012 and GLI Global',
    build: () => golden({ fev1: 3.585, fvc: 5.0, volumes: null, dlco: null }),
    final: [/depends on the reference equation/, /borderline/, /GLI-2012/, /GLI Global \(2022\)/, /FEV1\/FVC ratio is below the lower limit of normal under GLI-2012/],
    forbid: [/clearly/],
    key: { pattern: 'normal', severity: null },
    flaws: ['ignores-equation-change'],
  },
  {
    name: 'poor-quality session qualifies the result',
    build: () => golden({ grades: { fev1: 'E', fvc: 'D' }, nAcc: [1, 2], spread: [null, 0.24], volumes: null, dlco: null }),
    final: [/qualified/, /grade E for FEV1 and grade D for FVC/],
    forbid: [/adequate/, /full confidence/],
    key: { pattern: 'normal', gradeFev1: 'E', gradeFvc: 'D' },
    flaws: ['ignores-quality'],
  },
  {
    name: 'spirometry only: preserved ratio impaired spirometry needs volumes',
    build: () => golden({ fev1: 2.6, fvc: 3.0, volumes: null, dlco: null }),
    final: [/preserved ratio impaired spirometry \(PRISm\)/, /lung volumes are needed/, /not measured/],
    forbid: [/consistent with restriction/, /bronchodilator/],
    key: { pattern: 'prism', severity: null, dlco: null },
    flaws: ['restriction-without-tlc'],
  },
  {
    name: 'bronchodilator response significant by 2022 and not by the earlier rule',
    build: () => golden({ fev1: 3.0, fvc: 5.0, post: { fev1: 3.3, fvc: 5.52 }, volumes: null, dlco: null }),
    final: [/significant by the 2022 criterion/, /not significant by the earlier criterion/, /criteria disagree|result depends on the criterion/],
    forbid: [],
    key: { bronchodilator: 'significant' },
    flaws: ['wrong-bronchodilator-rule'],
  },
  {
    name: 'low ERV with raised body mass index and normal spirometry',
    build: () => golden({ patient: { weightKg: 125 }, volumes: { tlc: 6.8, rv: 1.9, vc: 4.9, frc: 2.3, erv: 0.4, ic: 4.5 } }),
    final: [/ERV/, /body mass index (?:of |is )?39\.5 kg\/m²/, /chest-wall load/],
    forbid: [/obesity/i],
    key: { pattern: 'normal' },
  },
  {
    name: 'heavy scenario: major limitations first, no-effect item stated as such, carboxyhemoglobin and assumed height',
    build: () => golden({
      fev1: 3.0, fvc: 5.0, volumes: null, dlco: null,
      scenario: {
        level: 'heavy', ids: [],
        caveats: [
          { id: 'a', text: 'Ambient temperature was recorded at 22 C', weight: 'minor' },
          { id: 'b', text: 'Height was estimated from ulna length and not measured', weight: 'major' },
          { id: 'c', text: 'The patient smoked 30 minutes before testing', weight: 'major' },
          { id: 'd', text: 'A second technologist ran the last maneuvers; this does not change the interpretation', weight: 'minor' },
        ],
        decoyCaveats: [{ id: 'x', text: 'Decoy: testing was performed supine' }],
        height: { statedCm: 178, trueCm: 183, source: 'ulna', note: '' },
        referenceSex: { used: 'F', birth: 'M', note: '' },
        coHbPercent: 6,
      },
    }),
    final: [/height was estimated from ulna length and not measured; the patient smoked 30 minutes before testing/, /do not change the interpretation/, /second technologist/],
    forbid: [/supine/, /ambient temperature/],
    key: { pattern: 'obstruction', severity: 'mild' },
    sections: {
      reference: [/178 cm[^.]*ulna length/, /differs from the sex recorded at birth|recorded sex at birth|sex recorded at birth/],
      limitations: [/ambient temperature was recorded at 22 C/],
    },
    flaws: ['omits-major-caveat'],
  },
];

test('there are twelve hand-written golden cases covering the required situations', () => assert.equal(GOLDEN.length, 12));

for (const g of GOLDEN) {
  test(`golden: ${g.name}`, () => {
    const { caseData, cmp, interp } = g.build();
    for (const [k, v] of Object.entries(g.key)) assert.equal(interp.key[k], v, `key.${k}`);
    // Every seed must satisfy the expected phrases: wording changes, content does not.
    for (let seed = 0; seed < 12; seed++) {
      const n = composeNarrative({ caseData, interp, cmp, seed });
      const lower = n.finalStatement;
      for (const re of g.final) assert.match(lower, re, `seed ${seed}\n${n.finalStatement}`);
      for (const re of g.forbid) assert.doesNotMatch(lower, re, `seed ${seed}\n${n.finalStatement}`);
      for (const [id, res] of Object.entries(g.sections ?? {})) {
        const text = n.sections.find((s) => s.id === id)?.text ?? '';
        for (const re of res) assert.match(text, re, `seed ${seed} section ${id}\n${text}`);
      }
      assertFinalMatchesKey({ c: { report: caseData.report, scenario: caseData.scenario }, cmp, interp }, n.finalStatement, `golden ${g.name} seed ${seed}`);
      for (const flaw of g.flaws ?? []) assert.ok(n.distractors.some((d) => d.flaw === flaw), `golden ${g.name}: expected a ${flaw} distractor`);
      assert.ok(n.distractors.length >= 5);
    }
  });
}

test('golden: a borderline value is never called clearly abnormal and a flip names both equations and z-scores', () => {
  const { caseData, cmp, interp } = GOLDEN[6].build();
  assert.equal(cmp.labelChanges.length, 1);
  const n = composeNarrative({ caseData, interp, cmp, seed: 2 });
  const sens = n.sections.find((s) => s.id === 'sensitivity').text;
  assert.match(sens, /FEV1\/FVC ratio is below the lower limit of normal under GLI-2012 \(z-score −1\.88, borderline\) but within the reference range under GLI Global \(2022\) \(z-score −1\.38, borderline\)/);
  assert.match(sens, /the pattern is airflow obstruction under GLI-2012 but normal spirometry under GLI Global \(2022\)/);
  assert.ok(n.findings.some((f) => f.id === 'equation-change'));
  assert.ok(n.distractors.some((d) => d.flaw === 'ignores-equation-change' && /unchanged by the choice of reference equation|does not depend on the reference equation/.test(d.text)));
});

test('golden: severity is stated only for obstruction patterns and the statement says when it is not graded', () => {
  for (const idx of [2, 3, 4]) {
    const { caseData, cmp, interp } = GOLDEN[idx].build();
    const n = composeNarrative({ caseData, interp, cmp, seed: 4 });
    assert.equal(interp.key.severity, null);
    assert.match(n.sections.find((s) => s.id === 'pattern').text, /not graded/);
    assert.doesNotMatch(allText({ ...n, distractors: [] }), /\b(?:mild|moderate|severe)\b/);
    assert.ok(n.findings.some((f) => f.id === 'severity' && /not graded/.test(f.text)));
  }
});

test('extractFacts reads the facts of a hand-written statement', () => {
  const f = extractFacts('Test quality is grade B for FEV1 and grade C for FVC, and the interpretation is made with reduced confidence. The FEV1/FVC ratio (z-score −1.70, borderline) is marginally below the lower limit of normal, consistent with airflow obstruction, of mild severity, graded on FEV1 (z-score −1.20). The response is not significant by the 2022 criterion (change above 10% of the predicted value) and significant by the earlier criterion.');
  assert.deepEqual(f, ['bd:2022:not-significant', 'bd:earlier:significant', 'bd:mentioned'.replace('bd:mentioned', 'borderline:FEV1/FVC ratio'), 'grades:BC', 'pattern:obstruction', 'quality:reduced', 'severity:mild'].sort());
});

test('a session with no usable maneuver cannot be interpreted and says so, qualified, without inventing values', () => {
  const g = golden({ fev1: null, fvc: null, volumes: null, dlco: null, grades: { fev1: 'F', fvc: 'F' }, nAcc: [0, 0], spread: [null, null] });
  assert.equal(g.interp.pattern, 'indeterminate');
  for (let seed = 0; seed < 6; seed++) {
    const n = composeNarrative({ caseData: g.caseData, interp: g.interp, cmp: g.cmp, seed });
    const f = assertFinalMatchesKey({ c: { report: g.report, scenario: undefined }, cmp: g.cmp, interp: g.interp }, n.finalStatement, `indeterminate seed ${seed}`);
    assert.ok(f.includes('pattern:indeterminate') && f.includes('quality:qualified'));
    assert.doesNotMatch(allText(n), /consistent with|z-score/);
    assert.ok(n.distractors.length >= 5 && n.distractors.every((d) => d.text !== n.finalStatement));
    for (const d of n.distractors) assertContradicts({ c: { report: g.report, scenario: undefined }, cmp: g.cmp, interp: g.interp }, d, f);
  }
});
