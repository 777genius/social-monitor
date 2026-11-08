import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectSecurityArtifact } from '../lib/security-final-sweep-direct-artifact.mjs';

const leakClasses = ['secret-values', 'raw-provider-payloads', 'raw-prompt-or-source-text'];
const configuration = () => ({
  securityFinalSweepArtifactFormat: 'security-final-sweep-staging-artifact-v1',
  securityFinalSweepEvidenceKind: 'staging_security_final_sweep',
  requiredLeakClasses: new Set(leakClasses),
});
const inputs = () => ({
  exportPathsByEnv: {
    LOG_EXPORT_PATH: '/sandbox/logs.json',
    METRICS_EXPORT_PATH: '/sandbox/metrics.json',
    PUBLIC_ERROR_EXPORT_PATH: '/sandbox/errors.json',
    AUDIT_EVENT_EXPORT_PATH: '/sandbox/audit.json',
  },
  exportHashesByEnv: {
    LOG_EXPORT_PATH: 'hash-logs',
    METRICS_EXPORT_PATH: 'hash-metrics',
    PUBLIC_ERROR_EXPORT_PATH: 'hash-errors',
    AUDIT_EVENT_EXPORT_PATH: 'hash-audit',
  },
});

test('direct fixture has the original ordered top-level envelope', () => {
  const value = buildDirectSecurityArtifact(inputs(), configuration());
  assert.deepEqual(Object.keys(value), [
    'schemaVersion', 'artifactFormat', 'scope', 'frontendPolicy', 'provenance',
    'environment', 'redaction', 'sourceExports', 'surfaces', 'review',
  ]);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.artifactFormat, 'security-final-sweep-staging-artifact-v1');
  assert.equal(value.scope, 'backend-only');
  assert.equal(value.frontendPolicy, 'deferred_contract_only');
  assert.deepEqual(value.provenance, {
    evidenceKind: 'staging_security_final_sweep',
    collectionMethod: 'staging security sweep capture',
    runner: 'scripts/capture-security-final-sweep.mjs',
    fixtureOnly: false,
  });
});

test('direct fixture preserves deterministic sampledAt and redacted metadata', () => {
  const value = buildDirectSecurityArtifact(inputs(), configuration());
  assert.equal(value.environment.sampledAt, '2026-01-01T00:00:00.000Z');
  assert.equal(value.environment.imageDigest, 'sha256:' + 'e'.repeat(64));
  assert.deepEqual(value.redaction, {
    secretValuesIncluded: false,
    credentialUrlsIncluded: false,
    rawProviderPayloadsIncluded: false,
    rawPromptTextIncluded: false,
    rawSourceTextIncluded: false,
    piiIncluded: false,
    method: 'Sanitized staging security sweep artifacts with redacted diagnostic fields.',
  });
  assert.equal(value.review.decision, 'passed');
});

test('source export order, mapping and flags are unchanged', () => {
  const value = buildDirectSecurityArtifact(inputs(), configuration());
  assert.deepEqual(value.sourceExports.map(({ surfaceId, envVar, path, sha256 }) => ({
    surfaceId, envVar, path, sha256,
  })), [
    { surfaceId: 'logs', envVar: 'LOG_EXPORT_PATH', path: '/sandbox/logs.json', sha256: 'hash-logs' },
    { surfaceId: 'metrics', envVar: 'METRICS_EXPORT_PATH', path: '/sandbox/metrics.json', sha256: 'hash-metrics' },
    { surfaceId: 'public-errors', envVar: 'PUBLIC_ERROR_EXPORT_PATH', path: '/sandbox/errors.json', sha256: 'hash-errors' },
    { surfaceId: 'audit-metadata', envVar: 'AUDIT_EVENT_EXPORT_PATH', path: '/sandbox/audit.json', sha256: 'hash-audit' },
  ]);
  for (const item of value.sourceExports) {
    assert.equal(item.sampleCount, 1);
    assert.equal(item.redactedOnly, true);
    assert.equal(item.sanitized, true);
    assert.equal(item.collectedAt, '2026-01-01T00:00:00.000Z');
  }
});

test('all surfaces retain original diagnostics and leak-class order', () => {
  const value = buildDirectSecurityArtifact(inputs(), configuration());
  assert.deepEqual(value.surfaces.map(({ surfaceId }) => surfaceId),
    ['logs', 'metrics', 'public-errors', 'audit-metadata']);
  for (const surface of value.surfaces) {
    assert.equal(surface.scanStatus, 'passed');
    assert.equal(surface.redactedOnly, true);
    assert.equal(surface.sampleCount, 1);
    assert.deepEqual(surface.safeDiagnosticFields, ['requestId', 'tenantId', 'workspaceId', 'status']);
    assert.deepEqual(surface.leakClassResults, leakClasses.map((leakClass) =>
      ({ leakClass, found: false, sampleCount: 1 })));
  }
});

test('empty and reordered leak-class sets retain iteration semantics', () => {
  const empty = configuration();
  empty.requiredLeakClasses = new Set();
  assert.deepEqual(buildDirectSecurityArtifact(inputs(), empty).surfaces[0].leakClassResults, []);
  const reversed = configuration();
  reversed.requiredLeakClasses = new Set([...leakClasses].reverse());
  assert.deepEqual(
    buildDirectSecurityArtifact(inputs(), reversed).surfaces[3].leakClassResults.map((row) => row.leakClass),
    [...leakClasses].reverse(),
  );
});

test('partial path/hash maps preserve undefined field semantics', () => {
  const value = buildDirectSecurityArtifact({
    exportPathsByEnv: {},
    exportHashesByEnv: {},
  }, configuration());
  assert.equal(Object.hasOwn(value.sourceExports[0], 'path'), true);
  assert.equal(value.sourceExports[0].path, undefined);
  assert.equal(Object.hasOwn(value.sourceExports[0], 'sha256'), true);
  assert.equal(value.sourceExports[0].sha256, undefined);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(value)).sourceExports[0], 'path'), false);
});

test('building a fixture does not mutate caller-owned input maps', () => {
  const input = inputs();
  const snapshot = JSON.stringify(input);
  buildDirectSecurityArtifact(input, configuration());
  assert.equal(JSON.stringify(input), snapshot);
});
