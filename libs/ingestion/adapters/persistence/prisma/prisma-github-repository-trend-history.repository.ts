import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { IdGenerator } from '@social-monitor/shared-kernel';

import type {
  GitHubRepositoryTrendHistoryRepositoryPort,
  SaveGitHubRepositoryTrendHistoryCommand,
  SaveGitHubRepositoryTrendHistoryResult,
} from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';

export class PrismaGitHubRepositoryTrendHistoryRepository implements GitHubRepositoryTrendHistoryRepositoryPort {
  constructor(
    private readonly prisma: PrismaIngestionClient,
    private readonly ids: IdGenerator,
  ) {}

  async saveBatch(
    command: SaveGitHubRepositoryTrendHistoryCommand,
  ): Promise<SaveGitHubRepositoryTrendHistoryResult> {
    for (const record of command.records) {
      await withPrismaWriteRetry(async () => {
        await this.prisma.githubRepositoryTrendCandidate.upsert({
          where: {
            tenantId_workspaceId_scanJobId_repositoryFullName_primaryWindow: {
              tenantId: record.tenantId,
              workspaceId: record.workspaceId,
              scanJobId: record.scanJobId,
              repositoryFullName: record.repositoryFullName,
              primaryWindow: record.primaryWindow,
            },
          },
          update: candidateData(record),
          create: {
            id: this.ids.generate(),
            ...candidateData(record),
          },
        });
        await this.prisma.githubRepositoryTrendSnapshot.upsert({
          where: {
            tenantId_workspaceId_repositoryFullName_checkedAt: {
              tenantId: record.tenantId,
              workspaceId: record.workspaceId,
              repositoryFullName: record.repositoryFullName,
              checkedAt: record.checkedAt,
            },
          },
          update: snapshotData(record),
          create: {
            id: this.ids.generate(),
            ...snapshotData(record),
          },
        });
        await this.prisma.githubRepositoryTrendResult.upsert({
          where: {
            tenantId_workspaceId_scanJobId_repositoryFullName_primaryWindow: {
              tenantId: record.tenantId,
              workspaceId: record.workspaceId,
              scanJobId: record.scanJobId,
              repositoryFullName: record.repositoryFullName,
              primaryWindow: record.primaryWindow,
            },
          },
          update: resultData(record),
          create: {
            id: this.ids.generate(),
            ...resultData(record),
          },
        });
      });
    }

    return { saved: command.records.length };
  }
}

type TrendRecord = SaveGitHubRepositoryTrendHistoryCommand['records'][number];

const candidateData = (record: TrendRecord) => ({
  tenantId: record.tenantId,
  workspaceId: record.workspaceId,
  topicId: record.topicId,
  sourceBindingId: record.sourceBindingId,
  scanJobId: record.scanJobId,
  repositoryFullName: record.repositoryFullName,
  primaryWindow: record.primaryWindow,
  stars24h: record.stars24h,
  stars7d: record.stars7d,
  stars30d: record.stars30d,
  stars90d: record.stars90d,
  rank: record.rank,
  observedAt: record.observedAt,
  source: record.source,
  metadata: record.metadata,
});

const snapshotData = (record: TrendRecord) => ({
  tenantId: record.tenantId,
  workspaceId: record.workspaceId,
  repositoryFullName: record.repositoryFullName,
  repositoryUrl: record.repositoryUrl,
  description: record.description ?? null,
  language: record.language ?? null,
  topics: [...record.topics],
  license: record.license ?? null,
  totalStars: record.totalStars,
  stars24h: record.stars24h,
  stars7d: record.stars7d,
  stars30d: record.stars30d,
  stars90d: record.stars90d,
  checkedAt: record.checkedAt,
  source: record.source,
  metadata: record.metadata,
});

const resultData = (record: TrendRecord) => ({
  tenantId: record.tenantId,
  workspaceId: record.workspaceId,
  topicId: record.topicId,
  sourceBindingId: record.sourceBindingId,
  scanJobId: record.scanJobId,
  sourceItemId: record.sourceItemId,
  repositoryFullName: record.repositoryFullName,
  repositoryUrl: record.repositoryUrl,
  primaryWindow: record.primaryWindow,
  rank: record.rank,
  checkedAt: record.checkedAt,
  observedAt: record.observedAt,
  source: record.source,
  metadata: record.metadata,
});
