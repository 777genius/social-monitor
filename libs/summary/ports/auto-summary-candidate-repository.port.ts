import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type AutoSummaryCandidate = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly latestFeedItemObservedAt: Date;
  readonly newFeedItemCount: number;
  readonly latestSummaryRequestedAt?: Date;
};

export interface AutoSummaryCandidateRepositoryPort {
  findDueCandidates(params: {
    readonly tenantId?: TenantId;
    readonly workspaceId?: WorkspaceId;
    readonly latestFeedItemObservedBefore: Date;
    readonly limit: number;
  }): Promise<readonly AutoSummaryCandidate[]>;
}
