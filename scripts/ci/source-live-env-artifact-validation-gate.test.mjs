import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Keep the shape contract tests in the static CI test glob.
import '../lib/source-live-env-artifact-validation.test.mjs';

// The standalone checker is a deterministic, read-only fixture gate. Exercise
// its real entrypoint as well as the isolated policy helper to catch wiring
// regressions without touching live provider evidence or credentials.
test('source-live certification checker accepts the tracked fixture policy', () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const checkerScript = fileURLToPath(new URL('../check-source-live-certification-evidence.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [checkerScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, [
    'standalone source-live checker should accept tracked fixture policy',
    'stderr:', result.stderr.slice(0, 8_000),
    'stdout:', result.stdout.slice(0, 2_000),
  ].join('\n'));
  assert.match(result.stdout, /Source live certification evidence OK/);
});
