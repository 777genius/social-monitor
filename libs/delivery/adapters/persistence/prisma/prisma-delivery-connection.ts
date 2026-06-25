import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type { PrismaDeliveryClient } from './prisma-delivery-client';

type PrismaDeliveryRuntimeClient = PrismaDeliveryClient & {
  $disconnect(): Promise<void>;
};

type PrismaDeliveryRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaDeliveryRuntimeClient;

export class PrismaDeliveryConnection implements PrismaDeliveryClient {
  readonly deliveryAttempt: PrismaDeliveryClient['deliveryAttempt'];
  readonly digest: PrismaDeliveryClient['digest'];
  readonly digestSchedule: PrismaDeliveryClient['digestSchedule'];
  readonly realtimeEvent: PrismaDeliveryClient['realtimeEvent'];
  readonly webhookEndpoint: PrismaDeliveryClient['webhookEndpoint'];
  readonly webhookSecret: PrismaDeliveryClient['webhookSecret'];
  readonly webhookReplayDelivery: PrismaDeliveryClient['webhookReplayDelivery'];
  readonly notificationPreference: PrismaDeliveryClient['notificationPreference'];
  readonly summaryArtifact: PrismaDeliveryClient['summaryArtifact'];
  readonly feedItem: PrismaDeliveryClient['feedItem'];

  private readonly pool: Pool;
  private readonly client: PrismaDeliveryRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma delivery persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const PrismaClient = loadPrismaRuntimeClient<PrismaDeliveryRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.deliveryAttempt = this.client.deliveryAttempt;
    this.digest = this.client.digest;
    this.digestSchedule = this.client.digestSchedule;
    this.realtimeEvent = this.client.realtimeEvent;
    this.webhookEndpoint = this.client.webhookEndpoint;
    this.webhookSecret = this.client.webhookSecret;
    this.webhookReplayDelivery = this.client.webhookReplayDelivery;
    this.notificationPreference = this.client.notificationPreference;
    this.summaryArtifact = this.client.summaryArtifact;
    this.feedItem = this.client.feedItem;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
