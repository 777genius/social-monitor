import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPeriod, ReaderSummaryScope } from "../domain";

export const READER_SUMMARY_COVERAGE_COUNTER = Symbol(
  "READER_SUMMARY_COVERAGE_COUNTER",
);

export type CountReaderSummaryCollectedFeedItemsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
};

export type ReaderSummaryCollectedProviderCoverage = {
  readonly providerKey: string;
  readonly collectedFeedItemCount: number;
};

export type ReaderSummaryCollectedFeedItemCoverage = {
  readonly collectedFeedItemCount: number;
  readonly providerBreakdown: readonly ReaderSummaryCollectedProviderCoverage[];
};

export interface ReaderSummaryCoverageCounterPort {
  countCollectedFeedItems(
    query: CountReaderSummaryCollectedFeedItemsQuery,
  ): Promise<number | undefined>;

  countCollectedFeedItemCoverage(
    query: CountReaderSummaryCollectedFeedItemsQuery,
  ): Promise<ReaderSummaryCollectedFeedItemCoverage | undefined>;
}

export const NOOP_READER_SUMMARY_COVERAGE_COUNTER: ReaderSummaryCoverageCounterPort =
  {
    async countCollectedFeedItems(): Promise<number | undefined> {
      return undefined;
    },

    async countCollectedFeedItemCoverage(): Promise<
      ReaderSummaryCollectedFeedItemCoverage | undefined
    > {
      return undefined;
    },
  };
