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

async function main(): Promise<void> {
  await proveSourceCredentialRotationAndRedaction();
  await proveWebhookSecretRotationAndRedaction();
  provePublicDiagnosticRedaction();

  console.log('Credential secret runtime flow smoke OK');
}

async function proveSourceCredentialRotationAndRedaction(): Promise<void> {
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
    topicId: 'topic-credential-rotation-smoke',
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
  assert(previewSerialized.includes('source-key-new'), 'source binding preview must expose only rotated key id metadata');

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
}

async function proveWebhookSecretRotationAndRedaction(): Promise<void> {
  const endpoints = new InMemoryWebhookEndpointRepository();
  const secrets = new InMemoryWebhookSecretVault();
  const eventCatalog = new ContractWebhookEventCatalogAdapter();
  const signer = new SignWebhookPayloadUseCase(endpoints, secrets, eventCatalog);
  const verifier = new VerifyWebhookSignatureUseCase(endpoints, secrets, new InMemoryWebhookReplayStore(), clock);
  const endpointId = 'webhook-endpoint-secret-rotation-smoke';

  await secrets.put({ secretKeyId: 'whsec_generated_old_key', secret: 'whsec_generated_old_secret' });
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

  await secrets.put({ secretKeyId: 'whsec_generated_new_key', secret: 'whsec_generated_new_secret' });
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
