import type { DeliveryAttempt } from '../../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult,
} from '../../../ports';
import type { PrismaDeliveryAttemptWriteData, PrismaDeliveryClient } from './prisma-delivery-client';
import { deliveryAttemptFromPrisma, deliveryAttemptStateToPrisma } from './prisma-delivery-records';

export class PrismaDeliveryAttemptRepository implements DeliveryAttemptRepositoryPort {
  constructor(private readonly prisma: PrismaDeliveryClient) {}

  async save(attempt: DeliveryAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    const data: PrismaDeliveryAttemptWriteData = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      idempotencyKey: snapshot.idempotencyKey,
      channel: snapshot.channel,
      recipientKey: snapshot.recipientKey,
      resourceType: snapshot.resourceType,
      resourceId: snapshot.resourceId,
      state: deliveryAttemptStateToPrisma(snapshot.state),
      queuedAt: snapshot.queuedAt,
      assemblingAt: snapshot.assemblingAt ?? null,
      suppressedAt: snapshot.suppressedAt ?? null,
      sendingAt: snapshot.sendingAt ?? null,
      deliveredAt: snapshot.deliveredAt ?? null,
      failedAt: snapshot.failedAt ?? null,
      deadLetteredAt: snapshot.deadLetteredAt ?? null,
      cancelledAt: snapshot.cancelledAt ?? null,
      retryCount: snapshot.retryCount,
      maxRetries: snapshot.maxRetries,
      failureReason: snapshot.failureReason ?? null,
      suppressionReason: snapshot.suppressionReason ?? null,
    };

    await this.prisma.deliveryAttempt.upsert({
      where: { id: snapshot.id },
      update: data,
      create: {
        id: snapshot.id,
        ...data,
      },
    });
  }

  async findById(params: Parameters<DeliveryAttemptRepositoryPort['findById']>[0]): Promise<DeliveryAttempt | null> {
    const record = await this.prisma.deliveryAttempt.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.deliveryAttemptId,
      },
    });

    return record === null ? null : deliveryAttemptFromPrisma(record);
  }

  async findByIdempotencyKey(
    params: Parameters<DeliveryAttemptRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<DeliveryAttempt | null> {
    const record = await this.prisma.deliveryAttempt.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return record === null ? null : deliveryAttemptFromPrisma(record);
  }

  async findQueued(params: Parameters<DeliveryAttemptRepositoryPort['findQueued']>[0]): Promise<readonly DeliveryAttempt[]> {
    const records = await this.prisma.deliveryAttempt.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        state: { in: ['QUEUED', 'FAILED_RETRYABLE'] },
      },
      orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
      take: params.limit,
    });

    return records.map(deliveryAttemptFromPrisma);
  }

  async list(query: ListDeliveryAttemptsQuery): Promise<ListDeliveryAttemptsResult> {
    const offset = parseCursor(query.cursor);
    const take = Math.max(1, Math.min(query.limit, 100));
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
    };
    const [records, total] = await Promise.all([
      this.prisma.deliveryAttempt.findMany({
        where,
        orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take,
      }),
      this.prisma.deliveryAttempt.count({ where }),
    ]);
    const nextOffset = offset + records.length;

    return {
      attempts: records.map(deliveryAttemptFromPrisma),
      nextCursor: nextOffset < total ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
