import {
  redactSensitiveText,
  type Clock,
  type IdGenerator,
} from '@social-monitor/shared-kernel';

import { CommandOutboxLeaseHeartbeat } from './command-outbox-lease-heartbeat';

import type {
  QueueCommandEnvelope,
  QueuePublisherPort,
} from './queue-command';

export type CommandOutboxRecord = {
  readonly id: string;
  readonly command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>;
  readonly publishAttempt: number;
};

export interface CommandOutboxStorePort {
  claimPending(params: {
    readonly limit: number;
    readonly now: Date;
    readonly leaseOwner: string;
    readonly leasedUntil: Date;
  }): Promise<readonly CommandOutboxRecord[]>;
  /** Renew the whole still-pending batch only while every row remains owned and unexpired. */
  renewClaims(params: {
    readonly ids: readonly string[];
    readonly leaseOwner: string;
    readonly now: Date;
    readonly leasedUntil: Date;
  }): Promise<boolean>;
  markPublished(params: {
    readonly id: string;
    readonly leaseOwner: string;
    readonly publishedAt: Date;
  }): Promise<void>;
  markFailed(params: {
    readonly id: string;
    readonly leaseOwner: string;
    readonly commandType: string;
    readonly availableAt: Date;
    readonly failedAt: Date;
    readonly lastError: string;
    readonly terminal: boolean;
  }): Promise<void>;
}

export type CommandOutboxDispatcherOptions = {
  readonly leaseMs?: number;
  readonly maxAttempts?: number;
  readonly retryBaseMs?: number;
  readonly retryMaxMs?: number;
};

export type CommandOutboxDispatchResult = {
  readonly published: number;
  readonly retrying: number;
  readonly failed: number;
};

export class CommandOutboxDispatcher {
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;

  constructor(
    private readonly outbox: CommandOutboxStorePort,
    private readonly publisher: QueuePublisherPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    options: CommandOutboxDispatcherOptions = {},
  ) {
    this.leaseMs = positiveInteger(options.leaseMs, 30_000);
    this.maxAttempts = positiveInteger(options.maxAttempts, 10);
    this.retryBaseMs = positiveInteger(options.retryBaseMs, 1_000);
    this.retryMaxMs = positiveInteger(options.retryMaxMs, 300_000);
  }

  async dispatchBatch(limit: number): Promise<CommandOutboxDispatchResult> {
    const now = this.clock.now();
    const leaseOwner = this.ids.generate();
    const leasedUntil = new Date(now.getTime() + this.leaseMs);
    const records = await this.outbox.claimPending({
      limit: Math.max(0, limit), now, leaseOwner, leasedUntil,
    });
    if (records.length === 0) return { published: 0, retrying: 0, failed: 0 };

    const heartbeat = new CommandOutboxLeaseHeartbeat(
      this.outbox, records.map((record) => record.id),
      leaseOwner, this.clock, this.leaseMs, leasedUntil,
    );
    let published = 0;
    let retrying = 0;
    let failed = 0;

    try {
      for (const record of records) {
        // Claimed later rows must remain owned during earlier slow RabbitMQ
        // confirmations. Never start a new send after renewal becomes uncertain.
        await heartbeat.assertOwned();
        let publishError: unknown;
        try {
          await this.publisher.publish(record.command);
        } catch (error) {
          publishError = error;
        }
        await heartbeat.assertOwned();
        heartbeat.completed(record.id);

        if (publishError !== undefined) {
          const terminal = record.publishAttempt >= this.maxAttempts;
          const failedAt = this.clock.now();
          await this.outbox.markFailed({
            id: record.id,
            leaseOwner,
            commandType: record.command.commandType,
            availableAt: new Date(failedAt.getTime() + this.retryDelayMs(record.publishAttempt)),
            failedAt,
            lastError: safeOutboxError(publishError),
            terminal,
          });
          if (terminal) failed += 1;
          else retrying += 1;
          continue;
        }

        await this.outbox.markPublished({
          id: record.id, leaseOwner, publishedAt: this.clock.now(),
        });
        published += 1;
      }
    } finally {
      // Unsettled rows remain leased until expiry; no cross-owner release.
      await heartbeat.stop();
    }
    return { published, retrying, failed };
  }

  private retryDelayMs(attempt: number): number {
    const exponent = Math.max(0, Math.min(attempt - 1, 20));

    return Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** exponent);
  }
}

const positiveInteger = (
  value: number | undefined,
  fallback: number,
): number =>
  value === undefined || !Number.isInteger(value) || value < 1
    ? fallback
    : value;

const safeOutboxError = (error: unknown): string =>
  redactSensitiveText(
    error instanceof Error ? error.message : String(error),
  ).slice(0, 240);
