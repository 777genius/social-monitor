import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { PrismaUsageClient } from './prisma-usage-client';

type PrismaUsageRuntimeClient = PrismaUsageClient & {
  $disconnect(): Promise<void>;
};

type PrismaUsageRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaUsageRuntimeClient;

type PrismaUsageRuntimeModule = {
  readonly PrismaClient: PrismaUsageRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaUsageConnection implements PrismaUsageClient {
  readonly publicApiAuditEvent: PrismaUsageClient['publicApiAuditEvent'];
  readonly rateLimitBucket: PrismaUsageClient['rateLimitBucket'];
  readonly usageQuotaBucket: PrismaUsageClient['usageQuotaBucket'];

  private readonly pool: Pool;
  private readonly client: PrismaUsageRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma usage persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaUsageRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.publicApiAuditEvent = this.client.publicApiAuditEvent;
    this.rateLimitBucket = this.client.rateLimitBucket;
    this.usageQuotaBucket = this.client.usageQuotaBucket;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
