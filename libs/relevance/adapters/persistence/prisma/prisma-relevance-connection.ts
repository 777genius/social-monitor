import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type {
  PrismaRelevanceClient,
  PrismaRelevanceTransactionClient,
  PrismaRelevanceTransactionOptions,
} from './prisma-relevance-client';

type PrismaRelevanceRuntimeClient = PrismaRelevanceClient & {
  $disconnect(): Promise<void>;
};

export class PrismaRelevanceConnection implements PrismaRelevanceClient {
  readonly userRelevanceProfile: PrismaRelevanceClient['userRelevanceProfile'];
  readonly relevanceFeedbackSignal: PrismaRelevanceClient['relevanceFeedbackSignal'];
  readonly relevanceMemoryProjection: PrismaRelevanceClient['relevanceMemoryProjection'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaRelevanceRuntimeClient>;
  private readonly client: PrismaRelevanceRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaRelevanceConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaRelevanceRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaRelevanceConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaRelevanceRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;
    this.userRelevanceProfile = this.client.userRelevanceProfile;
    this.relevanceFeedbackSignal = this.client.relevanceFeedbackSignal;
    this.relevanceMemoryProjection = this.client.relevanceMemoryProjection;
  }

  async $transaction<TValue>(
    operation: (client: PrismaRelevanceTransactionClient) => Promise<TValue>,
    options?: PrismaRelevanceTransactionOptions,
  ): Promise<TValue> {
    return this.client.$transaction(
      (client) => operation(client as PrismaRelevanceTransactionClient),
      options,
    );
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
