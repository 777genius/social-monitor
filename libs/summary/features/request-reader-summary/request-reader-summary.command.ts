import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryCadence,
  ReaderSummaryPeriodInput,
  ReaderSummaryScope,
} from "../../domain";

export type RequestReaderSummaryCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly cadence?: ReaderSummaryCadence;
  readonly period?: ReaderSummaryPeriodInput;
  readonly timezone?: string;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
