import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ExecuteBriefingJobCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly briefingJobId: string;
  readonly maxEvidenceItems?: number;
};
