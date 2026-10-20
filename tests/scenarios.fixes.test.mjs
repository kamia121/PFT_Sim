/**
 * Regression tests for the clinical-review findings on the scenario layer (branch fix/scenarios-case).
 * Each test names the finding it locks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { buildCase } from '../src/core/case.js';
import { ARCHETYPES, TECHNIQUE_LEVELS, resolveDescriptor } from '../src/core/descriptor.js';
import { DLCO_MODEL } from '../src/core/dlco-trace.js';
import { ALL_FAULT_IDS } from '../src/core/maneuver.js';
import { FAULT_LABELS, FAULT_TEXT, FAULT_SHORT, faultWording } from '../src/core/quality.js';
import { cohbDlcoFactor } from '../src/core/physiology.js';
import { SCENARIOS, getScenario } from '../src/scenarios/library.js';
import { SCENARIO_CONSTANTS as C, bronchodilatorBaselineShift, altitudeDlcoMultiplier } from '../src/scenarios/constants.js';

const ds = await loadDatasets();
const build = (seed, archetype, ids, extra = {}) => buildCase({ seed, archetype, technique: 'good', scenarioLevel: 'light', scenarioIds: ids, ...extra }, ds);
const plain = (seed, archetype, extra = {}) => buildCase({ seed, archetype, technique: 'good', ...extra }, ds);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const seeds = (n, from = 1) => Array.from({ length: n }, (_, i) => from + i);
const alltext = (c) => [...c.scenario.statements.map((s) => s.text), ...c.scenario.technologistComments, c.scenario.referenceSex.note, ...c.scenario.caveats.map((x) => x.text), ...c.scenario.decoyCaveats.map((x) => x.text)];

// Finding 1 -------------------------------------------------------------------------------------------------------------

test('vaping carries no carboxyhemoglobin effect; cigarette and water pipe do', () => {
  const vaped = getScenario('sub-vaped-within-hour'), smoked = getScenario('sub-smoked-within-hour');
  assert.equal(vaped.effects.dlco, undefined, 'vaping has no DLCO effect');
  assert.ok(smoked.effects.dlco.coHbPercent);
  for (const v of vaped.variants) assert.ok(!/cigarette\b(?! use)|water pipe|hookah/i.test(v.replace(/e-cigarette/gi, '')), `vaped phrasing names a combustion source: ${v}`);
  for (const v of smoked.variants) assert.ok(!/vap|e-cig/i.test(v), `smoked phrasing names vaping: ${v}`);
  assert.ok(smoked.variants.some((v) => /water pipe/i.test(v)) && smoked.variants.some((v) => /cigarette/i.test(v)));
  for (const seed of seeds(40)) {
    const p = plain(seed, 'obstruction'), c = build(seed, 'obstruction', ['sub-vaped-within-hour']);
    assert.equal(c.scenario.coHbPercent, null);
    assert.equal(c.dlco.adjusted, p.dlco.adjusted, 'DLCO is untouched by vaping');
    assert.equal(c.dlco.va, p.dlco.va);
    assert.ok(c.scenario.preTest.lastVapingHours > 0 && c.scenario.preTest.lastVapingHours < 1);
    assert.equal(c.scenario.preTest.lastSmokingHours, undefined, 'a vaping history does not set the smoking record');
    const ids = c.scenario.caveats.map((x) => x.id);
    assert.ok(!ids.includes('smoking-cohb-dlco'));
    assert.ok(ids.includes('vaping-acute-airway-irritation'));
    assert.ok(c.scenario.decoyCaveats.some((x) => x.id === 'decoy-vaping-cohb'), 'raised COHb from vaping is offered only as a decoy');
    assert.ok(!c.scenario.caveats.some((x) => /raise[sd]? carboxyhemoglobin|lower the measured DLCO/.test(x.text) && x.id.startsWith('vaping')));
  }
  const s = build(7, 'obstruction', ['sub-smoked-within-hour']);
  assert.ok(s.scenario.coHbPercent >= 4 && s.scenario.coHbPercent <= 9);
  assert.ok(s.scenario.caveats.some((x) => x.id === 'smoking-cohb-dlco' && /water pipe/.test(x.text)));
});

// Finding 2 -------------------------------------------------------------------------------------------------------------

test('DLCO technique faults act once: Valsalva and Mueller stay inside the tracing range, not its square', () => {
  const [fLo, fHi] = DLCO_MODEL.valsalvaDlcoFall.value, [rLo, rHi] = DLCO_MODEL.muellerDlcoRise.value;
  const slack = 0.02; // the tracing recomputes the printed values from noisy arrays (within 1% of the case values)
  const val = [], mue = [];
  for (const seed of seeds(60)) {
    const arch = ARCHETYPES[seed % ARCHETYPES.length];
    const p = plain(seed, arch);
    const v = build(seed, arch, ['dlco-valsalva']), m = build(seed, arch, ['dlco-mueller']);
    const rv = v.dlco.raw / p.dlco.raw, rm = m.dlco.raw / p.dlco.raw;
    assert.ok(rv >= 1 - fHi - slack && rv <= 1 - fLo + slack, `Valsalva DLCO ratio ${rv} outside the tracing range (seed ${seed})`);
    assert.ok(rm >= 1 + rLo - slack && rm <= 1 + rHi + slack, `Mueller DLCO ratio ${rm} outside the tracing range (seed ${seed})`);
    assert.ok(Math.abs(v.dlco.adjusted / p.dlco.adjusted - rv) < 0.01, 'the adjusted value follows the printed raw value');
    val.push(rv); mue.push(rm);
    assert.ok(Math.abs(v.dlco.va / p.dlco.va - 1) < 0.015, 'Valsalva does not change VA beyond the tracing recomputation');
  }
  // Applied twice the mean ratio would be near 0.72 (Valsalva) and 1.31 (Mueller).
  assert.ok(mean(val) > 0.78 && mean(mue) < 1.25, `${mean(val)} ${mean(mue)}`);
  assert.equal(getScenario('dlco-valsalva').effects.dlco, undefined);
  assert.equal(getScenario('dlco-mueller').effects.dlco, undefined);
});

test('incomplete inhalation acts once and the stated VI/VC is the one the tracing uses', () => {
  const exponent = DLCO_MODEL.lowViDlcoExponent.value;
  for (const seed of seeds(40)) {
    const arch = ARCHETYPES[seed % ARCHETYPES.length];
    const p = plain(seed, arch), c = build(seed, arch, ['dlco-low-inspired-volume']);
    const stated = Number(/(\d+)%/.exec(c.scenario.statements[0].text)?.[1]);
    assert.equal(stated, Math.round(c.dlcoTrace.inspired.viOverVc * 100), `statement ${stated}% vs tracing ${c.dlcoTrace.inspired.viOverVc} (seed ${seed})`);
    assert.ok(c.dlcoTrace.faults.some((f) => f.code === 'low-vi'));
    const vaRatio = c.dlco.va / p.dlco.va, dlcoRatio = c.dlco.raw / p.dlco.raw;
    assert.ok(vaRatio < 0.97, 'VA falls');
    // DLCO follows VA through the tracing's exponent only; a second application would put it near vaRatio^(2 x exponent) or below.
    assert.ok(Math.abs(dlcoRatio - vaRatio ** exponent) < 0.025, `DLCO ratio ${dlcoRatio}, VA ratio ${vaRatio} (seed ${seed})`);
    assert.ok(c.dlco.kco > p.dlco.kco, 'KCO rises');
  }
});

test('DLCO leak has no tracing effect, so its scenario multipliers are the only application', () => {
  for (const seed of seeds(20)) {
    const c = build(seed, 'normal', ['dlco-leak']);
    assert.equal(c.dlcoTrace.reproducesCase, true);
    assert.ok(c.dlcoTrace.faults.some((f) => f.code === 'leak' && !f.affectsNumbers));
  }
});

// Finding 3 -------------------------------------------------------------------------------------------------------------

test('short plethysmographic IC lowers TLC and VC, leaves RV and the single-breath VA alone, and raises RV/TLC', () => {
  let lowerTlc = 0;
  for (const seed of seeds(40)) {
    const arch = ['normal', 'obstruction', 'mixed', 'restriction-parenchymal'][seed % 4];
    const p = plain(seed, arch), c = build(seed, arch, ['pleth-incomplete-ic']);
    assert.ok(c.volumes.tlc < p.volumes.tlc && c.volumes.vc < p.volumes.vc);
    assert.equal(c.volumes.rv, p.volumes.rv, 'RV is unchanged');
    assert.ok(c.volumes.rv / c.volumes.tlc > p.volumes.rv / p.volumes.tlc, 'RV/TLC rises');
    // The VA comes from a separate maneuver; it moves only through the exact constraint VA <= 0.99 TLC.
    assert.equal(c.dlco.va, Math.min(p.dlco.va, 0.99 * c.volumes.tlc), 'VA does not follow the artifactual TLC');
    if (c.dlco.va === p.dlco.va) lowerTlc++;
    assert.ok(c.dlco.va <= c.volumes.tlc);
  }
  // Where VA exceeded the lowered TLC the exact constraint VA <= 0.99 TLC (checked above) is the only thing that moves it.
  assert.ok(lowerTlc >= 20, `VA unchanged in only ${lowerTlc} of 40 cases`);
  assert.equal(getScenario('pleth-incomplete-ic').effects.volumes.vaFollowsTlc, undefined);
  assert.match(getScenario('pleth-incomplete-ic').caveats[0].text, /RV is unchanged, so RV\/TLC rises/);
  // A real restriction of inspiration (binder, surgery) does lower the inhaled volume of the single-breath test too.
  assert.equal(getScenario('prep-binder').effects.volumes.vaFollowsTlc, true);
});

// Finding 4 -------------------------------------------------------------------------------------------------------------

test('bronchodilator baseline shift is monotone non-increasing in the hours since the dose, and the same curve serves LABA and usual inhalers', () => {
  for (const kind of ['saba', 'laba', 'lama']) {
    let last = Infinity;
    for (let h = 0.25; h <= 60; h += 0.25) {
      const s = bronchodilatorBaselineShift(kind, h, 0.9);
      assert.ok(s <= last + 1e-12, `${kind} at ${h} h`);
      assert.ok(s > 0);
      last = s;
    }
  }
  assert.equal(getScenario('med-usual-inhalers').effects.physiology.baselineShiftToPost, getScenario('med-laba-recent').effects.physiology.baselineShiftToPost);
  const [pLo, pHi] = C.bronchodilatorWashout.peakShift;
  const byScenario = {};
  for (const id of ['med-laba-recent', 'med-usual-inhalers', 'med-saba-recent', 'med-lama-recent']) {
    const win = { 'med-laba-recent': ['lastLabaHours', 'laba'], 'med-usual-inhalers': ['lastLabaHours', 'laba'], 'med-saba-recent': ['lastSabaHours', 'saba'], 'med-lama-recent': ['lastLamaHours', 'lama'] }[id];
    const rows = [];
    for (const seed of seeds(300)) {
      const arch = ['obstruction', 'mixed', 'normal'][seed % 3];
      if (!getScenario(id).applies(resolveDescriptor({ seed, archetype: arch, panel: 'full' }), null)) continue;
      const c = build(seed, arch, [id]);
      const h = c.scenario.preTest[win[0]], shift = c.scenario.acute.baselineShiftToPost;
      const remaining = Math.max(C.bronchodilatorWashout.minimumRemaining, 1 - h / C.bronchodilatorWashout.windowHours[win[1]]);
      assert.ok(shift >= pLo * remaining - 1e-3 && shift <= pHi * remaining + 1e-3, `${id}: shift ${shift} at ${h} h`);
      rows.push({ h, shift });
    }
    assert.ok(rows.length > 40, id);
    rows.sort((a, b) => a.h - b.h);
    const half = Math.floor(rows.length / 2);
    assert.ok(mean(rows.slice(0, half).map((r) => r.shift)) > mean(rows.slice(half).map((r) => r.shift)), `${id}: a more recent dose must have the larger effect`);
    byScenario[id] = mean(rows.map((r) => r.shift));
  }
  // A dose 4 to 14 h ago (usual inhalers) acts at least as strongly as one 8 to 20 h ago (recent LABA).
  assert.ok(byScenario['med-usual-inhalers'] > byScenario['med-laba-recent']);
});

// Finding 5 -------------------------------------------------------------------------------------------------------------

test('every scenario keeps its caveats on its own subject (no copied caveat from a sibling method)', () => {
  const ulna = getScenario('height-unable-stand-ulna');
  for (const c of ulna.caveats) assert.ok(!/leg length|arm span/i.test(c.text), `${c.id}: ${c.text}`);
  assert.ok(ulna.caveats.some((c) => /ulna/i.test(c.text) && c.id === 'height-ulna-measurement'));
  // A caveat id is never shared between scenarios of different subject; a decoy id names its own subject.
  const texts = new Map();
  for (const s of SCENARIOS) for (const c of s.caveats) {
    if (texts.has(c.text)) assert.equal(texts.get(c.text), c.id, `two ids carry the text of ${c.id}`);
    texts.set(c.text, c.id);
  }
  const subjectOf = (id) => id.replace(/^decoy-/, '');
  const checks = [
    ['decoy-lama-dlco', /DLCO/], ['decoy-exercise-volumes', /volumes/], ['decoy-obesity-dlco-unreliable', /diffusing capacity/],
    ['decoy-meal-dlco', /diffusing/], ['decoy-alcohol-dlco', /DLCO/], ['decoy-anxiety-dlco', /DLCO/], ['decoy-oxygen-spirometry', /FEV1/],
  ];
  const decoys = new Map(SCENARIOS.flatMap((s) => s.decoyCaveats.map((d) => [d.id, d.text])));
  for (const [id, re] of checks) assert.match(decoys.get(id) ?? '', re, subjectOf(id));
  assert.equal(decoys.has('decoy-lama-ics'), false);
  assert.equal(decoys.has('decoy-obesity-raises-dlco-artifact'), false);
});

// Finding 6 -------------------------------------------------------------------------------------------------------------

test('"the sex choice does not change the result" is a decoy only when the classification really changes, and a true caveat when it does not', () => {
  let changed = 0, same = 0;
  for (const id of ['sex-identity-entered', 'sex-birth-default', 'sex-not-recorded']) {
    for (const seed of seeds(120)) {
      const arch = ARCHETYPES[seed % ARCHETYPES.length];
      const c = build(seed, arch, [id]);
      const alt = c.scenario.referenceSex.alternative;
      const caveatIds = c.scenario.caveats.map((x) => x.id), decoyIds = c.scenario.decoyCaveats.map((x) => x.id);
      assert.equal(typeof alt.classificationChanges, 'boolean');
      assert.equal(alt.classificationChanges, alt.pattern !== alt.patternUsed || alt.labelChanges.length > 0);
      if (alt.classificationChanges) {
        changed++;
        assert.ok(decoyIds.includes('decoy-sex-no-effect'), `${id} seed ${seed}`);
        assert.ok(!caveatIds.includes('sex-choice-no-change'));
      } else {
        same++;
        assert.ok(!decoyIds.includes('decoy-sex-no-effect'), `${id} seed ${seed}: a true statement offered as a decoy`);
        assert.ok(caveatIds.includes('sex-choice-no-change'));
        assert.ok(c.anchorKey.key.caveatIds.includes('sex-choice-no-change'), 'the true statement is part of the key');
      }
    }
  }
  assert.ok(changed > 20 && same > 20, `changed ${changed}, same ${same}`);
});

// Finding 7 -------------------------------------------------------------------------------------------------------------

test('sex and gender wording: gender identity and sex assigned at birth are stated separately, entering identity is not an operator error', () => {
  const sexScenarios = ['sex-birth-default', 'sex-identity-entered', 'sex-not-recorded'].map(getScenario);
  const banned = /identifies as|identifies with|agreed to this|did not change the reference sex|operator error|mistake|incorrectly/i;
  for (const s of sexScenarios) {
    for (const t of [...s.variants, ...s.comments, ...s.caveats.map((c) => c.text), ...s.decoyCaveats.map((c) => c.text)]) assert.ok(!banned.test(t), `${s.id}: ${t}`);
  }
  for (const id of ['sex-birth-default', 'sex-identity-entered']) {
    for (const v of getScenario(id).variants) assert.match(v, /[Gg]ender identity/, v);
    for (const v of getScenario(id).variants) assert.match(v, /[Ss]ex assigned at birth/, v);
  }
  const identity = getScenario('sex-identity-entered').caveats.find((c) => c.id === 'sex-identity-used-nondefault').text;
  assert.match(identity, /Neither entry is an error/);
  assert.match(identity, /both reference sexes/);
  assert.match(identity, /how long any hormone therapy has been taken/);
  const everyDecoy = SCENARIOS.flatMap((s) => s.decoyCaveats.map((d) => d.id));
  assert.ok(!everyDecoy.includes('decoy-hormones-change-lungs'), 'the effect of hormone therapy on lung size is not established, so it is not keyed false');
  for (const seed of seeds(60)) {
    for (const id of ['sex-birth-default', 'sex-identity-entered']) {
      const c = build(seed, ARCHETYPES[seed % ARCHETYPES.length], [id]);
      assert.match(c.scenario.referenceSex.note, /gender-affirming hormone therapy on lung size is not established/);
      assert.equal(c.scenario.referenceSex.birthDisclosed, true);
      assert.match(c.scenario.statements[0].text, /(man|woman|nonbinary|not disclosed)/);
      assert.ok(!/identifies/.test(alltext(c).join(' ')));
    }
  }
});

test('sex-not-recorded does not reveal the sex assigned at birth in any text visible before the answers are checked', () => {
  let differs = 0;
  for (const seed of seeds(200)) {
    const arch = ARCHETYPES[seed % ARCHETYPES.length];
    const c = build(seed, arch, ['sex-not-recorded']);
    const { used, birth } = c.scenario.referenceSex;
    assert.equal(c.scenario.referenceSex.birthDisclosed, false);
    if (used === birth) continue;
    differs++;
    const birthWord = birth === 'M' ? 'male' : 'female', usedWord = used === 'M' ? 'male' : 'female';
    const visible = [...c.scenario.statements.map((s) => s.text), ...c.scenario.technologistComments, c.scenario.referenceSex.note, JSON.stringify(c.scenario.preTest), c.scenario.height.note].join('\n');
    assert.ok(!new RegExp(`\\b${birthWord}\\b`, 'i').test(visible) && !/\bman\b|\bwoman\b|assigned at birth/i.test(visible), `birth sex shown: ${visible}`);
    assert.match(visible, new RegExp(`\\b${usedWord}\\b`));
  }
  assert.ok(differs > 30);
});

// Finding 8 -------------------------------------------------------------------------------------------------------------

test('reference scenarios describe a European-ancestry reference population, not a missing group equation', () => {
  const s = getScenario('ref-european-only');
  for (const t of [...s.variants, ...s.caveats.map((c) => c.text)]) {
    assert.ok(!/none is available|no group-specific|no equation|not available|was available/i.test(t), t);
  }
  assert.match(s.caveats[0].text, /reference population/);
  assert.match(s.caveats[0].text, /advises against ancestry adjustment factors/);
  assert.ok(s.variants.every((v) => /European/.test(v)));
});

// Finding 9 -------------------------------------------------------------------------------------------------------------

test('every fault id the generator can emit has readable wording in all three tables, and no comment prints a bare id', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const seed = 100 + 13 * i;
    const c = buildCase({ seed, archetype: ARCHETYPES[i % ARCHETYPES.length], technique: TECHNIQUE_LEVELS[i % 3], scenarioLevel: 'heavy' }, ds);
    for (const set of [c.spirometry.pre, c.spirometry.post]) for (const m of set?.maneuvers ?? []) for (const f of m.faults) seen.add(f);
  }
  for (const f of seen) assert.ok(ALL_FAULT_IDS.includes(f), `generator emitted unlisted fault ${f}`);
  for (const f of ['leak', 'pause-at-TLC', 'mouthpiece-obstruction', 'submaximal-effort', 'no-plateau']) assert.ok(seen.has(f), `${f} never appeared in 400 heavy cases`);
  for (const id of ALL_FAULT_IDS) {
    for (const table of [FAULT_LABELS, FAULT_TEXT, FAULT_SHORT]) {
      assert.ok(table[id], `${id} missing`);
      if (id.includes('-')) assert.notEqual(table[id], id, `${id} is a bare id`);
      assert.ok(!/-/.test(table[id]) || /\s/.test(table[id]), `${id}: ${table[id]}`);
    }
    assert.equal(faultWording(id), FAULT_TEXT[id]);
  }
  assert.equal(faultWording('some-new-fault'), 'some new fault', 'an unknown id is spelled out, never printed raw');
});

// Finding 10 ------------------------------------------------------------------------------------------------------------

test('smaller overstatements are corrected in the scenario text', () => {
  const caveat = (id) => SCENARIOS.flatMap((s) => s.caveats).find((c) => c.id === id)?.text ?? assert.fail(`no caveat ${id}`);
  // Slow start: the direction of the FEV1 error is not fixed.
  const slow = caveat('slow-start-bev-fev1-unusable');
  assert.ok(!/inflate|hides? obstruction/.test(slow) && /no fixed direction/.test(slow));
  assert.equal(SCENARIOS.flatMap((s) => s.caveats).some((c) => c.id === 'slow-start-bev-hides-obstruction'), false);
  // Anxiety: technique and disease are not exclusive.
  const anx = caveat('anxiety-variable-effort');
  assert.ok(!/and not airway disease/.test(anx) && /cannot be excluded or confirmed/.test(anx));
  // Missing hemoglobin: a markedly low DLCO is still read.
  const hb = caveat('hb-missing-dlco-unadjusted');
  assert.ok(!/cannot be read/.test(hb) && /markedly low DLCO is still reported as impaired gas transfer/.test(hb));
  // Facial weakness: genuine neuromuscular weakness is named as a cause.
  assert.match(caveat('weakness-true-low-fvc'), /neuromuscular disease[\s\S]*lowers FVC/);
  assert.ok(getScenario('iface-facial-weakness').caveats.some((c) => c.id === 'weakness-true-low-fvc'));
  // COHb: older standards gave a correction; the current one is unverified here.
  const cohb = caveat('cohb-measured-unadjusted');
  assert.ok(!/not settled/.test(cohb));
  assert.match(cohb, /Earlier standards gave a correction for carboxyhemoglobin; this project has not verified the current one/);
  // Obesity is not taught as raising the DLCO anywhere a statement is true.
  const decoyIds = new Set(SCENARIOS.flatMap((s) => s.decoyCaveats.map((d) => d.id)));
  for (const s of SCENARIOS) for (const t of [...s.variants, ...s.comments, ...s.caveats.map((c) => c.text)]) {
    if (/obes/i.test(t) && /DLCO|diffusing/i.test(t)) assert.ok(!/rais|increas|higher|above/i.test(t), `${s.id}: ${t}`);
  }
  assert.ok(![...decoyIds].some((id) => /obesity-raises/.test(id)));
});

test('altitude raises the measured DLCO through the lower alveolar PO2 by an amount that follows the stated elevation', () => {
  const rows = [];
  for (const seed of seeds(120)) {
    const arch = ARCHETYPES[seed % ARCHETYPES.length];
    const p = plain(seed, arch), c = build(seed, arch, ['env-altitude']);
    const elev = c.scenario.preTest.elevationM;
    assert.equal(elev % 50, 0, 'the elevation is the rounded value printed in the statement');
    assert.ok(c.scenario.statements[0].text.includes(String(elev)));
    assert.ok(!/lived|resident|years/.test(c.scenario.statements[0].text), 'chronic residence is not assumed');
    const ratio = c.dlco.raw / p.dlco.raw;
    assert.ok(Math.abs(ratio - altitudeDlcoMultiplier(elev)) < 1e-3, `ratio ${ratio} at ${elev} m`);
    rows.push([elev, ratio]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i][1] >= rows[i - 1][1] - 1e-9, 'a higher laboratory gives a larger rise');
  assert.ok(altitudeDlcoMultiplier(0) === 1 && altitudeDlcoMultiplier(2000) > altitudeDlcoMultiplier(1400));
  assert.equal(C.altitude.verification, 'unverified');
  assert.match(getScenario('env-altitude').caveats[0].text, /unverified/);
  assert.match(getScenario('env-altitude').caveats[0].text, /lower alveolar PO2/);
});

test('the COHb factor still comes from the documented rule for the smoked scenario', () => {
  const p = plain(5, 'obstruction'), c = build(5, 'obstruction', ['sub-smoked-within-hour']);
  assert.ok(Math.abs(c.dlco.adjusted / p.dlco.adjusted - cohbDlcoFactor(c.scenario.coHbPercent)) < 1e-9);
});
