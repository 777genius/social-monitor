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

  async markPublished(params: {
    readonly id: string;
    readonly leaseOwner: string;
    readonly publishedAt: Date;
  }): Promise<void> {
    const updated = await runWithSystemDatabaseAccess(
      'command outbox publish acknowledgement',
      () => withPrismaWriteRetry(() => this.prisma.outboxEvent.updateMany({
        where: {
          id: params.id,
          status: 'PENDING',
          leaseOwner: params.leaseOwner,
        },
        data: {
          status: 'PUBLISHED',
          publishedAt: params.publishedAt,
          leaseOwner: null,
          leasedUntil: null,
          lastError: null,
        },
      })),
    );
    assertSingleLeaseUpdate(updated.count);
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
              const updated = await transaction.outboxEvent.updateMany({
                where: {
                  id: params.id,
                  status: 'PENDING',
                  leaseOwner: params.leaseOwner,
                },
                data: {
                  status: params.terminal ? 'FAILED' : 'PENDING',
                  availableAt: params.availableAt,
                  lastError: params.lastError,
                  leaseOwner: null,
                  leasedUntil: null,
                  publishedAt: null,
                },
              });
              assertSingleLeaseUpdate(updated.count);

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
