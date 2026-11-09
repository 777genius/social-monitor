import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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

function assertBehavioralDelegation(candidate) {
  const precedingCall = 'validateCommand(contract.executeCommand, `${contractPath}: executeCommand`);';
  const followingCall = 'validateArtifactExamples();';
  const start = candidate.indexOf(precedingCall);
  const end = candidate.indexOf(followingCall, start + precedingCall.length);
  assert.ok(start >= 0 && end > start, 'checker policy delegation boundary');

  const invoked = [];
  runInNewContext(candidate.slice(start + precedingCall.length, end), {
    contract: {},
    contractPath: 'test-contract',
    forbiddenFragments: [],
    violations: [],
    validateSafety: () => invoked.push('safety'),
    validateArtifactFreshnessPolicy: () => invoked.push('freshness'),
  }, { timeout: 1000 });
  assert.deepEqual(invoked, ['safety', 'freshness']);
}

test('real external-beta checker uses extracted safety and freshness validators', () => {
  assert.match(source, /from '\.\/lib\/external-beta-execution-safety-policy\.mjs'/);
  assert.doesNotMatch(source, /function validateSafety\(/);
  assert.doesNotMatch(source, /function validateArtifactFreshnessPolicy\(/);
  assertDelegation(source);
  assertBehavioralDelegation(source);
});

test('removing or commenting either required safety call fails the static gate', () => {
  for (const call of calls) {
    assert.ok(source.includes(call), 'original invocation must exist before test mutation');
    assert.throws(() => assertDelegation(source.replace(call, '')), /required active checker call/);
    assert.throws(() => assertDelegation(source.replace(call, '// ' + call)), /required active checker call/);
  }
});

test('unreachable safety or freshness delegation fails behavioral validation', () => {
  for (const call of calls) {
    const unreachable = source.replace(call, 'if (false) {\n' + call + '\n}');
    assertDelegation(unreachable);
    assert.throws(() => assertBehavioralDelegation(unreachable), { code: 'ERR_ASSERTION' });
  }
});
