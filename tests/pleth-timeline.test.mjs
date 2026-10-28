import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase as buildCaseV2 } from '../src/core/case.js';
// Legacy v2 plot contract. Version 3 measured and unavailable sessions have dedicated integration coverage.
const buildCase = (input, ds) => buildCaseV2({ v: 2, ...input }, ds);
import { buildPleth, bestTrialIndex } from '../src/core/pleth.js';

const ds = await loadDatasets();
const pleth = (c, extra = {}) => buildPleth({ seed: c.descriptor.seed, truth: c.truth, volumes: c.volumes, technique: c.descriptor.technique, ...extra });

test('the timeline holds one record per trial with the five segments in order, contiguous in time and index', () => {
  let n = 0;
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 1; seed <= 5; seed++) {
    const p = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds).pleth;
    assert.equal(p.timeline.trials.length, p.trials.length);
    assert.equal(p.timeline.breathingMode, 'tidal');
    p.timeline.trials.forEach((tl, k) => {
      assert.equal(tl.trial, k + 1);
      assert.deepEqual(tl.segments.map((s) => s.id), ['tidal', 'closure', 'open-shutter', 'expiration', 'inspiration']);
      assert.equal(tl.t.length, tl.v.length);
      assert.ok(tl.t.every((x, j) => j === 0 || x > tl.t[j - 1]), 'time increases');
      assert.ok(tl.v.every(Number.isFinite));
      tl.segments.forEach((s, i) => {
        if (i === 0) assert.equal(s.i0, 0);
        else assert.equal(s.i0, tl.segments[i - 1].i1, 'the last sample of a segment is the first of the next');
        assert.equal(tl.t[s.i0], s.t0);
        assert.equal(tl.t[s.i1], s.t1);
      });
      assert.equal(tl.segments[4].i1, tl.t.length - 1);
      // no jumps in volume: the fastest slow maneuver is below 3 L/s, and the volume record is continuous through every join
      for (let j = 1; j < tl.v.length; j++) assert.ok(Math.abs(tl.v[j] - tl.v[j - 1]) / (tl.t[j] - tl.t[j - 1]) < 3, `${archetype} ${technique} ${seed} trial ${k + 1} sample ${j}`);
      n++;
    });
  }
  assert.ok(n > 600);
});

test('during closure the pneumotach volume is flat, and the pants are on the mouth-pressure lane', () => {
  const p = buildCase({ seed: 7, archetype: 'normal', technique: 'fair' }, ds).pleth;
  for (const tl of p.timeline.trials) {
    const sg = tl.segments.find((s) => s.id === 'closure');
    const closed = tl.v.slice(sg.i0, sg.i1 + 1);
    assert.ok(closed.length >= 2 && closed.every((x) => x === closed[0]), 'flat volume while the shutter is closed');
    assert.equal(closed[0], tl.levels.trialFrcL);
    const trial = p.trials[tl.trial - 1];
    assert.ok(Math.abs(sg.t1 - sg.t0 - trial.t[trial.t.length - 1]) < 2e-3, 'closure lasts as long as the recorded pants');
    assert.equal(tl.lane.tStartS, sg.t0);
    assert.ok(Math.max(...tl.lane.pm) - Math.min(...tl.lane.pm) > 1, 'the mouth-pressure swing is on the lane');
  }
});

test('the lane embeds each trial\'s t, pm and pbox arrays verbatim (the same arrays, not resampled)', () => {
  for (const archetype of ['normal', 'obstruction', 'mixed']) {
    const p = buildCase({ seed: 21, archetype, technique: 'poor', severity: 2 }, ds).pleth;
    p.timeline.trials.forEach((tl, k) => {
      const tr = p.trials[k];
      assert.equal(tl.lane.t, tr.t);
      assert.equal(tl.lane.pm, tr.pm);
      assert.equal(tl.lane.pbox, tr.pbox);
      assert.equal(tl.lane.panFreqHz, tr.panFreqHz);
      assert.equal(tl.lane.trial, tr.index);
    });
    // and they survive serialization unchanged
    const round = JSON.parse(JSON.stringify(p));
    assert.deepEqual(round.timeline.trials[0].lane.pm, p.trials[0].pm);
  }
});

test('the volume axis is anchored at the reported values: closure at the trial FRC, RV and TLC as reported', () => {
  for (const archetype of ARCHETYPES) {
    const c = buildCase({ seed: 33, archetype, technique: 'good', severity: 2 }, ds);
    const p = c.pleth, sv = p.suggestedVolumes;
    for (const tl of p.timeline.trials) {
      const L = tl.levels;
      assert.equal(L.reportedFrcL, p.reportedFrcL);
      assert.equal(L.trialFrcL, p.trials[tl.trial - 1].frcL);
      assert.ok(Math.abs(L.rvL - sv.rv) < 1e-3 && Math.abs(L.tlcL - sv.tlc) < 1e-3);
      assert.ok(Math.abs(L.tlcL - (p.reportedFrcL + c.volumes.ic)) < 1e-3, 'TLC = reported FRC + IC');
      assert.ok(Math.abs(L.rvL - (p.reportedFrcL - c.volumes.erv)) < 1e-3, 'RV = reported FRC - ERV');
      assert.ok(Math.abs(L.closureOffsetL) < 0.2, 'a stable trial closes near its stable level');
      const insp = tl.segments.find((s) => s.id === 'inspiration'), exp = tl.segments.find((s) => s.id === 'expiration');
      assert.ok(Math.abs(tl.v[exp.i1] - sv.rv) < 1e-3, 'the slow expiration ends at RV');
      assert.ok(Math.abs(tl.v[insp.i1] - sv.tlc) < 1e-3, 'the slow inspiration ends at TLC');
      assert.ok(Math.abs(Math.min(...tl.v) - sv.rv) < 1e-3 && Math.abs(Math.max(...tl.v) - sv.tlc) < 1e-3, 'RV and TLC are the extremes of the record');
      // the quiet breaths end at the closure level
      const tidal = tl.segments[0];
      assert.ok(Math.abs(tl.v[tidal.i1] - L.trialFrcL) < 1e-3);
      assert.equal(tl.eelL.length, 5);
    }
  }
});

test('the best trial is the acceptable one closest to the reported FRC, else usable, else any', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const p = buildCase({ seed, archetype: 'obstruction', technique: 'poor', severity: 2 }, ds).pleth;
    const k = bestTrialIndex(p);
    const tier = ['acceptable', 'usable'].map((s) => p.trials.filter((t) => t.status === s)).find((a) => a.length) ?? p.trials;
    assert.ok(tier.some((t) => t.index === k));
    assert.ok(tier.every((t) => Math.abs(p.trials[k - 1].deviationPct) <= Math.abs(t.deviationPct)));
  }
});

test('the timeline is a pure function of the inputs and does not read the case streams', () => {
  const c = buildCase({ seed: 12, archetype: 'mixed', technique: 'fair', severity: 2 }, ds);
  assert.equal(JSON.stringify(pleth(c).timeline), JSON.stringify(pleth(c).timeline));
  const other = pleth(buildCase({ seed: 13, archetype: 'mixed', technique: 'fair', severity: 2 }, ds));
  assert.notEqual(JSON.stringify(other.timeline), JSON.stringify(pleth(c).timeline));
});
