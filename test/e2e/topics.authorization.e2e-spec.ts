import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Topic workspace authorization (e2e)', () => {
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

  it('requires an owner or admin workspace role to create topics', async () => {
    const tenant = tenantId('tenant-topic-authorization-e2e');
    const workspace = workspaceId('workspace-topic-authorization-e2e');

    const missingRole = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'topic-auth-missing-role')
      .set('idempotency-key', 'topic-auth-missing-role')
      .send({
        name: 'Missing role topic',
        query: 'missing role topic',
      })
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'topics.create',
      },
    });

    const viewer = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-request-id', 'topic-auth-viewer')
      .set('idempotency-key', 'topic-auth-viewer')
      .send({
        name: 'Viewer topic',
        query: 'viewer topic',
      })
      .expect(403);

    expect(viewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'topics.create',
        requiredRoles: ['owner', 'admin'],
      },
    });

    const owner = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'owner')
      .set('x-request-id', 'topic-auth-owner')
      .set('idempotency-key', 'topic-auth-owner')
      .send({
        name: 'Owner topic',
        query: 'owner topic',
      })
      .expect(201);

    expect(owner.body).toEqual({
      topicId: expect.any(String),
      created: true,
    });
  });
});
