import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from '@social-monitor/platform-persistence';

import type {
  CommandOutboxRecord,
  CommandOutboxStorePort,
} from '../../command-outbox-dispatcher';
import type { QueueCommandEnvelope } from '../../queue-command';
import type {
  PrismaCommandOutboxClient,
  PrismaCommandOutboxRecord,
} from './prisma-command-outbox-client';

export class PrismaCommandOutboxStoreAdapter
  implements CommandOutboxStorePort
{
  constructor(private readonly prisma: PrismaCommandOutboxClient) {}

  async claimPending(params: {
    readonly limit: number;
    readonly now: Date;
    readonly leaseOwner: string;
    readonly leasedUntil: Date;
  }): Promise<readonly CommandOutboxRecord[]> {
    return runWithSystemDatabaseAccess('command outbox lease claim', () =>
      withPrismaWriteRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
          const records = await transaction.outboxEvent.findMany({
            where: {
              messageKind: 'COMMAND',
              status: 'PENDING',
              availableAt: { lte: params.now },
              OR: [
                { leasedUntil: null },
                { leasedUntil: { lte: params.now } },
              ],
            },
            orderBy: [
              { availableAt: 'asc' },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            take: Math.max(0, params.limit),
          });
          if (records.length === 0) {
            return [];
          }

          const claimed = await transaction.outboxEvent.updateMany({
            where: {
              id: { in: records.map((record) => record.id) },
              messageKind: 'COMMAND',
              status: 'PENDING',
              availableAt: { lte: params.now },
              OR: [
                { leasedUntil: null },
                { leasedUntil: { lte: params.now } },
              ],
            },
            data: {
              leaseOwner: params.leaseOwner,
              leasedUntil: params.leasedUntil,
              publishAttempts: { increment: 1 },
            },
          });
          if (claimed.count !== records.length) {
            throw new Error('Command outbox lease claim was incomplete');
          }

          return records.map((record) => ({
            id: record.id,
            command: commandEnvelopeFromPrisma(record),
            publishAttempt: record.publishAttempts + 1,
          }));
          },
          { isolationLevel: 'Serializable' },
        ),
      ),
    );
  }

  async renewClaims(params: {
    readonly ids: readonly string[];
    readonly leaseOwner: string;
    readonly now: Date;
    readonly leasedUntil: Date;
  }): Promise<boolean> {
    if (params.ids.length === 0) return true;
    if (new Set(params.ids).size !== params.ids.length ||
      params.ids.some((id) => id.trim().length === 0) ||
      params.leasedUntil.getTime() <= params.now.getTime()) {
      throw new Error('Invalid command outbox lease renewal');
    }
    const changed = await runWithSystemDatabaseAccess(
      'command outbox batch lease renewal',
      () => withPrismaWriteRetry(() => this.prisma.$executeRaw`
        UPDATE public."outbox_events"
        SET "leased_until" = ${params.leasedUntil}
        WHERE "id" = ANY(${params.ids}::uuid[])
          AND "message_kind" = 'COMMAND'
          AND "status" = 'PENDING'
          AND "lease_owner" = ${params.leaseOwner}
          AND "leased_until" > clock_timestamp()
      `),
    );
    // A partial renewal is never permission to publish the remaining batch.
    // The lease predicate is evaluated by PostgreSQL at update time, not by
    // a timestamp captured before the request waited for a DB connection.
    return changed === params.ids.length;
  }

  async markPublished(params: {
    readonly id: string;
    readonly leaseOwner: string;
    readonly publishedAt: Date;
  }): Promise<void> {
    const updated = await runWithSystemDatabaseAccess(
      'command outbox publish acknowledgement',
      () => withPrismaWriteRetry(() => this.prisma.$executeRaw`
        UPDATE public."outbox_events"
        SET "status" = 'PUBLISHED',
            "published_at" = ${params.publishedAt},
            "lease_owner" = NULL,
            "leased_until" = NULL,
            "last_error" = NULL
        WHERE "id" = ${params.id}::uuid
          AND "message_kind" = 'COMMAND'
          AND "status" = 'PENDING'
          AND "lease_owner" = ${params.leaseOwner}
          AND "leased_until" > clock_timestamp()
      `),
    );
    assertSingleLeaseUpdate(updated);
  }

  async markFailed(params: {
    readonly id: string;
    readonly leaseOwner: string;
    readonly commandType: string;
    readonly availableAt: Date;
    readonly failedAt: Date;
    readonly lastError: string;
    readonly terminal: boolean;
  }): Promise<void> {
    await runWithSystemDatabaseAccess(
      'command outbox failure acknowledgement',
      () =>
        withPrismaWriteRetry(() =>
          this.prisma.$transaction(
            async (transaction) => {
              const updated = await transaction.$executeRaw`
                UPDATE public."outbox_events"
                SET "status" = (CASE WHEN ${params.terminal} THEN 'FAILED' ELSE 'PENDING' END)::"OutboxStatus",
                    "available_at" = ${params.availableAt},
                    "last_error" = ${params.lastError},
                    "lease_owner" = NULL,
                    "leased_until" = NULL,
                    "published_at" = NULL
                WHERE "id" = ${params.id}::uuid
                  AND "message_kind" = 'COMMAND'
                  AND "status" = 'PENDING'
                  AND "lease_owner" = ${params.leaseOwner}
                  AND "leased_until" > clock_timestamp()
              `;
              assertSingleLeaseUpdate(updated);

              if (
                params.terminal &&
                params.commandType === 'ingestion.scan.execute'
              ) {
                await transaction.scanJob.updateMany({
                  where: {
                    id: params.id,
                    status: 'ENQUEUED',
                  },
                  data: {
                    status: 'FAILED',
                    completedAt: params.failedAt,
                    failureReason: terminalScanDispatchFailureReason(
                      params.lastError,
                    ),
                  },
                });
              }
            },
            { isolationLevel: 'Serializable' },
          ),
        ),
    );
  }
}

const commandEnvelopeFromPrisma = (
  record: PrismaCommandOutboxRecord,
): QueueCommandEnvelope<Readonly<Record<string, unknown>>> => ({
  commandId: record.id,
  commandType: record.eventType,
  schemaVersion: record.schemaVersion,
  correlationId: record.correlationId,
  ...(record.causationId === null
    ? {}
    : { causationId: record.causationId }),
  payload: objectPayload(record.payload),
});

const objectPayload = (
  value: unknown,
): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Command outbox payload must be an object');
  }

  return value as Readonly<Record<string, unknown>>;
};

const assertSingleLeaseUpdate = (count: number): void => {
  if (count !== 1) {
    throw new Error('Command outbox lease ownership was lost');
  }
};

const terminalScanDispatchFailureReason = (lastError: string): string =>
  `Scan command publication exhausted retries: ${lastError}`.slice(0, 500);
