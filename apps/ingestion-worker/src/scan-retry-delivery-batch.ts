import type { ScanRetryDelivery } from '@social-monitor/ingestion/ports';
import type { StructuredLogger } from '@social-monitor/platform-logging';
import type { Clock } from '@social-monitor/shared-kernel';

import type { QueueCommandDelivery } from './scan-command-queue-reader';

export const SCAN_RETRY_VISIBILITY_SECONDS = 300;
const RENEW_INTERVAL_MS = 60_000;

/** Keep queued and executing claims alive until the worker settles or releases them. */
export class ScanRetryDeliveryBatch {
  readonly deliveries: readonly QueueCommandDelivery[];
  private readonly pending = new Map<QueueCommandDelivery, ScanRetryDelivery>();
  private readonly lost = new Set<QueueCommandDelivery>();
  private readonly timer: NodeJS.Timeout | undefined;
  private renewal: Promise<void> | undefined;

  constructor(retries: readonly ScanRetryDelivery[], private readonly clock: Clock,
    private readonly logger: StructuredLogger) {
    this.deliveries = retries.map((retry) => {
      const command = retry.command;
      const settle = async (operation: () => Promise<void>) => {
        await operation();
        this.pending.delete(delivery);
      };
      const delivery: QueueCommandDelivery = {
        command: {
          commandId: `${command.scanJobId}:retry:${command.nextAttemptNumber}`,
          commandType: 'ingestion.scan.execute', schemaVersion: 1,
          correlationId: command.correlationId, causationId: command.causationId,
          payload: {
            tenantId: command.tenantId, workspaceId: command.workspaceId, scanJobId: command.scanJobId,
            interestId: command.interestId, sourceBindingId: command.sourceBindingId,
            scanPolicyId: command.scanPolicyId, providerKey: command.providerKey,
            sourceQuery: command.sourceQuery, attemptNumber: command.nextAttemptNumber,
            retryBudget: command.retryBudget,
          },
        },
        diagnostics: { redelivered: false, deadLetterCount: 0 },
        ack: () => settle(() => retry.ack()),
        nack: (params) => settle(() => retry.nack(params)),
      };
      this.pending.set(delivery, retry);
      return delivery;
    });
    if (retries.length > 0) {
      this.timer = setInterval(() => {
        if (this.renewal !== undefined) return;
        this.renewal = this.renewClaims().finally(() => { this.renewal = undefined; });
      }, RENEW_INTERVAL_MS);
    }
  }

  owns(delivery: QueueCommandDelivery): boolean {
    return !this.lost.has(delivery);
  }

  async releaseUnsettled(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.renewal;
    const outcomes = await Promise.allSettled([...this.pending.values()].map((retry) => retry.nack({ requeue: true })));
    this.pending.clear();
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  }

  private async renewClaims(): Promise<void> {
    for (const [delivery, retry] of this.pending) {
      try {
        if (!(await retry.renew(this.clock.now()))) this.lost.add(delivery);
      } catch (error) {
        // Stop starting work whose ownership cannot be established; expiry is the recovery path.
        this.lost.add(delivery);
        this.logger.error('scan retry claim renewal failed', {
          commandId: delivery.command.commandId,
          error: error instanceof Error ? error.message : 'Unknown retry renewal failure',
          worker: 'ingestion-worker',
        });
      }
    }
  }
}
