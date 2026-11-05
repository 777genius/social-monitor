import type { EventEnvelope } from '@social-monitor/shared-kernel';

export type OutboxRecord = {
  readonly id: string;
  readonly event: EventEnvelope<Readonly<Record<string, unknown>>>;
};

export interface OutboxStorePort {
  pending(limit: number): Promise<readonly OutboxRecord[]>;
  // Counts recorded dispatch starts, including interrupted/uncertain outcomes.
  // EVENT rows predating this instrumentation have unknown earlier attempts.
  recordAttempt(id: string): Promise<void>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
}

export interface EventPublisherPort {
  publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void>;
}

export class OutboxDispatcher {
  constructor(
    private readonly outbox: OutboxStorePort,
    private readonly publisher: EventPublisherPort,
  ) {}

  async dispatchBatch(limit: number): Promise<{ readonly published: number; readonly failed: number }> {
    const records = await this.outbox.pending(limit);
    let published = 0;
    let failed = 0;

    for (const record of records) {
      await this.outbox.recordAttempt(record.id);
      try {
        await this.publisher.publish(record.event);
        await this.outbox.markPublished(record.id);
        published += 1;
      } catch (error) {
        await this.outbox.markFailed(record.id, error instanceof Error ? error.message : 'unknown');
        failed += 1;
      }
    }

    return { published, failed };
  }
}
