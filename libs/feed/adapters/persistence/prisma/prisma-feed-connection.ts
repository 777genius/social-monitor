import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaFeedClient } from './prisma-feed-client';

type PrismaFeedRuntimeClient = PrismaFeedClient & {
  $disconnect(): Promise<void>;
};

export class PrismaFeedConnection implements PrismaFeedClient {
  readonly feedItem: PrismaFeedClient['feedItem'];
  readonly feedSignalBaselineSample: PrismaFeedClient['feedSignalBaselineSample'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaFeedRuntimeClient>;
  private readonly client: PrismaFeedRuntimeClient;

  static create(config: PostgresRuntimePoolConfig): Promise<PrismaFeedConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaFeedRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaFeedConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaFeedRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;
    this.feedItem = this.client.feedItem;
    this.feedSignalBaselineSample = this.client.feedSignalBaselineSample;
  }

  $transaction<Result>(
    operation: (transaction: PrismaFeedClient) => Promise<Result>,
    options: {
      readonly isolationLevel: "RepeatableRead" | "Serializable";
      readonly maxWait?: number;
      readonly timeout?: number;
    },
  ): Promise<Result> {
    return this.client.$transaction!(operation, options);
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
