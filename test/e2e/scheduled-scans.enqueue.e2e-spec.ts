import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { ScheduleDueScansUseCase } from '../../libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';
import { MonitoringRestModule } from '../../libs/monitoring/interfaces/rest/monitoring-rest.module';

describe('Scheduled scan enqueue flow (e2e)', () => {
  let app: INestApplication;
  let queue: InMemoryQueuePublisher;
  let scheduler: ScheduleDueScansUseCase;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    queue = moduleRef.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });
    scheduler = moduleRef.get(ScheduleDueScansUseCase);
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

  it('enqueues due scan from configured scan policy', async () => {
    const tenant = 'tenant-scheduled-e2e';
    const workspace = 'workspace-scheduled-e2e';

    const topic = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-topic')
      .set('idempotency-key', 'create-scheduled-topic')
      .send({
        name: 'Scheduled Monitoring',
        query: 'scheduled monitoring',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-bind')
      .set('idempotency-key', 'bind-scheduled-source')
      .send({
        providerKey: 'fake-source',
        config: { query: 'scheduled monitoring' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-policy')
      .set('idempotency-key', 'set-scheduled-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);
    const policy = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    const result = await scheduler.execute({
      tenantId: tenantId(tenant),
      workspaceId: workspaceId(workspace),
      limit: 10,
      correlationId: 'scheduler-tick-e2e',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      evaluated: 1,
      enqueued: 1,
      skipped: 0,
    });
    expect(queue.all()).toHaveLength(1);
    const queuedCommand = queue.all()[0];
    if (queuedCommand === undefined) {
      throw new Error('Expected scheduled scan command to be enqueued');
    }
    expect(queuedCommand).toMatchObject({
      commandId: expect.any(String),
      commandType: 'ingestion.scan.execute',
      correlationId: 'scheduler-tick-e2e',
      payload: {
        tenantId: tenant,
        workspaceId: workspace,
        topicId: topic.body.topicId,
        sourceBindingId: binding.body.sourceBindingId,
        scanPolicyId: policy.body.id,
      },
    });

    const status = await request(app.getHttpServer())
      .get(`/scan-requests/${queuedCommand.commandId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(status.body).toMatchObject({
      scanJobId: queuedCommand.commandId,
      sourceBindingId: binding.body.sourceBindingId,
      scanPolicyId: policy.body.id,
      status: 'enqueued',
      userState: 'scan_in_progress',
      operatorAction: 'check_worker_lag_if_status_exceeds_freshness_slo',
      requestedAt: expect.any(String),
      enqueuedAt: expect.any(String),
    });
  });

  it('skips due scheduled scan when manual scan is already active for source binding', async () => {
    const tenant = 'tenant-scheduled-overlap-e2e';
    const workspace = 'workspace-scheduled-overlap-e2e';
    const initialQueueLength = queue.all().length;

    const topic = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-overlap-topic')
      .set('idempotency-key', 'create-scheduled-overlap-topic')
      .send({
        name: 'Scheduled Overlap Monitoring',
        query: 'scheduled overlap monitoring',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-overlap-bind')
      .set('idempotency-key', 'bind-scheduled-overlap-source')
      .send({
        providerKey: 'fake-source',
        config: { query: 'scheduled overlap monitoring' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-overlap-policy')
      .set('idempotency-key', 'set-scheduled-overlap-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    const manual = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'request-scheduled-overlap-manual')
      .set('idempotency-key', 'request-scheduled-overlap-manual')
      .expect(201);
    expect(manual.body).toEqual({
      scanJobId: expect.any(String),
      status: 'enqueued',
      created: true,
    });

    const result = await scheduler.execute({
      tenantId: tenantId(tenant),
      workspaceId: workspaceId(workspace),
      limit: 10,
      correlationId: 'scheduler-tick-overlap-e2e',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      evaluated: 1,
      enqueued: 0,
      skipped: 1,
    });
    expect(queue.all()).toHaveLength(initialQueueLength + 1);
  });

  it('skips due scheduled scan for a paused source binding without advancing cadence', async () => {
    const tenant = 'tenant-scheduled-paused-e2e';
    const workspace = 'workspace-scheduled-paused-e2e';
    const initialQueueLength = queue.all().length;

    const topic = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-paused-topic')
      .set('idempotency-key', 'create-scheduled-paused-topic')
      .send({
        name: 'Scheduled Paused Monitoring',
        query: 'scheduled paused monitoring',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-paused-bind')
      .set('idempotency-key', 'bind-scheduled-paused-source')
      .send({
        providerKey: 'fake-source',
        config: { query: 'scheduled paused monitoring' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-scheduled-paused-policy')
      .set('idempotency-key', 'set-scheduled-paused-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);
    const policy = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'pause-scheduled-source-binding')
      .set('idempotency-key', 'pause-scheduled-source-binding')
      .send({ status: 'paused' })
      .expect(200);

    const result = await scheduler.execute({
      tenantId: tenantId(tenant),
      workspaceId: workspaceId(workspace),
      limit: 10,
      correlationId: 'scheduler-tick-paused-e2e',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      evaluated: 1,
      enqueued: 0,
      skipped: 1,
    });
    expect(queue.all()).toHaveLength(initialQueueLength);

    const unchangedPolicy = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(unchangedPolicy.body).toMatchObject({
      id: policy.body.id,
      sourceBindingId: binding.body.sourceBindingId,
      nextRunAt: policy.body.nextRunAt,
    });
  });
});
