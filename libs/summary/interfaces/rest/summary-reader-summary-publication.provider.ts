import type { Provider } from "@nestjs/common";

import { InMemoryReaderSummaryArtifactRepository } from "../../adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "../../adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from "../../adapters/persistence/in-memory-reader-summary-publication";
import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import { PrismaReaderSummaryPublication } from "../../adapters/persistence/prisma/prisma-reader-summary-publication";
import type {
  ReaderSummaryPublicationPort,
  SummaryEventPublisherPort,
} from "../../ports";
import {
  READER_SUMMARY_PUBLICATION,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_PRISMA_CLIENT,
  type SummaryPersistenceMode,
} from "./summary-provider-tokens";

export const readerSummaryPublicationProvider: Provider = {
  provide: READER_SUMMARY_PUBLICATION,
  useFactory: (
    mode: SummaryPersistenceMode,
    prisma: PrismaSummaryClient | null,
    inMemoryJobs: InMemoryReaderSummaryJobRepository,
    inMemoryArtifacts: InMemoryReaderSummaryArtifactRepository,
    events: SummaryEventPublisherPort,
  ): ReaderSummaryPublicationPort =>
    mode === "prisma"
      ? new PrismaReaderSummaryPublication(requirePrismaSummaryClient(prisma))
      : new InMemoryReaderSummaryPublication(
          inMemoryJobs,
          inMemoryArtifacts,
          events,
        ),
  inject: [
    SUMMARY_PERSISTENCE_MODE,
    SUMMARY_PRISMA_CLIENT,
    InMemoryReaderSummaryJobRepository,
    InMemoryReaderSummaryArtifactRepository,
    SUMMARY_EVENT_PUBLISHER,
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
