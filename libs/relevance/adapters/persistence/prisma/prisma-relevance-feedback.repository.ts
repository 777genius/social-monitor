import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { RelevanceFeedbackSignal } from '../../../domain';
import type { RelevanceFeedbackRepositoryPort } from '../../../ports';
import type { PrismaRelevanceClient } from './prisma-relevance-client';
import { relevanceFeedbackSignalFromPrisma } from './prisma-relevance-records';

export class PrismaRelevanceFeedbackRepository implements RelevanceFeedbackRepositoryPort {
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
}
