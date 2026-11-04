import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type FeedCollectionCoverageQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId?: string;
  readonly publishedAtOrAfter: Date;
  readonly publishedBefore: Date;
  readonly observedAtOrBefore?: Date;
  readonly excludedProviderKeys: readonly string[];
};

/** Complete database aggregates, independent of the bounded ranking window. */
export type FeedCollectionCoverageRow = {
  readonly dimension: "total" | "provider" | "topic" | "query";
  readonly key: string;
  readonly label?: string;
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
};
