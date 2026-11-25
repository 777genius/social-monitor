import type { SummaryPolicy } from '../../domain';
import type { SummaryPolicyRepositoryPort } from '../../ports';

export class InMemorySummaryPolicyRepository implements SummaryPolicyRepositoryPort {
  private readonly policiesByInterest = new Map<string, SummaryPolicy>();

  async save(policy: SummaryPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policiesByInterest.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.interestId}`,
      policy,
    );
  }

  async findByInterest(
    params: Parameters<SummaryPolicyRepositoryPort['findByInterest']>[0],
  ): Promise<SummaryPolicy | null> {
    return this.policiesByInterest.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}`) ?? null;
  }

  all(): readonly SummaryPolicy[] {
    return [...this.policiesByInterest.values()];
  }
}
