import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryScanFailureQueueAdapter } from './in-memory-scan-failure-queue.adapter';

describe('InMemoryScanFailureQueueAdapter', () => {
  it('records retry and dead-letter metrics with safe labels', async () => {
    const metrics = new InMemoryMetricsRecorder();
    const queue = new InMemoryScanFailureQueueAdapter(metrics);
    const command = {
      tenantId: tenantId('tenant-failure-queue'),
      workspaceId: workspaceId('workspace-failure-queue'),
      scanJobId: 'scan-job-failure',
      sourceBindingId: 'source-binding-failure',
      scanPolicyId: 'scan-policy-failure',
      correlationId: 'correlation-failure',
      causationId: 'causation-failure',
      attemptNumber: 1,
      retryBudget: 2,
      failureReason: 'Provider unavailable',
    };

    await queue.enqueueRetry({ ...command, nextAttemptNumber: 2 });
    await queue.deadLetter(command);

    expect(queue.retries()).toHaveLength(1);
    expect(queue.deadLettered()).toHaveLength(1);
    expect(metrics.counterValue('scan_failure_queue_events_total', {
      queue: 'scan-retry',
      status: 'retry_enqueued',
    })).toBe(1);
    expect(metrics.latestGaugeValue('scan_failure_queue_backlog', {
      queue: 'scan-retry',
    })).toBe(1);
    expect(metrics.counterValue('scan_failure_queue_events_total', {
      queue: 'scan-dlq',
      status: 'dead_lettered',
    })).toBe(1);
    expect(metrics.latestGaugeValue('scan_failure_queue_backlog', {
      queue: 'scan-dlq',
    })).toBe(1);
  });

  it('lists dead letters by tenant and workspace with a bounded limit', async () => {
    const metrics = new InMemoryMetricsRecorder();
    const queue = new InMemoryScanFailureQueueAdapter(metrics);
    const command = {
      tenantId: tenantId('tenant-failure-queue'),
      workspaceId: workspaceId('workspace-failure-queue'),
      scanJobId: 'scan-job-failure',
      sourceBindingId: 'source-binding-failure',
      scanPolicyId: 'scan-policy-failure',
      correlationId: 'correlation-failure',
      causationId: 'causation-failure',
      attemptNumber: 1,
      retryBudget: 1,
      failureReason: 'Provider unavailable',
    };

    await queue.deadLetter(command);
    await queue.deadLetter({
      ...command,
      tenantId: tenantId('tenant-other'),
      scanJobId: 'scan-job-other',
    });

    await expect(queue.listDeadLetters({
      tenantId: tenantId('tenant-failure-queue'),
      workspaceId: workspaceId('workspace-failure-queue'),
      limit: 1,
    })).resolves.toEqual([command]);
  });
});
