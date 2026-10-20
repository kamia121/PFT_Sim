import test from 'node:test';
import assert from 'node:assert/strict';
import { generateManeuvers } from '../src/core/maneuver.js';
import { volume } from '../src/core/curve.js';

const truth = { fvc: 4.0, fev1: 3.1, k: 0.9, technique: 'fair' };
const strip = (g) => JSON.stringify(g.maneuvers.map(({ curve, ...m }) => ({ ...m, curve })));

test('the same seed and truth give byte-identical maneuver sets', () => {
  assert.equal(strip(generateManeuvers(42, truth)), strip(generateManeuvers(42, truth)));
  assert.notEqual(strip(generateManeuvers(42, truth)), strip(generateManeuvers(43, truth)));
});

test('a set holds 3 to 8 maneuvers', () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const technique of ['good', 'fair', 'poor']) {
      const n = generateManeuvers(seed, { ...truth, technique }).maneuvers.length;
      assert.ok(n >= 3 && n <= 8);
    }
  }
});

test('constraints hold on every maneuver: FEV1 <= FVC, tabulated values come from the curve', () => {
  let checked = 0;
  for (let seed = 0; seed < 400; seed++) {
    for (const technique of ['good', 'fair', 'poor']) {
      const { maneuvers } = generateManeuvers(seed, { ...truth, technique });
      for (const m of maneuvers) {
        assert.ok(m.fev1 <= m.fvc + 1e-9, `seed ${seed}`);
        assert.ok(Math.abs(volume(m.curve, Math.min(m.t0 + 1, m.fet)) - m.fev1) < 1e-9);
        assert.ok(Math.abs(volume(m.curve, m.fet) - m.fvc) < 1e-9);
        assert.ok(m.pef > 0 && m.fef2575 > 0 && m.bev >= 0);
        checked++;
      }
    }
  }
  assert.ok(checked > 3000);
});

test('poorer technique lowers the share of sessions graded A', () => {
  const share = (technique) => {
    let a = 0;
    for (let seed = 0; seed < 400; seed++) if (generateManeuvers(seed, { ...truth, technique }).summary.grades.fev1 === 'A' && generateManeuvers(seed, { ...truth, technique }).summary.grades.fvc === 'A') a++;
    return a / 400;
  };
  const [g, f, p] = ['good', 'fair', 'poor'].map(share);
  assert.ok(g > f && f > p, `${g} ${f} ${p}`);
});

test('scenario faults use their own streams: a scenario that adds nothing leaves the maneuvers unchanged', () => {
  const truth = { fvc: 4.2, fev1: 3.3, k: 0.9, T: 12, technique: 'fair' };
  const a = generateManeuvers(7, truth), b = generateManeuvers(7, { ...truth, scenario: {} });
  assert.equal(JSON.stringify(a.maneuvers.map(({ curve, ...m }) => m)), JSON.stringify(b.maneuvers.map(({ curve, ...m }) => m)));
});

test('forced scenario faults appear on the named blow and are recorded in the fault list', () => {
  for (const fault of ['leak', 'mouthpiece-obstruction', 'pause-at-TLC', 'no-plateau', 'slow-start', 'cough', 'glottic-closure', 'early-termination', 'variable-effort']) {
    for (const first of [0, 1, 2]) {
      const r = generateManeuvers(11, { fvc: 4.2, fev1: 3.3, k: 0.9, T: 12, technique: 'good', scenario: { forced: [{ fault, p: 0, first }] } });
      assert.ok(r.maneuvers[first].faults.includes(fault), `${fault} on blow ${first}`);
      for (const m of r.maneuvers) assert.ok(m.fev1 <= m.fvc + 1e-9);
    }
  }
});

test('set-wide effort and the blow cap', () => {
  const r = generateManeuvers(3, { fvc: 4.2, fev1: 3.3, k: 0.9, T: 12, technique: 'good', scenario: { effort: { fvc: 0.85, fev1: 0.85, r: 0.1 }, maxManeuvers: 3 } });
  assert.equal(r.maneuvers.length, 3);
  assert.ok(r.maneuvers.every((m) => m.faults.includes('submaximal-effort') && m.fvc < 4.2 * 0.9));
});
