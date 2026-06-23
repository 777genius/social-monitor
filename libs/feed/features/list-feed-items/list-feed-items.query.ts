import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListFeedItemsUseCaseQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
  readonly topicId?: string;
  readonly searchQuery?: string;
  readonly providerKey?: string;
  readonly repositoryTrendWindow?: string;
  readonly repositoryLanguage?: string;
  readonly repositoryTopic?: string;
};
