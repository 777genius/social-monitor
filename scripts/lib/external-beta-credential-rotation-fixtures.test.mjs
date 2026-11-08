import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import {
  sourceCredentialRotationArtifact,
  webhookSecretRotationArtifact,
} from './external-beta-credential-rotation-fixtures.mjs';

const load = (name) => JSON.parse(readFileSync(new URL('../../ops/security/fixtures/' + name, import.meta.url), 'utf8'));
const source = () => load('source-credential-rotation-redacted-examples.json');
const webhook = () => load('webhook-secret-rotation-redacted-examples.json');
const buildSource = (artifact = source()) => sourceCredentialRotationArtifact(artifact);
const buildWebhook = (artifact = webhook()) => webhookSecretRotationArtifact(artifact);
const sourceOps = ['decrypt-with-current-key', 'reencrypt-with-new-key-id', 'preview-redaction-proof'];
const webhookOps = ['new-key-signs', 'old-key-rejected-after-rotation', 'delivery-preview-redaction-proof'];

test('source credential fixture retains its format and original operation ordering', () => {
  const value = buildSource();
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.artifactFormat, 'source-credential-rotation-redacted-v1');
  assert.deepEqual(value.operations.map(x => x.operationId), sourceOps);
});

test('webhook secret fixture retains its format and original operation ordering', () => {
  const value = buildWebhook();
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.artifactFormat, 'webhook-secret-rotation-redacted-v1');
  assert.deepEqual(value.operations.map(x => x.operationId), webhookOps);
});

test('source staging provenance retains the exact original capture runner', () => {
  assert.deepEqual(buildSource().provenance, {
    evidenceKind: 'staging_source_credential_rotation',
    collectionMethod: 'Rotation drill captured from staging source credential boundary.',
    runner: 'scripts/capture-source-credential-rotation.ts',
    fixtureOnly: false,
  });
});

test('webhook staging provenance retains the exact original capture runner', () => {
  assert.deepEqual(buildWebhook().provenance, {
    evidenceKind: 'staging_webhook_secret_rotation',
    collectionMethod: 'Rotation drill captured from staging webhook secret boundary.',
    runner: 'scripts/capture-webhook-secret-rotation.ts',
    fixtureOnly: false,
  });
});

test('rotation evidence uses the exact mocked clock and restores it after verification', (t) => {
  const instant = new Date('2026-11-08T12:34:56.789Z');
  t.mock.timers.enable({ apis: ['Date'], now: instant });
  try {
    for (const value of [buildSource(), buildWebhook()]) {
      assert.deepEqual(
        [value.environment.environmentId, value.environment.secretStoreId, value.environment.operator],
        ['staging-secret-rotation-alpha-1', 'secret-store-staging-alpha-1', 'security-owner-1'],
      );
      assert.equal(value.environment.sampledAt, instant.toISOString());
      assert.ok(value.operations.every((operation) => operation.observedAt === instant.toISOString()));
    }
  } finally {
    t.mock.timers.reset();
  }
});

test('webhook staging environment retains the same secret store and operator', () => {
  const value = buildWebhook();
  assert.equal(value.environment.environmentId, 'staging-secret-rotation-alpha-1');
  assert.equal(value.environment.secretStoreId, 'secret-store-staging-alpha-1');
  assert.equal(value.environment.operator, 'security-owner-1');
});

test('all source observedAt timestamps exactly equal their artifact sampledAt', () => {
  const value = buildSource();
  assert.equal(value.operations.length, 3);
  assert.ok(value.operations.every(x => x.observedAt === value.environment.sampledAt));
});

test('all webhook observedAt timestamps exactly equal their artifact sampledAt', () => {
  const value = buildWebhook();
  assert.equal(value.operations.length, 3);
  assert.ok(value.operations.every(x => x.observedAt === value.environment.sampledAt));
});

test('source operation evidence payloads remain identical after timestamp refresh', () => {
  const before = source(), value = buildSource();
  assert.deepEqual(value.operations.map((operation) => ({ ...operation, observedAt: undefined })),
    before.operations.map((operation) => ({ ...operation, observedAt: undefined })));
});

test('webhook operation evidence payloads remain identical after timestamp refresh', () => {
  const before = webhook(), value = buildWebhook();
  assert.deepEqual(value.operations.map((operation) => ({ ...operation, observedAt: undefined })),
    before.operations.map((operation) => ({ ...operation, observedAt: undefined })));
});

test('original redaction fields remain unchanged for both rotation artifacts', () => {
  assert.deepEqual(buildSource().redaction, source().redaction);
  assert.deepEqual(buildWebhook().redaction, webhook().redaction);
});

test('builders return their caller-supplied artifact identity without silently copying', () => {
  const originalSource = source(), originalWebhook = webhook();
  assert.strictEqual(buildSource(originalSource), originalSource);
  assert.strictEqual(buildWebhook(originalWebhook), originalWebhook);
});

test('separate invocations do not reuse or mutate the checked-in source fixture', () => {
  const before = source(), first = buildSource();
  first.operations[0].operationId = 'changed';
  const again = buildSource();
  assert.equal(again.operations[0].operationId, sourceOps[0]);
  assert.deepEqual(source(), before);
});

test('separate webhook invocations cannot overwrite a later artifact', () => {
  const before = webhook(), first = buildWebhook();
  first.operations[0].operationId = 'changed';
  assert.equal(buildWebhook().operations[0].operationId, webhookOps[0]);
  assert.deepEqual(webhook(), before);
});

test('empty operation arrays retain empty operations with fresh provenance', () => {
  const a = source(), b = webhook(); a.operations = []; b.operations = [];
  assert.deepEqual(buildSource(a).operations, []);
  assert.deepEqual(buildWebhook(b).operations, []);
});

test('malformed operation arrays fail closed before returning evidence', () => {
  const a = source(), b = webhook(); a.operations = null; b.operations = undefined;
  assert.throws(() => buildSource(a), TypeError);
  assert.throws(() => buildWebhook(b), TypeError);
});
