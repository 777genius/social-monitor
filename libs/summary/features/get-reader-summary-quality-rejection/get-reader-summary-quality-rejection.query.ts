import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type GetReaderSummaryQualityRejectionQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryJobId: string;
};
