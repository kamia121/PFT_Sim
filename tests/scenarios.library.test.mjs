import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCENARIOS, SCENARIO_IDS, getScenario, compatible, CONTRADICTORY_CAVEATS, ALWAYS_ALLOWED_NUMBERS } from '../src/scenarios/library.js';

const NUMBER = /(?<![\w.])\d+(?:\.\d+)?(?![\w])/g;
const withoutPlaceholders = (t) => t.replace(/\{\w+\}/g, '').replace(/Tables? \d+/g, 'Table').replace(/GLI-\d{4}/g, 'GLI').replace(/FEF25-75/g, 'FEF');
const numbersIn = (t) => withoutPlaceholders(t).match(NUMBER) ?? [];

test('the catalog has at least 40 scenarios with unique ids and the required fields', () => {
  assert.ok(SCENARIOS.length >= 40, `only ${SCENARIOS.length}`);
  assert.equal(new Set(SCENARIO_IDS).size, SCENARIO_IDS.length);
  for (const s of SCENARIOS) {
    assert.match(s.id, /^[a-z0-9-]+$/);
    assert.ok(s.category && s.source, s.id);
    assert.ok(['high', 'medium', 'low'].includes(s.confidence), s.id);
    assert.equal(typeof s.applies, 'function');
    assert.equal(typeof s.effects, 'object');
    assert.ok(s.variants.length >= 3, `${s.id} has ${s.variants.length} variants`);
    assert.equal(new Set(s.variants).size, s.variants.length, `${s.id} repeats a variant`);
    assert.ok(s.caveats.length >= 1, s.id);
    assert.ok(s.decoyCaveats.length >= 1, `${s.id} has no decoy caveat`);
    for (const c of s.caveats) {
      assert.ok(c.id && c.text && ['major', 'minor'].includes(c.weight), `${s.id}: ${c.id}`);
      assert.ok(!c.id.startsWith('decoy-'), `${s.id}: real caveat named like a decoy`);
    }
    for (const c of s.decoyCaveats) assert.ok(c.id.startsWith('decoy-') && c.text, `${s.id}: ${c.id}`);
  }
});

test('the catalog covers every situation the brief names', () => {
  const need = {
    'no legs or unmeasurable height': ['height-no-legs', 'height-kyphoscoliosis', 'height-unable-stand-ulna', 'height-one-forearm-halfspan', 'height-old-chart'],
    'sex and gender': ['sex-birth-default', 'sex-identity-entered', 'sex-not-recorded'],
    smoking: ['sub-smoked-within-hour', 'sub-smoked-hours-ago', 'sub-cohb-measured'],
    'bronchodilators taken before the test': ['med-saba-recent', 'med-laba-recent', 'med-lama-recent', 'med-usual-inhalers'],
    'non-contributory statements': ['med-ics-today'],
    'preparation and clinical state': ['prep-exercise-recent', 'prep-heavy-meal', 'sub-caffeine', 'sub-alcohol', 'clin-uri', 'clin-abdominal-surgery', 'clin-mi-recent'],
    'body and setting': ['body-obesity', 'iface-tracheostomy', 'iface-dentures-loose', 'iface-facial-weakness', 'coop-language-cognitive', 'coop-anxiety', 'coop-pain-chest-wall', 'env-altitude', 'body-anemia-note', 'race-field-missing'],
    'spirometry quality': ['qs-submaximal-effort', 'qs-slow-start', 'qs-early-termination', 'qs-no-plateau', 'qs-cough-first-second', 'qs-glottic-closure', 'qs-leak', 'qs-tongue-teeth', 'qs-pause-at-tlc', 'qs-variable-effort'],
    'DLCO quality': ['dlco-low-inspired-volume', 'dlco-valsalva', 'dlco-mueller', 'dlco-hb-missing'],
  };
  for (const [topic, ids] of Object.entries(need)) for (const id of ids) assert.ok(getScenario(id), `${topic}: ${id} missing`);
});

test('the height scenarios state their purpose in the caveats and mark conversion factors as unverified in the constants', async () => {
  const { SCENARIO_CONSTANTS: C } = await import('../src/scenarios/constants.js');
  for (const k of ['armSpanDivisor', 'armSpanMeanRatio', 'armSpanIndividualSd', 'ulnaToHeightRatio', 'coHbDlcoFractionPerPercent', 'coHbReferencePercent']) assert.equal(C[k].verification, 'unverified', k);
  const kyph = getScenario('height-kyphoscoliosis');
  assert.ok(kyph.caveats.some((c) => /understates skeletal height/.test(c.text) && /milder/.test(c.text)));
  assert.ok(getScenario('height-no-legs').caveats.some((c) => /ratio varies with sex, age and ancestry/.test(c.text)));
  assert.ok(getScenario('height-old-chart').caveats.some((c) => /too tall/.test(c.text)));
});

test('non-contributory scenarios say "does not change the interpretation" and change no data', () => {
  const nc = SCENARIOS.filter((s) => s.noncontributory);
  assert.ok(nc.length >= 4);
  for (const s of nc) {
    assert.ok(s.caveats.some((c) => c.text.includes('does not change the interpretation') || c.text.includes('do not change the interpretation')), s.id);
    assert.deepEqual(Object.keys(s.effects).filter((k) => k !== 'preTest'), [], `${s.id} has data effects`);
    assert.deepEqual(Object.keys(s.effects.preTest ?? {}).filter((k) => k !== 'notes'), [], s.id);
  }
  const ics = getScenario('med-ics-today');
  assert.ok(ics.variants.some((v) => /inhaled steroid|inhaled corticosteroid|controller/.test(v)));
});

test('static scenario text carries no unverified number as fact', () => {
  for (const s of SCENARIOS) {
    const allowed = new Set([...ALWAYS_ALLOWED_NUMBERS, ...s.verifiedNumbers]);
    for (const c of [...s.caveats, ...s.decoyCaveats]) {
      for (const n of numbersIn(c.text)) assert.ok(allowed.has(n), `${s.id}/${c.id}: number ${n} is not in verifiedNumbers`);
      assert.ok(!/[{}]/.test(c.text), `${s.id}/${c.id} has a placeholder`);
    }
    // Statements and comments hold patient-history values and placeholders; they must not quote an effect size.
    for (const v of [...s.variants, ...s.comments]) assert.ok(!/%/.test(withoutPlaceholders(v.replace(/\{\w+\}%/g, ''))),`${s.id}: percent sign in a statement: ${v}`);
    for (const n of s.verifiedNumbers) assert.ok(s.caveats.some((c) => numbersIn(c.text).includes(n)), `${s.id}: verifiedNumbers lists ${n}, which no caveat uses`);
  }
});

test('wording is neutral and factual', () => {
  const banned = /tranny|transvestite|shemale|she-male|hermaphrodite|lifestyle|deviant|sex.change|\bMTF\b|\bFTM\b|biological (male|female|man|woman)|real (man|woman)|normal sex|admits|claims to be|so-called/i;
  for (const s of SCENARIOS) for (const t of [...s.variants, ...s.comments, ...s.caveats.map((c) => c.text), ...s.decoyCaveats.map((c) => c.text)]) {
    assert.ok(!banned.test(t), `${s.id}: ${t}`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}—]/u.test(t), `${s.id}: emoji or em dash in ${t}`);
  }
  const gender = SCENARIOS.filter((s) => s.category === 'Sex and gender');
  assert.equal(gender.length, 3);
  // The evidence limits from the research document are stated.
  assert.ok(getScenario('sex-birth-default').caveats.some((c) => /limited to small retrospective series/.test(c.text)));
  assert.ok(getScenario('sex-birth-default').caveats.some((c) => /appropriate reference equation for transgender patients is unknown/.test(c.text)));
});

test('decoys are never real caveats; a shared caveat id always carries the same text', () => {
  const real = new Map();
  for (const s of SCENARIOS) for (const c of s.caveats) {
    if (real.has(c.id)) assert.equal(real.get(c.id), c.text, `caveat ${c.id} differs between scenarios`);
    real.set(c.id, c.text);
  }
  const decoyText = new Map();
  for (const s of SCENARIOS) for (const d of s.decoyCaveats) {
    assert.ok(!real.has(d.id), `decoy ${d.id} is also a real caveat`);
    if (decoyText.has(d.id)) assert.equal(decoyText.get(d.id), d.text);
    decoyText.set(d.id, d.text);
    assert.ok(![...real.values()].includes(d.text), `decoy ${d.id} repeats a real caveat's text`);
  }
});

test('exclusive scenarios never combine, and contradictory caveats have no common scenario', () => {
  assert.equal(compatible(getScenario('sex-birth-default'), getScenario('sex-identity-entered')), false);
  assert.equal(compatible(getScenario('iface-dentures-ok'), getScenario('qs-leak')), false);
  assert.equal(compatible(getScenario('med-saba-recent'), getScenario('med-laba-recent')), false);
  assert.equal(compatible(getScenario('med-saba-recent'), getScenario('qs-leak')), true);
  // Every contradictory pair sits in scenarios that cannot be selected together.
  const owners = (id) => SCENARIOS.filter((s) => s.caveats.some((c) => c.id === id));
  for (const [a, b] of CONTRADICTORY_CAVEATS) for (const x of owners(a)) for (const y of owners(b)) assert.equal(compatible(x, y), false, `${x.id} and ${y.id} could co-occur`);
});

test('scenario code draws random numbers only from the "scenarios" stream (maneuver faults use their own stream in maneuver.js)', () => {
  for (const f of fs.readdirSync(new URL('../src/scenarios/', import.meta.url))) {
    const src = fs.readFileSync(new URL(`../src/scenarios/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/createStream\(([^)]*)\)/g)) assert.match(m[1], /'scenarios'/, `${f}: ${m[0]}`);
    assert.ok(!/Math\.random/.test(src), f);
  }
});
