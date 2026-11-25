import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { UserSubscriptionSchedule } from '../../../domain';
import type { UserSubscriptionScheduleRepositoryPort } from '../../../ports';
import type { PrismaSubscriptionsClient } from './prisma-subscriptions-client';
import {
  scheduleStatusToPrisma,
  userSubscriptionScheduleFromPrisma,
} from './prisma-subscriptions-records';

export class PrismaUserSubscriptionScheduleRepository implements UserSubscriptionScheduleRepositoryPort {
  constructor(private readonly prisma: PrismaSubscriptionsClient) {}

  async save(schedule: UserSubscriptionSchedule): Promise<void> {
    const snapshot = schedule.toSnapshot();

    await withPrismaWriteRetry(() => this.prisma.userSubscriptionSchedule.upsert({
      where: { id: snapshot.id },
      update: {
        recipientKey: snapshot.recipientKey,
        channel: snapshot.channel,
        intervalSeconds: snapshot.intervalSeconds,
        includeNoSignal: snapshot.includeNoSignal,
        nextRunAt: snapshot.nextRunAt,
        status: scheduleStatusToPrisma(snapshot.status),
        updatedAt: snapshot.updatedAt,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        subscriptionId: snapshot.subscriptionId,
        recipientKey: snapshot.recipientKey,
        channel: snapshot.channel,
        intervalSeconds: snapshot.intervalSeconds,
        includeNoSignal: snapshot.includeNoSignal,
        nextRunAt: snapshot.nextRunAt,
        status: scheduleStatusToPrisma(snapshot.status),
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    }));
  }

  async findBySubscription(
    params: Parameters<UserSubscriptionScheduleRepositoryPort['findBySubscription']>[0],
  ): Promise<UserSubscriptionSchedule | null> {
    const record = await this.prisma.userSubscriptionSchedule.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        subscriptionId: params.subscriptionId,
      },
    });

    return record === null ? null : userSubscriptionScheduleFromPrisma(record);
  }
}
