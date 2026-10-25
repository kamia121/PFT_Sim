/** Current-version regression snapshots. Historical fixtures are retained byte-for-byte, never overwritten.
 * Run after reviewing intended generation/reporting changes: node tools/versioned-regression-hashes.mjs --write
 * These are regression locks, not primary-source numerical or clinical validation.
 */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadDatasets } from '../src/reference/load.js';
import { buildCase } from '../src/core/case.js';
import { BASELINE_DESCRIPTORS, hashCase } from './baseline-hashes.mjs';
import { identityDescriptors, frozenHash } from '../tests/helpers/pleth-identity.mjs';
const sha = (x) => createHash('sha256').update(x).digest('hex');
const root = new URL('../tests/fixtures/', import.meta.url);
const ds = await loadDatasets();
const provenance = 'Reviewed generator v2-v5 behavior after source-backed interpretation corrections, linked pleth v3, replicate DLCO v4, Jones–Meade v5 and explicit FIVC assessment metadata. Historical hashes are retained; old cross-version identity failures are not reclassified as historical passes. These locks do not validate clinical models or GLI outputs.';
const scenario = { provenance, originalFixtureSha256: sha(await fs.readFile(new URL('baseline-case-hashes.json',root))), versions: Object.fromEntries([2,3,4,5].map(v=>[v,BASELINE_DESCRIPTORS.map(d=>({...d,sha256:hashCase(buildCase({...d,v},ds))}))])) };
const descriptors=identityDescriptors();
const pleth = { provenance, originalFixtureSha256: sha(await fs.readFile(new URL('pleth-identity-hashes.json',root))), generatorVersion:5,n:descriptors.length,hashes:descriptors.map(d=>frozenHash(buildCase({...d,v:5},ds))) };
if (process.argv.includes('--write')) {
 await fs.writeFile(new URL('versioned-case-hashes.json',root),JSON.stringify(scenario,null,1)+'\n');
 await fs.writeFile(new URL('pleth-identity-v5-hashes.json',root),JSON.stringify(pleth)+'\n');
} else console.log(JSON.stringify({scenarioVersions:Object.keys(scenario.versions),plethCases:pleth.n}));
