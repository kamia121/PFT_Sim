#!/usr/bin/env node
/**
 * Writes tests/fixtures/pleth-identity-hashes.json: hashes of 2230 cases without the resistance-dependent plethysmography fields
 * (tests/helpers/pleth-identity.mjs). The test in tests/pleth.test.mjs compares a fresh build with these values, so an unintended change
 * to any other case value is caught. Re-run it only for an intended generator change, and record the reason (SPEC.md).
 * Usage: node tools/pleth-identity-hashes.mjs --write
 */
import fs from 'node:fs/promises';
import { loadDatasets } from '../src/reference/load.js';
import { buildCase } from '../src/core/case.js';
import { GENERATOR_VERSION } from '../src/core/standards.js';
import { identityDescriptors, frozenHash } from '../tests/helpers/pleth-identity.mjs';

const ds = await loadDatasets();
const descriptors = identityDescriptors();
const hashes = descriptors.map((d) => frozenHash(buildCase(d, ds)));
const text = JSON.stringify({ note: `sha256 of the case with the resistance-dependent pleth fields removed (tests/helpers/pleth-identity.mjs); re-baselined at generator version ${GENERATOR_VERSION} (archetype parameters changed, docs/archetype-changes.md); the original fixture proved that the plethysmography rebuild changed nothing else`, n: descriptors.length, hashes }) + '\n';
if (process.argv.includes('--write')) await fs.writeFile(new URL('../tests/fixtures/pleth-identity-hashes.json', import.meta.url), text);
else console.log(`${descriptors.length} cases hashed`);
