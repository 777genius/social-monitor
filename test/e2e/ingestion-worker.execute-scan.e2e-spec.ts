import { Test } from '@nestjs/testing';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { IngestionWorkerModule } from '../../apps/ingestion-worker/src/ingestion-worker.module';
import { InMemoryFeedItemReadRepository } from '../../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryScanLeaseAdapter } from '../../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { InMemorySourceProviderRegistry } from '../../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { ExecuteScanCommandHandler } from '../../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import type { FetchSourceItemsResult, SourceFetcherPort } from '../../libs/ingestion/ports';

class FailingSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    throw new Error('Provider unavailable');
  }
}

describe('ingestion worker execute scan command (e2e)', () => {
  it('handles queued scan command and persists fetched source items idempotently', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    }).compile();

    await moduleRef.init();

    const handler = moduleRef.get(ExecuteScanCommandHandler);
    const repository = moduleRef.get(InMemorySourceItemRepository);
    const feedRepository = moduleRef.get(InMemoryFeedItemReadRepository);
    const attemptRepository = moduleRef.get(InMemoryScanAttemptRepository);
    const cursorRepository = moduleRef.get(InMemoryScanCursorRepository);
    const leaseAdapter = moduleRef.get(InMemoryScanLeaseAdapter);
    const providerRegistry = moduleRef.get(InMemorySourceProviderRegistry);
    const command = {
      commandId: 'scan-job-1',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      causationId: 'scan-request-1',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        scanJobId: 'scan-job-1',
        topicId: 'topic-worker-e2e',
        sourceBindingId: 'source-binding-1',
        scanPolicyId: 'scan-policy-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'worker e2e' },
      },
    };

    const first = await handler.handle(command);
    const second = await handler.handle(command);

    expect(first).toEqual({
      scanJobId: 'scan-job-1',
      fetched: 2,
      inserted: 2,
      skippedDuplicates: 0,
      projected: 2,
    });
    expect(second).toEqual({
      scanJobId: 'scan-job-1',
      fetched: 2,
      inserted: 0,
      skippedDuplicates: 2,
      projected: 2,
    });
    expect(repository.all()).toHaveLength(2);
    expect((await feedRepository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-worker-e2e',
      limit: 10,
    })).items).toHaveLength(2);
    expect((await attemptRepository.findByScanJob({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
    }))?.toSnapshot()).toMatchObject({
      status: 'succeeded',
      fetched: 2,
      inserted: 0,
      skippedDuplicates: 2,
      projected: 2,
    });
    expect(await cursorRepository.findBySourceBinding({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'source-binding-1',
    })).toEqual(expect.objectContaining({
      cursor: 'fake-cursor-next',
    }));
    expect(leaseAdapter.current({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
    })).toBeNull();
    await expect(providerRegistry.getReadinessProfile('reddit')).resolves.toEqual(
      expect.objectContaining({
        providerKey: 'reddit',
        state: 'enabled_beta',
      }),
    );

    await moduleRef.close();
  });

  it('rejects queued scan command while another worker holds the scan lease', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    }).compile();

    await moduleRef.init();

    const handler = moduleRef.get(ExecuteScanCommandHandler);
    const leaseAdapter = moduleRef.get(InMemoryScanLeaseAdapter);
    const repository = moduleRef.get(InMemorySourceItemRepository);
    const failureQueue = moduleRef.get(InMemoryScanFailureQueueAdapter);
    const attemptRepository = moduleRef.get(InMemoryScanAttemptRepository);
    await leaseAdapter.acquire({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-leased',
      workerId: 'other-worker',
      leasedAt: new Date(),
      ttlSeconds: 300,
    });

    await expect(handler.handle({
      commandId: 'scan-job-leased',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-leased',
      causationId: 'scan-request-leased',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        scanJobId: 'scan-job-leased',
        topicId: 'topic-worker-e2e',
        sourceBindingId: 'source-binding-1',
        scanPolicyId: 'scan-policy-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'worker e2e' },
        workerId: 'worker-1',
      },
    })).rejects.toThrow('Scan job is already leased');
    expect(repository.all()).toHaveLength(0);
    expect(await attemptRepository.findByScanJob({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-leased',
    })).toBeNull();
    expect(failureQueue.retries()).toEqual([]);
    expect(failureQueue.deadLettered()).toEqual([]);

    await moduleRef.close();
  });

  it('records failed attempt and schedules retry when scan execution fails', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    })
      .overrideProvider(RegistrySourceFetcherAdapter)
      .useValue(new FailingSourceFetcher())
      .compile();

    await moduleRef.init();

    const handler = moduleRef.get(ExecuteScanCommandHandler);
    const attemptRepository = moduleRef.get(InMemoryScanAttemptRepository);
    const cursorRepository = moduleRef.get(InMemoryScanCursorRepository);
    const failureQueue = moduleRef.get(InMemoryScanFailureQueueAdapter);
    const metrics = moduleRef.select(IngestionWorkerModule).get(InMemoryMetricsRecorder, { strict: true });
    const command = {
      commandId: 'scan-job-failure',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-failure',
      causationId: 'scan-request-failure',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        scanJobId: 'scan-job-failure',
        topicId: 'topic-worker-e2e',
        sourceBindingId: 'source-binding-1',
        scanPolicyId: 'scan-policy-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'worker e2e' },
        attemptNumber: 1,
        retryBudget: 3,
      },
    };

    await expect(handler.handle(command)).rejects.toThrow('Provider unavailable');
    expect((await attemptRepository.findByScanJob({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-failure',
    }))?.toSnapshot()).toMatchObject({
      status: 'failed',
      failureReason: 'Provider unavailable',
    });
    expect(failureQueue.retries()).toEqual([
      expect.objectContaining({
        scanJobId: 'scan-job-failure',
        attemptNumber: 1,
        nextAttemptNumber: 2,
        retryBudget: 3,
        failureReason: 'Provider unavailable',
      }),
    ]);
    expect(failureQueue.deadLettered()).toEqual([]);
    expect(metrics.counterValue('scan_failure_queue_events_total', {
      queue: 'scan-retry',
      status: 'retry_enqueued',
    })).toBe(1);
    expect(metrics.latestGaugeValue('scan_failure_queue_backlog', {
      queue: 'scan-retry',
    })).toBe(1);
    expect(metrics.counterValue('scan_failures_total', {
      failure_class: 'provider_unavailable',
      job_type: 'scan',
      worker: 'ingestion-worker',
    })).toBe(1);
    await expect(cursorRepository.findBySourceBinding({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'source-binding-1',
    })).resolves.toBeNull();

    await moduleRef.close();
  });

  it('accepts zero retry budget and dead-letters failed execution without retry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    })
      .overrideProvider(RegistrySourceFetcherAdapter)
      .useValue(new FailingSourceFetcher())
      .compile();

    await moduleRef.init();

    const handler = moduleRef.get(ExecuteScanCommandHandler);
    const failureQueue = moduleRef.get(InMemoryScanFailureQueueAdapter);
    const command = {
      commandId: 'scan-job-zero-retry',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-zero-retry',
      causationId: 'scan-request-zero-retry',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        scanJobId: 'scan-job-zero-retry',
        topicId: 'topic-worker-e2e',
        sourceBindingId: 'source-binding-1',
        scanPolicyId: 'scan-policy-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'worker e2e' },
        retryBudget: 0,
      },
    };

    await expect(handler.handle(command)).rejects.toThrow('Provider unavailable');
    expect(failureQueue.retries()).toEqual([]);
    expect(failureQueue.deadLettered()).toEqual([
      expect.objectContaining({
        scanJobId: 'scan-job-zero-retry',
        attemptNumber: 1,
        retryBudget: 0,
      }),
    ]);

    await moduleRef.close();
  });
});
