import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import {
  SUMMARY_JOB_QUEUE,
} from '@social-monitor/summary/interfaces/rest/summary-provider-tokens';
import type { SummaryJobQueuePort } from '@social-monitor/summary/ports';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';
import { InMemorySummaryJobQueueAdapter } from '../libs/summary/adapters/messaging/in-memory-summary-job-queue.adapter';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [SummaryRestModule],
    providers: [
      {
        provide: APP_FILTER,
        useClass: DomainErrorFilter,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  try {
    const response = await request(app.getHttpServer())
      .post('/interests/topic-summary-request-queue-smoke/summary-requests')
      .set('x-tenant-id', 'tenant-summary-request-queue-smoke')
      .set('x-workspace-id', 'workspace-summary-request-queue-smoke')
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'correlation-summary-request-queue-smoke')
      .set('idempotency-key', 'summary-request-queue-smoke')
      .expect(201);

    assert(response.body.status === 'requested', `expected requested summary job, got ${response.body.status}`);
    const queue = app.get<SummaryJobQueuePort>(SUMMARY_JOB_QUEUE);
    assert(queue instanceof InMemorySummaryJobQueueAdapter, 'summary smoke expects in-memory summary job queue');
    const queued = queue.all();
    assert(queued.length === 1, `expected one summary job command, got ${queued.length}`);
    assert(queued[0]?.commandType === 'summary.job.execute', 'summary request must enqueue execute command');
    assert(
      queued[0]?.payload.summaryJobId === response.body.summaryJobId,
      'queued summary job id must match response job id',
    );

    await request(app.getHttpServer())
      .post('/interests/topic-summary-request-queue-smoke/summary-requests')
      .set('x-tenant-id', 'tenant-summary-request-queue-smoke')
      .set('x-workspace-id', 'workspace-summary-request-queue-smoke')
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'correlation-summary-request-queue-smoke')
      .set('idempotency-key', 'summary-request-queue-smoke')
      .expect(201);
    assert(queue.all().length === 1, 'idempotent summary request must not enqueue duplicate commands');

    await request(app.getHttpServer())
      .post('/interests/topic-summary-request-queue-smoke/summary-requests')
      .set('x-tenant-id', 'tenant-summary-request-queue-smoke')
      .set('x-workspace-id', 'workspace-summary-request-queue-smoke')
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'correlation-summary-request-missing-idempotency')
      .expect(400);

    console.log('Summary request queue smoke OK');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
