import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Interest workspace authorization (e2e)', () => {
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

  it('requires an owner or admin workspace role to create interests', async () => {
    const tenant = tenantId('tenant-interest-authorization-e2e');
    const workspace = workspaceId('workspace-interest-authorization-e2e');

    const missingRole = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'interest-auth-missing-role')
      .set('idempotency-key', 'interest-auth-missing-role')
      .send({
        name: 'Missing role interest',
        query: 'missing role interest',
      })
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'interests.create',
      },
    });

    const viewer = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-request-id', 'interest-auth-viewer')
      .set('idempotency-key', 'interest-auth-viewer')
      .send({
        name: 'Viewer interest',
        query: 'viewer interest',
      })
      .expect(403);

    expect(viewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'interests.create',
        requiredRoles: ['owner', 'admin'],
      },
    });

    const owner = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'owner')
      .set('x-request-id', 'interest-auth-owner')
      .set('idempotency-key', 'interest-auth-owner')
      .send({
        name: 'Owner interest',
        query: 'owner interest',
      })
      .expect(201);

    expect(owner.body).toEqual({
      interestId: expect.any(String),
      created: true,
    });
  });
});
