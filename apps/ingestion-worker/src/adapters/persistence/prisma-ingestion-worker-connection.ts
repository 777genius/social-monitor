import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaFeedClient } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-client';
import type { PrismaIngestionClient } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-client';
import { Pool } from 'pg';

export type PrismaIngestionWorkerClient = PrismaIngestionClient & PrismaFeedClient;

type PrismaIngestionWorkerRuntimeClient = PrismaIngestionWorkerClient & {
  $disconnect(): Promise<void>;
};

type PrismaIngestionWorkerRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaIngestionWorkerRuntimeClient;

type PrismaIngestionWorkerRuntimeModule = {
  readonly PrismaClient: PrismaIngestionWorkerRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaIngestionWorkerConnection implements PrismaIngestionWorkerClient {
  readonly sourceItem: PrismaIngestionClient['sourceItem'];
  readonly cursorCheckpoint: PrismaIngestionClient['cursorCheckpoint'];
  readonly scanFailureQueueEntry: PrismaIngestionClient['scanFailureQueueEntry'];
  readonly scanAttempt: PrismaIngestionClient['scanAttempt'];
  readonly scanLeaseEntry: PrismaIngestionClient['scanLeaseEntry'];
  readonly githubRepositoryTrendCandidate: PrismaIngestionClient['githubRepositoryTrendCandidate'];
  readonly githubRepositoryTrendSnapshot: PrismaIngestionClient['githubRepositoryTrendSnapshot'];
  readonly githubRepositoryTrendResult: PrismaIngestionClient['githubRepositoryTrendResult'];
  readonly feedItem: PrismaFeedClient['feedItem'];

  private readonly pool: Pool;
  private readonly client: PrismaIngestionWorkerRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma ingestion worker persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaIngestionWorkerRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.sourceItem = this.client.sourceItem;
    this.cursorCheckpoint = this.client.cursorCheckpoint;
    this.scanFailureQueueEntry = this.client.scanFailureQueueEntry;
    this.scanAttempt = this.client.scanAttempt;
    this.scanLeaseEntry = this.client.scanLeaseEntry;
    this.githubRepositoryTrendCandidate = this.client.githubRepositoryTrendCandidate;
    this.githubRepositoryTrendSnapshot = this.client.githubRepositoryTrendSnapshot;
    this.githubRepositoryTrendResult = this.client.githubRepositoryTrendResult;
    this.feedItem = this.client.feedItem;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
