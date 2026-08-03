import type { Provider } from "@nestjs/common";

import { InMemoryReaderSummaryArtifactRepository } from "../../adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "../../adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPolicyRepository } from "../../adapters/persistence/in-memory-reader-summary-policy.repository";
import { PrismaReaderSummaryArtifactRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryGitHubProjectionReader } from "../../adapters/persistence/prisma/prisma-reader-summary-github-projection.reader";
import { PrismaReaderSummaryJobRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryPolicyRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import {
  type ReaderSummaryArtifactRepositoryPort,
  type ReaderSummaryGitHubProjectionReaderPort,
  type ReaderSummaryJobRepositoryPort,
  type ReaderSummaryPolicyRepositoryPort,
  UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER,
} from "../../ports";
import {
  READER_SUMMARY_ARTIFACT_REPOSITORY,
  READER_SUMMARY_GITHUB_PROJECTION_READER,
  READER_SUMMARY_JOB_REPOSITORY,
  READER_SUMMARY_POLICY_REPOSITORY,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_PRISMA_CLIENT,
  type SummaryPersistenceMode,
} from "./summary-provider-tokens";

export const summaryReaderSummaryPersistenceProviders: Provider[] = [
  {
    provide: READER_SUMMARY_JOB_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryReaderSummaryJobs: InMemoryReaderSummaryJobRepository,
    ): ReaderSummaryJobRepositoryPort =>
      mode === "prisma"
        ? new PrismaReaderSummaryJobRepository(requirePrismaClient(prisma))
        : inMemoryReaderSummaryJobs,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryReaderSummaryJobRepository,
    ],
  },
  {
    provide: READER_SUMMARY_ARTIFACT_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryReaderSummaryArtifacts: InMemoryReaderSummaryArtifactRepository,
    ): ReaderSummaryArtifactRepositoryPort =>
      mode === "prisma"
        ? new PrismaReaderSummaryArtifactRepository(requirePrismaClient(prisma))
        : inMemoryReaderSummaryArtifacts,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryReaderSummaryArtifactRepository,
    ],
  },
  {
    provide: READER_SUMMARY_GITHUB_PROJECTION_READER,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
    ): ReaderSummaryGitHubProjectionReaderPort =>
      mode === "prisma"
        ? new PrismaReaderSummaryGitHubProjectionReader(
            requirePrismaClient(prisma),
          )
        : UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER,
    inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT],
  },
  {
    provide: READER_SUMMARY_POLICY_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryReaderSummaryPolicies: InMemoryReaderSummaryPolicyRepository,
    ): ReaderSummaryPolicyRepositoryPort =>
      mode === "prisma"
        ? new PrismaReaderSummaryPolicyRepository(requirePrismaClient(prisma))
        : inMemoryReaderSummaryPolicies,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryReaderSummaryPolicyRepository,
    ],
  },
];

const requirePrismaClient = (
  client: PrismaSummaryClient | null,
): PrismaSummaryClient => {
  if (client === null) {
    throw new Error(
      "Prisma summary client is required when SUMMARY_PERSISTENCE=prisma",
    );
  }
  return client;
};
