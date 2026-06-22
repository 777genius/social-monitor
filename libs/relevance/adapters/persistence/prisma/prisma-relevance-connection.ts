import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { PrismaRelevanceClient } from './prisma-relevance-client';

type PrismaRelevanceRuntimeClient = PrismaRelevanceClient & {
  $disconnect(): Promise<void>;
};

type PrismaRelevanceRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaRelevanceRuntimeClient;

type PrismaRelevanceRuntimeModule = {
  readonly PrismaClient: PrismaRelevanceRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaRelevanceConnection implements PrismaRelevanceClient {
  readonly userRelevanceProfile: PrismaRelevanceClient['userRelevanceProfile'];
  readonly relevanceFeedbackSignal: PrismaRelevanceClient['relevanceFeedbackSignal'];

  private readonly pool: Pool;
  private readonly client: PrismaRelevanceRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma relevance persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaRelevanceRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });
    this.userRelevanceProfile = this.client.userRelevanceProfile;
    this.relevanceFeedbackSignal = this.client.relevanceFeedbackSignal;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
