import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryScheduleReadyAtUtc,
  ScheduledReaderSummaryCadence,
} from "../../domain";

export type PeriodicReaderSummaryContinuation = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly day: string;
  readonly policyId: string;
  /** Absent once this policy has been fully visited. */
  readonly cadence?: ScheduledReaderSummaryCadence;
  readonly periodDay?: string;
};

export type SchedulePeriodicReaderSummariesCommand = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly now: Date;
  readonly limit: number;
  readonly correlationId: string;
  readonly readyAtUtc?: ReaderSummaryScheduleReadyAtUtc;
  readonly continuation?: PeriodicReaderSummaryContinuation;
};
