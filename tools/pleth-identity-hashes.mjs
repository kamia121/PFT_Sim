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

throw new Error('Historical identity fixtures are immutable. Use tools/versioned-regression-hashes.mjs for reviewed current-version snapshots.');
