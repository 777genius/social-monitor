import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryScope } from "../../domain";

export type ListReaderSummaryTopicRecommendationsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope?: ReaderSummaryScope;
  readonly windowDays: number;
  readonly limit: number;
};
