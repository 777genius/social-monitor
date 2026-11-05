import { createPrismaPgRuntimeConnection, type PostgresRuntimePoolConfig, type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease } from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import type { AssessmentSqlClient } from './assessment-sql';

type RuntimeClient = AssessmentSqlClient & { $disconnect(): Promise<void> };

/** Shares the existing process Prisma/pool registry and its transaction-local RLS context. */
export class PrismaReaderValueConnection {
  static create(config: PostgresRuntimePoolConfig): Promise<PrismaReaderValueConnection> {
    const Client = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<RuntimeClient>>();
    return createPrismaPgRuntimeConnection(config, Client, (lease) => new PrismaReaderValueConnection(lease));
  }
  private constructor(private readonly lease: PrismaPgRuntimeConnectionLease<RuntimeClient>) {}
  get client(): AssessmentSqlClient { return this.lease.client; }
  onApplicationShutdown(): Promise<void> { return this.lease.close(); }
}
