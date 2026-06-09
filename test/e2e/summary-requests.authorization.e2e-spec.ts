import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary request workspace authorization (e2e)', () => {
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

  it('requires a workspace role with summary request permission', async () => {
    const tenant = tenantId('tenant-summary-request-authorization-e2e');
    const workspace = workspaceId('workspace-summary-request-authorization-e2e');
    const topicId = 'topic-summary-request-authorization-e2e';

    const missingRole = await request(app.getHttpServer())
      .post(`/topics/${topicId}/summary-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'summary-request-auth-missing-role')
      .set('idempotency-key', 'summary-request-auth-missing-role')
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'summary_requests.create',
      },
    });

    const viewer = await request(app.getHttpServer())
      .post(`/topics/${topicId}/summary-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-request-id', 'summary-request-auth-viewer')
      .set('idempotency-key', 'summary-request-auth-viewer')
      .expect(403);

    expect(viewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'summary_requests.create',
        requiredRoles: ['owner', 'admin', 'member'],
      },
    });

    const member = await request(app.getHttpServer())
      .post(`/topics/${topicId}/summary-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-request-auth-member')
      .set('idempotency-key', 'summary-request-auth-member')
      .expect(201);

    expect(member.body).toEqual({
      summaryJobId: expect.any(String),
      status: 'requested',
      created: true,
    });
  });
});
