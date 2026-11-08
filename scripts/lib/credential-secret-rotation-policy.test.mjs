import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateArtifactProvenance,
  validateArtifactEnvironment,
  validateArtifactRedaction,
  validateArtifactOperations,
  validateArtifactRollup,
} from './credential-secret-rotation-policy.mjs';

const requiredRotationOperations = {
  sourceCredentialRotation: new Set([
    'decrypt-with-current-key', 'reencrypt-with-new-key-id', 'preview-redaction-proof',
  ]),
  webhookSecretRotation: new Set([
    'new-key-signs', 'old-key-rejected-after-rotation', 'delivery-preview-redaction-proof',
  ]),
};
const requiredRotationRedactionFlags = {
  secretValuesIncluded: false,
  plaintextCredentialValuesIncluded: false,
  credentialUrlsIncluded: false,
  rawProviderPayloadsIncluded: false,
  rawWebhookPayloadsIncluded: false,
  piiIncluded: false,
};
const isIsoDateString = (value) =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && !Number.isNaN(Date.parse(value));
const context = (violations = []) => ({
  violations,
  requiredRotationOperations,
  rotationArtifactEvidenceKinds: {
    sourceCredentialRotation: 'staging_source_credential_rotation',
    webhookSecretRotation: 'staging_webhook_secret_rotation',
  },
  requiredRotationRedactionFlags,
  isIsoDateString,
});
const sourceOptions = {
  schemaKey: 'sourceCredentialRotation',
  expectedSecretClass: 'source-credentials',
  allowExample: true,
};
const webhookOptions = {
  schemaKey: 'webhookSecretRotation',
  expectedSecretClass: 'webhook-signing-secrets',
  allowExample: true,
};
const observedAt = '2026-11-08T12:00:00Z';

function operation(operationId, options = sourceOptions) {
  const isWebhook = options.schemaKey === 'webhookSecretRotation';
  return {
    operationId,
    status: 'passed',
    secretClass: options.expectedSecretClass,
    keyIdBefore: 'key-previous',
    keyIdAfter: 'key-current',
    observedAt,
    safeEvidence: {
      plaintextObserved: false,
      previewContainsSecretValue: false,
      ...(isWebhook
        ? { webhookEndpointId: 'endpoint-synthetic', signatureVerified: operationId === 'new-key-signs' }
        : { credentialRecordId: 'record-synthetic', provider: 'rss' }),
    },
  };
}

test('valid source-rotation operation evidence produces no violations and is not mutated', () => {
  const operations = [...requiredRotationOperations.sourceCredentialRotation].map((id) => operation(id));
  const original = globalThis.structuredClone(operations);
  const ctx = context();
  validateArtifactOperations(operations, 'artifact', sourceOptions, ctx);
  assert.deepEqual(ctx.violations, []);
  assert.deepEqual(operations, original);
});

test('valid webhook rotation supports signature-verified and revoked-key operations', () => {
  const operations = [...requiredRotationOperations.webhookSecretRotation].map((id) => operation(id, webhookOptions));
  const ctx = context();
  validateArtifactOperations(operations, 'artifact', webhookOptions, ctx);
  assert.deepEqual(ctx.violations, []);
});

test('non-array operation collection fails closed with the original diagnostic', () => {
  const ctx = context();
  validateArtifactOperations(null, 'artifact', sourceOptions, ctx);
  assert.deepEqual(ctx.violations, ['artifact: operations must be an array']);
});

test('missing required rotation operations report in declaration order', () => {
  const ctx = context();
  validateArtifactOperations([], 'artifact', sourceOptions, ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: operations must include decrypt-with-current-key',
    'artifact: operations must include reencrypt-with-new-key-id',
    'artifact: operations must include preview-redaction-proof',
  ]);
});

test('duplicate and unsupported operation IDs retain nested diagnostic paths', () => {
  const operations = [...requiredRotationOperations.sourceCredentialRotation].map((id) => operation(id));
  operations.push(operation('decrypt-with-current-key'));
  operations.push(operation('unknown-operation'));
  const ctx = context();
  validateArtifactOperations(operations, 'artifact', sourceOptions, ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: operations[3]: duplicate operationId "decrypt-with-current-key"',
    'artifact: operations[4]: unsupported operationId "unknown-operation"',
  ]);
});

test('invalid rotation key IDs, timestamps and redaction evidence fail closed', () => {
  const operations = [...requiredRotationOperations.sourceCredentialRotation].map((id) => operation(id));
  operations[1].keyIdAfter = 'key-previous';
  operations[1].observedAt = 'not-a-time';
  operations[1].safeEvidence.plaintextObserved = true;
  operations[1].safeEvidence.credentialRecordId = '';
  const ctx = context();
  validateArtifactOperations(operations, 'artifact', sourceOptions, ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: operations[1]: observedAt must be an ISO timestamp',
    'artifact: operations[1]: reencrypt-with-new-key-id must change key id',
    'artifact: operations[1]: safeEvidence.plaintextObserved must be false',
    'artifact: operations[1]: reencrypt-with-new-key-id safeEvidence.credentialRecordId must be a non-empty string',
  ]);
});

test('webhook signature proof is mandatory for new and revoked keys', () => {
  const operations = [...requiredRotationOperations.webhookSecretRotation].map((id) => operation(id, webhookOptions));
  operations[0].safeEvidence.signatureVerified = false;
  operations[1].safeEvidence.signatureVerified = true;
  const ctx = context();
  validateArtifactOperations(operations, 'artifact', webhookOptions, ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: operations[0]: new-key-signs must have signatureVerified=true',
    'artifact: operations[1]: old-key-rejected-after-rotation must have signatureVerified=false',
  ]);
});

test('invalid operation object does not prevent required-operation checks', () => {
  const ctx = context();
  validateArtifactOperations([null], 'artifact', sourceOptions, ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: operations[0]: operation must be an object',
    'artifact: operations must include decrypt-with-current-key',
    'artifact: operations must include reencrypt-with-new-key-id',
    'artifact: operations must include preview-redaction-proof',
  ]);
});

test('environment fields and source evidence binding are validated in order', () => {
  const environment = {
    environmentId: 'staging-alpha',
    secretStoreId: 'store-a',
    sampledAt: observedAt,
    operator: 'security-owner',
  };
  const ctx = context();
  validateArtifactEnvironment(environment, 'artifact', {
    ...sourceOptions,
    expectedEvidence: { secretStoreId: 'store-a', sampledAt: observedAt },
  }, ctx);
  assert.deepEqual(ctx.violations, []);
  environment.sampledAt = 'bad-date';
  environment.secretStoreId = 'wrong-store';
  const bad = context();
  validateArtifactEnvironment(environment, 'artifact', {
    ...sourceOptions,
    expectedEvidence: { secretStoreId: 'store-a', sampledAt: observedAt },
  }, bad);
  assert.deepEqual(bad.violations, [
    'artifact: environment.sampledAt must be an ISO timestamp',
    'artifact: environment.secretStoreId must match rotationEvidence.secretStoreId',
    'artifact: environment.sampledAt must match rotationEvidence.sampledAt',
  ]);
});

test('malformed environment and redaction objects reject without throwing', () => {
  const ctx = context();
  validateArtifactEnvironment(null, 'artifact', sourceOptions, ctx);
  validateArtifactRedaction(null, 'artifact', ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: environment must be an object',
    'artifact: redaction must be an object',
  ]);
});

test('redaction flags and explanation constraints preserve contract errors', () => {
  const redaction = { ...requiredRotationRedactionFlags, method: 'The output redacts all sensitive values before writing.' };
  const ctx = context();
  validateArtifactRedaction(redaction, 'artifact', ctx);
  assert.deepEqual(ctx.violations, []);
  redaction.rawProviderPayloadsIncluded = true;
  redaction.method = 'short';
  const bad = context();
  validateArtifactRedaction(redaction, 'artifact', bad);
  assert.deepEqual(bad.violations, [
    'artifact: redaction.rawProviderPayloadsIncluded must be false',
    'artifact: redaction.method must explain the redaction process',
  ]);
});

test('rollup contract and caller-owned diagnostics are retained', () => {
  const ctx = context(['preexisting']);
  validateArtifactRollup({ rotationPassed: true, redactionPassed: true, plaintextObserved: false }, 'artifact', ctx);
  assert.deepEqual(ctx.violations, ['preexisting']);
  validateArtifactRollup({ rotationPassed: false, redactionPassed: false, plaintextObserved: true }, 'artifact', ctx);
  assert.deepEqual(ctx.violations, [
    'preexisting',
    'artifact: rollup.rotationPassed must be true',
    'artifact: rollup.redactionPassed must be true',
    'artifact: rollup.plaintextObserved must be false',
  ]);
});

test('fixture and real rotation provenance preserve evidence-kind and identity contracts', () => {
  const fixture = {
    evidenceKind: 'fixture_example',
    collectionMethod: 'synthetic fixture validation',
    runner: 'scripts/check-synthetic-smoke.mjs',
    fixtureOnly: true,
  };
  const ctx = context();
  validateArtifactProvenance(fixture, 'artifact', sourceOptions, ctx);
  assert.deepEqual(ctx.violations, []);

  const real = {
    evidenceKind: 'staging_source_credential_rotation',
    collectionMethod: 'staging secret rotation observed through protected boundary',
    runner: 'scripts/capture-credential-secret-runtime-flow.mjs',
    fixtureOnly: false,
  };
  const realCtx = context();
  validateArtifactProvenance(real, 'artifact', { ...sourceOptions, allowExample: false }, realCtx);
  assert.deepEqual(realCtx.violations, []);
});

test('real provenance forbids fixture markers and retains exact field paths', () => {
  const real = {
    evidenceKind: 'staging_source_credential_rotation',
    collectionMethod: 'mock staging credential rotation',
    runner: 'scripts/capture-credential-secret-runtime-flow.mjs',
    fixtureOnly: false,
  };
  const ctx = context();
  validateArtifactProvenance(real, 'artifact', { ...sourceOptions, allowExample: false }, ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: provenance.collectionMethod must not contain "mock" for rotation evidence',
  ]);
});
