/** Display of the decision quantities of the earlier (2005) bronchodilator rule: a printed value never reads as meeting a threshold that the unrounded value fails (deferred item 7). Display only; the rule is unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeModel } from './report-helpers.mjs';
import { tableMatrix } from '../src/report/table.js';
import { bdPctBaseText, bdMlText } from '../src/interpret/precision.js';

test('percent of baseline prints the digits that show the side of 12%', () => {
  assert.equal(bdPctBaseText(11.96), '11.96');
  assert.equal(bdPctBaseText(11.9996), '11.9996');
  assert.equal(bdPctBaseText(11.99999), '12.0000 (below 12)');
  assert.equal(bdPctBaseText(12.04), '12.0');
  assert.equal(bdPctBaseText(12), '12.0');
  assert.equal(bdPctBaseText(25.34), '25.3');
});

test('milliliters print the digits that show the side of 200 mL', () => {
  assert.equal(bdMlText(0.1996), '199.6');
  assert.equal(bdMlText(0.1999), '199.9');
  assert.equal(bdMlText(0.1999999), '200.000 (below 200)');
  assert.equal(bdMlText(0.2), '200');
  assert.equal(bdMlText(0.2004), '200');
  assert.equal(bdMlText(0.35), '350');
  for (const l of [0.19951, 0.1996, 0.19999]) assert.ok(!/^200(\.0+)?$/.test(bdMlText(l)), `${l} -> ${bdMlText(l)}`);
});

test('in the report table no printed change or percent of baseline reads as meeting a threshold the unrounded value fails, or the reverse', () => {
  let near = 0, checked = 0;
  for (const archetype of ['obstruction', 'mixed', 'bd-discordant']) {
    for (let seed = 1; seed <= 250; seed++) {
      const { c, interp, model } = makeModel({ seed, archetype, technique: 'good' });
      if (!c.spirometry.post || !interp.bd) continue;
      const t = model.sections.flatMap((s) => s.tables).find((x) => x.id === 'spirometry');
      const mx = tableMatrix(t);
      for (const id of ['fev1', 'fvc']) {
        const ri = t.rows.findIndex((r) => r.id === id);
        const rawL = id === 'fev1' ? interp.bd.dFev1 : interp.bd.dFvc, rawB = interp.bd.pctBase[id];
        const cell = (key) => mx.body[ri][t.columns.findIndex((x) => x.key === key)];
        const pb = cell('changePct'), pl = cell('change');
        checked++;
        if (/\(/.test(pl) || /\(/.test(pb)) near++;
        assert.equal(/\(below/.test(pl) || (!/\(/.test(pl) && Number(pl) < 0.2), rawL < 0.2, `seed ${seed} ${archetype} ${id}: change ${pl} vs ${rawL}`);
        assert.equal(/\(below/.test(pb) || (!/\(/.test(pb) && Number(pb) < 12), rawB < 12, `seed ${seed} ${archetype} ${id}: % of baseline ${pb} vs ${rawB}`);
      }
    }
  }
  assert.ok(checked > 100 && near > 0, `${checked} rows checked, ${near} near-threshold rows qualified`);
});
