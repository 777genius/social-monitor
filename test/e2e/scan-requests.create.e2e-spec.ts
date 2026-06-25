import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { MonitoringRestModule } from '../../libs/monitoring/interfaces/rest/monitoring-rest.module';

describe('Request scan flow (e2e)', () => {
  let app: INestApplication;
  let queue: InMemoryQueuePublisher;
  let metrics: InMemoryMetricsRecorder;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MonitoringRestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    queue = moduleRef.get(InMemoryQueuePublisher);
    metrics = moduleRef.get(InMemoryMetricsRecorder);
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
      .set('x-workspace-role', 'admin')
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
      .set('x-workspace-role', 'admin')
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
      .set('x-workspace-role', 'admin')
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
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'request-scan-now')
      .set('x-correlation-id', 'correlation-scan-now')
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
      correlationId: 'correlation-scan-now',
      causationId: 'request-scan-now',
      payload: {
        scanJobId: first.body.scanJobId,
        topicId: topic.body.topicId,
        sourceBindingId: binding.body.sourceBindingId,
        retryBudget: 3,
      },
    });
    expect(
      metrics.counterValue('queue_commands_enqueued_total', {
        command_type: 'ingestion.scan.execute',
        job_type: 'scan',
        status: 'enqueued',
      }),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue('queue_commands_backlog', {
        command_type: 'ingestion.scan.execute',
        queue: 'scan',
      }),
    ).toBe(1);

    const second = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
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
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'request-scan-overlap')
      .set('idempotency-key', 'request-scan-overlap')
      .expect(201);

    expect(overlapping.body).toEqual({
      scanJobId: first.body.scanJobId,
      status: 'enqueued',
      created: false,
    });
    expect(queue.all()).toHaveLength(1);

    const listed = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests?limit=10`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(listed.body).toEqual({
      scanRequests: [
        expect.objectContaining({
          scanJobId: first.body.scanJobId,
          sourceBindingId: binding.body.sourceBindingId,
          status: 'enqueued',
          userState: 'scan_in_progress',
          operatorAction: 'check_worker_lag_if_status_exceeds_freshness_slo',
        }),
      ],
    });

    const daily = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests/daily?days=1`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(daily.body).toEqual({
      sourceBindingId: binding.body.sourceBindingId,
      windowStartedAt: expect.any(String),
      windowEndedAt: expect.any(String),
      truncated: false,
      maxScanJobs: 100,
      days: [
        expect.objectContaining({
          date: expect.any(String),
          providerHealthState: 'unknown',
          totalScans: 1,
          succeededScans: 0,
          failedScans: 0,
          activeScans: 1,
          signals: ['active_scan_in_progress'],
        }),
      ],
    });

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(auditRecords.records.filter((record) => record.action === 'scan_request.created')).toEqual([
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
