import type { SummaryPolicy } from '../../domain';
import type { SummaryPolicyRepositoryPort } from '../../ports';

export class InMemorySummaryPolicyRepository implements SummaryPolicyRepositoryPort {
  private readonly policiesByTopic = new Map<string, SummaryPolicy>();

  async save(policy: SummaryPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policiesByTopic.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.topicId}`,
      policy,
    );
  }

  async findByTopic(
    params: Parameters<SummaryPolicyRepositoryPort['findByTopic']>[0],
  ): Promise<SummaryPolicy | null> {
    return this.policiesByTopic.get(`${params.tenantId}:${params.workspaceId}:${params.topicId}`) ?? null;
  }
}
