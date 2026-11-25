import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QuarantineWebhookEndpointUseCase } from '@social-monitor/delivery/features/quarantine-webhook-endpoint/quarantine-webhook-endpoint.use-case';
import { SignWebhookPayloadUseCase } from '@social-monitor/delivery/features/sign-webhook-payload/sign-webhook-payload.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Webhook endpoint quarantine (e2e)', () => {
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

  it('quarantines failing endpoint and blocks new outbound signing', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-webhook-quarantine-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-webhook-quarantine-e2e'));
    const apiKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Webhook endpoint writer',
        scopes: ['write:webhook_endpoints'],
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
    const endpointId = created.body.endpoint.id as string;
    const quarantined = await app.get(QuarantineWebhookEndpointUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: endpointId,
      reason: 'Repeated terminal webhook failures',
    });

    if (!quarantined.ok) {
      throw quarantined.error;
    }

    expect(quarantined.value).toMatchObject({
      id: endpointId,
      status: 'quarantined',
      quarantineReason: 'Repeated terminal webhook failures',
      quarantinedAt: expect.any(String),
    });

    const signed = await app.get(SignWebhookPayloadUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: endpointId,
      deliveryId: 'delivery-quarantine-e2e-1',
      eventType: 'digest.ready.v1',
      occurredAt: new Date('2026-06-06T01:00:00.000Z'),
      resourceType: 'digest',
      resourceId: 'digest-quarantine-e2e-1',
      idempotencyKey: 'digest:tenant-webhook-quarantine-e2e:workspace-webhook-quarantine-e2e:user-1:window-1:hash-1',
      correlationId: 'correlation-quarantine-e2e-1',
      resourceLinks: {
        digest: '/delivery/digests/digest-quarantine-e2e-1',
      },
      summary: {
        status: 'ready',
      },
    });

    expect(signed).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.conflict',
      }),
    });
  });
});
