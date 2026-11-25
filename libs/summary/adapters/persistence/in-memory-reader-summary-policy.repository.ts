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

  async listScheduled(
    query: Parameters<ReaderSummaryPolicyRepositoryPort["listScheduled"]>[0],
  ): Promise<readonly ReaderSummaryPolicy[]> {
    return [...this.policiesByScope.values()]
      .filter((policy) => {
        const snapshot = policy.toSnapshot();

        return (
          snapshot.schedule.enabled &&
          (query.tenantId === undefined ||
            snapshot.tenantId === query.tenantId) &&
          (query.workspaceId === undefined ||
            snapshot.workspaceId === query.workspaceId)
        );
      })
      .sort((left, right) => {
        const leftSnapshot = left.toSnapshot();
        const rightSnapshot = right.toSnapshot();
        const updatedAtDiff =
          rightSnapshot.updatedAt.getTime() - leftSnapshot.updatedAt.getTime();

        return updatedAtDiff === 0
          ? readerSummaryScopeKey(leftSnapshot.scope).localeCompare(
              readerSummaryScopeKey(rightSnapshot.scope),
            )
          : updatedAtDiff;
      })
      .slice(0, query.limit);
  }

  all(): readonly ReaderSummaryPolicy[] {
    return [...this.policiesByScope.values()];
  }
}
