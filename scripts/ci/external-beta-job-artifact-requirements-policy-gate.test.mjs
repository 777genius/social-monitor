import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

// The existing static-quality discovery exercises these policy regressions.
import '../lib/external-beta-job-artifact-requirements-policy.test.mjs';

const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const active = candidate => candidate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

function assertDelegation(candidate) {
  const content = active(candidate);
  assert.match(content, /createExternalBetaJobArtifactRequirementsPolicy\(\{[\s\S]*?violations,/);
  assert.match(content, /validateJobArtifacts\(job, label\);/);
  assert.match(content, /validateRequiredJobEvidence\(job, label\);/);
  const start = content.indexOf('validateJobEnvironment(job, label);');
  const end = content.indexOf('validateJobScopeSafety(job, label);', start);
  assert.ok(start >= 0 && end > start);
  const events = [];
  runInNewContext(content.slice(start + 'validateJobEnvironment(job, label);'.length, end), {
    job: {}, label: 'job',
    validateJobArtifacts: () => events.push('artifacts'),
    validateRequiredJobEvidence: () => events.push('evidence'),
  }, { timeout: 1000 });
  assert.deepEqual(events, ['artifacts', 'evidence']);
}

test('real checker delegates both artifact policy calls in original order', () => {
  assert.match(source, /from '\.\/lib\/external-beta-job-artifact-requirements-policy\.mjs'/);
  for (const name of [
    'validateJobArtifacts', 'validateArtifactValidatorCoverage',
    'validateRequiredJobEvidence', 'validateExpectedProviderKeys', 'providerKeysEqual',
  ]) {
    assert.doesNotMatch(source, new RegExp('function ' + name + '\\('));
  }
  assertDelegation(source);
});

test('deleting or commenting either mandatory policy call fails closed', () => {
  for (const name of ['validateJobArtifacts', 'validateRequiredJobEvidence']) {
    const pattern = new RegExp('^\\s*' + name + '\\(job, label\\);', 'm');
    assert.match(source, pattern);
    assert.throws(() => assertDelegation(source.replace(pattern, '')), { code: 'ERR_ASSERTION' });
    assert.throws(() => assertDelegation(source.replace(pattern, '// ' + name + '(job, label);')), { code: 'ERR_ASSERTION' });
  }
});

test('unreachable policy call cannot pass behavioral delegation gate', () => {
  const candidate = source.replace(/validateJobArtifacts\(job, label\);/,
    'if (false) { validateJobArtifacts(job, label); }');
  assert.notEqual(candidate, source);
  assert.throws(() => assertDelegation(candidate), { code: 'ERR_ASSERTION' });
});
