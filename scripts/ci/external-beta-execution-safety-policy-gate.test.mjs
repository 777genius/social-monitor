import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Existing static-quality node:test glob also discovers safety-policy regressions.
import '../lib/external-beta-execution-safety-policy.test.mjs';

const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const calls = [
  'validateSafety({ contract, contractPath, forbiddenFragments, violations });',
  'validateArtifactFreshnessPolicy({ contract, contractPath, violations });',
];

function assertDelegation(candidate) {
  const executable = candidate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const call of calls) {
    assert.ok(executable.split('\n').some(line => line.trim() === call), 'required active checker call: ' + call);
  }
}

test('real external-beta checker uses extracted safety and freshness validators', () => {
  assert.match(source, /from '\.\/lib\/external-beta-execution-safety-policy\.mjs'/);
  assert.doesNotMatch(source, /function validateSafety\(/);
  assert.doesNotMatch(source, /function validateArtifactFreshnessPolicy\(/);
  assertDelegation(source);
});

test('removing or commenting either required safety call fails the static gate', () => {
  for (const call of calls) {
    assert.ok(source.includes(call), 'original invocation must exist before test mutation');
    assert.throws(() => assertDelegation(source.replace(call, '')), /required active checker call/);
    assert.throws(() => assertDelegation(source.replace(call, '// ' + call)), /required active checker call/);
  }
});
