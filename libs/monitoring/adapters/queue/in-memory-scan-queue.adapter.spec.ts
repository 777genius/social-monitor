import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { EnqueueScanCommand } from '../../ports';
import { InMemoryScanQueueAdapter } from './in-memory-scan-queue.adapter';

describe('InMemoryScanQueueAdapter', () => {
  it('publishes scan commands and records safe queue metrics', async () => {
    const publisher = new InMemoryQueuePublisher();
    const metrics = new InMemoryMetricsRecorder();
    const adapter = new InMemoryScanQueueAdapter(publisher, metrics);

    await adapter.enqueue({
      tenantId: tenantId('tenant-queue-metrics'),
      workspaceId: workspaceId('workspace-queue-metrics'),
      scanJobId: 'scan-job-1',
      topicId: 'topic-queue-metrics',
      sourceBindingId: 'source-binding-1',
      scanPolicyId: 'scan-policy-1',
      providerKey: 'fake-source',
      sourceQuery: { mode: 'search', query: 'queue monitoring' },
      retryBudget: 0,
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });

    expect(publisher.all()).toEqual([
      expect.objectContaining({
        commandId: 'scan-job-1',
        commandType: 'ingestion.scan.execute',
        correlationId: 'correlation-1',
        causationId: 'causation-1',
        payload: expect.objectContaining({
          providerKey: 'fake-source',
          topicId: 'topic-queue-metrics',
          sourceQuery: { mode: 'search', query: 'queue monitoring' },
          retryBudget: 0,
        }),
      }),
    ]);
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
  });

  it('rejects enqueue when queue reaches configured backpressure depth', async () => {
    const publisher = new InMemoryQueuePublisher();
    const metrics = new InMemoryMetricsRecorder();
    const adapter = new InMemoryScanQueueAdapter(publisher, metrics, 1);
    const command: EnqueueScanCommand = {
      tenantId: tenantId('tenant-backpressure'),
      workspaceId: workspaceId('workspace-backpressure'),
      scanJobId: 'scan-job-1',
      topicId: 'topic-backpressure',
      sourceBindingId: 'source-binding-1',
      scanPolicyId: 'scan-policy-1',
      providerKey: 'fake-source',
      sourceQuery: { mode: 'search', query: 'queue monitoring' },
      retryBudget: 1,
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    };

    await adapter.enqueue(command);
    await expect(adapter.enqueue({
      ...command,
      scanJobId: 'scan-job-2',
    })).rejects.toThrow('Scan queue backpressure limit reached');

    expect(publisher.all()).toHaveLength(1);
    expect(
      metrics.counterValue('queue_commands_enqueued_total', {
        command_type: 'ingestion.scan.execute',
        job_type: 'scan',
        status: 'rejected',
      }),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue('queue_commands_backlog', {
        command_type: 'ingestion.scan.execute',
        queue: 'scan',
      }),
    ).toBe(1);
  });
});
