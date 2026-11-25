import type { RelevanceMemoryProjection } from '../../domain';
import type { RelevanceMemoryProjectionRepositoryPort } from '../../ports';

export class InMemoryRelevanceMemoryProjectionRepository implements RelevanceMemoryProjectionRepositoryPort {
  private readonly projections = new Map<string, RelevanceMemoryProjection>();

  async save(projection: RelevanceMemoryProjection): Promise<void> {
    const snapshot = projection.toSnapshot();

    this.projections.set(snapshot.feedbackId, projection);
  }

  async findDue(params: Parameters<RelevanceMemoryProjectionRepositoryPort['findDue']>[0]): Promise<readonly RelevanceMemoryProjection[]> {
    return [...this.projections.values()]
      .filter((projection) => {
        const snapshot = projection.toSnapshot();

        return (snapshot.status === 'pending' || snapshot.status === 'failed') &&
          snapshot.nextAttemptAt.getTime() <= params.now.getTime() &&
          (params.tenantId === undefined || snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined || snapshot.workspaceId === params.workspaceId);
      })
      .sort((left, right) => {
        const leftSnapshot = left.toSnapshot();
        const rightSnapshot = right.toSnapshot();

        return leftSnapshot.nextAttemptAt.getTime() - rightSnapshot.nextAttemptAt.getTime() ||
          leftSnapshot.createdAt.getTime() - rightSnapshot.createdAt.getTime() ||
          leftSnapshot.id.localeCompare(rightSnapshot.id);
      })
      .slice(0, Math.max(0, params.limit));
  }

  all(): readonly RelevanceMemoryProjection[] {
    return [...this.projections.values()];
  }
}
