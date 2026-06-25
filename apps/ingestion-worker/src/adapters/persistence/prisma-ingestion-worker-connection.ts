import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaFeedClient } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-client';
import type { PrismaIngestionClient } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-client';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

export type PrismaIngestionWorkerClient = PrismaIngestionClient & PrismaFeedClient;

type PrismaIngestionWorkerRuntimeClient = PrismaIngestionWorkerClient & {
  $disconnect(): Promise<void>;
};

type PrismaIngestionWorkerRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaIngestionWorkerRuntimeClient;

export class PrismaIngestionWorkerConnection implements PrismaIngestionWorkerClient {
  readonly sourceItem: PrismaIngestionClient['sourceItem'];
  readonly cursorCheckpoint: PrismaIngestionClient['cursorCheckpoint'];
  readonly scanFailureQueueEntry: PrismaIngestionClient['scanFailureQueueEntry'];
  readonly scanAttempt: PrismaIngestionClient['scanAttempt'];
  readonly scanLeaseEntry: PrismaIngestionClient['scanLeaseEntry'];
  readonly gitHubRepositoryTrendCandidate: PrismaIngestionClient['gitHubRepositoryTrendCandidate'];
  readonly gitHubRepositoryTrendSnapshot: PrismaIngestionClient['gitHubRepositoryTrendSnapshot'];
  readonly gitHubRepositoryTrendResult: PrismaIngestionClient['gitHubRepositoryTrendResult'];
  readonly feedItem: PrismaFeedClient['feedItem'];
  readonly feedSignalBaselineSample: PrismaFeedClient['feedSignalBaselineSample'];

  private readonly pool: Pool;
  private readonly client: PrismaIngestionWorkerRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma ingestion worker persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const PrismaClient = loadPrismaRuntimeClient<PrismaIngestionWorkerRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.sourceItem = this.client.sourceItem;
    this.cursorCheckpoint = this.client.cursorCheckpoint;
    this.scanFailureQueueEntry = this.client.scanFailureQueueEntry;
    this.scanAttempt = this.client.scanAttempt;
    this.scanLeaseEntry = this.client.scanLeaseEntry;
    this.gitHubRepositoryTrendCandidate = this.client.gitHubRepositoryTrendCandidate;
    this.gitHubRepositoryTrendSnapshot = this.client.gitHubRepositoryTrendSnapshot;
    this.gitHubRepositoryTrendResult = this.client.gitHubRepositoryTrendResult;
    this.feedItem = this.client.feedItem;
    this.feedSignalBaselineSample = this.client.feedSignalBaselineSample;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
