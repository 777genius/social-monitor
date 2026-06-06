import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignWebhookPayloadUseCase } from '@social-monitor/delivery/features/sign-webhook-payload/sign-webhook-payload.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Webhook endpoint management (e2e)', () => {
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

  it('lists endpoints and soft-disables one without exposing raw secrets', async () => {
    const tenant = tenantId('tenant-webhook-management-e2e');
    const workspace = workspaceId('workspace-webhook-management-e2e');
    const apiKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .send({
        name: 'Webhook endpoint manager',
        scopes: ['write:webhook_endpoints'],
      })
      .expect(201);
    const authorization = `Bearer ${apiKey.body.secret}`;
    const first = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', authorization)
      .send({
        url: 'https://example.com/webhooks/first',
        eventTypes: ['digest.ready.v1'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', authorization)
      .send({
        url: 'https://example.com/webhooks/second',
        eventTypes: ['digest.ready.v1'],
      })
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get('/delivery/webhook-endpoints')
      .query({ limit: 1 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', authorization)
      .expect(200);

    expect(listed.body).toMatchObject({
      endpoints: [expect.objectContaining({
        tenantId: tenant,
        workspaceId: workspace,
        secretPreview: expect.any(String),
      })],
      nextCursor: expect.any(String),
    });
    expect(listed.body.endpoints[0].signingSecret).toBeUndefined();

    const disabled = await request(app.getHttpServer())
      .delete(`/delivery/webhook-endpoints/${first.body.endpoint.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', authorization)
      .expect(200);

    expect(disabled.body).toMatchObject({
      id: first.body.endpoint.id,
      status: 'disabled',
      disabledAt: expect.any(String),
    });

    const signed = await app.get(SignWebhookPayloadUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: first.body.endpoint.id,
      deliveryId: 'delivery-management-e2e-1',
      eventType: 'digest.ready.v1',
      occurredAt: new Date('2026-06-06T01:00:00.000Z'),
      resourceType: 'digest',
      resourceId: 'digest-management-e2e-1',
      idempotencyKey: 'digest:tenant-webhook-management-e2e:workspace-webhook-management-e2e:user-1:window-1:hash-1',
      correlationId: 'correlation-management-e2e-1',
      resourceLinks: {
        digest: '/delivery/digests/digest-management-e2e-1',
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
