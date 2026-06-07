import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Request scan flow (e2e)', () => {
  let app: INestApplication;
  let queue: InMemoryQueuePublisher;

  beforeAll(async () => {
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
    await app.close();
  });

  it('requests scan after topic, source binding and scan policy setup', async () => {
    const tenant = tenantId('tenant-scan-e2e');
    const workspace = workspaceId('workspace-scan-e2e');

    const topic = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'request-scan-topic')
      .set('idempotency-key', 'create-scan-topic')
      .send({
        name: 'Scan Monitoring',
        query: 'scan monitoring',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'request-scan-bind')
      .set('idempotency-key', 'bind-scan-source')
      .send({
        providerKey: 'fake-source',
        config: { query: 'scan monitoring' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'request-scan-policy')
      .set('idempotency-key', 'set-scan-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'request-scan-now')
      .set('idempotency-key', 'request-scan-now')
      .expect(201);

    expect(first.body).toEqual({
      scanJobId: expect.any(String),
      status: 'enqueued',
      created: true,
    });
    expect(queue.all()).toHaveLength(1);
    expect(queue.all()[0]).toMatchObject({
      commandType: 'ingestion.scan.execute',
      payload: {
        scanJobId: first.body.scanJobId,
        sourceBindingId: binding.body.sourceBindingId,
      },
    });

    const second = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'request-scan-now')
      .set('idempotency-key', 'request-scan-now')
      .expect(201);

    expect(second.body).toEqual({
      scanJobId: first.body.scanJobId,
      status: 'enqueued',
      created: false,
    });
    expect(queue.all()).toHaveLength(1);

    const overlapping = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'request-scan-overlap')
      .set('idempotency-key', 'request-scan-overlap')
      .expect(201);

    expect(overlapping.body).toEqual({
      scanJobId: first.body.scanJobId,
      status: 'enqueued',
      created: false,
    });
    expect(queue.all()).toHaveLength(1);

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
    });

    expect(auditRecords.filter((record) => record.action === 'scan_request.created')).toEqual([
      expect.objectContaining({
        actorType: 'system',
        actorId: 'monitoring.scan-requests',
        action: 'scan_request.created',
        outcome: 'succeeded',
        resourceType: 'scan_job',
        resourceId: first.body.scanJobId,
        metadata: {
          sourceBindingId: binding.body.sourceBindingId,
          status: 'enqueued',
          created: true,
        },
      }),
    ]);
  });
});
