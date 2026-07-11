import type { Provider } from "@nestjs/common";
import {
  FEED_ITEM_READ_REPOSITORY,
  type FeedItemReadRepositoryPort,
} from "@social-monitor/feed/ports";

import { FeedReaderSummaryCoverageCounter } from "../../adapters/evidence/feed-reader-summary-coverage.counter";
import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import { PrismaReaderSummaryProviderCollectionHealthReader } from "../../adapters/persistence/prisma/prisma-reader-summary-provider-collection-health.reader";
import {
  NOOP_READER_SUMMARY_PROVIDER_COLLECTION_HEALTH_READER,
  READER_SUMMARY_COVERAGE_COUNTER,
  type ReaderSummaryCoverageCounterPort,
} from "../../ports";
import {
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_PRISMA_CLIENT,
  type SummaryPersistenceMode,
} from "./summary-provider-tokens";

export const readerSummaryCoverageProvider: Provider = {
  provide: READER_SUMMARY_COVERAGE_COUNTER,
  useFactory: (
    feedItems: FeedItemReadRepositoryPort,
    mode: SummaryPersistenceMode,
    prisma: PrismaSummaryClient | null,
  ): ReaderSummaryCoverageCounterPort =>
    new FeedReaderSummaryCoverageCounter(
      feedItems,
      mode === "prisma"
        ? new PrismaReaderSummaryProviderCollectionHealthReader(
            requirePrismaSummaryClient(prisma),
          )
        : NOOP_READER_SUMMARY_PROVIDER_COLLECTION_HEALTH_READER,
    ),
  inject: [
    FEED_ITEM_READ_REPOSITORY,
    SUMMARY_PERSISTENCE_MODE,
    SUMMARY_PRISMA_CLIENT,
  ],
};

const requirePrismaSummaryClient = (
  client: PrismaSummaryClient | null,
): PrismaSummaryClient => {
  if (client === null) {
    throw new Error(
      "Prisma summary client is required when SUMMARY_PERSISTENCE=prisma",
    );
  }
  return client;
};
