import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryScope } from "../../domain";

export type ListReaderSummariesQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope?: ReaderSummaryScope;
  readonly limit: number;
  readonly cursor?: string;
};
