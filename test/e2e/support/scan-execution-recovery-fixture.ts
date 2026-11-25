import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { RegistrySourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter';
import { IngestionRestModule } from '@social-monitor/ingestion/interfaces/rest/ingestion-rest.module';
import { MonitoringScanExecutionReporterAdapter } from '@social-monitor/monitoring/adapters/reporting/monitoring-scan-execution-reporter.adapter';
import { RecordScanExecutionUseCase } from '@social-monitor/monitoring/features/record-scan-execution/record-scan-execution.use-case';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../../apps/api-gateway/src/app.module';
import { IngestionWorkerModule } from '../../../apps/ingestion-worker/src/ingestion-worker.module';
import {
  INGESTION_SCAN_EXECUTION_REPORTER,
  INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS,
  INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS,
} from '../../../apps/ingestion-worker/src/ingestion-worker-provider-tokens';
import { createApiGatewayE2eApp } from './api-gateway-e2e-app';
import { deterministicTestUuid } from './deterministic-test-uuid';

/** Shared local storage makes each bounded Nest worker startup observe prior outcomes. */
export class ScanExecutionRecoveryFixture {
  readonly tenant;
  readonly workspace;
  readonly headers;
  readonly queue: InMemoryQueuePublisher;
  readonly failures: InMemoryScanFailureQueueAdapter;
  readonly attempts = new InMemoryScanAttemptRepository();
  readonly sourceItems = new InMemorySourceItemRepository();
  readonly reporter: MonitoringScanExecutionReporterAdapter;
  private readonly cursors = new InMemoryScanCursorRepository();
  private readonly leases = new InMemoryScanLeaseAdapter();
  private fetchCount = 0;

  private constructor(
    readonly api: INestApplication,
    name: string,
    private readonly sourceFailuresBeforeSuccess: number,
  ) {
    this.tenant = tenantId(deterministicTestUuid(`${name}-tenant`));
    this.workspace = workspaceId(deterministicTestUuid(`${name}-workspace`));
    this.headers = {
      'x-tenant-id': this.tenant,
      'x-workspace-id': this.workspace,
      'x-workspace-role': 'admin',
    };
    this.queue = api.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });
    this.failures = api.select(IngestionRestModule).get(InMemoryScanFailureQueueAdapter, { strict: true });
    this.reporter = new MonitoringScanExecutionReporterAdapter(api.get(RecordScanExecutionUseCase));
  }

  static async create(name: string, sourceFailuresBeforeSuccess = 0): Promise<ScanExecutionRecoveryFixture> {
    const api = createApiGatewayE2eApp(await Test.createTestingModule({ imports: [AppModule] }).compile());
    try {
      await api.init();
      return new ScanExecutionRecoveryFixture(api, name, sourceFailuresBeforeSuccess);
    } catch (error) {
      await api.close();
      throw error;
    }
  }

  sourceFetchCount(): number {
    return this.fetchCount;
  }

  async createScan(): Promise<{ interestId: string; bindingPath: string; scanJobId: string }> {
    const interest = await request(this.api.getHttpServer()).post('/interests')
      .set(this.headers).set('idempotency-key', 'execution-recovery-interest')
      .send({ name: 'Execution recovery fixture', query: 'execution recovery' }).expect(201);
    const binding = await request(this.api.getHttpServer())
      .post(`/interests/${interest.body.interestId}/source-bindings`)
      .set(this.headers).set('idempotency-key', 'execution-recovery-binding')
      .send({ providerKey: 'fake-source', config: { query: 'execution recovery' } }).expect(201);
    const bindingPath = `/source-bindings/${binding.body.sourceBindingId}`;
    await request(this.api.getHttpServer()).post(`${bindingPath}/scan-policy`)
      .set(this.headers).set('idempotency-key', 'execution-recovery-policy')
      .send({ intervalSeconds: 300, freshnessSeconds: 900, retryBudget: 2 }).expect(201);
    const scan = await request(this.api.getHttpServer()).post(`${bindingPath}/scan-requests`)
      .set(this.headers).set('idempotency-key', 'execution-recovery-scan')
      .set('x-correlation-id', 'execution-recovery-correlation').expect(201);
    expect(scan.body).toMatchObject({ status: 'enqueued', created: true });
    expect(this.queue.all()).toHaveLength(1);
    return {
      interestId: String(interest.body.interestId),
      bindingPath,
      scanJobId: String(scan.body.scanJobId),
    };
  }

  async runWorkerTick(): Promise<void> {
    const worker = await Test.createTestingModule({ imports: [IngestionWorkerModule] })
      .overrideProvider(InMemoryQueuePublisher).useValue(this.queue)
      .overrideProvider(InMemoryScanFailureQueueAdapter).useValue(this.failures)
      .overrideProvider(InMemoryScanAttemptRepository).useValue(this.attempts)
      .overrideProvider(InMemorySourceItemRepository).useValue(this.sourceItems)
      .overrideProvider(InMemoryScanCursorRepository).useValue(this.cursors)
      .overrideProvider(InMemoryScanLeaseAdapter).useValue(this.leases)
      .overrideProvider(InMemoryFeedItemReadRepository).useValue(this.api.get(InMemoryFeedItemReadRepository))
      .overrideProvider(INGESTION_SCAN_EXECUTION_REPORTER).useValue(this.reporter)
      .overrideProvider(INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS)
      .useValue({ enabled: true, intervalMs: 60_000, limit: 2, runOnStart: true })
      .overrideProvider(INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS)
      .useValue({ enabled: false, intervalMs: 60_000, limit: 2, runOnStart: false })
      .compile();
    const fetcher = worker.get(RegistrySourceFetcherAdapter);
    const fetch = fetcher.fetch.bind(fetcher);
    const observation = jest.spyOn(fetcher, 'fetch').mockImplementation(async (command) => {
      this.fetchCount += 1;
      if (this.fetchCount <= this.sourceFailuresBeforeSuccess) throw new Error('Fixture provider unavailable');
      return fetch(command);
    });
    try {
      // Nest starts the real runtime before its real queue loop and awaits its startup tick.
      await worker.init();
    } finally {
      await worker.close();
      observation.mockRestore();
    }
  }

  async attempt(scanJobId: string) {
    return (await this.attempts.findByScanJob({
      tenantId: this.tenant, workspaceId: this.workspace, scanJobId,
    }))?.toSnapshot();
  }

  status(scanJobId: string) {
    return request(this.api.getHttpServer()).get(`/scan-requests/${scanJobId}/status`).set(this.headers);
  }

  feed(interestId: string) {
    return request(this.api.getHttpServer()).get('/feed/items')
      .set(this.headers).query({ interestId, limit: 10 });
  }

  close(): Promise<void> {
    return this.api.close();
  }
}
