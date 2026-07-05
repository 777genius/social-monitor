import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { FeedItem } from "../domain";

export const FEED_ITEM_READ_REPOSITORY = Symbol("FEED_ITEM_READ_REPOSITORY");

export type ListFeedItemsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
  readonly interestId?: string;
  readonly searchQuery?: string;
  readonly observedAfter?: Date;
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

export interface FeedItemReadRepositoryPort {
  list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult>;
  findById(query: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    feedItemId: string;
  }): Promise<FeedItem | null>;
}
