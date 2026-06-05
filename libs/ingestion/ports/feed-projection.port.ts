import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceItem } from '../domain';

export type ProjectFeedItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly sourceItems: readonly SourceItem[];
};

export type ProjectFeedItemsResult = {
  readonly projected: number;
};

export interface FeedProjectionPort {
  project(command: ProjectFeedItemsCommand): Promise<ProjectFeedItemsResult>;
}
