import type { SummaryFeedback } from '../../../domain';
import type {
  FindSummaryFeedbackByIdempotencyKeyQuery,
  SummaryFeedbackRepositoryPort,
} from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import { summaryFeedbackFromPrisma } from './prisma-summary-records';

export class PrismaSummaryFeedbackRepository implements SummaryFeedbackRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(feedback: SummaryFeedback): Promise<void> {
    const snapshot = feedback.toSnapshot();
    const data = {
      submittedBy: snapshot.submittedBy,
      rating: snapshot.rating,
      category: snapshot.category,
      triageOwner: snapshot.triageOwner,
      eligibleForEvalFixture: snapshot.eligibleForEvalFixture,
      note: snapshot.comment ?? null,
      evidence: snapshot.evidence,
    };

    await this.prisma.summaryFeedback.upsert({
      where: {
        tenantId_idempotencyKey: {
          tenantId: snapshot.tenantId,
          idempotencyKey: snapshot.idempotencyKey,
        },
      },
      update: data,
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        summaryArtifactId: snapshot.summaryId,
        topicId: snapshot.topicId,
        idempotencyKey: snapshot.idempotencyKey,
        createdAt: snapshot.createdAt,
        ...data,
      },
    });
  }

  async findByIdempotencyKey(
    query: FindSummaryFeedbackByIdempotencyKeyQuery,
  ): Promise<SummaryFeedback | null> {
    const record = await this.prisma.summaryFeedback.findFirst({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        idempotencyKey: query.idempotencyKey,
      },
    });

    return record === null ? null : summaryFeedbackFromPrisma(record);
  }
}
