import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryGitHubProjectionItem } from "../domain";

export type ReadReaderSummaryGitHubProjectionQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly dayStartedAt: Date;
  readonly dayEndedAt: Date;
  readonly observedThrough: Date;
};

export type ReadReaderSummaryGitHubProjectionResult = {
  readonly eligibleBindingIds: readonly string[];
  readonly items: readonly ReaderSummaryGitHubProjectionItem[];
  readonly pageCount: number;
};

export interface ReaderSummaryGitHubProjectionReaderPort {
  read(
    query: ReadReaderSummaryGitHubProjectionQuery,
  ): Promise<ReadReaderSummaryGitHubProjectionResult>;
}

export const UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER: ReaderSummaryGitHubProjectionReaderPort =
  {
    async read(): Promise<ReadReaderSummaryGitHubProjectionResult> {
      throw new Error("Durable GitHub projection reader is unavailable");
    },
  };
