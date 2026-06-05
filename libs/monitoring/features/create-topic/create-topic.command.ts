import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type CreateTopicCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly query: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
