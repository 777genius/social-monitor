import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { DomainError } from '@social-monitor/shared-kernel';
import { SUMMARY_READY_CONSUMER, type SummaryReadyProjection, type SummaryReadyProjectionStore } from '../../../application/contracts/summary-ready-projection-store';
import { encodeRealtimeReplayCursor, RealtimeEvent } from '../../../domain';
import { assertSameSummaryReadyProjection, summaryReadyReplayId } from '../summary-ready-projection-identity';
import type { PrismaReaderSummaryProjectionClient } from './prisma-reader-summary-projection-client';
import { realtimeEventFromPrisma } from './prisma-delivery-records';

export class PrismaSummaryReadyProjectionStore implements SummaryReadyProjectionStore {
  constructor(private readonly prisma: PrismaReaderSummaryProjectionClient) {}

  project(projection: SummaryReadyProjection): Promise<RealtimeEvent> {
    const id = summaryReadyReplayId(projection);
    return withPrismaWriteRetry(async () => {
      try {
        return await this.prisma.$transaction(async tx => {
          const existing = await tx.inboxRecord.findUnique({ where: {
            consumerName_eventId: { consumerName: SUMMARY_READY_CONSUMER, eventId: projection.sourceEventId },
          } });
          if (existing !== null) {
            // Check tenant before loading the replay row. Never return another
            // tenant's payload or identity for a reused source event ID.
            if (existing.tenantId !== projection.tenantId) {
              throw new DomainError('validation.failed', 'Summary ready inbox projection is unavailable in this scope');
            }
            const record = await tx.realtimeEvent.findUnique({ where: { id: existing.id } });
            if (record === null) {
              throw new DomainError('validation.failed', 'Summary ready inbox projection is unavailable in this scope');
            }
            const event = realtimeEventFromPrisma(record);
            assertSameSummaryReadyProjection(event.toSnapshot(), projection);
            return event;
          }
          const latest = await tx.realtimeEvent.findFirst({
            where: { tenantId: projection.tenantId, workspaceId: projection.workspaceId, channel: projection.channel },
            orderBy: { sequence: 'desc' },
          });
          const sequence = (latest?.sequence ?? 0) + 1;
          const { sourceEventId, sourceIdentityHash, ...props } = projection;
          const event = RealtimeEvent.create({ ...props, id, sequence, replayCursor: encodeRealtimeReplayCursor(sequence) });
          await tx.inboxRecord.create({ data: { id, consumerName: SUMMARY_READY_CONSUMER,
            eventId: sourceEventId, tenantId: projection.tenantId, schemaVersion: 1 } });
          await tx.realtimeEvent.create({ data: event.toSnapshot() });
          return event;
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        // Concurrent inserts may report a unique violation instead of a
        // serialization failure. Retry the full read and identity comparison.
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
          throw Object.assign(new Error('Summary ready projection concurrent insert'), { code: 'P2034' });
        }
        throw error;
      }
    });
  }
}
