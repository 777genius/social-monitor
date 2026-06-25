import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type { PrismaSubscriptionsClient } from './prisma-subscriptions-client';

type PrismaSubscriptionsRuntimeClient = PrismaSubscriptionsClient & {
  $disconnect(): Promise<void>;
};

type PrismaSubscriptionsRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaSubscriptionsRuntimeClient;

export class PrismaSubscriptionsConnection implements PrismaSubscriptionsClient {
  readonly sourceTarget: PrismaSubscriptionsClient['sourceTarget'];
  readonly userSubscription: PrismaSubscriptionsClient['userSubscription'];
  readonly userSubscriptionSchedule: PrismaSubscriptionsClient['userSubscriptionSchedule'];
  readonly userSummaryPreference: PrismaSubscriptionsClient['userSummaryPreference'];

  private readonly pool: Pool;
  private readonly client: PrismaSubscriptionsRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma subscriptions persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const PrismaClient = loadPrismaRuntimeClient<PrismaSubscriptionsRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.sourceTarget = this.client.sourceTarget;
    this.userSubscription = this.client.userSubscription;
    this.userSubscriptionSchedule = this.client.userSubscriptionSchedule;
    this.userSummaryPreference = this.client.userSummaryPreference;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
