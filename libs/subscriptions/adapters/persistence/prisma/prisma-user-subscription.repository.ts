import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { UserSubscription } from '../../../domain';
import type {
  ListUserSubscriptionsQuery,
  ListUserSubscriptionsResult,
  UserSubscriptionRepositoryPort,
} from '../../../ports';
import type { PrismaSubscriptionsClient } from './prisma-subscriptions-client';
import {
  subscriptionStatusToPrisma,
  userSubscriptionFromPrisma,
} from './prisma-subscriptions-records';

export class PrismaUserSubscriptionRepository implements UserSubscriptionRepositoryPort {
  constructor(private readonly prisma: PrismaSubscriptionsClient) {}

  async save(subscription: UserSubscription): Promise<void> {
    const snapshot = subscription.toSnapshot();

    await withPrismaWriteRetry(() => this.prisma.userSubscription.upsert({
      where: { id: snapshot.id },
      update: {
        userId: snapshot.userId,
        sourceTargetId: snapshot.sourceTargetId,
        status: subscriptionStatusToPrisma(snapshot.status),
        updatedAt: snapshot.updatedAt,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        userId: snapshot.userId,
        sourceTargetId: snapshot.sourceTargetId,
        status: subscriptionStatusToPrisma(snapshot.status),
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    }));
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    subscriptionId: string;
  }): Promise<UserSubscription | null> {
    const record = await this.prisma.userSubscription.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.subscriptionId,
      },
    });

    return record === null ? null : userSubscriptionFromPrisma(record);
  }

  async findByUserAndTarget(
    params: Parameters<UserSubscriptionRepositoryPort['findByUserAndTarget']>[0],
  ): Promise<UserSubscription | null> {
    const record = await this.prisma.userSubscription.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        sourceTargetId: params.sourceTargetId,
      },
    });

    return record === null ? null : userSubscriptionFromPrisma(record);
  }

  async listByUser(query: ListUserSubscriptionsQuery): Promise<ListUserSubscriptionsResult> {
    const offset = parseCursor(query.cursor);
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      userId: query.userId,
    };
    const [records, total] = await Promise.all([
      this.prisma.userSubscription.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.userSubscription.count({ where }),
    ]);
    const nextOffset = offset + records.length;

    return {
      subscriptions: records.map((record) => userSubscriptionFromPrisma(record)),
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
