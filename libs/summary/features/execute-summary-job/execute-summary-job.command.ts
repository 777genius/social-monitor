import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ExecuteSummaryJobCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryJobId: string;
  readonly maxEvidenceItems?: number;
};
