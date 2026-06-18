import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { MonitoringRestModule } from '../../libs/monitoring/interfaces/rest/monitoring-rest.module';

describe('Source binding status API (e2e)', () => {
  let app: INestApplication;
  let queue: InMemoryQueuePublisher;
  let auditLog: InMemoryPublicApiAuditLog;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    queue = moduleRef.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });
    auditLog = moduleRef.get(InMemoryPublicApiAuditLog);
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

  it('pauses manual scan enqueueing, reports paused health, then resumes the binding', async () => {
    const tenant = tenantId('tenant-source-status-e2e');
    const workspace = workspaceId('workspace-source-status-e2e');

    const topic = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'source-status-topic-request')
      .set('idempotency-key', 'source-status-topic')
      .send({
        name: 'Source Status Monitoring',
        query: 'source status monitoring',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'source-status-bind-request')
      .set('idempotency-key', 'source-status-bind')
      .send({
        providerKey: 'fake-source',
        config: { query: 'source status monitoring' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'source-status-policy-request')
      .set('idempotency-key', 'source-status-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    const pause = await request(app.getHttpServer())
      .patch(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'source-status-pause-request')
      .set('idempotency-key', 'source-status-pause')
      .send({ status: 'paused' })
      .expect(200);

    expect(pause.body).toEqual({
      sourceBindingId: binding.body.sourceBindingId,
      status: 'paused',
      changed: true,
    });

    const repeatedPause = await request(app.getHttpServer())
      .patch(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'source-status-pause-request')
      .set('idempotency-key', 'source-status-pause')
      .send({ status: 'paused' })
      .expect(200);

    expect(repeatedPause.body).toEqual({
      sourceBindingId: binding.body.sourceBindingId,
      status: 'paused',
      changed: false,
    });

    const health = await request(app.getHttpServer())
      .get(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(health.body).toMatchObject({
      sourceBinding: {
        id: binding.body.sourceBindingId,
        status: 'paused',
      },
      healthState: 'paused',
      operatorAction: 'resume_source_binding_before_scanning',
    });

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'source-status-scan-paused-request')
      .set('idempotency-key', 'source-status-scan-paused')
      .expect(400);

    expect(queue.all()).toHaveLength(0);

    const resume = await request(app.getHttpServer())
      .patch(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'source-status-resume-request')
      .set('idempotency-key', 'source-status-resume')
      .send({ status: 'enabled' })
      .expect(200);

    expect(resume.body).toEqual({
      sourceBindingId: binding.body.sourceBindingId,
      status: 'enabled',
      changed: true,
    });

    const scan = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'source-status-scan-resumed-request')
      .set('x-correlation-id', 'source-status-scan-resumed-correlation')
      .set('idempotency-key', 'source-status-scan-resumed')
      .expect(201);

    expect(scan.body).toMatchObject({
      status: 'enqueued',
      created: true,
    });
    expect(queue.all()).toHaveLength(1);
    expect(queue.all()[0]).toMatchObject({
      commandType: 'ingestion.scan.execute',
      correlationId: 'source-status-scan-resumed-correlation',
      payload: {
        scanJobId: scan.body.scanJobId,
        topicId: topic.body.topicId,
        sourceBindingId: binding.body.sourceBindingId,
      },
    });

    const auditRecords = await auditLog.list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 20,
    });

    expect(auditRecords.records.filter((record) => record.action === 'source_binding.status_changed')).toEqual([
      expect.objectContaining({
        resourceId: binding.body.sourceBindingId,
        metadata: {
          topicId: topic.body.topicId,
          status: 'enabled',
        },
      }),
      expect.objectContaining({
        resourceId: binding.body.sourceBindingId,
        metadata: {
          topicId: topic.body.topicId,
          status: 'paused',
        },
      }),
    ]);
  });
});
