import { createHmac } from 'node:crypto';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignWebhookPayloadUseCase } from '@social-monitor/delivery/features/sign-webhook-payload/sign-webhook-payload.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Webhook endpoint signing (e2e)', () => {
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

  it('creates endpoint with show-once secret, hides it on read and signs outbound payload', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-webhook-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-webhook-e2e'));
    const apiKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Webhook endpoint writer',
        scopes: ['read:webhook_endpoints', 'write:webhook_endpoints'],
      })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('Authorization', `Bearer ${apiKey.body.secret}`)
      .send({
        url: 'https://example.com/webhooks/social-monitor',
        eventTypes: ['digest.ready.v1'],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      endpoint: {
        tenantId: tenant,
        workspaceId: workspace,
        url: 'https://example.com/webhooks/social-monitor',
        eventTypes: ['digest.ready.v1'],
        status: 'enabled',
        secretKeyId: expect.any(String),
        secretPreview: expect.any(String),
        createdAt: expect.any(String),
      },
      signingSecret: expect.stringMatching(/^whsec_/),
    });

    const endpointId = created.body.endpoint.id as string;
    const signingSecret = created.body.signingSecret as string;
    const read = await request(app.getHttpServer())
      .get(`/delivery/webhook-endpoints/${endpointId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('Authorization', `Bearer ${apiKey.body.secret}`)
      .expect(200);

    expect(read.body).toEqual(created.body.endpoint);
    expect(read.body.signingSecret).toBeUndefined();

    const signed = await app.get(SignWebhookPayloadUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: endpointId,
      deliveryId: 'delivery-e2e-1',
      eventType: 'digest.ready.v1',
      occurredAt: new Date('2026-06-06T01:00:00.000Z'),
      resourceType: 'digest',
      resourceId: 'digest-e2e-1',
      idempotencyKey: 'digest:tenant-webhook-e2e:workspace-webhook-e2e:user-1:window-1:hash-1',
      correlationId: 'correlation-e2e-1',
      resourceLinks: {
        digest: `/delivery/digests/digest-e2e-1`,
      },
      summary: {
        status: 'ready',
      },
    });

    if (!signed.ok) {
      throw signed.error;
    }

    const expectedSignature = createHmac('sha256', signingSecret)
      .update(`2026-06-06T01:00:00.000Z.delivery-e2e-1.${signed.value.rawBody}`)
      .digest('hex');

    expect(signed.value.headers).toEqual({
      'x-social-monitor-signature': `v1=${expectedSignature}`,
      'x-social-monitor-timestamp': '2026-06-06T01:00:00.000Z',
      'x-social-monitor-delivery-id': 'delivery-e2e-1',
      'x-social-monitor-key-id': created.body.endpoint.secretKeyId,
    });
    expect(signed.value.payload).toMatchObject({
      payloadVersion: 1,
      deliveryId: 'delivery-e2e-1',
      eventType: 'digest.ready.v1',
      tenantId: tenant,
      workspaceId: workspace,
      resourceType: 'digest',
      resourceId: 'digest-e2e-1',
    });
  });
});
