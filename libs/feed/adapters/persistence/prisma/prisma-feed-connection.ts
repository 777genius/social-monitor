import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type { PrismaFeedClient } from './prisma-feed-client';

type PrismaFeedRuntimeClient = PrismaFeedClient & {
  $disconnect(): Promise<void>;
};

type PrismaFeedRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaFeedRuntimeClient;

export class PrismaFeedConnection implements PrismaFeedClient {
  readonly feedItem: PrismaFeedClient['feedItem'];
  readonly feedSignalBaselineSample: PrismaFeedClient['feedSignalBaselineSample'];

  private readonly pool: Pool;
  private readonly client: PrismaFeedRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma feed persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const PrismaClient = loadPrismaRuntimeClient<PrismaFeedRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });
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
