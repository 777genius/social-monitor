import { createRequire } from 'node:module';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { PrismaDeliveryClient } from './prisma-delivery-client';

type PrismaDeliveryRuntimeClient = PrismaDeliveryClient & {
  $disconnect(): Promise<void>;
};

type PrismaDeliveryRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaDeliveryRuntimeClient;

type PrismaDeliveryRuntimeModule = {
  readonly PrismaClient: PrismaDeliveryRuntimeClientConstructor;
};

const runtimeRequire = createRequire(`${process.cwd()}/package.json`);

export class PrismaDeliveryConnection implements PrismaDeliveryClient {
  readonly deliveryAttempt: PrismaDeliveryClient['deliveryAttempt'];
  readonly digest: PrismaDeliveryClient['digest'];
  readonly digestSchedule: PrismaDeliveryClient['digestSchedule'];

  private readonly pool: Pool;
  private readonly client: PrismaDeliveryRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma delivery persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const { PrismaClient } = runtimeRequire('./prisma/generated/client/client') as PrismaDeliveryRuntimeModule;
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.deliveryAttempt = this.client.deliveryAttempt;
    this.digest = this.client.digest;
    this.digestSchedule = this.client.digestSchedule;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
