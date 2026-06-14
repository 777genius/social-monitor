import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { PrismaSummaryClient } from './prisma-summary-client';

type PrismaSummaryRuntimeClient = PrismaSummaryClient & {
  $disconnect(): Promise<void>;
};

type PrismaSummaryRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaSummaryRuntimeClient;

type PrismaSummaryRuntimeModule = {
  readonly PrismaClient: PrismaSummaryRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaSummaryConnection implements PrismaSummaryClient {
  readonly summaryJob: PrismaSummaryClient['summaryJob'];
  readonly summaryArtifact: PrismaSummaryClient['summaryArtifact'];
  readonly summaryFeedback: PrismaSummaryClient['summaryFeedback'];

  private readonly pool: Pool;
  private readonly client: PrismaSummaryRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma summary persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaSummaryRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.summaryJob = this.client.summaryJob;
    this.summaryArtifact = this.client.summaryArtifact;
    this.summaryFeedback = this.client.summaryFeedback;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
