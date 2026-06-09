import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary job status timeline (e2e)', () => {
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

  it('returns requested and completed timeline states for a summary job', async () => {
    const tenant = tenantId('tenant-summary-status-e2e');
    const workspace = workspaceId('workspace-summary-status-e2e');
    const requested = await request(app.getHttpServer())
      .post('/topics/topic-summary-status-e2e/summary-requests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-status-request-1')
      .set('idempotency-key', 'summary-status-request-1')
      .expect(201);

    const beforeExecution = await request(app.getHttpServer())
      .get(`/summary-jobs/${requested.body.summaryJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(200);

    expect(beforeExecution.body).toMatchObject({
      summaryJobId: requested.body.summaryJobId,
      topicId: 'topic-summary-status-e2e',
      status: 'requested',
      timeline: [
        {
          status: 'requested',
          message: 'Summary requested',
        },
      ],
    });

    const executed = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId,
    });

    if (!executed.ok || executed.value.summaryId === undefined) {
      throw new Error('Expected summary execution to produce a summary id');
    }

    const afterExecution = await request(app.getHttpServer())
      .get(`/summary-jobs/${requested.body.summaryJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(200);

    expect(afterExecution.body).toMatchObject({
      summaryJobId: requested.body.summaryJobId,
      topicId: 'topic-summary-status-e2e',
      status: 'no_signal',
      summaryId: executed.value.summaryId,
      timeline: [
        {
          status: 'requested',
          message: 'Summary requested',
        },
        {
          status: 'running',
          message: 'Summary generation started',
        },
        {
          status: 'no_signal',
          message: 'Summary completed with no reliable signal',
        },
      ],
    });
  });
});
