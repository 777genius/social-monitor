import type { PrismaConversationClient } from "@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-client";
import type { PrismaFeedClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-client";
import type {
  PrismaIngestionClient,
  PrismaSourceCandidateMemoryClient,
} from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-client";
import type {
  PrismaSourceEngagementClient,
  PrismaSourceEngagementTransactionClient,
} from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-client";
import type { PrismaMonitoringClient } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-monitoring-client";
import {
  createPrismaPgRuntimeConnection,
  defaultPostgresRuntimePoolConfig,
  type PostgresRuntimePoolConfig,
  type PostgresRuntimeProcessId,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";

export type PrismaIngestionWorkerClient = PrismaIngestionClient &
  PrismaSourceCandidateMemoryClient &
  PrismaSourceEngagementClient &
  PrismaFeedClient &
  PrismaConversationClient &
  Pick<PrismaMonitoringClient, "scanJob">;

type PrismaIngestionWorkerRuntimeClient = PrismaIngestionWorkerClient & {
  $disconnect(): Promise<void>;
};

export class PrismaIngestionWorkerConnection implements PrismaIngestionWorkerClient {
  readonly sourceCandidateMemory: PrismaSourceCandidateMemoryClient["sourceCandidateMemory"];
  readonly sourceItem: PrismaIngestionClient["sourceItem"];
  readonly cursorCheckpoint: PrismaIngestionClient["cursorCheckpoint"];
  readonly scanFailureQueueEntry: PrismaIngestionClient["scanFailureQueueEntry"];
  readonly scanAttempt: PrismaIngestionClient["scanAttempt"];
  readonly scanLeaseEntry: PrismaIngestionClient["scanLeaseEntry"];
  readonly scanJob: PrismaMonitoringClient["scanJob"];
  readonly gitHubRepositoryTrendCandidate: PrismaIngestionClient["gitHubRepositoryTrendCandidate"];
  readonly gitHubRepositoryTrendSnapshot: PrismaIngestionClient["gitHubRepositoryTrendSnapshot"];
  readonly gitHubRepositoryTrendResult: PrismaIngestionClient["gitHubRepositoryTrendResult"];
  readonly feedItem: PrismaFeedClient["feedItem"];
  readonly feedSignalBaselineSample: PrismaFeedClient["feedSignalBaselineSample"];
  readonly sourceItemEngagementSnapshot: PrismaSourceEngagementClient["sourceItemEngagementSnapshot"];
  readonly sourceItemEngagementObservation: PrismaSourceEngagementClient["sourceItemEngagementObservation"];
  readonly sourceItemEngagementDailyRollup: PrismaSourceEngagementClient["sourceItemEngagementDailyRollup"];
  readonly conversationUnit: PrismaConversationClient["conversationUnit"];
  readonly conversationSignalBaselineSample: PrismaConversationClient["conversationSignalBaselineSample"];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaIngestionWorkerRuntimeClient>;
  private readonly client: PrismaIngestionWorkerRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaIngestionWorkerConnection> {
    const PrismaClient =
      loadPrismaRuntimeClient<
        PrismaPgRuntimeClientConstructor<PrismaIngestionWorkerRuntimeClient>
      >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaIngestionWorkerConnection(runtime),
    );
  }

  static createForProcess(
    connectionString: string,
    processId: PostgresRuntimeProcessId,
  ): Promise<PrismaIngestionWorkerConnection> {
    return this.create(
      defaultPostgresRuntimePoolConfig(connectionString, processId),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaIngestionWorkerRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

    this.sourceCandidateMemory = this.client.sourceCandidateMemory;
    this.sourceItem = this.client.sourceItem;
    this.cursorCheckpoint = this.client.cursorCheckpoint;
    this.scanFailureQueueEntry = this.client.scanFailureQueueEntry;
    this.scanAttempt = this.client.scanAttempt;
    this.scanLeaseEntry = this.client.scanLeaseEntry;
    this.scanJob = this.client.scanJob;
    this.gitHubRepositoryTrendCandidate =
      this.client.gitHubRepositoryTrendCandidate;
    this.gitHubRepositoryTrendSnapshot =
      this.client.gitHubRepositoryTrendSnapshot;
    this.gitHubRepositoryTrendResult = this.client.gitHubRepositoryTrendResult;
    this.feedItem = this.client.feedItem;
    this.feedSignalBaselineSample = this.client.feedSignalBaselineSample;
    this.sourceItemEngagementSnapshot =
      this.client.sourceItemEngagementSnapshot;
    this.sourceItemEngagementObservation =
      this.client.sourceItemEngagementObservation;
    this.sourceItemEngagementDailyRollup =
      this.client.sourceItemEngagementDailyRollup;
    this.conversationUnit = this.client.conversationUnit;
    this.conversationSignalBaselineSample =
      this.client.conversationSignalBaselineSample;
  }

  $transaction<T>(
    operation: (
      client: PrismaSourceEngagementTransactionClient,
    ) => Promise<T>,
    options?: {
      readonly maxWait?: number;
      readonly timeout?: number;
      readonly isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable";
    },
  ): Promise<T> {
    const transaction = this.client.$transaction as unknown as (
      work: typeof operation,
      settings: typeof options,
    ) => Promise<T>;
    return transaction(operation, options);
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
