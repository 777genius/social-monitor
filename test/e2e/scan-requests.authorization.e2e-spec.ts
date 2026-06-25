import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Manual scan request workspace authorization (e2e)', () => {
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

  it('requires a workspace role with manual scan permission', async () => {
    const tenant = tenantId('tenant-scan-request-authorization-e2e');
    const workspace = workspaceId('workspace-scan-request-authorization-e2e');
    const bindingId = await createReadyBinding({ app, tenant, workspace });

    const missingRole = await request(app.getHttpServer())
      .post(`/source-bindings/${bindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'scan-request-auth-missing-role')
      .set('idempotency-key', 'scan-request-auth-missing-role')
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'scan_requests.create',
      },
    });

    const viewer = await request(app.getHttpServer())
      .post(`/source-bindings/${bindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-request-id', 'scan-request-auth-viewer')
      .set('idempotency-key', 'scan-request-auth-viewer')
      .expect(403);

    expect(viewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'scan_requests.create',
        requiredRoles: ['owner', 'admin', 'member'],
      },
    });

    const member = await request(app.getHttpServer())
      .post(`/source-bindings/${bindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'scan-request-auth-member')
      .set('idempotency-key', 'scan-request-auth-member')
      .expect(201);

    expect(member.body).toEqual({
      scanJobId: expect.any(String),
      status: 'enqueued',
      created: true,
    });
  });

  it('allows viewer role to list scan request history', async () => {
    const tenant = tenantId('tenant-scan-request-list-authorization-e2e');
    const workspace = workspaceId('workspace-scan-request-list-authorization-e2e');
    const bindingId = await createReadyBinding({ app, tenant, workspace });

    const missingRole = await request(app.getHttpServer())
      .get(`/source-bindings/${bindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'scan_jobs.read',
      },
    });

    const viewer = await request(app.getHttpServer())
      .get(`/source-bindings/${bindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(viewer.body).toEqual({
      scanRequests: [],
    });
  });

  it('allows viewer role to read daily scan history', async () => {
    const tenant = tenantId('tenant-scan-request-daily-authorization-e2e');
    const workspace = workspaceId('workspace-scan-request-daily-authorization-e2e');
    const bindingId = await createReadyBinding({ app, tenant, workspace });

    const missingRole = await request(app.getHttpServer())
      .get(`/source-bindings/${bindingId}/scan-requests/daily`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'scan_jobs.read',
      },
    });

    const viewer = await request(app.getHttpServer())
      .get(`/source-bindings/${bindingId}/scan-requests/daily?days=2`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(viewer.body).toEqual({
      sourceBindingId: bindingId,
      windowStartedAt: expect.any(String),
      windowEndedAt: expect.any(String),
      truncated: false,
      maxScanJobs: 200,
      days: [
        expect.objectContaining({
          totalScans: 0,
          providerHealthState: 'unknown',
        }),
        expect.objectContaining({
          totalScans: 0,
          providerHealthState: 'unknown',
        }),
      ],
    });
  });
});

const createReadyBinding = async (params: {
  readonly app: INestApplication;
  readonly tenant: string;
  readonly workspace: string;
}): Promise<string> => {
  const topic = await request(params.app.getHttpServer())
    .post('/topics')
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'owner')
    .set('x-request-id', 'scan-request-auth-topic')
    .set('idempotency-key', 'scan-request-auth-topic')
    .send({
      name: 'Scan request auth topic',
      query: 'scan request auth topic',
    })
    .expect(201);

  const binding = await request(params.app.getHttpServer())
    .post(`/topics/${topic.body.topicId}/source-bindings`)
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'owner')
    .set('x-request-id', 'scan-request-auth-binding')
    .set('idempotency-key', 'scan-request-auth-binding')
    .send({
      providerKey: 'fake-source',
      config: { query: 'scan request auth binding' },
    })
    .expect(201);

  await request(params.app.getHttpServer())
    .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'owner')
    .set('x-request-id', 'scan-request-auth-policy')
    .set('idempotency-key', 'scan-request-auth-policy')
    .send({
      intervalSeconds: 300,
      freshnessSeconds: 900,
      retryBudget: 3,
    })
    .expect(201);

  return binding.body.sourceBindingId as string;
};
