/** Compare measured report objects with a separate checkout; excludes deliberately corrected interpretation keys/prose. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCase } from '../src/core/case.js';
import { loadDatasets } from '../src/reference/load.js';
if (!process.argv[2]) throw new Error('Usage: node tools/check-measured-isolation.mjs BASE_CHECKOUT');
const { buildCase: baseline } = await import(pathToFileURL(path.resolve(process.argv[2], 'src/core/case.js')));
const data = await loadDatasets();
const types = ['normal', 'obstruction', 'restriction-parenchymal', 'restriction-extraparenchymal', 'mixed', 'nonspecific', 'low-dlco', 'anemia', 'obesity-low-erv', 'bd-discordant'];
let count = 0;
for (let seed = 1; seed <= 10; seed++) for (const archetype of types) {
  const input = { seed, archetype, technique: 'good' };
  assert.deepEqual(buildCase(input, data).report, baseline(input, data).report, JSON.stringify(input));
  count++;
}
console.log(`${count} complete measured report objects identical to baseline; interpretation keys/text deliberately excluded.`);
