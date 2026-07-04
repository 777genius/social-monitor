import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import {
  createPostRating,
  postRatingRecordFromFeedbackSignal,
  postRatingTargetKey,
  postRatingTargetsMatch,
  type PostRating,
  type PostRatingRecord,
  type RelevanceFeedbackSignal,
} from '../../../domain';
import type {
  PostRatingProjectionPort,
  PostRatingRepositoryPort,
  RelevanceFeedbackRepositoryPort,
} from '../../../ports';
import type { PrismaRelevanceClient } from './prisma-relevance-client';
import { relevanceFeedbackSignalFromPrisma } from './prisma-relevance-records';

export class PrismaRelevanceFeedbackRepository implements
  RelevanceFeedbackRepositoryPort,
  PostRatingProjectionPort,
  PostRatingRepositoryPort {
  constructor(private readonly prisma: PrismaRelevanceClient) {}

  async save(feedback: RelevanceFeedbackSignal): Promise<void> {
    const snapshot = feedback.toSnapshot();

    await withPrismaWriteRetry(() => this.prisma.relevanceFeedbackSignal.upsert({
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
    }));
  }

  async findByIdempotencyKey(
    params: Parameters<RelevanceFeedbackRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<RelevanceFeedbackSignal | null> {
    const record = await this.prisma.relevanceFeedbackSignal.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return record === null ? null : relevanceFeedbackSignalFromPrisma(record);
  }

  async findPostRatingByIdempotencyKey(
    params: Parameters<PostRatingRepositoryPort['findPostRatingByIdempotencyKey']>[0],
  ): Promise<PostRatingRecord | null> {
    const signal = await this.findByIdempotencyKey(params);

    return signal === null ? null : postRatingRecordFromFeedbackSignal(signal);
  }

  async savePostRating(record: PostRatingRecord): Promise<void> {
    await withPrismaWriteRetry(() => this.prisma.relevanceFeedbackSignal.upsert({
      where: {
        tenantId_workspaceId_idempotencyKey: {
          tenantId: record.tenantId,
          workspaceId: record.workspaceId,
          idempotencyKey: record.idempotencyKey,
        },
      },
      update: {},
      create: {
        id: record.feedbackId,
        tenantId: record.tenantId,
        workspaceId: record.workspaceId,
        userId: record.userId,
        idempotencyKey: record.idempotencyKey,
        action: 'rate_post',
        rating: record.rating,
        target: {
          ...record.target,
          postRatingReason: record.reason,
        },
        createdAt: record.ratedAt,
      },
    }));
  }

  async listLatestByTargets(params: Parameters<PostRatingProjectionPort['listLatestByTargets']>[0]): Promise<readonly PostRating[]> {
    const targets = params.targets.map((target) => ({
      key: postRatingTargetKey(target),
      target,
    }));
    if (targets.length === 0) {
      return [];
    }

    const records = await this.prisma.relevanceFeedbackSignal.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        action: 'rate_post',
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: Math.min(Math.max(targets.length * 20, 100), 2000),
    });
    const latestByTargetKey = new Map<string, PostRating>();

    for (const record of records) {
      const signal = relevanceFeedbackSignalFromPrisma(record);
      const snapshot = signal.toSnapshot();
      if (snapshot.rating === undefined) {
        continue;
      }

      for (const target of targets) {
        if (latestByTargetKey.has(target.key) || !postRatingTargetsMatch(target.target, snapshot.target)) {
          continue;
        }

        latestByTargetKey.set(target.key, createPostRating({
          feedbackId: snapshot.id,
          userId: snapshot.userId,
          rating: snapshot.rating,
          reason: snapshot.target.postRatingReason,
          target: {
            feedItemId: snapshot.target.feedItemId,
            sourceItemId: snapshot.target.sourceItemId,
            interestId: snapshot.target.interestId,
          },
          ratedAt: snapshot.createdAt,
        }));
      }
    }

    return [...latestByTargetKey.values()];
  }
}
