/**
 * False-credit tests by construction: for each credited statement, every mutation that changes its meaning (negation, antonym, hedge, attribution,
 * condition, domain swap) must lose the credit. A mutated text may abstain or contradict; it must never be credited in the domain it targets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, verdicts } from './helpers/written-eval.mjs';

// [scenario, domain, credited text, mutated texts that must NOT be credited in that domain]
const ROWS = [
  ['S1', 'pattern', 'Mild obstruction', ['No obstruction', 'Not obstructive', 'Mild restriction', 'Possible mild obstruction', 'The report says mild obstruction', 'If FEV1 is low this is mild obstruction', 'Mild obstruction is absent', 'Normal spirometry', 'Obstruction? vs restriction', 'Mild obstruction cannot be confirmed']],
  ['S1', 'severity', 'Mild obstruction', ['Moderate obstruction', 'Severe obstruction', 'No mild obstruction', 'Possibly mild obstruction', 'Mild restriction', 'The technologist says mild obstruction', 'Obstruction, severity not graded because FEV1 is normal']],
  ['S1', 'bd', 'No significant bronchodilator response', ['Significant bronchodilator response', 'Bronchodilator response positive', 'No bronchodilator performed', 'Possible bronchodilator response', 'Not a non-significant bronchodilator response', 'The report says no significant bronchodilator response', 'BD insignificant? maybe significant']],
  ['S1', 'dlco', 'DLCO normal', ['DLCO reduced', 'DLCO increased', 'DLCO not normal', 'DLCO possibly normal', 'KCO normal', 'VA normal', 'The report says DLCO normal', 'DLCO normal after COHb correction', 'No DLCO performed', 'If hemoglobin is low DLCO is normal', 'Abnormal DLCO']],
  ['S2', 'bd', 'Significant bronchodilator response', ['No bronchodilator response', 'No significant bronchodilator response', 'BD negative', 'Not a significant bronchodilator response', 'Bronchodilator response may be significant', 'Bronchodilator not performed', 'Bronchodilator response insignificant']],
  ['S2', 'pattern', 'Obstruction with low FVC; restriction cannot be confirmed without lung volumes', ['Mixed obstruction and restriction', 'Obstruction and restriction', 'No obstruction', 'Normal spirometry', 'Restriction', 'Obstruction likely with restriction', 'Obstruction is not present; restriction cannot be confirmed without lung volumes']],
  ['S2', 'volumes', 'Restriction cannot be confirmed without lung volumes', ['TLC is normal', 'Lung volumes were normal', 'TLC low consistent with restriction', 'Possible restriction']],
  ['S3', 'pattern', 'Restriction with low TLC', ['No restriction', 'Not restrictive', 'TLC normal', 'Obstruction', 'Mixed pattern', 'Possible restriction', 'Restriction cannot be confirmed without volumes', 'Normal study', 'Restriction is excluded', 'If TLC is low there is restriction']],
  ['S3', 'dlco', 'DLCO reduced', ['DLCO normal', 'DLCO not reduced', 'DLCO increased', 'DLCO may be reduced', 'KCO reduced', 'Reduced KCO and VA', 'DLCO was not performed', 'The report says DLCO reduced', 'DLCO reduced when corrected for COHb']],
  ['S4', 'pattern', 'Normal study', ['Abnormal study', 'Not normal', 'Study is probably normal', 'If volumes are normal the study is normal', 'The report says normal', 'Normal? maybe obstruction', 'Obstruction', 'Restriction', 'No normal study']],
  ['S4', 'quality', 'Poor quality', ['Good quality', 'Not poor quality', 'Quality is acceptable', 'Quality may be poor', 'The technologist says poor quality', 'No quality concerns', 'Excellent effort']],
  ['S5', 'pattern', 'Preserved ratio with low FVC; restriction cannot be confirmed without lung volumes', ['Restriction', 'Restrictive pattern', 'Obstruction', 'Mixed obstruction and restriction', 'Normal spirometry', 'Not low FVC', 'Possible PRISm']],
  ['S6', 'severity', 'Obstruction with preserved FEV1', ['Mild obstruction', 'Moderate obstruction', 'Severe obstruction', 'FEV1 not preserved', 'Possibly preserved FEV1', 'The report says FEV1 preserved', 'FEV1 reduced']],
  ['S6', 'pattern', 'Obstruction with normal FEV1', ['No obstruction', 'Restriction', 'Normal', 'Possible obstruction', 'Obstruction is not present']],
];

test('each credited statement is credited as written', () => {
  for (const [sc, d, good] of ROWS) assert.equal(verdicts(good, SCENARIOS[sc])[d], 'correct', `${sc} ${d}: ${good}`);
});

test('no meaning-changing mutation earns credit in the domain it targets', () => {
  let n = 0;
  for (const [sc, d, , bad] of ROWS) for (const t of bad) { n++; assert.notEqual(verdicts(t, SCENARIOS[sc])[d], 'correct', `${sc} ${d}: ${JSON.stringify(t)}`); }
  assert.ok(n >= 90, `${n} mutations`);
});

test('generated mutations of every credited statement: prefix negation, hedge, attribution and condition never keep credit', () => {
  const PREFIX = ['No ', 'There is no ', 'Possibly ', 'Probably ', 'The report says ', 'The technologist notes ', 'Cannot exclude ', 'If ', 'Unlikely ', 'Not '];
  let checked = 0;
  for (const [sc, d, good] of ROWS) {
    // a limitation ("volumes are needed") stays a limitation under a hedge, so that row is exercised by the explicit mutations above only
    if (d === 'volumes') continue;
    // statements that name a pattern or a value; the lowercase form follows the prefix
    for (const p of PREFIX) {
      const t = `${p}${good[0].toLowerCase()}${good.slice(1)}`;
      checked++;
      assert.notEqual(verdicts(t, SCENARIOS[sc])[d], 'correct', `${sc} ${d}: ${JSON.stringify(t)}`);
    }
  }
  assert.ok(checked >= 130);
});

test('domain swap: a correct statement about one domain earns nothing in another', () => {
  // DLCO words do not satisfy bronchodilator; bronchodilator words do not satisfy DLCO; severity words alone do not name a pattern
  assert.notEqual(verdicts('DLCO normal', SCENARIOS.S1).bd, 'correct');
  assert.notEqual(verdicts('No bronchodilator response', SCENARIOS.S1).dlco, 'correct');
  assert.notEqual(verdicts('Mild', SCENARIOS.S1).pattern, 'correct');
  assert.notEqual(verdicts('KCO normal', SCENARIOS.S1).dlco, 'correct');
  assert.notEqual(verdicts('Normal VA and KCO', SCENARIOS.S1).dlco, 'correct');
  assert.notEqual(verdicts('Mild restriction', SCENARIOS.S1).severity, 'correct');
  assert.notEqual(verdicts('Poor quality', SCENARIOS.S1).quality, 'correct');
});
