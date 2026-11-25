import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type {
  RelevanceFeedbackLearningStorePort,
  RelevanceFeedbackLearningUnitOfWorkPort,
} from '../../../ports';
import type {
  PrismaRelevanceClient,
  PrismaRelevanceTransactionClient,
} from './prisma-relevance-client';
import {
  relevanceFeedbackSignalFromPrisma,
  userRelevanceProfileFromPrisma,
} from './prisma-relevance-records';

export class PrismaRelevanceFeedbackLearningStore implements RelevanceFeedbackLearningStorePort {
  constructor(private readonly prisma: PrismaRelevanceClient) {}

  async runLearningTransaction<TValue>(
    operation: (unitOfWork: RelevanceFeedbackLearningUnitOfWorkPort) => Promise<TValue>,
  ): Promise<TValue> {
    return withPrismaWriteRetry(() => this.prisma.$transaction(
      (client) => operation(new PrismaRelevanceFeedbackLearningUnitOfWork(client)),
      { isolationLevel: 'Serializable' },
    ));
  }
}

class PrismaRelevanceFeedbackLearningUnitOfWork implements RelevanceFeedbackLearningUnitOfWorkPort {
  constructor(private readonly prisma: PrismaRelevanceTransactionClient) {}

  async saveFeedback(feedback: Parameters<RelevanceFeedbackLearningUnitOfWorkPort['saveFeedback']>[0]): Promise<void> {
    const snapshot = feedback.toSnapshot();

    await this.prisma.relevanceFeedbackSignal.upsert({
      where: {
        tenantId_workspaceId_idempotencyKey: {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          idempotencyKey: snapshot.idempotencyKey,
        },
      },
      update: {},
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        userId: snapshot.userId,
        idempotencyKey: snapshot.idempotencyKey,
        action: snapshot.action,
        rating: snapshot.rating ?? null,
        target: snapshot.target,
        createdAt: snapshot.createdAt,
      },
    });
  }

  async saveMemoryProjection(
    projection: Parameters<RelevanceFeedbackLearningUnitOfWorkPort['saveMemoryProjection']>[0],
  ): Promise<void> {
    const snapshot = projection.toSnapshot();

    await this.prisma.relevanceMemoryProjection.upsert({
      where: {
        tenantId_workspaceId_feedbackId: {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          feedbackId: snapshot.feedbackId,
        },
      },
      update: {},
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        feedbackId: snapshot.feedbackId,
        userId: snapshot.userId,
        idempotencyKey: snapshot.idempotencyKey,
        action: snapshot.action,
        rating: snapshot.rating ?? null,
        target: snapshot.target,
        learningDirection: snapshot.learningDirection,
        status: snapshot.status,
        retryCount: snapshot.retryCount,
        nextAttemptAt: snapshot.nextAttemptAt,
        projectedAt: snapshot.projectedAt ?? null,
        lastError: snapshot.lastError ?? null,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    });
  }

  async saveProfile(profile: Parameters<RelevanceFeedbackLearningUnitOfWorkPort['saveProfile']>[0]): Promise<void> {
    const snapshot = profile.toSnapshot();
    const mutation = {
      interestWeights: snapshot.interestWeights,
      sourceWeights: snapshot.sourceWeights,
      keywordWeights: snapshot.keywordWeights,
      mutedKeywords: snapshot.mutedKeywords,
      blockedProviderKeys: snapshot.blockedProviderKeys,
      rulesVersion: snapshot.rulesVersion,
      updatedAt: snapshot.updatedAt,
    };

    await this.prisma.userRelevanceProfile.upsert({
      where: {
        tenantId_workspaceId_userId: {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          userId: snapshot.userId,
        },
      },
      update: mutation,
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        userId: snapshot.userId,
        ...mutation,
        createdAt: snapshot.createdAt,
      },
    });
  }

  async findFeedbackByIdempotencyKey(
    params: Parameters<RelevanceFeedbackLearningUnitOfWorkPort['findFeedbackByIdempotencyKey']>[0],
  ) {
    const record = await this.prisma.relevanceFeedbackSignal.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return record === null ? null : relevanceFeedbackSignalFromPrisma(record);
  }

  async findProfileByUser(
    params: Parameters<RelevanceFeedbackLearningUnitOfWorkPort['findProfileByUser']>[0],
  ) {
    const record = await this.prisma.userRelevanceProfile.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
      },
    });

    return record === null ? null : userRelevanceProfileFromPrisma(record);
  }
}
