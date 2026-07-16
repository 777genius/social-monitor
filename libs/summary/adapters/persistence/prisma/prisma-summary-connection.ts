import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";

import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import type {
  PrismaSummaryTransactionOptions,
  PrismaTransactionalSummaryClient,
} from "./prisma-summary-transaction";

type PrismaSummaryRuntimeClient = PrismaTransactionalSummaryClient & {
  $disconnect(): Promise<void>;
};

export class PrismaSummaryConnection implements PrismaSummaryClient {
  readonly $queryRaw: PrismaSummaryClient["$queryRaw"];
  readonly summaryJob: PrismaSummaryClient["summaryJob"];
  readonly summaryArtifact: PrismaSummaryClient["summaryArtifact"];
  readonly summaryFeedback: PrismaSummaryClient["summaryFeedback"];
  readonly summaryPolicy: PrismaSummaryClient["summaryPolicy"];
  readonly readerSummaryJob: PrismaSummaryClient["readerSummaryJob"];
  readonly readerSummaryArtifact: PrismaSummaryClient["readerSummaryArtifact"];
  readonly readerSummaryPolicy: PrismaSummaryClient["readerSummaryPolicy"];
  readonly readerSummaryTopicRecommendationDecision: PrismaSummaryClient["readerSummaryTopicRecommendationDecision"];
  readonly outboxEvent: PrismaSummaryClient["outboxEvent"];
  readonly conversationUnit: PrismaSummaryClient["conversationUnit"];
  readonly conversationSignalBaselineSample: PrismaSummaryClient["conversationSignalBaselineSample"];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaSummaryRuntimeClient>;
  private readonly client: PrismaSummaryRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaSummaryConnection> {
    const PrismaClient =
      loadPrismaRuntimeClient<
        PrismaPgRuntimeClientConstructor<PrismaSummaryRuntimeClient>
      >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaSummaryConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaSummaryRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

    this.summaryJob = this.client.summaryJob;
    this.summaryArtifact = this.client.summaryArtifact;
    this.summaryFeedback = this.client.summaryFeedback;
    this.summaryPolicy = this.client.summaryPolicy;
    this.readerSummaryJob = this.client.readerSummaryJob;
    this.readerSummaryArtifact = this.client.readerSummaryArtifact;
    this.readerSummaryPolicy = this.client.readerSummaryPolicy;
    this.readerSummaryTopicRecommendationDecision =
      this.client.readerSummaryTopicRecommendationDecision;
    this.outboxEvent = this.client.outboxEvent;
    this.conversationUnit = this.client.conversationUnit;
    this.conversationSignalBaselineSample =
      this.client.conversationSignalBaselineSample;
    this.$queryRaw = this.client.$queryRaw.bind(
      this.client,
    ) as PrismaSummaryClient["$queryRaw"];
  }

  async $transaction<TValue>(
    operation: (client: PrismaReaderSummaryClient) => Promise<TValue>,
    options?: PrismaSummaryTransactionOptions,
  ): Promise<TValue> {
    return this.client.$transaction(
      (client) => operation(client as PrismaReaderSummaryClient),
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
