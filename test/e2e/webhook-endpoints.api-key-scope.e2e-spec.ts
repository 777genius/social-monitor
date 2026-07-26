import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Webhook endpoint API key scope enforcement (e2e)', () => {
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

  it('requires a matching active API key with write:webhook_endpoints scope', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-webhook-scope-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-webhook-scope-e2e'));
    const webhookBody = {
      url: 'https://example.com/webhooks/scope',
      eventTypes: ['digest.ready.v1'],
    };

    await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .send(webhookBody)
      .expect(403);

    const readonlyKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Readonly key',
        scopes: ['read:summaries'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${readonlyKey.body.secret}`)
      .send(webhookBody)
      .expect(403);

    const writerKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Webhook writer key',
        scopes: ['write:webhook_endpoints'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspaceId(deterministicTestUuid('different-workspace')))
      .set('Authorization', `Bearer ${writerKey.body.secret}`)
      .send(webhookBody)
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${writerKey.body.secret}`)
      .send(webhookBody)
      .expect(201);

    expect(created.body.endpoint).toMatchObject({
      tenantId: tenant,
      workspaceId: workspace,
      status: 'enabled',
    });

    await request(app.getHttpServer())
      .delete(`/identity/api-keys/${writerKey.body.apiKey.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .expect(200);

    await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${writerKey.body.secret}`)
      .send(webhookBody)
      .expect(403);
  });
});
