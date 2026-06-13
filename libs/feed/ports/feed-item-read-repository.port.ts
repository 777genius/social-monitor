import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { FeedItem } from '../domain';

export const FEED_ITEM_READ_REPOSITORY = Symbol('FEED_ITEM_READ_REPOSITORY');

export type ListFeedItemsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
  readonly topicId?: string;
  readonly searchQuery?: string;
  readonly observedAfter?: Date;
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
