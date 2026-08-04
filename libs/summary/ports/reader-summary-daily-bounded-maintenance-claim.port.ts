import type {
  ReaderSummaryDailyClaimResult,
} from "./reader-summary-daily-execution-cursor.port";

export type ReaderSummaryDailyBoundedMaintenanceClaimResult =
  | ReaderSummaryDailyClaimResult
  | Readonly<{
      kind: "bounded_caught_up";
      nextUnresolvedUtcDate: string;
    }>
  | Readonly<{
      kind: "stale_cursor";
      nextUnresolvedUtcDate: string;
    }>;

export type ReaderSummaryDailyBoundedMaintenanceClaim = Readonly<{
  tenantId: string;
  workspaceId: string;
  workerId: string;
  requestedUtcDate: string;
  invokedAt: string;
}>;

export interface ReaderSummaryDailyBoundedMaintenanceClaimPort {
  claimExactBoundedMaintenance(
    input: ReaderSummaryDailyBoundedMaintenanceClaim,
  ): Promise<ReaderSummaryDailyBoundedMaintenanceClaimResult>;
}
