import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDirectSecurityArtifact } from './security-final-sweep-direct-artifact.mjs';

import {
  scanForbiddenArtifactKeys,
  validateNoRealArtifactFixtureMarkers,
} from './security-final-sweep-artifact-shape.mjs';

const forbiddenArtifactKeys = new Set(['token', 'api_key', 'apikey', 'rawpayload']);
const forbiddenRealArtifactMarkerPattern = /(?:^|[-_:.\s])(example|fixture|synthetic|mock|test)(?:$|[-_:.\s])/i;
function context(violations) {
  return { forbiddenArtifactKeys, forbiddenRealArtifactMarkerPattern, violations };
}

test('sensitive top-level keys retain the original diagnostic', () => {
  const violations = [];
  scanForbiddenArtifactKeys({ token: 'redacted' }, 'sample', context(violations));
  assert.deepEqual(violations, ['sample: forbidden sensitive field "token"']);
});

test('sensitive nested array keys retain traversal order and parent label', () => {
  const violations = [];
  scanForbiddenArtifactKeys({
    records: [{ 'To-ken': 'redacted', 'raw-payload': null }, { api_key: false }],
    other: { safeField: true },
  }, 'sample', context(violations));
  assert.deepEqual(violations, [
    'sample.records[0]: forbidden sensitive field "To-ken"',
    'sample.records[0]: forbidden sensitive field "raw-payload"',
    'sample.records[1]: forbidden sensitive field "api_key"',
  ]);
});

test('field name normalization remains case sensitive only after normalization', () => {
  const violations = [];
  scanForbiddenArtifactKeys({ 'API-KEY': null, 'ordinary-value': 1 }, 'fixture', context(violations));
  assert.deepEqual(violations, ['fixture: forbidden sensitive field "API-KEY"']);
});

test('primitive, null, and safe data stay accepted without mutation', () => {
  const data = { entries: [null, 0, false, { safeName: 'redacted' }] };
  const snapshot = globalThis.structuredClone(data);
  const violations = [];
  scanForbiddenArtifactKeys(data, 'sample', context(violations));
  scanForbiddenArtifactKeys(null, 'sample', context(violations));
  assert.deepEqual(data, snapshot);
  assert.deepEqual(violations, []);
});

test('root fixture marker still reports the root field label', () => {
  const violations = [];
  validateNoRealArtifactFixtureMarkers('release_example', 'artifact', context(violations));
  assert.deepEqual(violations, ['artifact: <root> must not contain fixture marker "example"']);
});

test('fixture marker search remains recursive through objects and arrays', () => {
  const violations = [];
  validateNoRealArtifactFixtureMarkers({
    event: [{ name: 'production-mock' }, { name: 'clean' }],
    generated: 'a_test_run',
  }, 'artifact', context(violations));
  assert.deepEqual(violations, [
    'artifact: event.[0].name must not contain fixture marker "mock"',
    'artifact: generated must not contain fixture marker "test"',
  ]);
});

test('marker recognition retains case-insensitivity and token boundaries', () => {
  const violations = [];
  validateNoRealArtifactFixtureMarkers(['TEST', 'contest', 'Tested', 'synthetic-run'], 'record', context(violations));
  assert.deepEqual(violations, [
    'record: [0] must not contain fixture marker "TEST"',
    'record: [3] must not contain fixture marker "synthetic"',
  ]);
});

test('scans append to caller violations and do not clear earlier diagnostics', () => {
  const violations = ['preexisting'];
  const ctx = context(violations);
  scanForbiddenArtifactKeys([{ token: 'redacted' }], 'artifact', ctx);
  validateNoRealArtifactFixtureMarkers('fixture', 'artifact', ctx);
  assert.deepEqual(violations, [
    'preexisting',
    'artifact[0]: forbidden sensitive field "token"',
    'artifact: <root> must not contain fixture marker "fixture"',
  ]);
});

test('repeated marker scans do not leak regex state', () => {
  const violations = [];
  const ctx = context(violations);
  validateNoRealArtifactFixtureMarkers('mock', 'first', ctx);
  validateNoRealArtifactFixtureMarkers('mock', 'second', ctx);
  assert.deepEqual(violations, [
    'first: <root> must not contain fixture marker "mock"',
    'second: <root> must not contain fixture marker "mock"',
  ]);
});

const checkerRoot = fileURLToPath(new URL('../../', import.meta.url));
const checkerScript = fileURLToPath(new URL('../check-security-final-sweep.mjs', import.meta.url));

// Exercise the real checker with synthetic, private, temporary staging artifacts.
function runCheckerWithArtifacts({ mutateArtifact = () => {}, mutateExports = () => {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'security-final-sweep-integration-'));
  try {
    const exportsByEnv = {
      LOG_EXPORT_PATH: { records: [{ requestId: 'req-1', status: 'ok' }] },
      METRICS_EXPORT_PATH: { records: [{ metricName: 'queue_lag_seconds', status: 'ok' }] },
      PUBLIC_ERROR_EXPORT_PATH: { records: [{ errorCode: 'rate_limited', status: 'handled' }] },
      AUDIT_EVENT_EXPORT_PATH: { records: [{ auditEventId: 'audit-1', status: 'recorded' }] },
    };
    mutateExports(exportsByEnv);
    const exportPathsByEnv = {};
    const exportHashesByEnv = {};
    for (const [envName, document] of Object.entries(exportsByEnv)) {
      const path = join(directory, `${envName.toLowerCase()}.json`);
      const content = `${JSON.stringify(document)}\n`;
      writeFileSync(path, content, { mode: 0o600 });
      exportPathsByEnv[envName] = path;
      exportHashesByEnv[envName] = createHash('sha256').update(content).digest('hex');
    }
    const artifact = buildDirectSecurityArtifact(
      { exportPathsByEnv, exportHashesByEnv },
      {
        securityFinalSweepArtifactFormat: 'security-final-sweep-staging-artifact-v1',
        securityFinalSweepEvidenceKind: 'staging_security_final_sweep',
        requiredLeakClasses: new Set(['secret-values', 'raw-provider-payloads', 'raw-prompt-or-source-text']),
      },
    );
    mutateArtifact(artifact);
    const artifactPath = join(directory, 'security-final-sweep.json');
    writeFileSync(artifactPath, `${JSON.stringify(artifact)}\n`, { mode: 0o600 });
    chmodSync(artifactPath, 0o600);
    return spawnSync(process.execPath, [checkerScript], {
      cwd: checkerRoot,
      env: {
        ...process.env,
        SECURITY_FINAL_SWEEP_ARTIFACT_PATH: artifactPath,
        SECURITY_FINAL_SWEEP_DIRECT_PATH_GUARD_TEST: '1',
        STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
        STAGING_OPERATOR: 'security-owner-1',
        BACKEND_IMAGE_DIGEST: `sha256:${'e'.repeat(64)}`,
        ...exportPathsByEnv,
      },
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('checker rejects sensitive artifact keys through the real entrypoint', () => {
  const result = runCheckerWithArtifacts({
    mutateArtifact: (artifact) => { artifact.extra = { rawsource: 'redacted' }; },
  });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /forbidden sensitive field "rawsource"/);
});

test('checker rejects fixture markers through the real artifact entrypoint', () => {
  const result = runCheckerWithArtifacts({
    mutateArtifact: (artifact) => { artifact.review.evidence = 'production-synthetic'; },
  });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /must not contain fixture marker "synthetic"/);
});

test('checker scans private exports with the real artifact wiring', () => {
  const result = runCheckerWithArtifacts({
    mutateExports: (documents) => { documents.LOG_EXPORT_PATH.records[0].rawsource = 'redacted'; },
  });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /export file: forbidden sensitive field "rawsource"/);
});
