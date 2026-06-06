import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RecordScanExecutionCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly completedAt: Date;
} & (
  | {
      readonly status: 'succeeded';
    }
  | {
      readonly status: 'failed';
      readonly failureReason: string;
    }
);
