import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// The static CI suite includes this file through scripts/ci/*.test.mjs.
// Use a separate Node process so the archive loader and type stripping are
// installed before the TypeScript test files and their imports are resolved.
test('HN archive observations and manifests pass the full fixture suite', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '--import', './scripts/lib/hn-archive-test-loader.mts',
    '--test',
    'scripts/lib/hn-archive-configured-scan.test.mts',
    'scripts/lib/hn-archive-discovery.test.mts',
    'scripts/lib/hn-archive-observed-client.test.mts',
    'scripts/lib/hn-archive-snapshot.test.mts',
    'scripts/lib/hn-archive-manifest-generation.test.mts',
    'scripts/lib/hn-archive-manifest-integration.test.mts',
    'scripts/generate-hn-archive-missing-manifest.test.mts',
  ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 2_000_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
