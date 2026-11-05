import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';

import {
  assertValidScanRetryClaim,
  type ScanRetryDelivery,
  type RetryScanCommand,
  type FailedScanCommand,
  type ScanFailureInspectionPort,
  type ScanFailureQueuePort,
  type ScanRetryQueuePort,
} from '../../ports';

type RetryEntry = {
  readonly command: RetryScanCommand;
  claimVersion?: number;
  claimedUntil?: number;
};

export class InMemoryScanFailureQueueAdapter
  implements ScanFailureQueuePort, ScanFailureInspectionPort, ScanRetryQueuePort
{
  private readonly retryCommands: RetryEntry[] = [];
  private readonly deadLetters: FailedScanCommand[] = [];
  private nextClaimVersion = 0;

  constructor(private readonly metrics: MetricsRecorderPort) {}

  async enqueueRetry(command: RetryScanCommand): Promise<void> {
    if (this.retryCommands.some((entry) => sameFailure(entry.command, command) &&
        entry.command.nextAttemptNumber === command.nextAttemptNumber)) return;
    this.retryCommands.push({ command });
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
    if (this.deadLetters.some((entry) => sameFailure(entry, command))) return;
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
    return this.retryCommands.map((entry) => entry.command);
  }

  async claimRetries(
    params: Parameters<ScanRetryQueuePort['claimRetries']>[0],
  ): Promise<readonly ScanRetryDelivery[]> {
    assertValidScanRetryClaim(params);
    return this.retryCommands.filter((entry) =>
      entry.claimedUntil === undefined || entry.claimedUntil <= params.now.getTime(),
    ).slice(0, params.limit).map((entry) => {
      const version = ++this.nextClaimVersion;
      entry.claimVersion = version;
      entry.claimedUntil = params.now.getTime() + params.visibilityTimeoutSeconds * 1000;
      const owns = () => this.retryCommands.includes(entry) && entry.claimVersion === version;
      const settle = async (requeue: boolean, deadLetter: boolean) => {
        if (!owns()) return;
        if (requeue) {
          entry.claimVersion = undefined;
          entry.claimedUntil = undefined;
        } else {
          this.retryCommands.splice(this.retryCommands.indexOf(entry), 1);
          if (deadLetter) await this.deadLetter(entry.command);
        }
        this.recordRetryBacklog();
      };
      return {
        command: entry.command,
        renew: async (now: Date) => {
          if (!owns() || entry.claimedUntil! <= now.getTime()) return false;
          entry.claimedUntil = now.getTime() + params.visibilityTimeoutSeconds * 1000;
          return true;
        },
        ack: () => settle(false, false),
        nack: ({ requeue }: { readonly requeue: boolean }) => settle(requeue, !requeue),
      };
    });
  }

  private recordRetryBacklog(): void {
    this.metrics.recordGauge({
      name: 'scan_failure_queue_backlog',
      value: this.retryCommands.length,
      labels: {
        queue: 'scan-retry',
      },
    });

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

const sameFailure = (left: FailedScanCommand, right: FailedScanCommand): boolean =>
  left.tenantId === right.tenantId && left.workspaceId === right.workspaceId &&
  left.scanJobId === right.scanJobId && left.attemptNumber === right.attemptNumber;
