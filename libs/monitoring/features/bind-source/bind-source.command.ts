import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type BindSourceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly providerKey: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
