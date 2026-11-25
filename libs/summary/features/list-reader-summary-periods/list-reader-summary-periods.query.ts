import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryCadence, ReaderSummaryScope } from "../../domain";

export type ListReaderSummaryPeriodsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope?: ReaderSummaryScope;
  readonly cadence?: ReaderSummaryCadence;
  readonly periodStartedAt?: Date;
  readonly periodStartedFrom?: Date;
  readonly periodStartedBefore?: Date;
  readonly periodEndedAt?: Date;
  readonly timezone?: string;
  readonly limit: number;
  readonly cursor?: string;
};
