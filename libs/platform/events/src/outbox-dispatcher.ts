import { OutboxLeaseHeartbeat } from '@social-monitor/platform-queue';
import {
  redactSensitiveResponseText,
  type Clock,
  type EventEnvelope,
  type IdGenerator,
} from '@social-monitor/shared-kernel';

import {
  assertEventOutboxBatchLimit,
  eventOutboxDispatchPolicy,
  eventOutboxRetryDelay,
  type EventOutboxDispatchPolicy,
  type OutboxDispatcherOptions,
} from './event-outbox-dispatch-policy';
import type { OutboxStorePort } from './event-outbox-store';

export type { ClaimedOutboxRecord, OutboxRecord, OutboxStorePort } from './event-outbox-store';
export type { OutboxDispatcherOptions } from './event-outbox-dispatch-policy';

export interface EventPublisherPort {
  publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void>;
}

export type OutboxDispatchResult = {
  readonly published: number;
  readonly retrying: number;
  readonly failed: number;
};

export class OutboxDispatcher {
  private readonly policy: EventOutboxDispatchPolicy;

  constructor(
    private readonly outbox: OutboxStorePort,
    private readonly publisher: EventPublisherPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    options: OutboxDispatcherOptions = {},
  ) {
    this.policy = eventOutboxDispatchPolicy(options);
  }

  async dispatchBatch(
    limit: number,
    shouldContinue: () => boolean = () => true,
  ): Promise<OutboxDispatchResult> {
    assertEventOutboxBatchLimit(limit);
    if (limit === 0 || !shouldContinue()) return { published: 0, retrying: 0, failed: 0 };
    const now = this.clock.now();
    const leaseOwner = this.ids.generate();
    const leasedUntil = new Date(now.getTime() + this.policy.leaseMs);
    const records = await this.outbox.claimPending({ limit, now, leaseOwner, leasedUntil });
    if (records.length === 0) return { published: 0, retrying: 0, failed: 0 };
    const heartbeat = new OutboxLeaseHeartbeat(
      this.outbox, records.map((record) => record.id), leaseOwner,
      this.clock, this.policy.leaseMs, leasedUntil,
    );
    let published = 0;
    let retrying = 0;
    let failed = 0;

    try {
      for (const record of records) {
        if (!shouldContinue()) break;
        await heartbeat.assertOwned();
        if (!shouldContinue()) break;
        const owner = { id: record.id, leaseOwner };
        if (record.publishAttempts >= this.policy.maxAttempts) {
          // A crash after the final recorded start must not buy another send.
          const failedAt = this.clock.now();
          heartbeat.completed(record.id);
          await this.outbox.markFailed({
            ...owner, failedAt, availableAt: failedAt, terminal: true,
            reason: 'Event publication exhausted recorded dispatch starts; last outcome may be unknown.',
          });
          failed += 1;
          continue;
        }

        const attempt = await this.outbox.recordAttempt(owner);
        await heartbeat.assertOwned();
        if (!shouldContinue()) break;
        let publishFailed = false;
        let publishError: unknown;
        try {
          await this.publisher.publish(record.event);
        } catch (error) {
          publishFailed = true;
          publishError = error;
        }
        await heartbeat.assertOwned();
        heartbeat.completed(record.id);
        if (publishFailed) {
          const terminal = attempt >= this.policy.maxAttempts;
          const failedAt = this.clock.now();
          await this.outbox.markFailed({
            ...owner, failedAt, terminal,
            availableAt: new Date(failedAt.getTime() + eventOutboxRetryDelay(this.policy, attempt)),
            reason: safeDispatchFailure(publishError),
          });
          if (terminal) failed += 1;
          else retrying += 1;
          continue;
        }
        // A broker ACK followed by a failed database write remains uncertain.
        // Leave the row leased for recovery; never rewrite it as a publish failure.
        await this.outbox.markPublished({ ...owner, publishedAt: this.clock.now() });
        published += 1;
      }
    } finally {
      // Unsettled claims expire naturally. There is no cross-owner release.
      await heartbeat.stop();
    }
    return { published, retrying, failed };
  }
}

const safeDispatchFailure = (error: unknown): string =>
  redactSensitiveResponseText(error instanceof Error ? error.message : String(error))
    .replace(/[\r\n\t]/g, ' ').slice(0, 500);
