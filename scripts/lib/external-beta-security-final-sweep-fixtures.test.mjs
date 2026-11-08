import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import {
  securityFinalSweepArtifact,
  securityFinalSweepExportDocuments,
} from './external-beta-security-final-sweep-fixtures.mjs';

const fixtureUrl = new URL('../../ops/security/fixtures/security-final-sweep-staging-artifact-examples.json', import.meta.url);
const trackedFixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
const surfaces = ['logs', 'metrics', 'public-errors', 'audit-metadata'];
const fields = ['logs', 'metrics', 'publicErrors', 'auditMetadata'];
const envVars = ['LOG_EXPORT_PATH', 'METRICS_EXPORT_PATH', 'PUBLIC_ERROR_EXPORT_PATH', 'AUDIT_EVENT_EXPORT_PATH'];
const fixture = () => globalThis.structuredClone(trackedFixture);
const exportsBySurface = () => Object.fromEntries(fields.map((name, index) => [
  name,
  {
    path: '/redacted/' + name + '.json',
    sha256: String(index + 1).repeat(64),
    sampleCount: index + 3,
  },
]));
const build = (paths = exportsBySurface(), input = fixture()) => securityFinalSweepArtifact(paths, input);

test('synthetic export documents contain the original four canonical groups', () => {
  const documents = securityFinalSweepExportDocuments();
  assert.deepEqual(Object.keys(documents), fields);
  assert.deepEqual(fields.map((key) => documents[key].records.length), [2, 2, 2, 2]);
});

test('export documents preserve their original safe record fields', () => {
  const docs = securityFinalSweepExportDocuments();
  assert.deepEqual(Object.keys(docs.logs.records[0]),
    ['requestId', 'tenantId', 'workspaceId', 'service', 'operation', 'status']);
  assert.deepEqual(Object.keys(docs.metrics.records[0]),
    ['metricName', 'tenantId', 'workspaceId', 'service', 'status']);
  assert.deepEqual(Object.keys(docs.publicErrors.records[0]),
    ['requestId', 'statusCode', 'errorCode', 'operation']);
  assert.deepEqual(Object.keys(docs.auditMetadata.records[0]),
    ['auditEventId', 'tenantId', 'workspaceId', 'actorId', 'operation', 'status']);
});

test('export document builder returns fresh unshared data every time', () => {
  const first = securityFinalSweepExportDocuments();
  first.logs.records[0].requestId = 'modified';
  const second = securityFinalSweepExportDocuments();
  assert.equal(second.logs.records[0].requestId, 'req-sec-1');
});

test('staging builder retains schema and public artifact envelope', () => {
  const value = build();
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.artifactFormat, 'security-final-sweep-staging-artifact-v1');
  assert.equal(value.scope, 'backend-only');
  assert.equal(value.frontendPolicy, 'deferred_contract_only');
});

test('staging artifact has its exact original collection provenance', () => {
  assert.deepEqual(build().provenance, {
    evidenceKind: 'staging_security_final_sweep',
    collectionMethod: 'Deploy log metric and public error samples captured from staging backend release.',
    runner: 'scripts/capture-security-final-sweep.ts',
    fixtureOnly: false,
  });
});

test('staging environment is freshly stamped with original identity and digest', () => {
  const before = Date.now();
  const value = build();
  const after = Date.now();
  assert.equal(value.environment.environmentId, 'staging-security-alpha-1');
  assert.equal(value.environment.imageDigest, 'sha256:' + 'f'.repeat(64));
  assert.equal(value.environment.operator, 'security-owner-1');
  assert.ok(Date.parse(value.environment.sampledAt) >= before);
  assert.ok(Date.parse(value.environment.sampledAt) <= after);
});

test('source export identity, path, digest and counts follow exact caller inputs', () => {
  const paths = exportsBySurface();
  const value = build(paths);
  assert.deepEqual(value.sourceExports.map((entry) => entry.surfaceId), surfaces);
  assert.deepEqual(value.sourceExports.map((entry) => entry.envVar), envVars);
  for (const [index, entry] of value.sourceExports.entries()) {
    assert.equal(entry.path, paths[fields[index]].path);
    assert.equal(entry.sha256, paths[fields[index]].sha256);
    assert.equal(entry.sampleCount, paths[fields[index]].sampleCount);
  }
});

test('source export redaction and collection timestamp fields remain in every entry', () => {
  const value = build();
  for (const entry of value.sourceExports) {
    assert.equal(entry.redactedOnly, true);
    assert.equal(entry.sanitized, true);
    assert.equal(entry.collectedAt, value.environment.sampledAt);
  }
});

test('surface sample counts follow exports without cross-surface aliases', () => {
  const value = build();
  const paths = exportsBySurface();
  for (const [index, surfaceId] of surfaces.entries()) {
    const surface = value.surfaces.find((item) => item.surfaceId === surfaceId);
    assert.equal(surface.sampleCount, paths[fields[index]].sampleCount);
  }
});

test('every leak-class result receives its own surface sample count', () => {
  const value = build();
  assert.ok(value.surfaces.every((surface) => surface.leakClassResults.length > 0));
  for (const surface of value.surfaces) {
    assert.ok(surface.leakClassResults.every((item) => item.sampleCount === surface.sampleCount));
  }
});

test('staging review remains the original accepted redaction review', () => {
  assert.deepEqual(build().review, {
    reviewer: 'security-owner-1',
    decision: 'passed',
    notes: 'Staging redaction review completed for logs, metrics, public errors and audit metadata.',
  });
});

test('builder retains original redaction evidence without exposing provider payloads', () => {
  const value = build();
  assert.deepEqual(value.redaction, trackedFixture.redaction);
  assert.equal(value.redaction.rawProviderPayloadsIncluded, false);
  assert.equal(value.redaction.secretValuesIncluded, false);
});

test('a missing required surface fails closed rather than emitting mismatched evidence', () => {
  const input = fixture();
  input.surfaces = input.surfaces.filter((item) => item.surfaceId !== 'logs');
  assert.throws(() => build(exportsBySurface(), input), TypeError);
});

test('different invocations produce independent fixtures and preserve the tracked fixture file', () => {
  const before = fixture();
  const a = build();
  a.sourceExports[0].sampleCount = -1;
  a.surfaces[0].leakClassResults[0].sampleCount = -1;
  const b = build();
  assert.notEqual(b.sourceExports[0].sampleCount, -1);
  assert.notEqual(b.surfaces[0].leakClassResults[0].sampleCount, -1);
  assert.deepEqual(trackedFixture, before);
});
