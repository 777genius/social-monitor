import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type { PrismaUsageClient, PrismaUsageTransactionClient, PrismaUsageTransactionOptions } from './prisma-usage-client';

type PrismaUsageRuntimeClient = PrismaUsageClient & {
  $disconnect(): Promise<void>;
};

type PrismaUsageRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaUsageRuntimeClient;

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
    const PrismaClient = loadPrismaRuntimeClient<PrismaUsageRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.publicApiAuditEvent = this.client.publicApiAuditEvent;
    this.rateLimitBucket = this.client.rateLimitBucket;
    this.usageQuotaBucket = this.client.usageQuotaBucket;
  }

  async $transaction<TValue>(
    operation: (client: PrismaUsageTransactionClient) => Promise<TValue>,
    options?: PrismaUsageTransactionOptions,
  ): Promise<TValue> {
    return this.client.$transaction(
      (client) => operation(client as PrismaUsageTransactionClient),
      options,
    );
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
