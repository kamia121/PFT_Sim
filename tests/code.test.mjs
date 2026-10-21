import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCase, decodeCase } from '../src/core/code.js';

test('case codes round-trip and hide the archetype from the address bar', () => {
  const q = 'v=2&s=2024&a=obstruction&t=fair';
  const token = encodeCase(q);
  assert.ok(!token.includes('obstruction'));
  assert.equal(decodeCase(token), q);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(token));
});

test('malformed codes are rejected', () => {
  assert.throws(() => decodeCase('not a code!'), /malformed/);
});
