import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaSubscriptionsClient } from './prisma-subscriptions-client';

type PrismaSubscriptionsRuntimeClient = PrismaSubscriptionsClient & {
  $disconnect(): Promise<void>;
};

export class PrismaSubscriptionsConnection implements PrismaSubscriptionsClient {
  readonly sourceTarget: PrismaSubscriptionsClient['sourceTarget'];
  readonly userSubscription: PrismaSubscriptionsClient['userSubscription'];
  readonly userSubscriptionSchedule: PrismaSubscriptionsClient['userSubscriptionSchedule'];
  readonly userSummaryPreference: PrismaSubscriptionsClient['userSummaryPreference'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaSubscriptionsRuntimeClient>;
  private readonly client: PrismaSubscriptionsRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaSubscriptionsConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaSubscriptionsRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaSubscriptionsConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaSubscriptionsRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

    this.sourceTarget = this.client.sourceTarget;
    this.userSubscription = this.client.userSubscription;
    this.userSubscriptionSchedule = this.client.userSubscriptionSchedule;
    this.userSummaryPreference = this.client.userSummaryPreference;
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
