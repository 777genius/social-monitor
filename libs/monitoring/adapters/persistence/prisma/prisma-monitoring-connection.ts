import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { PrismaMonitoringClient } from './prisma-monitoring-client';

type PrismaMonitoringRuntimeClient = PrismaMonitoringClient & {
  $disconnect(): Promise<void>;
};

type PrismaMonitoringRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaMonitoringRuntimeClient;

type PrismaMonitoringRuntimeModule = {
  readonly PrismaClient: PrismaMonitoringRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaMonitoringConnection implements PrismaMonitoringClient {
  readonly topic: PrismaMonitoringClient['topic'];
  readonly sourceCatalogEntry: PrismaMonitoringClient['sourceCatalogEntry'];
  readonly sourceBinding: PrismaMonitoringClient['sourceBinding'];
  readonly scanPolicy: PrismaMonitoringClient['scanPolicy'];
  readonly scanJob: PrismaMonitoringClient['scanJob'];

  private readonly pool: Pool;
  private readonly client: PrismaMonitoringRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma monitoring persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaMonitoringRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.topic = this.client.topic;
    this.sourceCatalogEntry = this.client.sourceCatalogEntry;
    this.sourceBinding = this.client.sourceBinding;
    this.scanPolicy = this.client.scanPolicy;
    this.scanJob = this.client.scanJob;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
