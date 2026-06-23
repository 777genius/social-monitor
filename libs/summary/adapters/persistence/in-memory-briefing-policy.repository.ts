import { briefingScopeKey, type BriefingPolicy } from '../../domain';
import type { BriefingPolicyRepositoryPort } from '../../ports';

export class InMemoryBriefingPolicyRepository implements BriefingPolicyRepositoryPort {
  private readonly policiesByScope = new Map<string, BriefingPolicy>();

  async save(policy: BriefingPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policiesByScope.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${briefingScopeKey(snapshot.scope)}`,
      policy,
    );
  }

  async findByScope(
    params: Parameters<BriefingPolicyRepositoryPort['findByScope']>[0],
  ): Promise<BriefingPolicy | null> {
    return this.policiesByScope.get(
      `${params.tenantId}:${params.workspaceId}:${briefingScopeKey(params.scope)}`,
    ) ?? null;
  }

  all(): readonly BriefingPolicy[] {
    return [...this.policiesByScope.values()];
  }
}
