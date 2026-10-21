/** The stage of the quality challenge in the address of the report page (deferred item 4): parsing, round trips, malformed values, what each stage shows, and the way back. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportQuery, reportQuery, practiceHref, ReportLinkError } from '../src/report-page/query.js';
import { reportPageHref } from '../src/report/html.js';
import { assembleReport } from '../src/report-page/assemble.js';
import { visibility } from '../src/challenges/visibility.js';
import { buildRtReport } from '../src/core/rt-report.js';
import { ds, resolveReference, makeModel } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { summarySheetHtml } from '../src/sheets/summary.js';

const base = 'c=dj0yJnM9OCZhPWJkLWRpc2NvcmRhbnQmdD1wb29y&eq=GLIglobal';
const sheets = { visibility, buildRtReport, summarySheetHtml };
const caseData = buildCase({ seed: 8, archetype: 'bd-discordant', technique: 'poor' }, ds);
const html = (o) => assembleReport({ caseData, resolve: resolveReference, sheets, ...o }).html;
const text = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const GRADES = /FEV\s?1 - [A-FU], FVC - [A-FU]/;
const ACCEPT = /Accept\.:|Criteria not met|FEV\s?1 accept\./;

test('stages 1, 2 and 3 parse with the challenge, default to 1, and write back canonically (stage 1 is left out)', () => {
  assert.equal(parseReportQuery(`?${base}&qc=1`).stage, 1);
  assert.equal(parseReportQuery(`?${base}&qc=1&st=2`).stage, 2);
  assert.equal(parseReportQuery(`?${base}&qc=1&st=3`).stage, 3);
  assert.equal(parseReportQuery(`?${base}&qc=1&st=1`).stage, 1);
  assert.equal(parseReportQuery(`?${base}`).stage, 1);
  const q = parseReportQuery(`?${base}&qc=1&st=2&flags=none`);
  const again = reportQuery({ token: q.token, equation: q.equation, qualityChallenge: q.qualityChallenge, flags: q.flags, stage: q.stage });
  assert.match(again, /&qc=1&flags=none&st=2$/);
  assert.deepEqual(parseReportQuery(again).stage, 2);
  assert.ok(!reportQuery({ token: q.token, qualityChallenge: true, stage: 1 }).includes('st='));
  assert.ok(!reportQuery({ token: q.token, qualityChallenge: false, stage: 3 }).includes('st='), 'a stage without the challenge is never written');
});

test('malformed or inconsistent stage parameters are errors written for the reader, not a quiet fallback', () => {
  for (const bad of ['st=0', 'st=4', 'st=', 'st=abc', 'st=2.5', 'st=%202', 'st=2&st=3', 'st=-1', 'st=١']) {
    assert.throws(() => parseReportQuery(`?${base}&qc=1&${bad}`), (e) => e instanceof ReportLinkError && /stage/i.test(e.message), bad);
  }
  assert.throws(() => parseReportQuery(`?${base}&st=2`), (e) => e instanceof ReportLinkError && /without the quality challenge/.test(e.message));
  assert.throws(() => parseReportQuery(`?${base}&qc=0&st=3`), ReportLinkError);
});

test('the page shows what each stage releases, and no more', () => {
  const s1 = text(html({ qualityChallenge: true, stage: 1 }));
  const s2 = text(html({ qualityChallenge: true, stage: 2 }));
  const s3 = text(html({ qualityChallenge: true, stage: 3 }));
  assert.doesNotMatch(s1, GRADES);
  assert.doesNotMatch(s1, ACCEPT);
  const lines = buildRtReport(caseData).qualityLines;
  assert.ok(lines.length > 0, 'the case has a technologist quality statement');
  for (const l of lines) { assert.ok(s2.includes(l), `stage 2 releases: ${l}`); assert.ok(!s1.includes(l), `stage 1 withholds: ${l}`); assert.ok(s3.includes(l), `stage 3 keeps: ${l}`); }
  assert.doesNotMatch(s2, ACCEPT, 'but not the acceptability or the grade columns');
  assert.match(s3, GRADES);
  assert.match(s3, ACCEPT, 'stage 3 shows acceptability');
  for (const s of [s1, s2, s3]) {
    assert.doesNotMatch(s, /Answer key|Instructor appendix|Interpretation summary|Supporting explanation/, 'the student copy never carries the key, the statement or the appendix');
  }
  // The challenge off shows everything from the start, as before, whatever the stage argument.
  assert.match(text(html({ qualityChallenge: false })), GRADES);
});

test('the stage markup is absent, not hidden: stage 1 holds no grade text in the source at all', () => {
  const src = html({ qualityChallenge: true, stage: 1 });
  assert.doesNotMatch(src, /FEV1 - [A-FU]|grade [A-F]\b|Accept\./i);
});

test('the practice page link carries the stage, and the report page way back keeps the challenge and flags but has no stage', () => {
  const { model } = makeModel({ seed: 8, archetype: 'bd-discordant', technique: 'poor' });
  for (const stage of [1, 2, 3]) {
    const href = reportPageHref(model, { qualityChallenge: true, flags: 'none', stage });
    const q = parseReportQuery(href.slice(href.indexOf('?')));
    assert.equal(q.stage, stage);
    assert.equal(q.flags, 'none');
    assert.equal(q.qualityChallenge, true);
  }
  const back = practiceHref({ token: 'abc', equation: 'GLI2012', qualityChallenge: true, flags: 'none' });
  assert.equal(back, './?c=abc&eq=GLI2012&qc=1&flags=none');
  assert.ok(!back.includes('st='));
});

test('a changed case or equation keeps the stage in the written address', () => {
  for (const equation of ['GLIglobal', 'GLI2012']) {
    const href = reportQuery({ token: 'tok', equation, qualityChallenge: true, stage: 3 });
    const q = parseReportQuery(`${href}`.replace('tok', 'dj0yJnM9OCZhPWJkLWRpc2NvcmRhbnQmdD1wb29y'));
    assert.equal(q.equation, equation);
    assert.equal(q.stage, 3);
  }
});
