import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';

import type { FailedScanCommand, RetryScanCommand, ScanFailureQueuePort } from '../../ports';

export class InMemoryScanFailureQueueAdapter implements ScanFailureQueuePort {
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

  deadLettered(): readonly FailedScanCommand[] {
    return [...this.deadLetters];
  }
}
