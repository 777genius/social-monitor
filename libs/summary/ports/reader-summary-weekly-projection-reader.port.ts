import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { PersistedReaderSummaryWeeklyArtifact } from "./reader-summary-artifact-repository.port";

export type ReadReaderSummaryWeeklyProjectionQuery = Readonly<{
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  weekStartedOn: string;
  weekEndedOn: string;
}>;

export type ReaderSummaryWeeklyEvidenceLimitation = Readonly<{
  requestedUtcDate: string;
  providerKey: "github-trending-page";
  evidenceState: "historical_unavailable";
}>;

export type ReaderSummaryWeeklyProjectionRead = Readonly<{
  certifiedDailyEvidenceDates: readonly string[];
  activeWeeklyCertifiedArtifactPresent: boolean;
  evidenceLimitations: readonly ReaderSummaryWeeklyEvidenceLimitation[];
  artifact: PersistedReaderSummaryWeeklyArtifact | null;
}>;

export interface ReaderSummaryWeeklyProjectionReaderPort {
  read(
    query: ReadReaderSummaryWeeklyProjectionQuery,
  ): Promise<ReaderSummaryWeeklyProjectionRead>;
}
