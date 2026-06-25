import { readerSummaryScopeKey, type ReaderSummaryPolicy } from "../../domain";
import type { ReaderSummaryPolicyRepositoryPort } from "../../ports";

export class InMemoryReaderSummaryPolicyRepository implements ReaderSummaryPolicyRepositoryPort {
  private readonly policiesByScope = new Map<string, ReaderSummaryPolicy>();

  async save(policy: ReaderSummaryPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policiesByScope.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${readerSummaryScopeKey(snapshot.scope)}`,
      policy,
    );
  }

  async findByScope(
    params: Parameters<ReaderSummaryPolicyRepositoryPort["findByScope"]>[0],
  ): Promise<ReaderSummaryPolicy | null> {
    return (
      this.policiesByScope.get(
        `${params.tenantId}:${params.workspaceId}:${readerSummaryScopeKey(params.scope)}`,
      ) ?? null
    );
  }

  all(): readonly ReaderSummaryPolicy[] {
    return [...this.policiesByScope.values()];
  }
}
