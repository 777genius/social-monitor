import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Webhook endpoint read authorization (e2e)', () => {
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

  it('requires read scope and any workspace role to list and get webhook endpoints', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-webhook-read-authorization-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-webhook-read-authorization-e2e'));
    const writerKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Webhook read authorization writer',
        scopes: ['write:webhook_endpoints'],
      })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('Authorization', `Bearer ${writerKey.body.secret}`)
      .send({
        url: 'https://example.com/webhooks/read-authorization',
        eventTypes: ['digest.ready.v1'],
      })
      .expect(201);
    const readerKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Webhook read authorization reader',
        scopes: ['read:webhook_endpoints'],
      })
      .expect(201);
    const readerAuthorization = `Bearer ${readerKey.body.secret}`;

    const missingRole = await request(app.getHttpServer())
      .get('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'webhook_endpoints.read',
      },
    });

    const writeOnlyRead = await request(app.getHttpServer())
      .get('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('Authorization', `Bearer ${writerKey.body.secret}`)
      .expect(403);

    expect(writeOnlyRead.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'API key scope is not allowed',
      details: {
        requiredScope: 'read:webhook_endpoints',
      },
    });

    const listed = await request(app.getHttpServer())
      .get('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('Authorization', readerAuthorization)
      .expect(200);

    expect(listed.body.endpoints).toEqual([
      expect.objectContaining({
        id: created.body.endpoint.id,
        tenantId: tenant,
        workspaceId: workspace,
      }),
    ]);

    const read = await request(app.getHttpServer())
      .get(`/delivery/webhook-endpoints/${created.body.endpoint.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('Authorization', readerAuthorization)
      .expect(200);

    expect(read.body).toMatchObject({
      id: created.body.endpoint.id,
      tenantId: tenant,
      workspaceId: workspace,
      status: 'enabled',
    });
  });
});
