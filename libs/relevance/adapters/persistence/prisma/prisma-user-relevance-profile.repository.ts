import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { UserRelevanceProfile } from '../../../domain';
import type { UserRelevanceProfileRepositoryPort } from '../../../ports';
import type { PrismaRelevanceClient } from './prisma-relevance-client';
import { userRelevanceProfileFromPrisma } from './prisma-relevance-records';

export class PrismaUserRelevanceProfileRepository implements UserRelevanceProfileRepositoryPort {
  constructor(private readonly prisma: PrismaRelevanceClient) {}

  async save(profile: UserRelevanceProfile): Promise<void> {
    const snapshot = profile.toSnapshot();
    const mutation = {
      topicWeights: snapshot.topicWeights,
      sourceWeights: snapshot.sourceWeights,
      keywordWeights: snapshot.keywordWeights,
      mutedKeywords: snapshot.mutedKeywords,
      blockedProviderKeys: snapshot.blockedProviderKeys,
      rulesVersion: snapshot.rulesVersion,
      updatedAt: snapshot.updatedAt,
    };

    await withPrismaWriteRetry(() => this.prisma.userRelevanceProfile.upsert({
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
    }));
  }

  async findByUser(
    params: Parameters<UserRelevanceProfileRepositoryPort['findByUser']>[0],
  ): Promise<UserRelevanceProfile | null> {
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
