import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateArtifactIdentity, validateArtifactProviderKeys } from './external-beta-evidence-artifact-shape-policy.mjs';

const run = (fn, data, options = {}) => {
  const violations = [];
  fn(data, { jobId: 'sample-job' }, { env: 'OUTPUT_PATH', ...options }, violations);
  return violations;
};

test('artifact identity optional and matching cases', () => {
  assert.deepEqual(run(validateArtifactIdentity, {}, {}), []);
  assert.deepEqual(run(validateArtifactIdentity, { artifactId: 'artifact-1' }, { expectedArtifactId: 'artifact-1' }), []);
});
test('invalid and nonmatching identities preserve error messages', () => {
  assert.deepEqual(run(validateArtifactIdentity, {}, { expectedArtifactId: '  ' }), [
    'sample-job: output artifact env OUTPUT_PATH has invalid expectedArtifactId',
  ]);
  assert.deepEqual(run(validateArtifactIdentity, { artifactId: 'other' }, { expectedArtifactId: 'wanted' }), [
    'sample-job: output artifact env OUTPUT_PATH must use artifactId wanted',
  ]);
});
test('provider schema requirement optional and duplicates rejected', () => {
  assert.deepEqual(run(validateArtifactProviderKeys, {}, {}), []);
  for (const keys of [[], ['a', 'a'], ['a', '  ']]) {
    const violations = run(validateArtifactProviderKeys, {}, { expectedProviderKeys: keys });
    assert.equal(violations.length, 1);
    assert.ok(violations[0].includes('expectedProviderKeys'));
  }
});
test('providerResults missing rejected', () => {
  assert.deepEqual(run(validateArtifactProviderKeys, {}, { expectedProviderKeys: ['one'] }), [
    'sample-job: output artifact env OUTPUT_PATH must include providerResults',
  ]);
});
test('provider key trims and preserves missing then extra violation ordering', () => {
  assert.deepEqual(run(validateArtifactProviderKeys, { providerResults: [{ providerKey: ' one ' }, { providerKey: 'three' }] }, { expectedProviderKeys: ['one', 'two'] }), [
    'sample-job: output artifact env OUTPUT_PATH must include providerKey two',
    'sample-job: output artifact env OUTPUT_PATH must not include providerKey three',
  ]);
  assert.deepEqual(run(validateArtifactProviderKeys, { providerResults: [{ providerKey: ' one ' }] }, { expectedProviderKeys: ['one'] }), []);
});
test('runner imports original policy and static plus bounded runner retain tests', () => {
  const src = readFileSync('scripts/external-beta-evidence-runner.mjs', 'utf8');
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  assert.ok(src.includes("import { validateArtifactIdentity, validateArtifactProviderKeys } from './lib/external-beta-evidence-artifact-shape-policy.mjs'"));
  assert.ok(!src.includes('function validateArtifactIdentity('));
  assert.ok(!src.includes('function validateArtifactProviderKeys('));
  assert.ok(scripts['check:architecture'].includes('external-beta-evidence-artifact-shape-policy.test.mjs'));
  assert.ok(scripts['check:external-beta-evidence-runner'].includes('external-beta-evidence-artifact-shape-policy.test.mjs'));
  assert.ok(scripts['check:external-beta-evidence-runner'].includes('--timeout-ms 300000'));
});
