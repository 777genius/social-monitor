import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPeriod, ReaderSummaryScope } from "../domain";
import type { ReaderSummaryProviderCollectionHealth } from "./reader-summary-provider-collection-health.port";

export const READER_SUMMARY_COVERAGE_COUNTER = Symbol(
  "READER_SUMMARY_COVERAGE_COUNTER",
);

export type CountReaderSummaryCollectedFeedItemsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly observedThrough?: Date;
};

export type ReaderSummaryCollectedProviderCoverage = {
  readonly providerKey: string;
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
  readonly collectionHealth?: Omit<
    ReaderSummaryProviderCollectionHealth,
    "providerKey"
  >;
};

export type ReaderSummaryCollectedTopicCoverage = {
  readonly topicKey: string;
  readonly topicLabel?: string;
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
};

export type ReaderSummaryCollectedQueryCoverage = {
  readonly query: string;
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
};

export type ReaderSummaryCollectedFeedItemCoverage = {
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
  readonly providerBreakdown: readonly ReaderSummaryCollectedProviderCoverage[];
  readonly topicBreakdown: readonly ReaderSummaryCollectedTopicCoverage[];
  readonly queryBreakdown: readonly ReaderSummaryCollectedQueryCoverage[];
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
