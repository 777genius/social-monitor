import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPeriod, ReaderSummaryScope } from "../domain";

export type ReaderSummaryProviderCollectionState =
  "complete" | "partial" | "degraded" | "unavailable";

export type ReaderSummaryProviderCollectionHealth = {
  readonly providerKey: string;
  readonly state: ReaderSummaryProviderCollectionState;
  readonly scanCount: number;
  readonly targetItemCount?: number;
  readonly collectedItemCount: number;
  readonly acceptedItemCount: number;
  readonly insertedItemCount: number;
  readonly outsideWindowItemCount: number;
  readonly paginationDuplicateItemCount: number;
  readonly storageDuplicateItemCount: number;
  readonly pageCount: number;
  readonly paginationStopReasons: readonly string[];
  readonly failureKinds: readonly string[];
  readonly rateLimitEventCount: number;
  readonly oldestAcceptedPublishedAt?: Date;
  readonly newestAcceptedPublishedAt?: Date;
};

export type ReadReaderSummaryProviderCollectionHealthQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
};

export interface ReaderSummaryProviderCollectionHealthReaderPort {
  readProviderCollectionHealth(
    query: ReadReaderSummaryProviderCollectionHealthQuery,
  ): Promise<readonly ReaderSummaryProviderCollectionHealth[]>;
}

export const NOOP_READER_SUMMARY_PROVIDER_COLLECTION_HEALTH_READER: ReaderSummaryProviderCollectionHealthReaderPort =
  {
    async readProviderCollectionHealth() {
      return [];
    },
  };
