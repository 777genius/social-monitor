import type { IdGenerator } from '@social-monitor/shared-kernel';
import type { ReaderSummaryReadyProjection, ReaderSummaryReadyProjectionStore } from '../../application/contracts/reader-summary-ready-projection-store';
import { encodeRealtimeReplayCursor, RealtimeEvent } from '../../domain';
import type { RealtimeEventRepositoryPort } from '../../ports';
import { assertSameReaderSummaryProjection } from './reader-summary-projection-identity';

export class InMemoryReaderSummaryReadyProjectionStore implements ReaderSummaryReadyProjectionStore {
  private readonly inbox = new Map<string, RealtimeEvent>();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly events: RealtimeEventRepositoryPort, private readonly ids: IdGenerator) {}

  project(projection: ReaderSummaryReadyProjection): ReturnType<ReaderSummaryReadyProjectionStore['project']> {
    const operation = this.pending.then(async () => {
      const existing = this.inbox.get(projection.sourceEventId);
      if (existing) {
        const snapshot = existing.toSnapshot();
        assertSameReaderSummaryProjection(snapshot, projection);
        return { realtimeEventId: snapshot.id, channel: snapshot.channel, sequence: snapshot.sequence, duplicate: true };
      }
      const sequence = await this.events.nextSequence(projection);
      const { sourceEventId, ...props } = projection;
      const event = RealtimeEvent.create({ ...props, id: this.ids.generate(), sequence, replayCursor: encodeRealtimeReplayCursor(sequence) });
      await this.events.append(event);
      this.inbox.set(sourceEventId, event);
      return { realtimeEventId: event.toSnapshot().id, channel: projection.channel, sequence, duplicate: false };
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
