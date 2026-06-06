import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignWebhookPayloadUseCase } from '@social-monitor/delivery/features/sign-webhook-payload/sign-webhook-payload.use-case';
import { VerifyWebhookSignatureUseCase } from '@social-monitor/delivery/features/verify-webhook-signature/verify-webhook-signature.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Webhook signature replay protection (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a fresh signed webhook once and rejects duplicate delivery id replay', async () => {
    const tenant = tenantId('tenant-webhook-replay-e2e');
    const workspace = workspaceId('workspace-webhook-replay-e2e');
    const apiKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .send({
        name: 'Webhook endpoint writer',
        scopes: ['write:webhook_endpoints'],
      })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${apiKey.body.secret}`)
      .send({
        url: 'https://example.com/webhooks/social-monitor',
        eventTypes: ['digest.ready.v1'],
      })
      .expect(201);
    const endpointId = created.body.endpoint.id as string;
    const signed = await app.get(SignWebhookPayloadUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: endpointId,
      deliveryId: 'delivery-replay-e2e-1',
      eventType: 'digest.ready.v1',
      occurredAt: new Date(),
      resourceType: 'digest',
      resourceId: 'digest-replay-e2e-1',
      idempotencyKey: 'digest:tenant-webhook-replay-e2e:workspace-webhook-replay-e2e:user-1:window-1:hash-1',
      correlationId: 'correlation-replay-e2e-1',
      resourceLinks: {
        digest: '/delivery/digests/digest-replay-e2e-1',
      },
      summary: {
        status: 'ready',
      },
    });

    if (!signed.ok) {
      throw signed.error;
    }

    const command = {
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: endpointId,
      deliveryId: signed.value.headers['x-social-monitor-delivery-id'],
      timestamp: signed.value.headers['x-social-monitor-timestamp'],
      rawBody: signed.value.rawBody,
      signatureHeader: signed.value.headers['x-social-monitor-signature'],
      keyId: signed.value.headers['x-social-monitor-key-id'],
      toleranceSeconds: 300,
    };

    await expect(app.get(VerifyWebhookSignatureUseCase).execute(command)).resolves.toEqual({
      ok: true,
      value: {
        verified: true,
      },
    });
    await expect(app.get(VerifyWebhookSignatureUseCase).execute(command)).resolves.toEqual({
      ok: true,
      value: {
        verified: false,
        reason: 'replay_detected',
      },
    });
  });
});
