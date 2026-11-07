import assert from 'node:assert/strict';
import { test } from 'node:test';

import { syntheticArtifact } from '../lib/docker-backend-staging-evidence-fixtures.mjs';

const observedAt = '2026-06-18T00:00:00.000Z';
const format = 'fixture-format-v1';
const build = (artifactId) => syntheticArtifact(artifactId, { format }, observedAt);

test('every self-test artifact preserves shared redaction and provenance', () => {
  const ids = [
    'durable-runtime-selector', 'source-credential-rotation', 'webhook-secret-rotation',
    'security-final-sweep', 'release-deploy-smoke', 'rabbitmq-staging-drill-output',
  ];
  for (const id of ids) {
    const artifact = build(id);
    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.scope, 'backend-only');
    assert.equal(artifact.frontendPolicy, 'deferred_contract_only');
    assert.deepEqual(artifact.provenance, {
      evidenceKind: 'docker_self_test',
      collectionMethod: 'Synthetic self-test artifact for bundle validator.',
      runner: 'scripts/check-docker-backend-staging-evidence-bundle.mjs',
      fixtureOnly: false,
    });
    assert.deepEqual(artifact.redaction, {
      secretsIncluded: false, rawProviderPayloadsIncluded: false,
      databaseUrlsIncluded: false, brokerUrlsIncluded: false,
    });
  }
});

test('durable runtime fixture retains five service selectors, environment and rollup', () => {
  const artifact = build('durable-runtime-selector');
  assert.equal(artifact.artifactFormat, format);
  assert.deepEqual(artifact.environment, {
    environmentId: 'docker-self-test',
    imageDigest: 'sha256:' + '1'.repeat(64),
    apiBaseUrl: 'http://127.0.0.1:3100',
    sampledAt: observedAt,
    operator: 'backend-ops-self-test',
  });
  assert.deepEqual(artifact.services, [
    'api-gateway', 'ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay',
  ].map((serviceId) => ({ serviceId, runtimeProfile: 'beta', forbiddenSelectorValuesFound: [] })));
  assert.deepEqual(artifact.rollup, {
    allServicesDurable: true, forbiddenSelectorsFound: false, runtimeProfile: 'beta',
  });
});

test('credential rotation fixtures retain operation IDs and timestamps', () => {
  for (const id of ['source-credential-rotation', 'webhook-secret-rotation']) {
    const artifact = build(id);
    assert.equal(artifact.artifactFormat, format);
    assert.deepEqual(artifact.operations, [{
      operationId: id + '-self-test', status: 'passed', observedAt,
    }]);
  }
});

test('security sweep fixture retains all redacted surfaces and exports', () => {
  const artifact = build('security-final-sweep');
  assert.equal(artifact.artifactFormat, format);
  assert.deepEqual(artifact.surfaces, [
    'logs', 'metrics', 'public-errors', 'audit-metadata',
  ].map((surfaceId) => ({ surfaceId, sampleCount: 1, scanStatus: 'passed', redactedOnly: true })));
  assert.deepEqual(artifact.sourceExports, [
    'logs', 'metrics', 'public-errors',
  ].map((surfaceId) => ({
    surfaceId, path: '/tmp/' + surfaceId + '.json', redactedOnly: true, sanitized: true,
  })));
});

test('release smoke fixture preserves four successful checks', () => {
  const artifact = build('release-deploy-smoke');
  assert.equal(artifact.format, format);
  assert.equal(artifact.artifactId, 'release-deploy-smoke');
  assert.deepEqual(artifact.smokeResults, [
    'api-health', 'openapi-contract', 'migration-version', 'worker-pause-resume',
  ].map((smokeId) => ({ smokeId, status: 'passed', observedAt })));
});

test('staging drill fixture retains generic signal contract', () => {
  for (const id of ['rabbitmq-staging-drill-output', 'postgres-restore-drill-output', 'durable-backend-e2e-output']) {
    const artifact = build(id);
    assert.equal(artifact.format, format);
    assert.equal(artifact.artifactId, id);
    assert.deepEqual(artifact.signalResults, [{
      signalId: id + '-self-test',
      status: 'passed',
      observedAt,
      evidence: { summary: 'redacted self-test evidence' },
    }]);
  }
});
