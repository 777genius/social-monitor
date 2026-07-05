import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPeriod, ReaderSummaryScope } from "../domain";

export const READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER = Symbol(
  "READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER",
);

export type ReaderSummaryTopicCollectionMetricsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly topicLabel: string;
  readonly interestIds: readonly string[];
};

export type ReaderSummaryTopicCollectionMetrics = {
  readonly collectedPostCount: number;
  readonly lowRelevancePostCount: number;
  readonly mutedPostCount: number;
  readonly userRatedPostCount: number;
};

export interface ReaderSummaryTopicCollectionMetricsReaderPort {
  readTopicCollectionMetrics(
    query: ReaderSummaryTopicCollectionMetricsQuery,
  ): Promise<ReaderSummaryTopicCollectionMetrics | undefined>;
}

export const NOOP_READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER: ReaderSummaryTopicCollectionMetricsReaderPort =
  {
    async readTopicCollectionMetrics(): Promise<
      ReaderSummaryTopicCollectionMetrics | undefined
    > {
      return undefined;
    },
  };
