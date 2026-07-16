import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaMonitoringClient } from './prisma-monitoring-client';

type PrismaMonitoringRuntimeClient = PrismaMonitoringClient & {
  $disconnect(): Promise<void>;
};

export class PrismaMonitoringConnection implements PrismaMonitoringClient {
  readonly interest: PrismaMonitoringClient['interest'];
  readonly sourceCatalogEntry: PrismaMonitoringClient['sourceCatalogEntry'];
  readonly sourceBinding: PrismaMonitoringClient['sourceBinding'];
  readonly sourceCredential: PrismaMonitoringClient['sourceCredential'];
  readonly sourceCredentialSecret: PrismaMonitoringClient['sourceCredentialSecret'];
  readonly scanPolicy: PrismaMonitoringClient['scanPolicy'];
  readonly scanJob: PrismaMonitoringClient['scanJob'];
  readonly scanSchedulerDecision: PrismaMonitoringClient['scanSchedulerDecision'];
  readonly scanAttempt: PrismaMonitoringClient['scanAttempt'];
  readonly outboxEvent: PrismaMonitoringClient['outboxEvent'];
  readonly idempotencyKey: PrismaMonitoringClient['idempotencyKey'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaMonitoringRuntimeClient>;
  private readonly client: PrismaMonitoringRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaMonitoringConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaMonitoringRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaMonitoringConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaMonitoringRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

    this.interest = this.client.interest;
    this.sourceCatalogEntry = this.client.sourceCatalogEntry;
    this.sourceBinding = this.client.sourceBinding;
    this.sourceCredential = this.client.sourceCredential;
    this.sourceCredentialSecret = this.client.sourceCredentialSecret;
    this.scanPolicy = this.client.scanPolicy;
    this.scanJob = this.client.scanJob;
    this.scanSchedulerDecision = this.client.scanSchedulerDecision;
    this.scanAttempt = this.client.scanAttempt;
    this.outboxEvent = this.client.outboxEvent;
    this.idempotencyKey = this.client.idempotencyKey;
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
