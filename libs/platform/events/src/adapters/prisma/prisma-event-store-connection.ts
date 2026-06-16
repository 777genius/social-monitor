import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { PrismaEventStoreClient } from './prisma-event-store-client';

type PrismaEventStoreRuntimeClient = PrismaEventStoreClient & {
  $disconnect(): Promise<void>;
};

type PrismaEventStoreRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaEventStoreRuntimeClient;

type PrismaEventStoreRuntimeModule = {
  readonly PrismaClient: PrismaEventStoreRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaEventStoreConnection implements PrismaEventStoreClient {
  readonly outboxEvent: PrismaEventStoreClient['outboxEvent'];
  readonly inboxRecord: PrismaEventStoreClient['inboxRecord'];

  private readonly pool: Pool;
  private readonly client: PrismaEventStoreRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma event store persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaEventStoreRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.outboxEvent = this.client.outboxEvent;
    this.inboxRecord = this.client.inboxRecord;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
