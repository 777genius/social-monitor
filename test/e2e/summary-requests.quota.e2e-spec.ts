import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemorySummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary request quota (e2e)', () => {
  let app: INestApplication;
  let summaryJobs: InMemorySummaryJobRepository;
  let previousQuota: string | undefined;

  beforeAll(async () => {
    previousQuota = process.env.SUMMARY_JOB_QUOTA_PER_HOUR;
    process.env.SUMMARY_JOB_QUOTA_PER_HOUR = '1';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    summaryJobs = moduleRef.get(InMemorySummaryJobRepository);
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
    if (previousQuota === undefined) {
      delete process.env.SUMMARY_JOB_QUOTA_PER_HOUR;
    } else {
      process.env.SUMMARY_JOB_QUOTA_PER_HOUR = previousQuota;
    }

    await app.close();
  });

  it('rejects a second new summary request before creating another job', async () => {
    const tenant = tenantId('tenant-summary-quota-e2e');
    const workspace = workspaceId('workspace-summary-quota-e2e');

    await request(app.getHttpServer())
      .post('/interests/topic-summary-quota-1/summary-requests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-quota-request-1')
      .set('idempotency-key', 'summary-quota-request-1')
      .expect(201);

    const exceeded = await request(app.getHttpServer())
      .post('/interests/topic-summary-quota-2/summary-requests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-quota-request-2')
      .set('idempotency-key', 'summary-quota-request-2')
      .expect(429);

    expect(exceeded.body).toMatchObject({
      code: 'operation.quota_exceeded',
      status: 429,
      title: 'Quota exceeded',
      details: {
        operation: 'summary.request',
        amount: 1,
        limit: 1,
        consumed: 1,
        remaining: 0,
        retryAfterSeconds: expect.any(Number),
      },
    });
    await expect(summaryJobs.findByIdempotencyKey({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'summary-quota-request-2',
    })).resolves.toBeNull();
  });
});
