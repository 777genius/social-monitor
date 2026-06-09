import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary regeneration flow (e2e)', () => {
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

  it('creates regeneration jobs idempotently from an existing summary', async () => {
    const tenant = tenantId('tenant-summary-regenerate-e2e');
    const workspace = workspaceId('workspace-summary-regenerate-e2e');
    const requested = await request(app.getHttpServer())
      .post('/topics/topic-summary-regenerate-e2e/summary-requests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-regenerate-request-1')
      .set('idempotency-key', 'summary-regenerate-request-1')
      .expect(201);
    const executed = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId,
    });

    if (!executed.ok || executed.value.summaryId === undefined) {
      throw new Error('Expected summary execution to produce a summary id');
    }

    const first = await request(app.getHttpServer())
      .post(`/summaries/${executed.value.summaryId}/regenerations`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-regenerate-request-2')
      .set('idempotency-key', 'summary-regenerate-request-2')
      .expect(201);

    expect(first.body).toEqual({
      summaryJobId: expect.any(String),
      status: 'requested',
      created: true,
    });

    const second = await request(app.getHttpServer())
      .post(`/summaries/${executed.value.summaryId}/regenerations`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-regenerate-request-2')
      .set('idempotency-key', 'summary-regenerate-request-2')
      .expect(201);

    expect(second.body).toEqual({
      summaryJobId: first.body.summaryJobId,
      status: 'requested',
      created: false,
    });
  });
});
