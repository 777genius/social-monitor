import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary regeneration workspace authorization (e2e)', () => {
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

  it('requires a workspace role with summary regeneration permission', async () => {
    const tenant = tenantId('tenant-summary-regeneration-authorization-e2e');
    const workspace = workspaceId('workspace-summary-regeneration-authorization-e2e');
    const summaryId = await createSummaryArtifact({ app, tenant, workspace });

    const missingRole = await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/regenerations`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'summary-regeneration-auth-missing-role')
      .set('idempotency-key', 'summary-regeneration-auth-missing-role')
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'summary_regenerations.create',
      },
    });

    const viewer = await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/regenerations`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-request-id', 'summary-regeneration-auth-viewer')
      .set('idempotency-key', 'summary-regeneration-auth-viewer')
      .expect(403);

    expect(viewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'summary_regenerations.create',
        requiredRoles: ['owner', 'admin', 'member'],
      },
    });

    const member = await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/regenerations`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-regeneration-auth-member')
      .set('idempotency-key', 'summary-regeneration-auth-member')
      .expect(201);

    expect(member.body).toEqual({
      summaryJobId: expect.any(String),
      status: 'requested',
      created: true,
    });
  });
});

const createSummaryArtifact = async (params: {
  readonly app: INestApplication;
  readonly tenant: string;
  readonly workspace: string;
}): Promise<string> => {
  const requested = await request(params.app.getHttpServer())
    .post('/topics/topic-summary-regeneration-authorization-e2e/summary-requests')
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'member')
    .set('x-request-id', 'summary-regeneration-auth-request')
    .set('idempotency-key', 'summary-regeneration-auth-request')
    .expect(201);
  const executed = await params.app.get(ExecuteSummaryJobUseCase).execute({
    tenantId: params.tenant,
    workspaceId: params.workspace,
    summaryJobId: requested.body.summaryJobId as string,
  });

  if (!executed.ok || executed.value.summaryId === undefined) {
    throw new Error('Expected summary execution to produce a summary id');
  }

  return executed.value.summaryId;
};
