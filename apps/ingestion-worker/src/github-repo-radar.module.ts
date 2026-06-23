import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { InMemoryGitHubRepositoryTrendHistoryRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-github-repository-trend-history.repository';
import { PrismaGitHubRepositoryTrendHistoryRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-github-repository-trend-history.repository';
import { HttpGitHubClient } from '@social-monitor/ingestion/adapters/source/github/http-github-client';
import { BigQueryGitHubRepoRadarClient } from '@social-monitor/ingestion/adapters/source/github-repo-radar/bigquery-github-repo-radar-client';
import { GitHubRepoRadarSourceProvider } from '@social-monitor/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { GitHubRepositoryLiveVerifierAdapter } from '@social-monitor/ingestion/adapters/source/github-repo-radar/github-repository-live-verifier.adapter';
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
  {
    provide: BigQueryGitHubRepoRadarClient,
    useFactory: () => new BigQueryGitHubRepoRadarClient({
      projectId: emptyToUndefined(process.env.GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID),
      location: emptyToUndefined(process.env.GITHUB_REPO_RADAR_BIGQUERY_LOCATION),
      maximumBytesBilled: emptyToUndefined(process.env.GITHUB_REPO_RADAR_BIGQUERY_MAX_BYTES_BILLED),
      timeoutMs: parseOptionalPositiveInteger(process.env.GITHUB_REPO_RADAR_BIGQUERY_TIMEOUT_MS),
      jobTimeoutMs: parseOptionalPositiveInteger(process.env.GITHUB_REPO_RADAR_BIGQUERY_JOB_TIMEOUT_MS),
    }),
  },
  {
    provide: GitHubRepositoryLiveVerifierAdapter,
    useFactory: (client: HttpGitHubClient) => new GitHubRepositoryLiveVerifierAdapter(client),
    inject: [HttpGitHubClient],
  },
  {
    provide: GitHubRepoRadarSourceProvider,
    useFactory: (
      radarClient: BigQueryGitHubRepoRadarClient,
      liveVerifier: GitHubRepositoryLiveVerifierAdapter,
    ) => new GitHubRepoRadarSourceProvider(radarClient, liveVerifier, new SystemClock()),
    inject: [BigQueryGitHubRepoRadarClient, GitHubRepositoryLiveVerifierAdapter],
  },
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

const emptyToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const parseOptionalPositiveInteger = (value: string | undefined): number | undefined => {
  const trimmed = emptyToUndefined(value);

  if (trimmed === undefined) {
    return undefined;
  }

  const parsed = Number(trimmed);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
