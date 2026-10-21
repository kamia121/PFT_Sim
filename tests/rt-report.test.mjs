import test from 'node:test';
import assert from 'node:assert/strict';
import { forEachCase, failureLog, buildCase, ds, TECHNIQUES } from './helpers/rt-cases.mjs';
import { buildRtReport, representativeFor, statementVerdict, displayedFaults, HONESTY_TYPES, RT_CLOSING } from '../src/core/rt-report.js';
import { FAULT_TEXT } from '../src/core/quality.js';

// One pass over 3000 cases (300 seeds, ten archetypes; technique, scenario level and panel cycle with the seed). Cases are not kept.
const log = failureLog();
const counts = Object.fromEntries(TECHNIQUES.map((t) => [t, Object.fromEntries(HONESTY_TYPES.map((h) => [h, 0]))]));
const seen = { cases: 0, flawed: { good: 0, fair: 0, poor: 0 }, bestShorterThanTabulated: 0, post: 0, dlco: 0, pleth: 0, needsDetails: 0 };
const POOR = ['D', 'E', 'U', 'F'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

forEachCase(300, (c, input) => {
  seen.cases++;
  const r = buildRtReport(c);
  log.check('deterministic', same(r, buildRtReport(c)), `${input.archetype} ${input.seed}`);
  if (seen.cases % 60 === 0) log.check('a function of the descriptor', same(r, buildRtReport(buildCase(input, ds))), `${input.archetype} ${input.seed}`);
  counts[input.technique][r.honesty]++;
  const id = `${input.archetype} s${input.seed} ${r.honesty}`;
  if (c.spirometry.post) seen.post++;
  if (c.dlcoTrace) seen.dlco++;
  if (c.pleth) seen.pleth++;
  if (r.needsDetails) seen.needsDetails++;

  // shape
  log.check('shape', r.version === 1 && HONESTY_TYPES.includes(r.honesty) && r.closing === RT_CLOSING && Array.isArray(r.interpretationLines) && Array.isArray(r.qualityLines) && Array.isArray(r.detailsReasons), id);
  log.check('lines are strings', [...r.interpretationLines, ...r.qualityLines].every((l) => typeof l === 'string' && l.length > 0 && !/undefined|NaN|\{|\}/.test(l)), id);

  // truth is the engine's own
  const g = c.report.grades, s = c.spirometry;
  log.check('truth.pre', r.truth.pre.fev1 === g.fev1 && r.truth.pre.fvc === g.fvc && g.fev1 === s.pre.summary.grades.fev1 && g.fvc === s.pre.summary.grades.fvc, id);
  log.check('truth.post', s.post ? r.truth.post.fev1 === g.postFev1 && r.truth.post.fvc === g.postFvc && g.postFev1 === s.post.summary.grades.fev1 && g.postFvc === s.post.summary.grades.fvc : r.truth.post === null, id);
  log.check('truth.dlco', c.dlcoTrace ? r.truth.dlco.acceptable === c.dlcoTrace.grade.acceptable && (r.truth.dlco.reasons.length > 0) === !r.truth.dlco.acceptable : r.truth.dlco === null, id);
  log.check('truth.pleth', c.pleth ? r.truth.pleth.acceptable === ['A', 'B'].includes(c.pleth.grade) && (r.truth.pleth.reasons.length > 0) === !r.truth.pleth.acceptable : r.truth.pleth === null, id);

  // the statement
  const truthWords = { dlco: r.truth.dlco ? (r.truth.dlco.acceptable ? 'acceptable' : 'not-acceptable') : null, pleth: r.truth.pleth ? (r.truth.pleth.acceptable ? 'acceptable' : 'not-acceptable') : null };
  const allTruthGrades = [r.truth.pre, r.truth.post].filter(Boolean).flatMap((x) => [x.fev1, x.fvc]);
  const verdict = statementVerdict(r);
  if (r.honesty === 'accurate') {
    log.check('accurate states the truth', same(r.stated.pre, r.truth.pre) && same(r.stated.post, r.truth.post) && r.stated.dlco === truthWords.dlco && r.stated.pleth === truthWords.pleth, id);
    log.check('accurate is consistent', verdict === 'consistent', id);
    log.check('accurate has lines', r.qualityLines.length > 0, id);
  }
  if (r.honesty === 'software') log.check('software differs from the truth', verdict !== 'consistent' && !same(r.stated, { pre: r.truth.pre, post: r.truth.post, dlco: truthWords.dlco, pleth: truthWords.pleth }), id);
  if (r.honesty === 'silent') log.check('silent', r.qualityLines.length === 0 && verdict === 'not-stated' && r.stated.pre === null && r.stated.post === null && r.stated.dlco === null && r.stated.pleth === null && !r.interpretationLines.some((l) => /effort/i.test(l)), id);
  else log.check('statement present', r.qualityLines.length > 0, id);
  if (r.honesty === 'generic') log.check('generic', r.stated.pre === null && r.stated.dlco === null && r.qualityLines.length === 1 && (verdict === 'consistent') === (allTruthGrades.every((x) => ['A', 'B'].includes(x)) && Object.values(r.truth).slice(2).filter(Boolean).every((t) => t.acceptable)), id);
  if (r.honesty === 'optimistic') log.check('optimistic over D or worse', allTruthGrades.some((x) => POOR.includes(x)) && verdict === 'overstated', id);
  if (r.honesty === 'pessimistic') log.check('pessimistic over a set that meets the criteria', allTruthGrades.every((x) => ['A', 'B'].includes(x)) && verdict === 'understated' && r.qualityLines.some((l) => /poor/i.test(l)) && r.stated.pre === null, id);
  if (r.honesty === 'stale') {
    const names = (r.stated.post && !r.truth.post) || (r.stated.dlco && !r.truth.dlco);
    log.check('stale names a test not done', Boolean(names) && verdict === 'overstated', id);
    log.check('stale states quality only', r.qualityLines.every((l) => !/response|significant|obstruct|restrict|pattern/i.test(l)), id);
  }
  log.check('verdict vocabulary', ['consistent', 'overstated', 'understated', 'not-stated'].includes(verdict), id);

  // representative maneuver
  for (const set of ['pre', 'post']) {
    const rep = r.representative[set];
    if (!s[set]) { log.check('no post representative without a post set', rep === null, id); continue; }
    const { maneuvers, summary } = s[set];
    const ev = summary.evaluations;
    const both = (i) => ev[i].fev1.acceptable && ev[i].fvc.acceptable;
    const idxs = maneuvers.map((_, i) => i);
    const acc = idxs.filter(both);
    const m = maneuvers[rep.index], e = ev[rep.index];
    log.check('rep index', Number.isInteger(rep.index) && rep.index >= 0 && rep.index < maneuvers.length && (rep.kind === 'best' || rep.kind === 'flawed'), id);
    log.check('rep faults are the displayed maneuver’s own', same(rep.faults, displayedFaults(m, e)) && rep.faults.every((f) => f in FAULT_TEXT), id);
    if (rep.kind === 'best') {
      if (acc.length) {
        log.check('best is acceptable', both(rep.index) && rep.faults.length === 0, id);
        log.check('best has the largest FEV1 plus FVC', acc.every((i) => maneuvers[i].fev1 + maneuvers[i].fvc <= m.fev1 + m.fvc + 1e-12), id);
        if (m.fvc < summary.fvc - 0.001) seen.bestShorterThanTabulated++;
      } else {
        const use = idxs.filter((i) => ev[i].fev1.usable && ev[i].fvc.usable);
        log.check('best usable when none is acceptable', (use.length ? use.includes(rep.index) : true) && rep.faults.length > 0, id);
      }
    } else {
      seen.flawed[input.technique]++;
      log.check('flawed is unacceptable with faults', !both(rep.index) && rep.faults.length > 0 && acc.length > 0, id);
      log.check('flawed never in good sessions', input.technique !== 'good', id);
    }
  }
  if (c.pleth) {
    const t = c.pleth.trials[r.representative.pleth.trial];
    const pool = ['acceptable', 'usable'].map((st) => c.pleth.trials.filter((x) => x.status === st)).find((a) => a.length) ?? c.pleth.trials;
    log.check('pleth representative', t && pool.includes(t) && pool.every((x) => Math.abs(x.deviationPct) >= Math.abs(t.deviationPct) - 1e-12) && !('kind' in r.representative.pleth), id);
  } else log.check('no pleth representative without pleth', r.representative.pleth === null, id);
  log.check('dlco representative', c.dlcoTrace ? r.representative.dlco?.test === 0 : r.representative.dlco === null, id);
  log.check('representativeFor agrees', same(representativeFor(c), r.representative), id);

  // details
  log.check('needsDetails follows the reasons', r.needsDetails === (r.detailsReasons.length > 0), id);
  if (['pre', 'post'].some((k) => r.representative[k]?.kind === 'flawed')) log.check('a flawed loop needs the details', r.needsDetails, id);
  if (r.honesty === 'accurate' && !['pre', 'post'].some((k) => r.representative[k]?.kind === 'flawed')) log.check('accurate with a good loop needs no details', !r.needsDetails, id);
});

const FAIL_NAMES = ['deterministic', 'a function of the descriptor', 'shape', 'lines are strings', 'truth.pre', 'truth.post', 'truth.dlco', 'truth.pleth', 'accurate states the truth', 'accurate is consistent', 'accurate has lines', 'software differs from the truth', 'silent', 'statement present', 'generic', 'optimistic over D or worse', 'pessimistic over a set that meets the criteria', 'stale names a test not done', 'stale states quality only', 'verdict vocabulary', 'rep index', 'rep faults are the displayed maneuver’s own', 'best is acceptable', 'best has the largest FEV1 plus FVC', 'best usable when none is acceptable', 'flawed is unacceptable with faults', 'flawed never in good sessions', 'pleth representative', 'no pleth representative without pleth', 'dlco representative', 'representativeFor agrees', 'no post representative without a post set', 'needsDetails follows the reasons', 'a flawed loop needs the details', 'accurate with a good loop needs no details'];
for (const name of FAIL_NAMES) test(`3000 cases: ${name}`, () => assert.equal(log.report(name), ''));

test('the sample covers post-bronchodilator, DLCO and plethysmography cases', () => {
  assert.equal(seen.cases, 3000);
  assert.ok(seen.post > 500 && seen.dlco > 2000 && seen.pleth > 2000, `post ${seen.post}, dlco ${seen.dlco}, pleth ${seen.pleth}`);
});

test('every honesty type occurs, and accurate dominates good sessions', () => {
  const total = (t) => Object.values(counts[t]).reduce((a, b) => a + b, 0);
  for (const h of HONESTY_TYPES) assert.ok(Object.values(counts).some((c) => c[h] > 0), `${h} never occurs`);
  const good = counts.good;
  for (const h of HONESTY_TYPES) if (h !== 'accurate') assert.ok(good.accurate > good[h], `accurate does not dominate ${h} in good sessions`);
  assert.ok(good.accurate / total('good') > 0.5, 'accurate is the majority in good sessions');
});

test('statements that cannot be trusted grow with worse technique (loose band)', () => {
  const total = (t) => Object.values(counts[t]).reduce((a, b) => a + b, 0);
  const share = (t) => counts[t].accurate / total(t);
  assert.ok(share('good') > share('fair') && share('fair') > share('poor'), `accurate share good ${share('good').toFixed(2)}, fair ${share('fair').toFixed(2)}, poor ${share('poor').toFixed(2)}`);
  assert.ok(share('poor') > 0.2, 'accurate keeps a substantial share in poor sessions');
  assert.ok(counts.poor.optimistic + counts.fair.optimistic > counts.good.optimistic, 'optimistic statements need poor sessions');
});

test('a flawed representative loop occurs in fair and poor sessions only, and a correct loop can fall short of the tabulated FVC', () => {
  assert.equal(seen.flawed.good, 0);
  assert.ok(seen.flawed.fair > 0 && seen.flawed.poor > seen.flawed.fair, `flawed fair ${seen.flawed.fair}, poor ${seen.flawed.poor}`);
  assert.ok(seen.bestShorterThanTabulated > 0, 'the shortfall is not a flaw cue: best maneuvers below the tabulated FVC exist');
});

test('the details are needed in some cases and not in others', () => {
  assert.ok(seen.needsDetails > 500 && seen.needsDetails < seen.cases - 500, `needsDetails ${seen.needsDetails} of ${seen.cases}`);
});
