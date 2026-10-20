#!/usr/bin/env node
/**
 * Builds the 50 baseline cases used by tests/scenario-regression.test.mjs and prints (or writes) their
 * SHA-256 hashes. The stored fixture was generated from the commit before the scenario thread (2ac98e3);
 * re-running this tool with scenario level 'none' must reproduce it. The additive top-level `scenario`
 * field is excluded from the hash.
 * Usage: node tools/baseline-hashes.mjs [--write]
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';

export const BASELINE_DESCRIPTORS = Array.from({ length: 50 }, (_, i) => ({
  seed: 1000 + 37 * i,
  archetype: ARCHETYPES[i % ARCHETYPES.length],
  technique: TECHNIQUE_LEVELS[i % 3],
  severity: 1 + (i % 3),
  panel: i % 7 === 6 ? 'spirometry' : 'full',
}));

export function hashCase(c) {
  const { scenario, ...rest } = c;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ds = await loadDatasets();
  const rows = BASELINE_DESCRIPTORS.map((d) => ({ ...d, sha256: hashCase(buildCase(d, ds)) }));
  const text = JSON.stringify({ note: 'sha256 of JSON.stringify(case without the scenario field); generated from baseline commit 2ac98e3', cases: rows }, null, 1) + '\n';
  if (process.argv.includes('--write')) await fs.writeFile(new URL('../tests/fixtures/baseline-case-hashes.json', import.meta.url), text);
  else process.stdout.write(text);
}
