import type { RelevanceFeedbackSignal } from '../../domain';
import type { RelevanceFeedbackRepositoryPort } from '../../ports';

export class InMemoryRelevanceFeedbackRepository implements RelevanceFeedbackRepositoryPort {
  private readonly feedbackByIdempotencyKey = new Map<string, RelevanceFeedbackSignal>();

  async save(feedback: RelevanceFeedbackSignal): Promise<void> {
    const snapshot = feedback.toSnapshot();

    this.feedbackByIdempotencyKey.set(this.key({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      idempotencyKey: snapshot.idempotencyKey,
    }), feedback);
  }

  async findByIdempotencyKey(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  }): Promise<RelevanceFeedbackSignal | null> {
    return this.feedbackByIdempotencyKey.get(this.key(params)) ?? null;
  }

  all(): readonly RelevanceFeedbackSignal[] {
    return [...this.feedbackByIdempotencyKey.values()];
  }

  private key(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  }): string {
    return [
      params.tenantId,
      params.workspaceId,
      params.idempotencyKey.trim(),
    ].join(':');
  }
}
