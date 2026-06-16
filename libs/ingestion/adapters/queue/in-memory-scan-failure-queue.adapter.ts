import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';

import type {
  FailedScanCommand,
  RetryScanCommand,
  ScanFailureInspectionPort,
  ScanFailureQueuePort,
  ScanRetryQueuePort,
} from '../../ports';

export class InMemoryScanFailureQueueAdapter
  implements ScanFailureQueuePort, ScanFailureInspectionPort, ScanRetryQueuePort
{
  private readonly retryCommands: RetryScanCommand[] = [];
  private readonly deadLetters: FailedScanCommand[] = [];

  constructor(private readonly metrics: MetricsRecorderPort) {}

  async enqueueRetry(command: RetryScanCommand): Promise<void> {
    this.retryCommands.push(command);
    this.metrics.incrementCounter({
      name: 'scan_failure_queue_events_total',
      labels: {
        queue: 'scan-retry',
        status: 'retry_enqueued',
      },
    });
    this.metrics.recordGauge({
      name: 'scan_failure_queue_backlog',
      value: this.retryCommands.length,
      labels: {
        queue: 'scan-retry',
      },
    });
  }

  async deadLetter(command: FailedScanCommand): Promise<void> {
    this.deadLetters.push(command);
    this.metrics.incrementCounter({
      name: 'scan_failure_queue_events_total',
      labels: {
        queue: 'scan-dlq',
        status: 'dead_lettered',
      },
    });
    this.metrics.recordGauge({
      name: 'scan_failure_queue_backlog',
      value: this.deadLetters.length,
      labels: {
        queue: 'scan-dlq',
      },
    });
  }

  retries(): readonly RetryScanCommand[] {
    return [...this.retryCommands];
  }

  async drainRetries(
    params: Parameters<ScanRetryQueuePort['drainRetries']>[0],
  ): Promise<readonly RetryScanCommand[]> {
    if (!Number.isInteger(params.limit) || params.limit < 1) {
      throw new Error('Scan retry drain limit must be a positive integer');
    }

    const drained = this.retryCommands.splice(0, params.limit);
    this.metrics.recordGauge({
      name: 'scan_failure_queue_backlog',
      value: this.retryCommands.length,
      labels: {
        queue: 'scan-retry',
      },
    });

    return drained;
  }

  deadLettered(): readonly FailedScanCommand[] {
    return [...this.deadLetters];
  }

  async listDeadLetters(
    params: Parameters<ScanFailureInspectionPort['listDeadLetters']>[0],
  ): Promise<readonly FailedScanCommand[]> {
    return this.deadLetters
      .filter((command) => command.tenantId === params.tenantId && command.workspaceId === params.workspaceId)
      .slice(0, params.limit);
  }
}
