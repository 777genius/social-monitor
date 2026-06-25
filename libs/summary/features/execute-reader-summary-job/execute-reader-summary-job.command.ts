import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type ExecuteReaderSummaryJobCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryJobId: string;
  readonly maxEvidenceItems?: number;
};
