import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type UpdateTopicCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly name: string;
  readonly query: string;
};
