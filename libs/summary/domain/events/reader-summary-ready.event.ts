import type {
  EventEnvelope,
  TenantId,
  WorkspaceId,
} from "@social-monitor/shared-kernel";

import type { ReaderSummaryJobStatus } from "../entities/reader-summary-job";
import type { ReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import type { ReaderSummaryScope } from "../value-objects/reader-summary-scope";

export type ReaderSummaryReadyEventPayload = {
  readonly readerSummaryJobId: string;
  readonly readerSummaryId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly status: Extract<ReaderSummaryJobStatus, "completed" | "no_signal">;
};

export type ReaderSummaryReadyEvent =
  EventEnvelope<ReaderSummaryReadyEventPayload> & {
    readonly eventType: "reader_summary.ready";
    readonly schemaVersion: 1;
  };
