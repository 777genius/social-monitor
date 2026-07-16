import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaEventStoreClient } from './prisma-event-store-client';

type PrismaEventStoreRuntimeClient = PrismaEventStoreClient & {
  $disconnect(): Promise<void>;
};

export class PrismaEventStoreConnection implements PrismaEventStoreClient {
  readonly outboxEvent: PrismaEventStoreClient['outboxEvent'];
  readonly inboxRecord: PrismaEventStoreClient['inboxRecord'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaEventStoreRuntimeClient>;
  private readonly client: PrismaEventStoreRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaEventStoreConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaEventStoreRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaEventStoreConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaEventStoreRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

    this.outboxEvent = this.client.outboxEvent;
    this.inboxRecord = this.client.inboxRecord;
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
