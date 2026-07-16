import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaDeliveryClient } from './prisma-delivery-client';

type PrismaDeliveryRuntimeClient = PrismaDeliveryClient & {
  $disconnect(): Promise<void>;
};

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

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaDeliveryRuntimeClient>;
  private readonly client: PrismaDeliveryRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaDeliveryConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaDeliveryRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaDeliveryConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaDeliveryRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

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

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
