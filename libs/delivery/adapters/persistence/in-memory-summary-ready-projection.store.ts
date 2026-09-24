import type { SummaryReadyProjection, SummaryReadyProjectionStore } from '../../application/contracts/summary-ready-projection-store';
import { encodeRealtimeReplayCursor, RealtimeEvent } from '../../domain';
import type { RealtimeEventRepositoryPort } from '../../ports';
import { assertSameSummaryReadyProjection, summaryReadyReplayId } from './summary-ready-projection-identity';

export class InMemorySummaryReadyProjectionStore implements SummaryReadyProjectionStore {
  private readonly inbox = new Map<string, RealtimeEvent>();
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly events: RealtimeEventRepositoryPort) {}

  project(projection: SummaryReadyProjection): Promise<RealtimeEvent> {
    const operation = this.pending.then(async () => {
      const { sourceEventId, sourceIdentityHash, ...props } = projection;
      const existing = this.inbox.get(sourceEventId);
      if (existing) {
        assertSameSummaryReadyProjection(existing.toSnapshot(), projection);
        return existing;
      }
      const sequence = await this.events.nextSequence(projection);
      const event = RealtimeEvent.create({ ...props, id: summaryReadyReplayId({ sourceEventId, sourceIdentityHash }), sequence,
        replayCursor: encodeRealtimeReplayCursor(sequence) });
      await this.events.append(event);
      this.inbox.set(sourceEventId, event);
      return event;
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
