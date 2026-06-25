import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type { PrismaEventStoreClient } from './prisma-event-store-client';

type PrismaEventStoreRuntimeClient = PrismaEventStoreClient & {
  $disconnect(): Promise<void>;
};

type PrismaEventStoreRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaEventStoreRuntimeClient;

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
    const PrismaClient = loadPrismaRuntimeClient<PrismaEventStoreRuntimeClientConstructor>();
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
