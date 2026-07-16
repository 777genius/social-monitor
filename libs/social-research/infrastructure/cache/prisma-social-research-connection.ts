import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaSocialResearchResultCacheClient } from './prisma-social-research-client';

type PrismaSocialResearchRuntimeClient =
  PrismaSocialResearchResultCacheClient & {
    $disconnect(): Promise<void>;
  };

export class PrismaSocialResearchConnection
  implements PrismaSocialResearchResultCacheClient
{
  readonly $queryRaw: PrismaSocialResearchResultCacheClient['$queryRaw'];
  readonly $executeRaw: PrismaSocialResearchResultCacheClient['$executeRaw'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaSocialResearchRuntimeClient>;
  private readonly client: PrismaSocialResearchRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaSocialResearchConnection> {
    const PrismaClient =
      loadPrismaRuntimeClient<
        PrismaPgRuntimeClientConstructor<PrismaSocialResearchRuntimeClient>
      >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaSocialResearchConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaSocialResearchRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;
    this.$queryRaw = this.client.$queryRaw.bind(
      this.client,
    ) as PrismaSocialResearchResultCacheClient['$queryRaw'];
    this.$executeRaw = this.client.$executeRaw.bind(
      this.client,
    ) as PrismaSocialResearchResultCacheClient['$executeRaw'];
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
