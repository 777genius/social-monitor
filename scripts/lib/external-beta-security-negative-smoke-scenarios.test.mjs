import assert from 'node:assert/strict';
import test from 'node:test';
import {
  credentialRotationNegativeSmokeScenarios,
  securityFinalSweepNegativeSmokeScenarios,
} from './external-beta-security-negative-smoke-scenarios.mjs';

const credentialContract = [
  ['source rotation fixture provenance', 'fixture provenance'],
  ['source rotation missing preview operation', 'operations must include preview-redaction-proof'],
  ['webhook rotation plaintext redaction flag', 'unredacted sensitive key'],
  ['webhook rotation unchanged old key', 'old-key-rejected-after-rotation must change key id'],
  ['source rotation secret store mismatch', 'secretStoreId must match STAGING_SECRET_STORE_ID'],
  ['source rotation nested fixture marker', 'must not contain fixture marker "example"'],
  ['source rotation raw duplicate-key credential hidden by JSON parser', 'sensitive literal fragment "bearer "'],
];
const securityContract = [
  ['security sweep fixture provenance', 'fixture provenance'],
  ['security sweep missing public error export', 'sourceExports must include public-errors'],
  ['security sweep missing audit metadata export', 'sourceExports must include audit-metadata'],
  ['security sweep mismatched export digest', 'sha256 must match the export file content'],
  ['security sweep unsafe diagnostic field', 'unsafe diagnostic field'],
  ['security sweep export sensitive literal', 'LOG_EXPORT_PATH must not contain sensitive literal fragment'],
  ['security sweep raw source redaction flag', 'redaction.rawSourceTextIncluded must be false'],
  ['security sweep nested fixture marker', 'must not contain fixture marker "example"'],
  ['security sweep raw duplicate-key credential hidden by JSON parser', 'sensitive literal fragment "bearer "'],
];

function sourceFixture() {
  return {
    provenance: { evidenceKind: 'source_rotation', fixtureOnly: false },
    operations: [
      { operationId: 'preview-redaction-proof', safeEvidence: { credentialRecordId: 'real-id' } },
      { operationId: 'other-operation', safeEvidence: { credentialRecordId: 'real-id-2' } },
    ],
    environment: { secretStoreId: 'secret-store-staging-real' },
    redaction: { plaintextObserved: false },
  };
}
function webhookFixture() {
  return {
    redaction: { plaintextCredentialValuesIncluded: false },
    operations: [{ operationId: 'old-key-rejected-after-rotation', keyIdBefore: 'old-id', keyIdAfter: 'new-id' }],
  };
}
function sweepFixture() {
  return {
    provenance: { evidenceKind: 'security_sweep', fixtureOnly: false },
    sourceExports: [
      { surfaceId: 'public-errors', sha256: '1'.repeat(64) },
      { surfaceId: 'audit-metadata', sha256: '2'.repeat(64) },
      { surfaceId: 'logs', sha256: '3'.repeat(64) },
    ],
    surfaces: [
      { surfaceId: 'logs', safeDiagnosticFields: ['requestId'], leakClassResults: [{ sampleId: 'real-sample' }] },
    ],
    redaction: { rawSourceTextIncluded: false },
    operator: 'security-owner-1',
  };
}
test('credential negative smoke identities, expected diagnostics and independent factory results remain exact', () => {
  const scenarios = credentialRotationNegativeSmokeScenarios();
  assert.deepEqual(scenarios.map(({ label, expectedOutput }) => [label, expectedOutput]), credentialContract);
  assert.equal(new Set(scenarios.map(item => item.label)).size, 7);
  assert.notStrictEqual(scenarios, credentialRotationNegativeSmokeScenarios());
});
test('security sweep negative smoke identities, expected diagnostics and independent results remain exact', () => {
  const scenarios = securityFinalSweepNegativeSmokeScenarios();
  assert.deepEqual(scenarios.map(({ label, expectedOutput }) => [label, expectedOutput]), securityContract);
  assert.equal(new Set(scenarios.map(item => item.label)).size, 9);
  assert.notStrictEqual(scenarios, securityFinalSweepNegativeSmokeScenarios());
});
test('credential source fixture provenance is rejected', () => {
  const artifact = sourceFixture();
  credentialRotationNegativeSmokeScenarios()[0].mutateSource(artifact);
  assert.equal(artifact.provenance.fixtureOnly, true);
  assert.equal(artifact.provenance.evidenceKind, 'fixture_example');
});
test('credential missing preview operation remains missing', () => {
  const artifact = sourceFixture();
  credentialRotationNegativeSmokeScenarios()[1].mutateSource(artifact);
  assert.deepEqual(artifact.operations.map(item => item.operationId), ['other-operation']);
});
test('webhook plaintext included flag is unsafe', () => {
  const artifact = webhookFixture();
  credentialRotationNegativeSmokeScenarios()[2].mutateWebhook(artifact);
  assert.equal(artifact.redaction.plaintextCredentialValuesIncluded, true);
});
test('webhook unchanged key remains rejected', () => {
  const artifact = webhookFixture();
  credentialRotationNegativeSmokeScenarios()[3].mutateWebhook(artifact);
  assert.equal(artifact.operations[0].keyIdAfter, 'old-id');
});
test('source secret-store mismatch uses the original sentinel', () => {
  const artifact = sourceFixture();
  credentialRotationNegativeSmokeScenarios()[4].mutateSource(artifact);
  assert.equal(artifact.environment.secretStoreId, 'secret-store-staging-other-1');
});
test('source nested fixture marker remains nested', () => {
  const artifact = sourceFixture();
  credentialRotationNegativeSmokeScenarios()[5].mutateSource(artifact);
  assert.equal(artifact.operations[0].safeEvidence.credentialRecordId, 'source-credential-example-001');
});
test('source raw duplicate key remains visible before parsing', () => {
  const raw = credentialRotationNegativeSmokeScenarios()[6].sourceContent(sourceFixture());
  assert.equal((raw.match(/"authorization":/g) ?? []).length, 2);
  assert.match(raw, /raw-rotation-token-hidden-by-duplicate-key/);
  assert.doesNotThrow(() => JSON.parse(raw));
});
test('security fixture provenance remains rejected', () => {
  const artifact = sweepFixture();
  securityFinalSweepNegativeSmokeScenarios()[0].mutateArtifact(artifact);
  assert.equal(artifact.provenance.fixtureOnly, true);
  assert.equal(artifact.provenance.evidenceKind, 'fixture_example');
});
test('security missing public error export is removed only', () => {
  const artifact = sweepFixture();
  securityFinalSweepNegativeSmokeScenarios()[1].mutateArtifact(artifact);
  assert.deepEqual(artifact.sourceExports.map(x => x.surfaceId), ['audit-metadata', 'logs']);
});
test('security missing audit metadata export is removed only', () => {
  const artifact = sweepFixture();
  securityFinalSweepNegativeSmokeScenarios()[2].mutateArtifact(artifact);
  assert.deepEqual(artifact.sourceExports.map(x => x.surfaceId), ['public-errors', 'logs']);
});
test('security log digest mismatch keeps the other digest values', () => {
  const artifact = sweepFixture();
  securityFinalSweepNegativeSmokeScenarios()[3].mutateArtifact(artifact);
  assert.equal(artifact.sourceExports[2].sha256, '0'.repeat(64));
  assert.equal(artifact.sourceExports[0].sha256, '1'.repeat(64));
});
test('security unsafe diagnostic field stays in the logs surface', () => {
  const artifact = sweepFixture();
  securityFinalSweepNegativeSmokeScenarios()[4].mutateArtifact(artifact);
  assert.deepEqual(artifact.surfaces[0].safeDiagnosticFields, ['requestId', 'token']);
});
test('security export leak is injected in the logs file only', () => {
  const exportsBySurface = { logs: { records: [] } };
  securityFinalSweepNegativeSmokeScenarios()[5].mutateExports(exportsBySurface);
  assert.equal(exportsBySurface.logs.records[0].requestId, 'req-leak-1');
  assert.equal(exportsBySurface.logs.records[0].message, 'bearer leaked-value');
});
test('security raw source text redaction flag is unsafe', () => {
  const artifact = sweepFixture();
  securityFinalSweepNegativeSmokeScenarios()[6].mutateArtifact(artifact);
  assert.equal(artifact.redaction.rawSourceTextIncluded, true);
});
test('security nested marker remains in leak-class result', () => {
  const artifact = sweepFixture();
  securityFinalSweepNegativeSmokeScenarios()[7].mutateArtifact(artifact);
  assert.equal(artifact.surfaces[0].leakClassResults[0].sampleId, 'security-sweep-example-001');
});
test('security raw duplicate credential is detectable before parsing', () => {
  const raw = securityFinalSweepNegativeSmokeScenarios()[8].artifactContent(sweepFixture());
  assert.equal((raw.match(/"operator":/g) ?? []).length, 2);
  assert.match(raw, /raw-security-token-hidden-by-duplicate-key/);
  assert.doesNotThrow(() => JSON.parse(raw));
});
