import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { FeedItem } from '../domain';

export type ListFeedItemsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListFeedItemsResult = {
  readonly items: readonly FeedItem[];
  readonly nextCursor?: string;
};

export interface FeedItemReadRepositoryPort {
  list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult>;
}
