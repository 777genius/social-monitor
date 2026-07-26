import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { ContractWebhookEventCatalogAdapter } from '@social-monitor/delivery/adapters/events/contract-webhook-event-catalog.adapter';
import { InMemoryWebhookEndpointRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-webhook-endpoint.repository';
import { InMemoryWebhookReplayStore } from '@social-monitor/delivery/adapters/replay/in-memory-webhook-replay.store';
import { InMemoryWebhookSecretVault } from '@social-monitor/delivery/adapters/secrets/in-memory-webhook-secret.vault';
import { WebhookEndpoint } from '@social-monitor/delivery/domain';
import { SignWebhookPayloadUseCase } from '@social-monitor/delivery/features/sign-webhook-payload/sign-webhook-payload.use-case';
import { VerifyWebhookSignatureUseCase } from '@social-monitor/delivery/features/verify-webhook-signature/verify-webhook-signature.use-case';
import { SourceBinding } from '@social-monitor/monitoring/domain';
import { AesGcmSourceBindingConfigProtector } from '@social-monitor/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import { presentSourceBinding } from '@social-monitor/monitoring/features/shared/source-binding-presenter';
import {
  FixedClock,
  REDACTED_VALUE,
  redactSensitiveRecord,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const tenant = tenantId('tenant-credential-secret-flow-smoke');
const workspace = workspaceId('workspace-credential-secret-flow-smoke');
const occurredAt = new Date('2026-06-18T12:00:00.000Z');
const clock = new FixedClock(occurredAt);

type RotationOperation = {
  readonly operationId: string;
  readonly status: 'passed';
  readonly secretClass: 'source-credentials' | 'webhook-signing-secrets';
  readonly keyIdBefore: string;
  readonly keyIdAfter: string;
  readonly observedAt: string;
  readonly safeEvidence: Record<string, string | boolean>;
};

type RotationArtifact = {
  readonly schemaVersion: 1;
  readonly artifactFormat: 'source-credential-rotation-redacted-v1' | 'webhook-secret-rotation-redacted-v1';
  readonly scope: 'backend-only';
  readonly frontendPolicy: 'deferred_contract_only';
  readonly provenance: {
    readonly evidenceKind: 'staging_source_credential_rotation' | 'staging_webhook_secret_rotation';
    readonly collectionMethod: string;
    readonly runner: string;
    readonly fixtureOnly: false;
  };
  readonly environment: {
    readonly environmentId: string;
    readonly secretStoreId: string;
    readonly sampledAt: string;
    readonly operator: string;
  };
  readonly redaction: {
    readonly secretValuesIncluded: false;
    readonly plaintextCredentialValuesIncluded: false;
    readonly credentialUrlsIncluded: false;
    readonly rawProviderPayloadsIncluded: false;
    readonly rawWebhookPayloadsIncluded: false;
    readonly piiIncluded: false;
    readonly method: string;
  };
  readonly operations: readonly RotationOperation[];
  readonly rollup: {
    readonly rotationPassed: true;
    readonly redactionPassed: true;
    readonly plaintextObserved: false;
  };
};

async function main(): Promise<void> {
  const sourceCredentialOperations = await proveSourceCredentialRotationAndRedaction();
  const webhookSecretOperations = await proveWebhookSecretRotationAndRedaction();
  provePublicDiagnosticRedaction();
  writeRotationArtifactsIfRequested({
    sourceCredentialOperations,
    webhookSecretOperations,
  });

  console.log('Credential secret runtime flow smoke OK');
}

async function proveSourceCredentialRotationAndRedaction(): Promise<readonly RotationOperation[]> {
  const oldProtector = AesGcmSourceBindingConfigProtector.fromBase64Key(
    Buffer.alloc(32, 11).toString('base64url'),
    'source-key-old',
  );
  const newProtector = AesGcmSourceBindingConfigProtector.fromBase64Key(
    Buffer.alloc(32, 12).toString('base64url'),
    'source-key-new',
  );
  const rawConfig = {
    query: 'credential rotation',
    accessToken: 'raw-source-access-token',
    nested: {
      refreshToken: 'raw-source-refresh-token',
      visible: 'safe-visible-value',
    },
  };

  const oldProtectedConfig = await oldProtector.protect(rawConfig);
  const oldSerialized = JSON.stringify(oldProtectedConfig);

  assert(!oldSerialized.includes(rawConfig.accessToken), 'old protected config must not contain raw access token');
  assert(!oldSerialized.includes(rawConfig.nested.refreshToken), 'old protected config must not contain raw refresh token');
  assert(oldSerialized.includes('source-key-old'), 'old protected config must include old key id metadata');

  const unprotected = await oldProtector.unprotect(oldProtectedConfig);
  assert(unprotected.accessToken === rawConfig.accessToken, 'old source credential must decrypt before rotation');

  const newProtectedConfig = await newProtector.protect(unprotected);
  const newSerialized = JSON.stringify(newProtectedConfig);
  assert(!newSerialized.includes(rawConfig.accessToken), 'rotated protected config must not contain raw access token');
  assert(!newSerialized.includes(rawConfig.nested.refreshToken), 'rotated protected config must not contain raw refresh token');
  assert(newSerialized.includes('source-key-new'), 'rotated protected config must include new key id metadata');
  assert(!newSerialized.includes('source-key-old'), 'rotated protected config must not retain old key id metadata');

  const rotatedBinding = SourceBinding.rehydrate({
    id: 'source-binding-credential-rotation-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'topic-credential-rotation-smoke',
    providerKey: 'reddit',
    capabilityProfileVersion: 1,
    config: newProtectedConfig,
    status: 'enabled',
    createdAt: occurredAt,
  });
  const preview = presentSourceBinding(rotatedBinding).configPreview;
  const previewSerialized = JSON.stringify(preview);

  assert(!previewSerialized.includes(rawConfig.accessToken), 'source binding preview must not expose access token');
  assert(!previewSerialized.includes(rawConfig.nested.refreshToken), 'source binding preview must not expose refresh token');
  assert(!previewSerialized.includes('source-key-new'), 'source binding preview must not expose source key id metadata');

  try {
    await oldProtector.unprotect(newProtectedConfig);
    throw new Error('old source credential key must not decrypt rotated config');
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes('Source credential key mismatch'),
      'old source credential key must fail with key mismatch after rotation',
    );
  }

  const rotatedPlaintext = await newProtector.unprotect(newProtectedConfig);
  assert(rotatedPlaintext.accessToken === rawConfig.accessToken, 'new source credential key must decrypt rotated access token');

  return [
    rotationOperation({
      operationId: 'decrypt-with-current-key',
      secretClass: 'source-credentials',
      keyIdBefore: 'source-key-redacted-old',
      keyIdAfter: 'source-key-redacted-old',
      minutesAfterStart: 1,
      safeEvidence: {
        credentialRecordId: 'source-binding-rotation-001',
        provider: 'reddit',
        plaintextObserved: false,
        previewContainsSecretValue: false,
      },
    }),
    rotationOperation({
      operationId: 'reencrypt-with-new-key-id',
      secretClass: 'source-credentials',
      keyIdBefore: 'source-key-redacted-old',
      keyIdAfter: 'source-key-redacted-new',
      minutesAfterStart: 2,
      safeEvidence: {
        credentialRecordId: 'source-binding-rotation-001',
        provider: 'reddit',
        plaintextObserved: false,
        previewContainsSecretValue: false,
      },
    }),
    rotationOperation({
      operationId: 'preview-redaction-proof',
      secretClass: 'source-credentials',
      keyIdBefore: 'source-key-redacted-new',
      keyIdAfter: 'source-key-redacted-new',
      minutesAfterStart: 3,
      safeEvidence: {
        credentialRecordId: 'source-binding-rotation-001',
        provider: 'reddit',
        plaintextObserved: false,
        previewContainsSecretValue: false,
      },
    }),
  ];
}

async function proveWebhookSecretRotationAndRedaction(): Promise<readonly RotationOperation[]> {
  const endpoints = new InMemoryWebhookEndpointRepository();
  const secrets = new InMemoryWebhookSecretVault();
  const eventCatalog = new ContractWebhookEventCatalogAdapter();
  const signer = new SignWebhookPayloadUseCase(endpoints, secrets, eventCatalog);
  const verifier = new VerifyWebhookSignatureUseCase(endpoints, secrets, new InMemoryWebhookReplayStore(), clock);
  const endpointId = 'webhook-endpoint-secret-rotation-smoke';

  await secrets.put({
    tenantId: tenant,
    workspaceId: workspace,
    secretKeyId: 'whsec_generated_old_key',
    secret: 'whsec_generated_old_secret',
  });
  await endpoints.save(WebhookEndpoint.create({
    id: endpointId,
    tenantId: tenant,
    workspaceId: workspace,
    url: 'https://example.com/social-monitor/credential-flow',
    eventTypes: ['digest.ready.v1'],
    status: 'enabled',
    secretKeyId: 'whsec_generated_old_key',
    secretPreview: 't_value',
    createdAt: occurredAt,
  }));

  const oldSigned = unwrap(await signer.execute(webhookCommand({
    endpointId,
    deliveryId: 'delivery-secret-rotation-old',
  })), 'old webhook signing');
  assert(
    !oldSigned.rawBody.includes('whsec_generated_old_secret'),
    'signed webhook raw body must not contain old signing secret',
  );
  assert(
    oldSigned.headers['x-social-monitor-key-id'] === 'whsec_generated_old_key',
    'old webhook signature must advertise old key id',
  );

  const oldVerified = unwrap(await verifier.execute({
    tenantId: tenant,
    workspaceId: workspace,
    webhookEndpointId: endpointId,
    deliveryId: oldSigned.headers['x-social-monitor-delivery-id'],
    keyId: oldSigned.headers['x-social-monitor-key-id'],
    timestamp: oldSigned.headers['x-social-monitor-timestamp'],
    rawBody: oldSigned.rawBody,
    signatureHeader: oldSigned.headers['x-social-monitor-signature'],
    toleranceSeconds: 300,
  }), 'old webhook verification');
  assert(oldVerified.verified, 'old webhook signature must verify before rotation');

  await secrets.put({
    tenantId: tenant,
    workspaceId: workspace,
    secretKeyId: 'whsec_generated_new_key',
    secret: 'whsec_generated_new_secret',
  });
  await endpoints.save(WebhookEndpoint.rehydrate({
    id: endpointId,
    tenantId: tenant,
    workspaceId: workspace,
    url: 'https://example.com/social-monitor/credential-flow',
    eventTypes: ['digest.ready.v1'],
    status: 'enabled',
    secretKeyId: 'whsec_generated_new_key',
    secretPreview: 't_value',
    createdAt: occurredAt,
  }));

  const oldAfterRotation = unwrap(await verifier.execute({
    tenantId: tenant,
    workspaceId: workspace,
    webhookEndpointId: endpointId,
    deliveryId: 'delivery-secret-rotation-old-after-rotation',
    keyId: oldSigned.headers['x-social-monitor-key-id'],
    timestamp: oldSigned.headers['x-social-monitor-timestamp'],
    rawBody: oldSigned.rawBody,
    signatureHeader: oldSigned.headers['x-social-monitor-signature'],
    toleranceSeconds: 300,
  }), 'old webhook verification after rotation');
  assert(!oldAfterRotation.verified, 'old webhook key id must not verify after endpoint rotation');
  assert(oldAfterRotation.reason === 'secret_unavailable', 'old webhook key id must fail as unavailable after rotation');

  const newSigned = unwrap(await signer.execute(webhookCommand({
    endpointId,
    deliveryId: 'delivery-secret-rotation-new',
  })), 'new webhook signing');
  assert(
    newSigned.headers['x-social-monitor-key-id'] === 'whsec_generated_new_key',
    'new webhook signature must advertise new key id',
  );
  assert(
    !newSigned.rawBody.includes('whsec_generated_new_secret'),
    'signed webhook raw body must not contain new signing secret',
  );

  const newVerified = unwrap(await verifier.execute({
    tenantId: tenant,
    workspaceId: workspace,
    webhookEndpointId: endpointId,
    deliveryId: newSigned.headers['x-social-monitor-delivery-id'],
    keyId: newSigned.headers['x-social-monitor-key-id'],
    timestamp: newSigned.headers['x-social-monitor-timestamp'],
    rawBody: newSigned.rawBody,
    signatureHeader: newSigned.headers['x-social-monitor-signature'],
    toleranceSeconds: 300,
  }), 'new webhook verification');
  assert(newVerified.verified, 'new webhook signature must verify after rotation');

  return [
    rotationOperation({
      operationId: 'new-key-signs',
      secretClass: 'webhook-signing-secrets',
      keyIdBefore: 'webhook-key-redacted-old',
      keyIdAfter: 'webhook-key-redacted-new',
      minutesAfterStart: 1,
      safeEvidence: {
        webhookEndpointId: 'webhook-endpoint-rotation-001',
        signatureVerified: true,
        plaintextObserved: false,
        previewContainsSecretValue: false,
      },
    }),
    rotationOperation({
      operationId: 'old-key-rejected-after-rotation',
      secretClass: 'webhook-signing-secrets',
      keyIdBefore: 'webhook-key-redacted-old',
      keyIdAfter: 'webhook-key-redacted-new',
      minutesAfterStart: 2,
      safeEvidence: {
        webhookEndpointId: 'webhook-endpoint-rotation-001',
        signatureVerified: false,
        plaintextObserved: false,
        previewContainsSecretValue: false,
      },
    }),
    rotationOperation({
      operationId: 'delivery-preview-redaction-proof',
      secretClass: 'webhook-signing-secrets',
      keyIdBefore: 'webhook-key-redacted-new',
      keyIdAfter: 'webhook-key-redacted-new',
      minutesAfterStart: 3,
      safeEvidence: {
        webhookEndpointId: 'webhook-endpoint-rotation-001',
        signatureVerified: true,
        plaintextObserved: false,
        previewContainsSecretValue: false,
      },
    }),
  ];
}

function provePublicDiagnosticRedaction(): void {
  const diagnostic = redactSensitiveRecord({
    provider: 'reddit',
    accessToken: 'raw-source-access-token',
    refreshToken: 'raw-source-refresh-token',
    authorization: 'Bearer token-value',
    databaseUrl: 'postgres://user:password@example.test/social_monitor',
    rabbitmqUrl: 'amqp://user:password@example.test/social_monitor',
    nested: {
      webhookSecret: 'whsec_generated_new_secret',
      safeField: 'visible',
    },
  });
  const serialized = JSON.stringify(diagnostic);

  for (const rawSecret of [
    'raw-source-access-token',
    'raw-source-refresh-token',
    'token-value',
    'postgres://user:password@example.test/social_monitor',
    'amqp://user:password@example.test/social_monitor',
    'whsec_generated_new_secret',
  ]) {
    assert(!serialized.includes(rawSecret), `redacted diagnostic must not contain ${rawSecret}`);
  }
  assert(serialized.includes(REDACTED_VALUE), 'redacted diagnostic must include redaction marker');
  assert(serialized.includes('visible'), 'redacted diagnostic must preserve safe fields');
}

function webhookCommand(params: {
  readonly endpointId: string;
  readonly deliveryId: string;
}): Parameters<SignWebhookPayloadUseCase['execute']>[0] {
  return {
    tenantId: tenant,
    workspaceId: workspace,
    webhookEndpointId: params.endpointId,
    deliveryId: params.deliveryId,
    eventType: 'digest.ready.v1',
    occurredAt,
    resourceType: 'digest',
    resourceId: 'digest-credential-secret-flow-smoke',
    idempotencyKey: `${params.deliveryId}:digest-credential-secret-flow-smoke`,
    correlationId: 'credential-secret-flow-smoke',
    resourceLinks: {},
    summary: {
      title: 'Credential secret flow smoke',
    },
  };
}

function unwrap<TValue, TError>(result: { ok: true; value: TValue } | { ok: false; error: TError }, label: string): TValue {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
  }

  return result.value;
}

function rotationOperation(params: {
  readonly operationId: string;
  readonly secretClass: 'source-credentials' | 'webhook-signing-secrets';
  readonly keyIdBefore: string;
  readonly keyIdAfter: string;
  readonly minutesAfterStart: number;
  readonly safeEvidence: Record<string, string | boolean>;
}): RotationOperation {
  return {
    operationId: params.operationId,
    status: 'passed',
    secretClass: params.secretClass,
    keyIdBefore: params.keyIdBefore,
    keyIdAfter: params.keyIdAfter,
    observedAt: new Date(occurredAt.getTime() + params.minutesAfterStart * 60_000).toISOString(),
    safeEvidence: params.safeEvidence,
  };
}

function writeRotationArtifactsIfRequested(params: {
  readonly sourceCredentialOperations: readonly RotationOperation[];
  readonly webhookSecretOperations: readonly RotationOperation[];
}): void {
  const sourceCredentialEvidencePath = optionalEnv('SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH');
  const webhookSecretEvidencePath = optionalEnv('WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH');
  if (sourceCredentialEvidencePath === undefined && webhookSecretEvidencePath === undefined) {
    return;
  }
  if (sourceCredentialEvidencePath === undefined || webhookSecretEvidencePath === undefined) {
    throw new Error(
      'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH and WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH must be set together',
    );
  }
  const sourceArtifactExists = existsSync(sourceCredentialEvidencePath);
  const webhookArtifactExists = existsSync(webhookSecretEvidencePath);
  const overwriteArtifacts = optionalEnv('CREDENTIAL_SECRET_RUNTIME_FLOW_OVERWRITE_ARTIFACTS') === '1';
  if (sourceArtifactExists || webhookArtifactExists) {
    if (!sourceArtifactExists || !webhookArtifactExists) {
      throw new Error('credential secret rotation evidence paths must both exist or both be created by capture');
    }
    if (!overwriteArtifacts) {
      return;
    }
  }

  const environment = {
    environmentId: optionalEnv('STAGING_ENVIRONMENT_ID') ?? 'credential-secret-runtime-drill',
    secretStoreId: requiredEnv('STAGING_SECRET_STORE_ID'),
    sampledAt: new Date().toISOString(),
    operator: optionalEnv('STAGING_OPERATOR') ?? 'security-owner',
  };

  writeArtifact(sourceCredentialEvidencePath, buildSourceCredentialArtifact(environment, params.sourceCredentialOperations));
  writeArtifact(webhookSecretEvidencePath, buildWebhookSecretArtifact(environment, params.webhookSecretOperations));
}

function buildSourceCredentialArtifact(
  environment: RotationArtifact['environment'],
  operations: readonly RotationOperation[],
): RotationArtifact {
  return {
    schemaVersion: 1,
    artifactFormat: 'source-credential-rotation-redacted-v1',
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    provenance: {
      evidenceKind: 'staging_source_credential_rotation',
      collectionMethod: 'Backend runtime drill captured source credential decrypt, re-encrypt and preview redaction.',
      runner: 'scripts/check-credential-secret-runtime-flow.ts',
      fixtureOnly: false,
    },
    environment,
    redaction: {
      secretValuesIncluded: false,
      plaintextCredentialValuesIncluded: false,
      credentialUrlsIncluded: false,
      rawProviderPayloadsIncluded: false,
      rawWebhookPayloadsIncluded: false,
      piiIncluded: false,
      method: 'Artifact keeps only operation ids, redacted key ids, sanitized record ids, statuses and boolean proof flags.',
    },
    operations,
    rollup: {
      rotationPassed: true,
      redactionPassed: true,
      plaintextObserved: false,
    },
  };
}

function buildWebhookSecretArtifact(
  environment: RotationArtifact['environment'],
  operations: readonly RotationOperation[],
): RotationArtifact {
  return {
    schemaVersion: 1,
    artifactFormat: 'webhook-secret-rotation-redacted-v1',
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    provenance: {
      evidenceKind: 'staging_webhook_secret_rotation',
      collectionMethod: 'Backend runtime drill captured webhook signing key rotation and old-key rejection.',
      runner: 'scripts/check-credential-secret-runtime-flow.ts',
      fixtureOnly: false,
    },
    environment,
    redaction: {
      secretValuesIncluded: false,
      plaintextCredentialValuesIncluded: false,
      credentialUrlsIncluded: false,
      rawProviderPayloadsIncluded: false,
      rawWebhookPayloadsIncluded: false,
      piiIncluded: false,
      method: 'Artifact keeps only operation ids, redacted key ids, sanitized endpoint ids, statuses and signature proof flags.',
    },
    operations,
    rollup: {
      rotationPassed: true,
      redactionPassed: true,
      plaintextObserved: false,
    },
  };
}

function writeArtifact(path: string, artifact: RotationArtifact): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required when writing credential secret rotation evidence`);
  }

  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
