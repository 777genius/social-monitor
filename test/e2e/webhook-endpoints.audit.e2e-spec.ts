import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Webhook endpoint public API audit (e2e)', () => {
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

  it('records safe audit events for webhook endpoint management actions', async () => {
    const tenant = tenantId('tenant-webhook-audit-e2e');
    const workspace = workspaceId('workspace-webhook-audit-e2e');
    const apiKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Webhook endpoint auditor',
        scopes: ['read:webhook_endpoints', 'write:webhook_endpoints'],
      })
      .expect(201);
    const authorization = `Bearer ${apiKey.body.secret}`;
    const created = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('Authorization', authorization)
      .send({
        url: 'https://example.com/webhooks/audit',
        eventTypes: ['digest.ready.v1'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('Authorization', authorization)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/delivery/webhook-endpoints/${created.body.endpoint.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('Authorization', authorization)
      .expect(200);

    const records = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
    });

    expect(records.map((record) => record.action).sort()).toEqual([
      'webhook_endpoint.created',
      'webhook_endpoint.disabled',
      'webhook_endpoint.listed',
    ]);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorType: 'api_key',
        actorId: apiKey.body.apiKey.id,
        outcome: 'succeeded',
        resourceId: created.body.endpoint.id,
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          resultCount: 1,
        }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          endpointStatus: 'enabled',
          eventTypes: ['digest.ready.v1'],
        }),
      }),
    ]));
    expect(JSON.stringify(records)).not.toContain(apiKey.body.secret);
    expect(JSON.stringify(records)).not.toContain(created.body.signingSecret);
  });
});
