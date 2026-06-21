import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { UserSummaryPreference } from '../../../domain';
import type { UserSummaryPreferenceRepositoryPort } from '../../../ports';
import type { PrismaSubscriptionsClient } from './prisma-subscriptions-client';
import { userSummaryPreferenceFromPrisma } from './prisma-subscriptions-records';

export class PrismaUserSummaryPreferenceRepository implements UserSummaryPreferenceRepositoryPort {
  constructor(private readonly prisma: PrismaSubscriptionsClient) {}

  async save(preference: UserSummaryPreference): Promise<void> {
    const snapshot = preference.toSnapshot();

    await withPrismaWriteRetry(() => this.prisma.userSummaryPreference.upsert({
      where: { id: snapshot.id },
      update: {
        language: snapshot.language ?? null,
        format: snapshot.format ?? null,
        tone: snapshot.tone ?? null,
        maxKeyPoints: snapshot.maxKeyPoints ?? null,
        includeRisks: snapshot.includeRisks ?? null,
        includeSourceHighlights: snapshot.includeSourceHighlights ?? null,
        customInstructions: snapshot.customInstructions ?? null,
        rulesVersion: snapshot.rulesVersion,
        updatedAt: snapshot.updatedAt,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        userId: snapshot.userId,
        subscriptionId: snapshot.subscriptionId ?? null,
        topicId: snapshot.topicId ?? null,
        language: snapshot.language ?? null,
        format: snapshot.format ?? null,
        tone: snapshot.tone ?? null,
        maxKeyPoints: snapshot.maxKeyPoints ?? null,
        includeRisks: snapshot.includeRisks ?? null,
        includeSourceHighlights: snapshot.includeSourceHighlights ?? null,
        customInstructions: snapshot.customInstructions ?? null,
        rulesVersion: snapshot.rulesVersion,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    }));
  }

  async findBySubscription(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findBySubscription']>[0],
  ): Promise<UserSummaryPreference | null> {
    const record = await this.prisma.userSummaryPreference.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        subscriptionId: params.subscriptionId,
      },
    });

    return record === null ? null : userSummaryPreferenceFromPrisma(record);
  }

  async findByTopic(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findByTopic']>[0],
  ): Promise<UserSummaryPreference | null> {
    const record = await this.prisma.userSummaryPreference.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        topicId: params.topicId,
      },
    });

    return record === null ? null : userSummaryPreferenceFromPrisma(record);
  }

  async findEffective(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findEffective']>[0],
  ): Promise<UserSummaryPreference | null> {
    if (params.subscriptionId !== undefined) {
      const subscriptionPreference = await this.findBySubscription({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        subscriptionId: params.subscriptionId,
      });

      if (subscriptionPreference !== null) {
        return subscriptionPreference;
      }
    }

    return this.findByTopic({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      topicId: params.topicId,
    });
  }
}
