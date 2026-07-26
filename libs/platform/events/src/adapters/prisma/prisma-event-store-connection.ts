import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import type { PrismaCommandOutboxClient } from '@social-monitor/platform-queue/adapters/prisma';

import type { PrismaEventStoreClient } from './prisma-event-store-client';

type PrismaEventStoreRuntimeClient = PrismaEventStoreClient &
  PrismaCommandOutboxClient & {
  $disconnect(): Promise<void>;
};

export class PrismaEventStoreConnection
  implements PrismaEventStoreClient, PrismaCommandOutboxClient
{
  readonly outboxEvent: PrismaEventStoreClient['outboxEvent'] &
    PrismaCommandOutboxClient['outboxEvent'];
  readonly scanJob: PrismaCommandOutboxClient['scanJob'];
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
    this.scanJob = this.client.scanJob;
    this.inboxRecord = this.client.inboxRecord;
  }

  $transaction<TValue>(
    work: Parameters<PrismaCommandOutboxClient['$transaction']>[0],
    options: Parameters<PrismaCommandOutboxClient['$transaction']>[1],
  ): Promise<TValue> {
    return this.client.$transaction(work, options) as Promise<TValue>;
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
