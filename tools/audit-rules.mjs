/** Reproducible inventory, not a clinical verification oracle. Run: node tools/audit-rules.mjs > audit.json */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SPIROMETRY_2019, INTERPRETATION_2022, LUNG_VOLUMES_2023 } from '../src/core/standards.js';
import { DLCO_MODEL } from '../src/core/dlco-trace.js';
import { PLETH_MODEL } from '../src/core/pleth.js';
import { COHB } from '../src/core/physiology.js';

const files = [
  'src/core/standards.js', 'src/core/pleth-session.js', 'src/core/comparison.js', 'src/core/quality.js', 'src/core/dlco-trace.js', 'src/core/pleth.js', 'src/core/physiology.js',
  'src/core/case.js', 'src/reference/gli.js', 'src/interpret/interpret.js', 'src/interpret/precision.js',
  'src/challenges/items.js', 'src/scenarios/catalog-reference.js', 'src/scenarios/catalog-prep.js',
  'src/scenarios/catalog-quality.js', 'src/quiz/scoring.js', 'src/app/answers.js',
  ...['gli2012', 'gli_global', 'gli_tlco', 'gli_volumes'].map((id) => `src/reference/data/${id}.json`),
];
const inventory = [];
for (const path of files) {
  const text = await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const lines = text.split('\n');
  inventory.push({ path, sha256: createHash('sha256').update(text).digest('hex'),
    reviewLines: path.endsWith('.js') ? lines.flatMap((text, i) => /(?:[<>]=?|verification:|fallbackReason|equationId)/.test(text) ? [{ line: i + 1, text: text.trim() }] : []) : [] });
}
console.log(JSON.stringify({
  status: 'inventory-only', scope: 'Reference, interpretation, quality, scenario and learner scoring implementation; source review is recorded separately.',
  constants: { SPIROMETRY_2019, INTERPRETATION_2022, LUNG_VOLUMES_2023, DLCO_MODEL, PLETH_MODEL, COHB }, files: inventory,
}, null, 2));
