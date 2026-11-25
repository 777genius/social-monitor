import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import '../lib/external-beta-security-negative-smoke-scenarios.test.mjs';

const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const cases = [
  ['validateRunnerNegativeCredentialRotationArtifactSmokes', 'credentialRotationNegativeSmokeScenarios'],
  ['validateRunnerNegativeSecurityFinalSweepArtifactSmokes', 'securityFinalSweepNegativeSmokeScenarios'],
];
function assertDelegated(candidate) {
  const active = candidate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(active, /from '\.\/lib\/external-beta-security-negative-smoke-scenarios\.mjs'/);
  for (const [caller, factory] of cases) {
    const marker = 'function ' + caller + '() {\n';
    const start = active.indexOf(marker);
    const end = active.indexOf('\n\n  for (const scenario of scenarios) {', start);
    assert.ok(start >= 0 && end > start, caller);
    const setup = active.slice(start + marker.length, end);
    const statement = 'const scenarios = ' + factory + '();';
    assert.ok(setup.includes(statement), caller);
    const sentinel = [];
    let calls = 0;
    const boundScenarios = runInNewContext(setup + '\nscenarios', {
      [factory]: () => { calls++; return sentinel; },
    }, { timeout: 1000 });
    assert.equal(calls, 1, caller);
    assert.strictEqual(boundScenarios, sentinel, caller);
  }
}
test('original credential and security negative smoke loops actively delegate to pure factories', () => {
  assertDelegated(source);
  assert.doesNotMatch(source, /const scenarios = \[\n {4}\{\n {6}label: 'source rotation fixture provenance'/);
  assert.doesNotMatch(source, /const scenarios = \[\n {4}\{\n {6}label: 'security sweep fixture provenance'/);
});
test('missing or commented credential/security scenario call fails closed', () => {
  for (const [, factory] of cases) {
    const statement = 'const scenarios = ' + factory + '();';
    assert.throws(() => assertDelegated(source.replace(statement, '')), { code: 'ERR_ASSERTION' });
    assert.throws(() => assertDelegated(source.replace(statement, '// ' + statement)), { code: 'ERR_ASSERTION' });
  }
});
test('unreachable or nested credential/security scenario result cannot satisfy the caller', () => {
  for (const [, factory] of cases) {
    const statement = 'const scenarios = ' + factory + '();';
    assert.throws(() => assertDelegated(source.replace(statement, 'if (false) { ' + statement + ' }')), { name: 'ReferenceError', message: 'scenarios is not defined' });
    assert.throws(() => assertDelegated(source.replace(statement, '{ ' + statement + ' }\n  const scenarios = [];')), { code: 'ERR_ASSERTION' });
  }
});
