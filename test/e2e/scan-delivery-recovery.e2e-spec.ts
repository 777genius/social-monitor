import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import type { QueueCommandDeliveryDiagnostics } from '@social-monitor/platform-queue';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { IngestionWorkerModule } from '../../apps/ingestion-worker/src/ingestion-worker.module';
import {
  INGESTION_SCAN_EXECUTION_REPORTER,
  INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS,
  INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS,
} from '../../apps/ingestion-worker/src/ingestion-worker-provider-tokens';
import { InMemoryScanCommandQueueReader } from '../../apps/ingestion-worker/src/scan-command-queue-reader';
import { ScanQueueDrainLoop } from '../../apps/ingestion-worker/src/scan-queue-drain-loop';
import { InMemoryFeedItemReadRepository } from '../../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryScanAttemptRepository } from '../../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemorySourceItemRepository } from '../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { ExecuteScanCommandHandler } from '../../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import { MonitoringScanExecutionReporterAdapter } from '../../libs/monitoring/adapters/reporting/monitoring-scan-execution-reporter.adapter';
import { RecordScanExecutionUseCase } from '../../libs/monitoring/features/record-scan-execution/record-scan-execution.use-case';
import { MonitoringRestModule } from '../../libs/monitoring/interfaces/rest/monitoring-rest.module';
import { createApiGatewayE2eApp } from './support/api-gateway-e2e-app';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

jest.setTimeout(120_000);

describe('HTTP scan request through queue redelivery (e2e)', () => {
  let api: INestApplication;
  const tenant = deterministicTestUuid('scan-delivery-recovery-tenant');
  const workspace = deterministicTestUuid('scan-delivery-recovery-workspace');
  const headers = {
    'x-tenant-id': tenant,
    'x-workspace-id': workspace,
    'x-workspace-role': 'admin',
  };

  beforeAll(async () => {
    api = createApiGatewayE2eApp(await Test.createTestingModule({
      imports: [AppModule],
    }).compile());
    await api.init();
  });

  afterAll(async () => { await api.close(); });

  it('requeues while the worker is unavailable, then persists one result and preserves HTTP idempotency', async () => {
    const interest = await request(api.getHttpServer()).post('/interests')
      .set(headers).set('idempotency-key', 'recovery-interest')
      .send({ name: 'Queue recovery fixture', query: 'queue recovery' }).expect(201);
    const binding = await request(api.getHttpServer())
      .post(`/interests/${interest.body.interestId}/source-bindings`)
      .set(headers).set('idempotency-key', 'recovery-binding')
      .send({ providerKey: 'fake-source', config: { query: 'queue recovery' } }).expect(201);
    const bindingPath = `/source-bindings/${binding.body.sourceBindingId}`;
    await request(api.getHttpServer()).post(`${bindingPath}/scan-policy`)
      .set(headers).set('idempotency-key', 'recovery-policy')
      .send({ intervalSeconds: 300, freshnessSeconds: 900, retryBudget: 2 }).expect(201);
    const scan = await request(api.getHttpServer()).post(`${bindingPath}/scan-requests`)
      .set(headers).set('idempotency-key', 'recovery-scan').expect(201);
    expect(scan.body).toMatchObject({ status: 'enqueued', created: true });

    const queue = api.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });
    const reader = new InMemoryScanCommandQueueReader(queue);
    const diagnostics: QueueCommandDeliveryDiagnostics[] = [];
    const drain = reader.drain.bind(reader);
    jest.spyOn(reader, 'drain').mockImplementation(async (params) => {
      const deliveries = await drain(params);
      diagnostics.push(...deliveries.map((delivery) => delivery.diagnostics));
      return deliveries;
    });
    const worker = await Test.createTestingModule({ imports: [IngestionWorkerModule] })
      .overrideProvider(INGESTION_SCAN_EXECUTION_REPORTER)
      .useValue(new MonitoringScanExecutionReporterAdapter(api.get(RecordScanExecutionUseCase)))
      .overrideProvider(InMemoryFeedItemReadRepository)
      .useValue(api.get(InMemoryFeedItemReadRepository))
      .overrideProvider(INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS)
      .useValue({ enabled: false, intervalMs: 60_000, limit: 2, runOnStart: false })
      .overrideProvider(INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS)
      .useValue({ enabled: false, intervalMs: 60_000, limit: 2, runOnStart: false })
      .compile();
    const loops: ScanQueueDrainLoop[] = [];
    const runOneTick = async (): Promise<void> => {
      const loop = new ScanQueueDrainLoop(
        reader,
        worker.get(ExecuteScanCommandHandler),
        worker.get(InMemoryScanFailureQueueAdapter),
        { enabled: true, intervalMs: 60_000, limit: 2, runOnStart: true },
        worker.select(IngestionWorkerModule).get(InMemoryMetricsRecorder, { strict: true }),
        new SystemClock(),
      );
      loops.push(loop);
      await loop.onModuleInit();
      await loop.onApplicationShutdown('fixture-tick-complete');
    };
    const scope = {
      tenantId: tenantId(tenant), workspaceId: workspaceId(workspace),
      scanJobId: String(scan.body.scanJobId),
    };

    try {
      // A compiled but not started WorkerRuntime rejects work with real backpressure.
      await runOneTick();
      expect(queue.all()).toHaveLength(1);
      expect(worker.get(InMemorySourceItemRepository).all()).toHaveLength(0);
      expect(await worker.get(InMemoryScanAttemptRepository).findByScanJob(scope)).toBeNull();
      await request(api.getHttpServer()).get(`/scan-requests/${scope.scanJobId}/status`)
        .set(headers).expect(200).expect((response) => {
          expect(response.body).toMatchObject({ status: 'enqueued' });
        });

      await worker.init();
      await runOneTick();
      expect(diagnostics.map((entry) => entry.redelivered)).toEqual([false, true]);
      expect(queue.all()).toHaveLength(0);
      expect(worker.get(InMemorySourceItemRepository).all()).toHaveLength(2);
      expect((await worker.get(InMemoryScanAttemptRepository).findByScanJob(scope))?.toSnapshot())
        .toMatchObject({ status: 'succeeded', tenantId: tenant, workspaceId: workspace });
      await request(api.getHttpServer()).get(`/scan-requests/${scope.scanJobId}/status`)
        .set(headers).expect(200).expect((response) => {
          expect(response.body).toMatchObject({ scanJobId: scope.scanJobId, status: 'succeeded' });
        });
      await request(api.getHttpServer()).get('/feed/items')
        .set(headers).query({ interestId: interest.body.interestId, limit: 10 })
        .expect(200).expect((response) => { expect(response.body.items).toHaveLength(2); });
      await request(api.getHttpServer()).get(`/scan-requests/${scope.scanJobId}/status`)
        .set({ ...headers, 'x-workspace-id': deterministicTestUuid('recovery-other-workspace') })
        .expect(404);

      await request(api.getHttpServer()).post(`${bindingPath}/scan-requests`)
        .set(headers).set('idempotency-key', 'recovery-scan')
        .expect(201).expect((response) => {
          expect(response.body).toMatchObject({ scanJobId: scope.scanJobId, created: false });
        });
      expect(queue.all()).toHaveLength(0);
      expect(worker.get(InMemorySourceItemRepository).all()).toHaveLength(2);
    } finally {
      await Promise.all(loops.map((loop) => loop.onApplicationShutdown('fixture-cleanup')));
      await worker.close();
    }
  });
});
