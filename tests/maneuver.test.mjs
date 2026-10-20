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
        assert.ok(Math.abs(volume(m.curve, m.t0 + 1) - m.fev1) < 1e-9);
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
    for (let seed = 0; seed < 400; seed++) if (generateManeuvers(seed, { ...truth, technique }).summary.grade === 'A') a++;
    return a / 400;
  };
  const [g, f, p] = ['good', 'fair', 'poor'].map(share);
  assert.ok(g > f && f > p, `${g} ${f} ${p}`);
});
