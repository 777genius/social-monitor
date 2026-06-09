import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Manual scan request quota (e2e)', () => {
  let app: INestApplication;
  let queue: InMemoryQueuePublisher;
  let previousQuota: string | undefined;

  beforeAll(async () => {
    previousQuota = process.env.MANUAL_SCAN_REQUEST_QUOTA_PER_HOUR;
    process.env.MANUAL_SCAN_REQUEST_QUOTA_PER_HOUR = '1';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    queue = moduleRef.get(InMemoryQueuePublisher);
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
      delete process.env.MANUAL_SCAN_REQUEST_QUOTA_PER_HOUR;
    } else {
      process.env.MANUAL_SCAN_REQUEST_QUOTA_PER_HOUR = previousQuota;
    }

    await app.close();
  });

  it('rejects a second new manual scan before enqueueing more work', async () => {
    const tenant = tenantId('tenant-scan-quota-e2e');
    const workspace = workspaceId('workspace-scan-quota-e2e');
    const firstBindingId = await createReadyBinding({
      app,
      tenant,
      workspace,
      topicIdempotencyKey: 'quota-topic-1',
      bindingIdempotencyKey: 'quota-binding-1',
      policyIdempotencyKey: 'quota-policy-1',
    });
    const secondBindingId = await createReadyBinding({
      app,
      tenant,
      workspace,
      topicIdempotencyKey: 'quota-topic-2',
      bindingIdempotencyKey: 'quota-binding-2',
      policyIdempotencyKey: 'quota-policy-2',
    });

    await request(app.getHttpServer())
      .post(`/source-bindings/${firstBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'request-quota-scan-1')
      .set('idempotency-key', 'quota-scan-1')
      .expect(201);

    expect(queue.all()).toHaveLength(1);

    const exceeded = await request(app.getHttpServer())
      .post(`/source-bindings/${secondBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'request-quota-scan-2')
      .set('idempotency-key', 'quota-scan-2')
      .expect(429);

    expect(exceeded.body).toMatchObject({
      code: 'operation.quota_exceeded',
      status: 429,
      title: 'Quota exceeded',
      details: {
        operation: 'scan_request.manual',
        amount: 1,
        limit: 1,
        consumed: 1,
        remaining: 0,
        retryAfterSeconds: expect.any(Number),
      },
    });
    expect(queue.all()).toHaveLength(1);
  });
});

const createReadyBinding = async (params: {
  readonly app: INestApplication;
  readonly tenant: string;
  readonly workspace: string;
  readonly topicIdempotencyKey: string;
  readonly bindingIdempotencyKey: string;
  readonly policyIdempotencyKey: string;
}): Promise<string> => {
  const topic = await request(params.app.getHttpServer())
    .post('/topics')
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'admin')
    .set('x-request-id', `${params.topicIdempotencyKey}-request`)
    .set('idempotency-key', params.topicIdempotencyKey)
    .send({
      name: `Quota ${params.topicIdempotencyKey}`,
      query: `quota ${params.topicIdempotencyKey}`,
    })
    .expect(201);

  const binding = await request(params.app.getHttpServer())
    .post(`/topics/${topic.body.topicId}/source-bindings`)
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'admin')
    .set('x-request-id', `${params.bindingIdempotencyKey}-request`)
    .set('idempotency-key', params.bindingIdempotencyKey)
    .send({
      providerKey: 'fake-source',
      config: { query: `quota ${params.bindingIdempotencyKey}` },
    })
    .expect(201);

  await request(params.app.getHttpServer())
    .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'admin')
    .set('x-request-id', `${params.policyIdempotencyKey}-request`)
    .set('idempotency-key', params.policyIdempotencyKey)
    .send({
      intervalSeconds: 300,
      freshnessSeconds: 900,
      retryBudget: 3,
    })
    .expect(201);

  return binding.body.sourceBindingId as string;
};
