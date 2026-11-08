import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Keep the shape contract tests in the static CI test glob.
import '../lib/source-live-env-artifact-validation.test.mjs';

// The full checker still reports pre-existing fixture/provider contract drift on
// main (349345c4). Keep its strict failure behavior intact. This smoke test
// checks the extracted helper's actual entrypoint wiring and fails on NEW
// checker violations; the existing 11 unit tests cover the isolated policy.
const knownMainDiagnostics = new Set([
  'ops/ingestion/source-provider-certification.json: provider "github-issues" must stay enabled_beta in fixture gate',
  'libs/ingestion/adapters/source/reddit/reddit-source.provider.ts: runtime Reddit provider must support tenant refresh-token credentials through context.config?.refreshToken',
  'libs/ingestion/adapters/source/reddit/reddit-source.provider.ts: runtime Reddit provider must support tenant refresh-token credentials through context.config?.redditRefreshToken',
  'libs/ingestion/adapters/source/reddit/reddit-source.provider.ts: runtime Reddit provider must support tenant refresh-token credentials through context.config?.clientId',
  'libs/ingestion/adapters/source/reddit/reddit-source.provider.ts: runtime Reddit provider must support tenant refresh-token credentials through context.config?.redditClientId',
  'libs/ingestion/adapters/source/reddit/reddit-source.provider.ts: runtime Reddit provider must support tenant refresh-token credentials through Reddit refresh-token OAuth provider is not configured',
  'ops/ingestion/fixtures/source-live-certification-artifact-examples.json: example "live-open-connectors-evidence-v1": providerResult "github-trending-page".freshnessGuard.maxStalenessSeconds must match ops/ingestion/source-provider-certification.json',
  'ops/ingestion/fixtures/source-live-certification-artifact-examples.json: example "live-open-connectors-evidence-v1": providerResult "github-trending-page".freshnessGuard.minimumScanIntervalSeconds must match ops/ingestion/source-provider-certification.json',
]);

test('source-live certification checker entrypoint preserves the existing fixture diagnostics', () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const checkerScript = fileURLToPath(new URL('../check-source-live-certification-evidence.mjs', import.meta.url));
  assert.match(
    readFileSync(checkerScript, 'utf8'),
    /validateEnvArtifactValidation\(schema\.envArtifactValidation,\s*\{/,
    'the standalone checker must delegate live artifact policy to the extracted helper',
  );

  const result = spawnSync(process.execPath, [checkerScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);

  if (result.status === 0) {
    assert.match(result.stdout, /Source live certification evidence OK/);
    return;
  }

  assert.equal(result.status, 1, 'the standalone checker must fail closed for invalid policy fixtures');
  const diagnostics = result.stderr.trim().split('\n').filter(Boolean);
  assert.ok(diagnostics.length > 0, 'a failing checker must emit validation diagnostics');
  assert.deepEqual(
    diagnostics.filter((line) => !knownMainDiagnostics.has(line)),
    [],
    'checker may only fail for previously confirmed, unchanged main fixture/provider violations',
  );
});

test('checker rejects a missing env artifact policy rule through the real entrypoint', () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const checkerScript = fileURLToPath(new URL('../check-source-live-certification-evidence.mjs', import.meta.url));
  const fixturePath = join(repoRoot, 'ops/ingestion/source-live-certification-evidence.json');
  const originalFixture = readFileSync(fixturePath, 'utf8');
  const originalRules = JSON.parse(originalFixture).passedArtifactContentSchema.envArtifactValidation;
  assert.ok(
    Array.isArray(originalRules) && originalRules.some((rule) => rule.envVar === 'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH'),
    'the baseline fixture must contain the rule removed by the negative test',
  );
  const directory = mkdtempSync(join(tmpdir(), 'source-live-env-regression-'));

  try {
    // Patch only this child process's fixture read. Never alter the tracked
    // evidence JSON, production checker, environment variables, or git workspace.
    const preloadPath = join(directory, 'invalid-env-rule.cjs');
    const preload = [
      "const fs = require('node:fs');",
      "const { syncBuiltinESMExports } = require('node:module');",
      "const original = fs.readFileSync;",
      "fs.readFileSync = function (path, ...options) {",
      "  const content = original.call(this, path, ...options);",
      "  if (path !== 'ops/ingestion/source-live-certification-evidence.json') return content;",
      "  const fixture = JSON.parse(content);",
      "  fixture.passedArtifactContentSchema.envArtifactValidation = fixture.passedArtifactContentSchema.envArtifactValidation.filter((rule) => rule.envVar !== 'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH');",
      "  return JSON.stringify(fixture);",
      "};",
      "syncBuiltinESMExports();",
    ].join('\n');
    writeFileSync(preloadPath, preload, { mode: 0o600 });

    const result = spawnSync(process.execPath, ['--require', preloadPath, checkerScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, 'invalid env artifact policy must fail closed');
    assert.match(
      result.stderr,
      /envArtifactValidation must include GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH/,
      'the real checker must execute the extracted environment policy',
    );
    assert.equal(readFileSync(fixturePath, 'utf8'), originalFixture, 'tracked fixtures must stay unchanged');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
