import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { PrismaIngestionClient } from './prisma-ingestion-client';

type PrismaIngestionRuntimeClient = PrismaIngestionClient & {
  $disconnect(): Promise<void>;
};

type PrismaIngestionRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaIngestionRuntimeClient;

type PrismaIngestionRuntimeModule = {
  readonly PrismaClient: PrismaIngestionRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaIngestionConnection implements PrismaIngestionClient {
  readonly sourceItem: PrismaIngestionClient['sourceItem'];
  readonly cursorCheckpoint: PrismaIngestionClient['cursorCheckpoint'];
  readonly scanFailureQueueEntry: PrismaIngestionClient['scanFailureQueueEntry'];
  readonly scanAttempt: PrismaIngestionClient['scanAttempt'];
  readonly scanLeaseEntry: PrismaIngestionClient['scanLeaseEntry'];

  private readonly pool: Pool;
  private readonly client: PrismaIngestionRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma ingestion persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaIngestionRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.sourceItem = this.client.sourceItem;
    this.cursorCheckpoint = this.client.cursorCheckpoint;
    this.scanFailureQueueEntry = this.client.scanFailureQueueEntry;
    this.scanAttempt = this.client.scanAttempt;
    this.scanLeaseEntry = this.client.scanLeaseEntry;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
