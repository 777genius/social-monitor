import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaUsageClient, PrismaUsageTransactionClient, PrismaUsageTransactionOptions } from './prisma-usage-client';

type PrismaUsageRuntimeClient = PrismaUsageClient & {
  $disconnect(): Promise<void>;
};

export class PrismaUsageConnection implements PrismaUsageClient {
  readonly publicApiAuditEvent: PrismaUsageClient['publicApiAuditEvent'];
  readonly rateLimitBucket: PrismaUsageClient['rateLimitBucket'];
  readonly usageQuotaBucket: PrismaUsageClient['usageQuotaBucket'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaUsageRuntimeClient>;
  private readonly client: PrismaUsageRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaUsageConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaUsageRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaUsageConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaUsageRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

    this.publicApiAuditEvent = this.client.publicApiAuditEvent;
    this.rateLimitBucket = this.client.rateLimitBucket;
    this.usageQuotaBucket = this.client.usageQuotaBucket;
  }

  async $transaction<TValue>(
    operation: (client: PrismaUsageTransactionClient) => Promise<TValue>,
    options?: PrismaUsageTransactionOptions,
  ): Promise<TValue> {
    return this.client.$transaction(
      (client) => operation(client as PrismaUsageTransactionClient),
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
