import { PrismaOutboxStoreAdapter } from '@social-monitor/platform-events/adapters/prisma';
import type { PrismaEventStoreClient, PrismaInboxRecord } from '@social-monitor/platform-events/adapters/prisma/prisma-event-store-client';
import { runWithSystemDatabaseAccess } from '@social-monitor/platform-persistence';
import type { Clock } from '@social-monitor/shared-kernel';
import { READER_SUMMARY_READY_CONSUMER } from '@social-monitor/delivery/application/contracts/reader-summary-ready-projection-store';
import type { PrismaRealtimeEventRecord } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-records';
import { requireRecovery, type RecoveryEntry, type RecoveryRow } from './reader-summary-ready-recovery-manifest';
import type { RecoveryPublication, RecoverySnapshot } from './reader-summary-ready-recovery-evidence';

type Update = Parameters<PrismaEventStoreClient['outboxEvent']['update']>[0];
type RecoveryTables = {
  $queryRawUnsafe<T>(sql: string, ...values: readonly unknown[]): Promise<T>;
  outboxEvent: {
    findUnique(args: { where: { id: string } }): Promise<Omit<RecoveryRow, 'rowVersion'> | null>;
    update(args: Update): Promise<Omit<RecoveryRow, 'rowVersion'>>;
  };
  readerSummaryPublication: { findUnique(args: { where: { outboxEventId: string };
    include: { readerSummaryArtifact: true; readerSummaryJob: true } }): Promise<RecoveryPublication | null> };
  inboxRecord: Pick<PrismaEventStoreClient['inboxRecord'], 'findUnique'>;
  realtimeEvent: { findMany(args: { where: { OR: readonly object[] }; take: number }): Promise<readonly PrismaRealtimeEventRecord[]> };
};
export type RecoveryDatabase = RecoveryTables & {
  $disconnect(): Promise<void>;
  $transaction<T>(work: (tx: RecoveryTables) => Promise<T>, options: { isolationLevel: 'Serializable' }): Promise<T>;
};
export type RecoveryPersistence = {
  read(entries: readonly RecoveryEntry[]): Promise<readonly RecoverySnapshot[]>;
  transition(row: RecoveryRow, action: 'start' | 'published' | 'failed'): Promise<RecoveryRow>;
};
export function recoveryPersistence(db: RecoveryDatabase, clock: Clock): RecoveryPersistence {
  return {
    read: entries => runWithSystemDatabaseAccess('reader ready recovery exact evidence read', () => db.$transaction(async tx => {
      const snapshots: RecoverySnapshot[] = [];
      for (const entry of entries) {
        const row = await tx.outboxEvent.findUnique({ where: { id: entry.eventId } });
        requireRecovery(row !== null, 'allowlisted_row_missing');
        const publication = await tx.readerSummaryPublication.findUnique({ where: { outboxEventId: entry.eventId },
          include: { readerSummaryArtifact: true, readerSummaryJob: true } });
        const inbox: PrismaInboxRecord | null = await tx.inboxRecord.findUnique({ where: {
          consumerName_eventId: { consumerName: READER_SUMMARY_READY_CONSUMER, eventId: entry.eventId },
        } });
        const projections = await tx.realtimeEvent.findMany({ where: { OR: [
          ...(inbox === null ? [] : [{ id: inbox.id }]),
          { tenantId: entry.tenantId, workspaceId: entry.workspaceId, eventType: 'reader_summary.status.changed.v1',
            payload: { path: ['readerSummaryId'], equals: entry.readerSummaryId } },
        ] }, take: 2 });
        snapshots.push({ row: { ...row, rowVersion: await readVersion(tx, row.id) }, publication, inbox, projections });
      }
      return snapshots;
    }, { isolationLevel: 'Serializable' })),
    transition: async (row, action) => {
      let updated: RecoveryRow | undefined;
      const unavailable = (): never => { throw new Error('Recovery adapter method unavailable'); };
      // The standard adapter owns diagnostics and start/ack/failure semantics.
      // Compare PostgreSQL tuple versions under an exact row lock. Comparing
      // Date values in Prisma WHERE loses PostgreSQL sub-millisecond precision.
      const guarded: PrismaEventStoreClient = {
        outboxEvent: { findMany: unavailable, update: async args => {
          requireRecovery(args.where.id === row.id, 'transition_id_mismatch');
          updated = await db.$transaction(async tx => {
            requireRecovery(await readVersion(tx, row.id, true) === row.rowVersion, 'outbox_concurrent_mutation');
            const next = await tx.outboxEvent.update(args);
            return { ...next, rowVersion: await readVersion(tx, row.id) };
          }, { isolationLevel: 'Serializable' });
          return updated;
        } }, inboxRecord: { findUnique: unavailable, create: unavailable },
      };
      const outbox = new PrismaOutboxStoreAdapter(guarded, clock);
      if (action === 'start') await outbox.recordAttempt(row.id);
      else if (action === 'published') await outbox.markPublished(row.id);
      else await outbox.markFailed(row.id, 'Reader ready recovery publish uncertain; inspect durable operation receipts.');
      requireRecovery(updated !== undefined, 'transition_unacknowledged');
      return updated;
    },
  };
}
async function readVersion(tx: RecoveryTables, id: string, lock = false): Promise<string> {
  const rows = await tx.$queryRawUnsafe<readonly { version: string }[]>(
    `SELECT xmin::text AS version FROM public.outbox_events WHERE id = $1::uuid${lock ? ' FOR UPDATE' : ''}`, id);
  requireRecovery(rows.length === 1 && rows[0]?.version, 'allowlisted_row_missing');
  return rows[0].version;
}
