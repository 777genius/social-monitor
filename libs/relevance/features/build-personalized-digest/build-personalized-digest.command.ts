import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type BuildPersonalizedDigestCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly topicIds: readonly string[];
  readonly windowStartedAt: Date;
  readonly windowEndedAt: Date;
  readonly limit: number;
};
