import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createExternalBetaDuplicateEvidencePaths } from './external-beta-evidence-duplicate-paths.mjs';

const enabled = { executionSafety: { evidencePathEnvForbidsDuplicatePaths: true } };
const disabled = { executionSafety: { evidencePathEnvForbidsDuplicatePaths: false } };
const job = (id, names) => ({ jobId: id, outputArtifacts: names.map(env => ({ env })) });
function check(contract, env, jobs) {
  const policy = createExternalBetaDuplicateEvidencePaths({ contract, env });
  return { byJob: policy.duplicateEvidencePathViolationsByJob(jobs),
    violations: policy.duplicateEvidencePathViolations(jobs) };
}

test('duplicate paths reject every affected job and env occurrence', () => {
  const env = { A_PATH: ' /tmp/evidence-a.json ', B_PATH: '/tmp/evidence-a.json', C_PATH: '/tmp/unique-c.json' };
  const result = check(enabled, env, [job('alpha', ['A_PATH', 'C_PATH']), job('beta', ['B_PATH'])]);
  assert.deepEqual([...result.byJob.keys()], ['alpha', 'beta']);
  assert.deepEqual(result.violations, [
    'alpha: evidence path env A_PATH must not duplicate another evidence artifact path in this run',
    'beta: evidence path env B_PATH must not duplicate another evidence artifact path in this run',
  ]);
});
test('disabled policy and empty/missing/non-PATH env values preserve legacy behavior', () => {
  assert.equal(check(disabled, { A_PATH: '/tmp/a', B_PATH: '/tmp/a' }, [job('a', ['A_PATH']), job('b', ['B_PATH'])]).violations.length, 0);
  assert.deepEqual(check(enabled, { IGNORED: '/tmp/a', EMPTY_PATH: ' ' },
    [{ jobId: 'a' }, job('b', ['ABSENT_PATH', 'IGNORED', 'EMPTY_PATH'])]).violations, []);
  assert.deepEqual(check(enabled, {}, []).violations, []);
  assert.equal(check({}, { A_PATH: '/tmp/a', B_PATH: '/tmp/a' },
    [job('a', ['A_PATH']), job('b', ['B_PATH'])]).violations.length, 0);
});
test('adapter references live env populated after original --env-file phase', () => {
  const env = { A_PATH: '/tmp/a' };
  const policy = createExternalBetaDuplicateEvidencePaths({ contract: enabled, env });
  const jobs = [job('a', ['A_PATH']), job('b', ['B_PATH'])];
  assert.deepEqual(policy.duplicateEvidencePathViolations(jobs), []);
  env.B_PATH = '/tmp/a';
  assert.equal(policy.duplicateEvidencePathViolations(jobs).length, 2);
});
test('existing symlink aliases cannot bypass duplicate detection or leak paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-duplicate-test-'));
  try {
    const actual = join(dir, 'real.json'), alias = join(dir, 'alias.json');
    writeFileSync(actual, '{}');
    symlinkSync(actual, alias);
    const result = check(enabled, { ONE_PATH: actual, TWO_PATH: alias },
      [job('one', ['ONE_PATH']), job('two', ['TWO_PATH'])]);
    assert.equal(result.violations.length, 2);
    assert.equal(JSON.stringify(result.violations).includes(dir), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('future artifact filenames with symlinked parent are canonicalized', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-duplicate-parent-'));
  try {
    const real = join(dir, 'real'), alias = join(dir, 'alias');
    mkdirSync(real);
    symlinkSync(real, alias, 'dir');
    assert.equal(check(enabled, { ONE_PATH: join(real, 'future.json'), TWO_PATH: join(alias, 'future.json') },
      [job('one', ['ONE_PATH']), job('two', ['TWO_PATH'])]).violations.length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('same job retains both duplicate violation messages', () => {
  const value = '/tmp/a.json';
  const result = check(enabled, { ONE_PATH: value, TWO_PATH: value }, [job('one', ['ONE_PATH', 'TWO_PATH'])]);
  assert.equal(result.byJob.get('one').length, 2);
});
test('runner delegates via one adapter and preserves all original enforcement hooks', () => {
  const source = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ createExternalBetaDuplicateEvidencePaths \} from '\.\/lib\/external-beta-evidence-duplicate-paths\.mjs'/);
  assert.match(source, /createExternalBetaDuplicateEvidencePaths\(\{ contract, env: process\.env \}\)/);
  assert.doesNotMatch(source, /function duplicateEvidencePathViolations(?:ByJob)?\(/);
  assert.doesNotMatch(source, /function evidencePathDuplicateKey\(/);
  assert.match(source, /duplicateEvidencePathViolationsByJob,/);
  assert.match(source, /duplicateEvidencePathViolations\(candidateJobs\)/);
});
