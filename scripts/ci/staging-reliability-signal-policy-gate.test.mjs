import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Include 19 extracted signal-policy regressions in the static CI glob.
import '../lib/staging-reliability-signal-policy.test.mjs';
// Include the release/readiness policy tests in the mandatory static CI glob.
import '../lib/staging-reliability-release-wiring-policy.test.mjs';

test('real staging-reliability checker remains wired to the pure signal policy', () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const checker = fileURLToPath(new URL('../check-staging-reliability-evidence.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [checker], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: '',
      STAGING_RELIABILITY_DIRECT_PATH_GUARD_TEST: '',
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'staging checker must accept the tracked fixture evidence');
  assert.match(result.stdout, /Staging reliability evidence contract OK/);
});
