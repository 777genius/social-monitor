import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from '@social-monitor/platform-persistence';

import type { RelevanceMemoryProjection } from '../../../domain';
import type { RelevanceMemoryProjectionRepositoryPort } from '../../../ports';
import type {
  PrismaRelevanceClient,
  PrismaRelevanceMemoryProjectionMutation,
} from './prisma-relevance-client';
import { relevanceMemoryProjectionFromPrisma } from './prisma-relevance-records';

export class PrismaRelevanceMemoryProjectionRepository implements RelevanceMemoryProjectionRepositoryPort {
  constructor(private readonly prisma: PrismaRelevanceClient) {}

  async save(projection: RelevanceMemoryProjection): Promise<void> {
    const snapshot = projection.toSnapshot();
    const mutation: PrismaRelevanceMemoryProjectionMutation = {
      status: snapshot.status,
      retryCount: snapshot.retryCount,
      nextAttemptAt: snapshot.nextAttemptAt,
      projectedAt: snapshot.projectedAt ?? null,
      lastError: snapshot.lastError ?? null,
      updatedAt: snapshot.updatedAt,
    };

    await withPrismaWriteRetry(() => this.prisma.relevanceMemoryProjection.upsert({
      where: {
        tenantId_workspaceId_feedbackId: {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          feedbackId: snapshot.feedbackId,
        },
      },
      update: mutation,
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
        createdAt: snapshot.createdAt,
        ...mutation,
      },
    }));
  }

  async findDue(
    params: Parameters<RelevanceMemoryProjectionRepositoryPort['findDue']>[0],
  ): Promise<readonly RelevanceMemoryProjection[]> {
    if ((params.tenantId === undefined) !== (params.workspaceId === undefined)) {
      throw new Error('Relevance projection due scope must include tenant and workspace together');
    }
    const findDue = () =>
      this.prisma.relevanceMemoryProjection.findMany({
        where: {
          status: { in: ['pending', 'failed'] },
          nextAttemptAt: { lte: params.now },
          ...(params.tenantId === undefined ? {} : { tenantId: params.tenantId }),
          ...(params.workspaceId === undefined ? {} : { workspaceId: params.workspaceId }),
        },
        orderBy: [
          { nextAttemptAt: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        take: Math.max(0, params.limit),
      });
    const records =
      params.tenantId === undefined
        ? await runWithSystemDatabaseAccess(
          'cross-tenant relevance projection scheduler',
          findDue,
        )
        : await findDue();

    return records.map(relevanceMemoryProjectionFromPrisma);
  }
}
