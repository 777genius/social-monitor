import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Webhook endpoint workspace authorization (e2e)', () => {
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

  it('requires owner or admin workspace role to create and disable webhook endpoints', async () => {
    const tenant = tenantId('tenant-webhook-authorization-e2e');
    const workspace = workspaceId('workspace-webhook-authorization-e2e');
    const apiKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Webhook authorization writer',
        scopes: ['write:webhook_endpoints'],
      })
      .expect(201);
    const authorization = `Bearer ${apiKey.body.secret}`;
    const webhookBody = {
      url: 'https://example.com/webhooks/authorization',
      eventTypes: ['digest.ready.v1'],
    };

    const missingRole = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', authorization)
      .send(webhookBody)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'webhook_endpoints.create',
      },
    });

    const viewer = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('Authorization', authorization)
      .send(webhookBody)
      .expect(403);

    expect(viewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'webhook_endpoints.create',
        requiredRoles: ['owner', 'admin'],
      },
    });

    const created = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('Authorization', authorization)
      .send(webhookBody)
      .expect(201);

    const disableViewer = await request(app.getHttpServer())
      .delete(`/delivery/webhook-endpoints/${created.body.endpoint.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('Authorization', authorization)
      .expect(403);

    expect(disableViewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'webhook_endpoints.disable',
        requiredRoles: ['owner', 'admin'],
      },
    });

    const disabled = await request(app.getHttpServer())
      .delete(`/delivery/webhook-endpoints/${created.body.endpoint.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'owner')
      .set('Authorization', authorization)
      .expect(200);

    expect(disabled.body).toMatchObject({
      id: created.body.endpoint.id,
      status: 'disabled',
    });
  });
});
