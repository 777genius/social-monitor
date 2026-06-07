import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

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
      sourceBindingId: 'source-binding-1',
      scanPolicyId: 'scan-policy-1',
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });

    expect(publisher.all()).toEqual([
      expect.objectContaining({
        commandId: 'scan-job-1',
        commandType: 'ingestion.scan.execute',
        correlationId: 'correlation-1',
        causationId: 'causation-1',
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
});
