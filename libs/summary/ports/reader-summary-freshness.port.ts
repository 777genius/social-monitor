import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  ReaderSummarySourceWindow,
} from "../domain";

export type ReaderSummaryFreshness =
  | {
      readonly status: "fresh";
      readonly checkedAt: Date;
    }
  | {
      readonly status: "stale";
      readonly checkedAt: Date;
      readonly staleMarkedAt: Date;
      readonly reason:
        | "new_evidence_after_window"
        | "interest_bindings_changed"
        | "reader_summary_policy_changed"
        | "ranking_policy_changed";
      readonly newestFeedItemId?: string;
      readonly newestObservedAt?: Date;
    };

export interface ReaderSummaryFreshnessProbePort {
  evaluate(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly scope: ReaderSummaryScope;
    readonly sourceWindow: ReaderSummarySourceWindow;
    readonly period?: ReaderSummaryPeriod;
    readonly observedThrough?: Date;
  }): Promise<ReaderSummaryFreshness>;
}
