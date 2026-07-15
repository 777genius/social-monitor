import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaIngestionClient } from './prisma-ingestion-client';

type PrismaIngestionRuntimeClient = PrismaIngestionClient & {
  $disconnect(): Promise<void>;
};

export class PrismaIngestionConnection implements PrismaIngestionClient {
  readonly sourceItem: PrismaIngestionClient['sourceItem'];
  readonly cursorCheckpoint: PrismaIngestionClient['cursorCheckpoint'];
  readonly scanFailureQueueEntry: PrismaIngestionClient['scanFailureQueueEntry'];
  readonly scanAttempt: PrismaIngestionClient['scanAttempt'];
  readonly scanLeaseEntry: PrismaIngestionClient['scanLeaseEntry'];
  readonly gitHubRepositoryTrendCandidate: PrismaIngestionClient['gitHubRepositoryTrendCandidate'];
  readonly gitHubRepositoryTrendSnapshot: PrismaIngestionClient['gitHubRepositoryTrendSnapshot'];
  readonly gitHubRepositoryTrendResult: PrismaIngestionClient['gitHubRepositoryTrendResult'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaIngestionRuntimeClient>;
  private readonly client: PrismaIngestionRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaIngestionConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaIngestionRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaIngestionConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaIngestionRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

    this.sourceItem = this.client.sourceItem;
    this.cursorCheckpoint = this.client.cursorCheckpoint;
    this.scanFailureQueueEntry = this.client.scanFailureQueueEntry;
    this.scanAttempt = this.client.scanAttempt;
    this.scanLeaseEntry = this.client.scanLeaseEntry;
    this.gitHubRepositoryTrendCandidate = this.client.gitHubRepositoryTrendCandidate;
    this.gitHubRepositoryTrendSnapshot = this.client.gitHubRepositoryTrendSnapshot;
    this.gitHubRepositoryTrendResult = this.client.gitHubRepositoryTrendResult;
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
