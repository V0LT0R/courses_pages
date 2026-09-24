import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));

test('package.json dependency declarations match package-lock root declarations', () => {
  assert.deepEqual(lock.packages[''].dependencies || {}, pkg.dependencies || {});
  assert.deepEqual(lock.packages[''].devDependencies || {}, pkg.devDependencies || {});
});
