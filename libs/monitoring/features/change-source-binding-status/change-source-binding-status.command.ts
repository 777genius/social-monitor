import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBindingStatus } from '../../domain';

export type ChangeSourceBindingStatusCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly sourceBindingId: string;
  readonly status: SourceBindingStatus;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
