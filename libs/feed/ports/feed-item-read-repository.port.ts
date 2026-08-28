import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  FeedItem,
  FeedPromotionEligibility,
} from "../domain";

export const FEED_ITEM_READ_REPOSITORY = Symbol("FEED_ITEM_READ_REPOSITORY");

export type FeedItemWindowTimestampPolicy = "published_at" | "observed_at";
export const MAX_FEED_ITEM_PAGE_LIMIT = 200;
export const PROMOTION_PHYSICAL_ROW_CEILING = 100_000;
export const PROMOTION_ELIGIBLE_ITEM_CEILING = 1_000;

export type ListFeedItemsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
  readonly interestId?: string;
  readonly searchQuery?: string;
  readonly observedAfter?: Date;
  readonly observedAtOrAfter?: Date;
  readonly observedAtOrBefore?: Date;
  readonly observedBefore?: Date;
  readonly publishedAtOrAfter?: Date;
  readonly publishedBefore?: Date;
  readonly providerKey?: string;
  readonly repositoryTrendWindow?: string;
  readonly repositoryLanguage?: string;
  readonly repositoryTopic?: string;
};

export type ListFeedItemsResult = {
  readonly items: readonly FeedItem[];
  readonly nextCursor?: string;
};

export type ListFeedItemSignalCandidatesQuery = Omit<
  ListFeedItemsQuery,
  "limit" | "cursor"
>;

export type FindLatestFeedItemSignalQuery = Omit<
  ListFeedItemSignalCandidatesQuery,
  | "searchQuery"
  | "repositoryTrendWindow"
  | "repositoryLanguage"
  | "repositoryTopic"
>;

export type ReadPromotionFeedItemSnapshotQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId?: string;
  readonly timestampPolicy: FeedItemWindowTimestampPolicy;
  readonly windowStartedAt: Date;
  readonly windowEndedAt: Date;
  readonly observedThrough: Date;
};

export type PromotionFeedItemCandidate = {
  readonly item: FeedItem;
  readonly canonical: Extract<FeedPromotionEligibility, { eligible: true }>;
  readonly exactTimestamps?: {
    readonly publishedAt: string;
    readonly observedAt: string;
  };
};

export type PromotionFeedItemSnapshotResult =
  | {
      readonly ok: true;
      readonly candidates: readonly PromotionFeedItemCandidate[];
      /** Context gathered by the same bounded MVCC scan, never a second read. */
      readonly supplementalItems?: readonly FeedItem[];
      /** Mutable source bodies captured inside the same authoritative snapshot. */
      readonly sourceContent: readonly FeedSourceContentItem[];
      readonly physicalRowsRead: number;
      readonly exhausted: true;
    }
  | {
      readonly ok: false;
      readonly reason: "physical_row_ceiling_exceeded" |
        "eligible_item_ceiling_exceeded";
      readonly physicalRowsRead: number;
      readonly eligibleItemCount: number;
      readonly exhausted: boolean;
    };

export interface PromotionFeedItemSnapshotRepositoryPort {
  readPromotionSnapshot(
    query: ReadPromotionFeedItemSnapshotQuery,
  ): Promise<PromotionFeedItemSnapshotResult>;
}

export const assertValidFeedItemListQuery = (
  query: ListFeedItemsQuery,
): void => {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 ||
      query.limit > MAX_FEED_ITEM_PAGE_LIMIT) {
    throw new Error(
      `Feed item page limit must be a safe integer between 1 and ${MAX_FEED_ITEM_PAGE_LIMIT}`,
    );
  }
  if (query.observedAfter !== undefined &&
      query.observedAtOrAfter !== undefined) {
    throw new Error(
      "Feed item observation window cannot mix exclusive and inclusive starts",
    );
  }
};

export type FeedSourceContentItem = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly body: string;
};

export interface FeedItemReadRepositoryPort {
  list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult>;
  /**
   * Returns the bounded recent candidate window before provider-signal
   * ordering so application-layer cohort normalization can rank across
   * sources without losing niche candidates to raw-metric scale differences.
   */
  listSignalCandidates?(
    query: ListFeedItemSignalCandidatesQuery,
  ): Promise<readonly FeedItem[]>;
  /** Returns the newest matching signal without hydrating the bounded cohort. */
  findLatestSignalCandidate?(
    query: FindLatestFeedItemSignalQuery,
  ): Promise<FeedItem | null>;
  readPromotionSnapshot?(
    query: ReadPromotionFeedItemSnapshotQuery,
  ): Promise<PromotionFeedItemSnapshotResult>;
  findById(query: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    feedItemId: string;
    observedBefore?: Date;
    observedAtOrBefore?: Date;
  }): Promise<FeedItem | null>;
  readSourceContent?(query: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly feedItemIds: readonly string[];
    readonly observedBefore?: Date;
    readonly observedAtOrBefore?: Date;
  }): Promise<readonly FeedSourceContentItem[]>;
}
