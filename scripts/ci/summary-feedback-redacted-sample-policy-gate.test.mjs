import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Discover the 20 focused summary-feedback policy regression cases in static CI.
import '../lib/summary-feedback-redacted-sample-policy.test.mjs';

test('standalone summary-feedback checker accepts tracked redacted fixture contracts end to end', () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const checkerScript = fileURLToPath(new URL('../check-summary-feedback-hardening.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [checkerScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: '',
      SUMMARY_FEEDBACK_DIRECT_PATH_GUARD_TEST: '',
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'standalone checker must accept the tracked redacted fixture contracts');
  assert.match(result.stdout, /Summary feedback hardening evidence OK/);
});
