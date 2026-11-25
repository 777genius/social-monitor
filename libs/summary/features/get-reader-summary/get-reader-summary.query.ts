import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type GetReaderSummaryQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryId: string;
};
