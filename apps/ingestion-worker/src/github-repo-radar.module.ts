import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator } from '@social-monitor/shared-kernel';
import { InMemoryGitHubRepositoryTrendHistoryRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-github-repository-trend-history.repository';
import { PrismaGitHubRepositoryTrendHistoryRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-github-repository-trend-history.repository';
import { GitHubRepositoryTrendMetadataProjectionAdapter } from '@social-monitor/ingestion/adapters/source/github-repo-radar/github-repository-trend-metadata-projection.adapter';
import type {
  GitHubRepositoryTrendHistoryRepositoryPort,
  SourceItemMetadataProjectionPort,
} from '@social-monitor/ingestion/ports';

import type { PrismaIngestionWorkerClient } from './adapters/persistence/prisma-ingestion-worker-connection';
import {
  INGESTION_GITHUB_REPOSITORY_TREND_HISTORY_REPOSITORY,
  INGESTION_SOURCE_ITEM_METADATA_PROJECTION,
  INGESTION_WORKER_PERSISTENCE_MODE,
  INGESTION_WORKER_PRISMA_CLIENT,
  type IngestionWorkerPersistenceMode,
} from './ingestion-worker-provider-tokens';

export const githubRepoRadarProviders: Provider[] = [
  InMemoryGitHubRepositoryTrendHistoryRepository,
  {
    provide: INGESTION_GITHUB_REPOSITORY_TREND_HISTORY_REPOSITORY,
    useFactory: (
      mode: IngestionWorkerPersistenceMode,
      prisma: PrismaIngestionWorkerClient | null,
      inMemoryRepository: InMemoryGitHubRepositoryTrendHistoryRepository,
    ): GitHubRepositoryTrendHistoryRepositoryPort =>
      mode === 'prisma'
        ? new PrismaGitHubRepositoryTrendHistoryRepository(
            requirePrismaIngestionWorkerClient(prisma),
            new CryptoIdGenerator(),
          )
        : inMemoryRepository,
    inject: [
      INGESTION_WORKER_PERSISTENCE_MODE,
      INGESTION_WORKER_PRISMA_CLIENT,
      InMemoryGitHubRepositoryTrendHistoryRepository,
    ],
  },
  {
    provide: INGESTION_SOURCE_ITEM_METADATA_PROJECTION,
    useFactory: (repository: GitHubRepositoryTrendHistoryRepositoryPort): SourceItemMetadataProjectionPort =>
      new GitHubRepositoryTrendMetadataProjectionAdapter(repository),
    inject: [INGESTION_GITHUB_REPOSITORY_TREND_HISTORY_REPOSITORY],
  },
];

const requirePrismaIngestionWorkerClient = (
  client: PrismaIngestionWorkerClient | null,
): PrismaIngestionWorkerClient => {
  if (client === null) {
    throw new Error('Prisma ingestion worker client is not configured');
  }

  return client;
};
