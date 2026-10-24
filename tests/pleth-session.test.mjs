import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPlethLink, plethVcComparator, plethSpread, summarizePlethSession } from '../src/core/pleth-session.js';

const link = (svcL = 4, extra = {}) => ({ linked: true, icL: 2, svcL, withinManeuverStatus: 'acceptable', ...extra });
const row = (id, frcL, extra = {}) => ({ id, frcL, frcStatus: 'acceptable', link: link(), ...extra });
const summarize = (trials, extra = {}) => summarizePlethSession({ age: 40, fvcL: 4, trials, ...extra });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} vs ${expected}`);

test('corrected adult SVC equality at 150 and 250 mL uses full precision', () => {
  for (const [svc, status] of [[3.85 + 1e-9, 'acceptable'], [3.85, 'acceptable'], [3.85 - 1e-9, 'usable'], [3.75, 'usable'], [3.75 - 1e-9, 'rejected'], [4.5, 'acceptable']]) assert.equal(assessPlethLink(link(svc), { age: 40, comparator: 4 }).status, status);
  assert.equal(assessPlethLink(link(4), { age: 40, comparator: 4.15 }).status, 'acceptable');
  assert.equal(assessPlethLink(link(3.9), { age: 40, comparator: 4.15 }).status, 'usable');
  assert.equal(assessPlethLink(link(4, { withinManeuverStatus: 'usable' }), { age: 40, comparator: 4 }).status, 'usable');
  assert.equal(assessPlethLink(link(4, { withinManeuverStatus: undefined }), { age: 40, comparator: 4 }).status, 'unknown');
});

test('corrected pediatric smaller candidate thresholds are not the smaller allowed difference', () => {
  const assess = (svc, fvc) => assessPlethLink(link(svc, { icL: 0.2 }), { age: 6, comparator: fvc }).status;
  assert.equal(assess(1.8, 2), 'acceptable');
  assert.equal(assess(1.8 - 1e-9, 2), 'rejected');
  assert.equal(assess(0.4, 0.5), 'acceptable');
  assert.equal(assess(0.3, 0.5), 'usable');
  assert.equal(assess(0.3 - 1e-9, 0.5), 'rejected');
  assert.equal(assessPlethLink(link(1.8, { icL: 0.2 }), { age: 6.01, comparator: 2 }).status, 'usable');
});

test('missing same-session FVC requires three independently acceptable VCs', () => {
  const vcs = [3.9, 4, 4.1].map((vcL) => ({ vcL, status: 'acceptable' }));
  assert.deepEqual(plethVcComparator({ acceptableVc: vcs }), { value: 4.1, basis: 'largest-of-three-acceptable-vc' });
  assert.equal(plethVcComparator({ acceptableVc: vcs.slice(0, 2) }).value, null);
  assert.equal(plethVcComparator({ acceptableVc: [...vcs.slice(0, 2), { vcL: 5, status: 'usable' }] }).value, null);
  const unknown = summarize([row('a', 3)], { fvcL: null });
  assert.equal(unknown.status, 'frc-only'); assert.equal(unknown.grades.svc, null); assert.equal(unknown.grades.overall, null);
  assert.equal(summarize([row('a', 3, { link: link(3.95) })], { fvcL: null, acceptableVc: vcs }).grades.svc, 'E');
});

test('selected FRC+IC pairs and largest retained eligible VC determine the reported subdivisions', () => {
  const input = [row('a', 3, { link: link(4, { icL: 2 }) }), row('b', 3.1, { link: link(4.2, { icL: 2.2 }) }), row('out', 4.5, { link: link(5, { icL: 3 }) })];
  const original = JSON.stringify(input), result = summarize(input);
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(result.selectedIds, ['a', 'b']);
  close(result.volumes.frc, 3.05); close(result.volumes.tlc, 5.15);
  close(result.volumes.vc, 4.2); close(result.volumes.rv, 0.95);
  close(result.volumes.ic, 2.1); close(result.volumes.erv, 2.1);
  assert.equal(result.grades.overall, 'B');
});

test('5% and 10% exact boundaries are inclusive, with no invented grade for a discordant pair', () => {
  const five = summarize([row('a', 3.9), row('b', 4.1)]);
  close(five.repeatability.fraction, 0.05); assert.equal(five.grades.overall, 'B');
  const aboveFive = summarize([row('a', 3.9), row('b', 4.1 + 1e-8)]);
  assert.equal(aboveFive.grades.overall, 'C');
  const ten = summarize([row('a', 3.8), row('b', 4.2)]);
  close(ten.repeatability.fraction, 0.1); assert.equal(ten.grades.overall, 'C');
  const aboveTen = summarize([row('a', 3.8), row('b', 4.2 + 1e-8)]);
  assert.equal(aboveTen.status, 'needs-review'); assert.equal(aboveTen.grades.overall, null);
  assert.deepEqual(aboveTen.pendingIds, ['a', 'b']); assert.equal(aboveTen.volumes.frc, null);
});

test('FRC and linked SVC counts independently constrain Table 4 grades A through F/U', () => {
  const a = summarize([row(1, 3), row(2, 3.02), row(3, 3.03)]); assert.equal(a.grades.overall, 'A');
  const b = summarize([row(1, 3), row(2, 3.02), row(3, 3.03, { link: link(3.8) })]);
  assert.deepEqual(b.grades, { frc: 'A', svc: 'B', repeatability: 'A', overall: 'B' });
  assert.equal(summarize([row(1, 3), row(2, 3.2)]).grades.overall, 'C');
  assert.equal(summarize([row(1, 3), row(2, 3.02, { frcStatus: 'usable' })]).grades.overall, 'D');
  assert.equal(summarize([row(1, 3)]).grades.overall, 'E');
  const u = summarize([row(1, 3, { frcStatus: 'usable' })]); assert.equal(u.grades.overall, 'U');
  assert.equal(u.repeatability.assessable, false); assert.equal(u.repeatability.fraction, null);
  const f = summarize([row(1, 3, { frcStatus: 'rejected' })]); assert.equal(f.grades.overall, 'F'); assert.equal(f.volumes.frc, null);
});

test('fallback removes FRC outliers with their linked spirometry, not unrelated IC measurements', () => {
  const r = summarize([row(1, 3), row(2, 3.02, { frcStatus: 'usable' }), row(3, 4, { frcStatus: 'usable', link: link(6, { icL: 4 }) })]);
  assert.deepEqual(r.selectedIds, [1, 2]); assert.equal(r.grades.overall, 'D');
  assert.match(r.excluded.find((x) => x.id === 3).reason, /associated spirometry excluded/);
  close(r.volumes.tlc, 5.01); close(r.volumes.vc, 4);
});

test('unlinked/rejected spirometry yields FRC only; rejected FRC never contributes', () => {
  const r = summarize([row('a', 3, { link: link(4, { linked: false }) }), row('b', 3.02, { link: link(4, { withinManeuverStatus: 'rejected' }) }), row('bad', 99, { frcStatus: 'rejected' })]);
  assert.equal(r.status, 'frc-only'); close(r.volumes.frc, 3.01);
  assert.equal(r.grades.frc, 'B'); assert.equal(r.grades.svc, 'F');
  for (const id of ['tlc', 'rv', 'vc', 'ic', 'erv']) assert.equal(r.volumes[id], null);
  assert.deepEqual(r.selectedIds, ['a', 'b']);
  const missing = summarize([row('a', 3, { link: undefined })]); assert.equal(missing.status, 'frc-only');
});

test('tie choices and input limits are transparent engineering rules', () => {
  const r = summarize([row('early-low', 3), row('later-low', 3.01), row('early-high', 4), row('later-high', 4.01)]);
  assert.deepEqual(r.selectedIds, ['early-high', 'later-high'], 'smaller fractional spread wins before acquisition order');
  assert.match(r.engineeringPolicy, /prefer smaller spread, then earlier acquisition/);
  assert.throws(() => summarize([row('same', 3), row('same', 3)]), /unique/);
  assert.throws(() => summarize(Array.from({ length: 9 }, (_, i) => row(i, 3))), /project limit/);
  assert.equal(plethSpread([3]), null);
});


test('component count combinations are classified without a catch-all for unmet repeatability', () => {
  for (let a = 0; a <= 3; a++) for (let u = 0; u <= 3; u++) {
    const trials = [...Array.from({ length: a }, (_, i) => row(`a${i}`, 3)), ...Array.from({ length: u }, (_, i) => row(`u${i}`, 3, { frcStatus: 'usable' }))];
    const r = summarize(trials);
    const expected = a >= 3 ? 'A' : a >= 2 ? 'B' : a === 1 ? u ? 'D' : 'E' : u ? 'U' : 'F';
    assert.equal(r.grades.overall, expected, `${a} acceptable, ${u} usable`);
  }
  const tied = summarize([row('earliest-high', 4), row('second-high', 4), row('later-low', 3), row('last-low', 3)]);
  assert.deepEqual(tied.selectedIds, ['earliest-high', 'second-high']);
  const outlierTie = summarize([row('low', 2, { frcStatus: 'usable' }), row('mid', 3, { frcStatus: 'usable' }), row('high', 4, { frcStatus: 'usable' })]);
  assert.equal(outlierTie.excluded[0].id, 'high');
  assert.deepEqual(outlierTie.pendingIds, ['low', 'mid']);
});

test('nonpositive derived RV requires review and is never repaired with a clamp', () => {
  const r = summarize([row('a', 1, { link: link(4, { icL: 2 }) })]);
  assert.equal(r.status, 'needs-review');
  assert.equal(r.volumes.frc, 1); assert.equal(r.volumes.tlc, null); assert.equal(r.volumes.rv, null);
  assert.equal(r.grades.overall, null); assert.match(r.warnings.join(' '), /withheld rather than clamped/);
});


test('pair reporting policy is explicit when good FRCs have poorer linked spirometry', () => {
  const rejected = { withinManeuverStatus: 'rejected' };
  const one = summarize([row(1, 3), row(2, 3.01, { link: link(4, rejected) }), row(3, 3.02, { link: link(4, rejected) })]);
  assert.deepEqual(one.selectedIds, [1]); assert.equal(one.grades.overall, 'E');
  assert.match(one.engineeringPolicy, /Prefer full volumes from eligible pairs/);
  const mixed = summarize([row(1, 3), row(2, 3.2), row(3, 3.01, { link: link(4, rejected) }), row(4, 3.02, { link: link(4, rejected) })]);
  assert.equal(mixed.grades.overall, 'C'); assert.deepEqual(mixed.selectedIds, [1, 2]);
  const usableLarge = summarize([row(1, 3), row(2, 3.02, { link: link(4.2, { withinManeuverStatus: 'usable' }) })]);
  assert.equal(usableLarge.volumes.vc, 4.2);
  assert.equal(usableLarge.rvVcPolicy.id, 'retained-linked');
  assert.match(usableLarge.rvVcPolicy.verification, /awaits source adjudication/);
});
