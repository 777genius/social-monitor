import type { SummaryFeedback } from '../../domain';
import type { SummaryFeedbackRepositoryPort } from '../../ports';

export class InMemorySummaryFeedbackRepository implements SummaryFeedbackRepositoryPort {
  private readonly feedbackById = new Map<string, SummaryFeedback>();
  private readonly feedbackByIdempotencyKey = new Map<string, SummaryFeedback>();

  async save(feedback: SummaryFeedback): Promise<void> {
    const snapshot = feedback.toSnapshot();
    this.feedbackById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, feedback);
    this.feedbackByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      feedback,
    );
  }

  async findByIdempotencyKey(
    query: Parameters<SummaryFeedbackRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<SummaryFeedback | null> {
    return this.feedbackByIdempotencyKey.get(
      `${query.tenantId}:${query.workspaceId}:${query.idempotencyKey}`,
    ) ?? null;
  }

  all(): readonly SummaryFeedback[] {
    return [...this.feedbackById.values()];
  }
}
