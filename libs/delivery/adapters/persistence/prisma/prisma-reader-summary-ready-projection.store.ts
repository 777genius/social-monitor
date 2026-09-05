import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { DomainError, type IdGenerator } from '@social-monitor/shared-kernel';
import { READER_SUMMARY_READY_CONSUMER, type ReaderSummaryReadyProjection, type ReaderSummaryReadyProjectionStore } from '../../../application/contracts/reader-summary-ready-projection-store';
import { encodeRealtimeReplayCursor, RealtimeEvent } from '../../../domain';
import { assertSameReaderSummaryProjection } from '../reader-summary-projection-identity';
import type { PrismaReaderSummaryProjectionClient } from './prisma-reader-summary-projection-client';
import { realtimeEventFromPrisma } from './prisma-delivery-records';

export class PrismaReaderSummaryReadyProjectionStore implements ReaderSummaryReadyProjectionStore {
  constructor(private readonly prisma: PrismaReaderSummaryProjectionClient, private readonly ids: IdGenerator) {}

  async project(projection: ReaderSummaryReadyProjection): ReturnType<ReaderSummaryReadyProjectionStore['project']> {
    const id = this.ids.generate();
    return withPrismaWriteRetry(async () => {
      try {
        return await this.prisma.$transaction(async tx => {
          const existing = await tx.inboxRecord.findUnique({ where: {
            consumerName_eventId: { consumerName: READER_SUMMARY_READY_CONSUMER, eventId: projection.sourceEventId },
          } });
          if (existing !== null) {
            const record = await tx.realtimeEvent.findUnique({ where: { id: existing.id } });
            if (existing.tenantId !== projection.tenantId || record === null) {
              throw new DomainError('validation.failed', 'Reader summary inbox projection is unavailable in this scope');
            }
            const snapshot = realtimeEventFromPrisma(record).toSnapshot();
            assertSameReaderSummaryProjection(snapshot, projection);
            return { realtimeEventId: snapshot.id, channel: snapshot.channel, sequence: snapshot.sequence, duplicate: true };
          }
          const latest = await tx.realtimeEvent.findFirst({
            where: { tenantId: projection.tenantId, workspaceId: projection.workspaceId, channel: projection.channel },
            orderBy: { sequence: 'desc' },
          });
          const sequence = (latest?.sequence ?? 0) + 1;
          const { sourceEventId, ...props } = projection;
          const snapshot = RealtimeEvent.create({ ...props, id, sequence, replayCursor: encodeRealtimeReplayCursor(sequence) }).toSnapshot();
          // Inbox id also identifies its replay projection. Both writes commit in
          // one transaction; neither a process crash nor concurrent delivery can
          // leave a processed marker without the downstream durable effect.
          await tx.inboxRecord.create({ data: { id, consumerName: READER_SUMMARY_READY_CONSUMER,
            eventId: sourceEventId, tenantId: projection.tenantId, schemaVersion: 1 } });
          await tx.realtimeEvent.create({ data: snapshot });
          return { realtimeEventId: id, channel: snapshot.channel, sequence, duplicate: false };
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        // Concurrent inserts can surface as P2002 instead of P2034. Retry the
        // entire transaction, including identity comparison, never just a write.
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
          throw Object.assign(new Error('Reader summary projection concurrent insert'), { code: 'P2034' });
        }
        throw error;
      }
    });
  }
}
