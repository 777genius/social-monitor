import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { PrismaFeedClient } from './prisma-feed-client';

type PrismaFeedRuntimeClient = PrismaFeedClient & {
  $disconnect(): Promise<void>;
};

type PrismaFeedRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaFeedRuntimeClient;

type PrismaFeedRuntimeModule = {
  readonly PrismaClient: PrismaFeedRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaFeedConnection implements PrismaFeedClient {
  readonly feedItem: PrismaFeedClient['feedItem'];

  private readonly pool: Pool;
  private readonly client: PrismaFeedRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma feed persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaFeedRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });
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
