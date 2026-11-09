import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Run job-policy regressions in the existing static CI test glob.
import '../lib/external-beta-job-requirements-policy.test.mjs';

test('original checker delegates every moved job and env validator to the leaf policy', () => {
  const checker = fileURLToPath(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url));
  const source = readFileSync(checker, 'utf8');
  assert.match(source, /createExternalBetaJobRequirementsPolicy/);
  for (const name of [
    'validateEnvExample', 'validateJobBasics', 'validateJobCommands',
    'validateJobEnvironment', 'validateJobScopeSafety',
  ]) {
    assert.doesNotMatch(source, new RegExp('function ' + name + '\\('));
    assert.match(source, new RegExp('\\b' + name + '\\b'));
  }
});

test('standalone external beta checker validates tracked job and env contracts end to end', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const checker = fileURLToPath(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, EXTERNAL_BETA_EVIDENCE_CONFIRM: '' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || 'standalone external beta checker must pass');
  assert.match(result.stdout, /External beta evidence runner contract OK/);
});
