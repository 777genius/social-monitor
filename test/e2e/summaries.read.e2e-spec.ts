import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary read model (e2e)', () => {
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

  it('returns executed summaries through REST detail and list endpoints', async () => {
    const tenant = tenantId('tenant-summary-read-e2e');
    const workspace = workspaceId('workspace-summary-read-e2e');
    const topicId = 'topic-summary-read-e2e';
    const requested = await request(app.getHttpServer())
      .post(`/topics/${topicId}/summary-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'summary-read-request-1')
      .set('idempotency-key', 'summary-read-request-1')
      .expect(201);
    const executed = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId,
    });

    if (!executed.ok || executed.value.summaryId === undefined) {
      throw new Error('Expected summary execution to produce a summary id');
    }

    const detail = await request(app.getHttpServer())
      .get(`/summaries/${executed.value.summaryId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(200);

    expect(detail.body).toMatchObject({
      schemaVersion: 'summary.artifact.v1',
      summaryId: executed.value.summaryId,
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
      qualityFlags: ['no_signal', 'limited_sources'],
      noSignalReason: 'No eligible evidence items selected for this topic.',
    });
    expect(detail.body.sourceWindow.startedAt).toEqual(expect.any(String));
    expect(detail.body.sourceWindow.endedAt).toEqual(expect.any(String));

    const list = await request(app.getHttpServer())
      .get(`/summaries?topicId=${topicId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(200);

    expect(list.body).toEqual({
      items: [detail.body],
    });
  });
});
