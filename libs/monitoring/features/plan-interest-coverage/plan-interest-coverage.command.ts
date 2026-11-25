import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type PlanInterestCoverageCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly description?: string;
  readonly sourcePackKey?: string;
  readonly keywords?: readonly string[];
  readonly subreddits?: readonly string[];
  readonly rssFeedUrls?: readonly string[];
  readonly includeProviders?: readonly string[];
  readonly excludeProviders?: readonly string[];
};
