import type { Provider } from "@nestjs/common";
import {
  FEED_ITEM_READ_REPOSITORY,
  type FeedItemReadRepositoryPort,
} from "@social-monitor/feed/ports";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import {
  RabbitMqQueuePublisher,
  type RabbitMqQueueChannelPort,
  type RabbitMqQueuePublisherOptions,
} from "@social-monitor/platform-queue/adapters/rabbitmq";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";

import { FeedReaderSummaryFreshnessProbe } from "../../adapters/evidence/feed-reader-summary-freshness.probe";
import { RelevanceReaderSummaryEvidenceSelector } from "../../adapters/evidence/relevance-reader-summary-evidence.selector";
import { ReaderSummaryLegacyEventPublisherAdapter } from "../../adapters/anti-corruption/reader-summary-legacy-event-publisher.adapter";
import { SummaryMemoryReaderSummaryContextProvider } from "../../adapters/memory/summary-memory-reader-summary-context.provider";
import { StoryRankingMetricsRecorder } from "../../adapters/metrics/story-ranking-metrics.recorder";
import { ReaderSummaryJobQueuePublisherAdapter } from "../../adapters/messaging/reader-summary-job-queue.adapter";
import { DeterministicReaderSummaryModelAdapter } from "../../adapters/model/deterministic-reader-summary-model.adapter";
import { MeteredReaderSummaryModelAdapter } from "../../adapters/model/metered-reader-summary-model.adapter";
import {
  OpenAiResponsesReaderSummaryModelAdapter,
  type OpenAiResponsesReaderSummaryModelAdapterOptions,
} from "../../adapters/model/openai-responses-reader-summary-model.adapter";
import { InMemoryReaderSummaryArtifactRepository } from "../../adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "../../adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPolicyRepository } from "../../adapters/persistence/in-memory-reader-summary-policy.repository";
import { UsageSummaryQuotaAdapter } from "../../adapters/quota/usage-summary-quota.adapter";
import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import { PrismaReaderSummaryArtifactRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryPolicyRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { GetReaderSummaryJobStatusUseCase } from "../../features/get-reader-summary-job-status/get-reader-summary-job-status.use-case";
import { GetReaderSummaryUseCase } from "../../features/get-reader-summary/get-reader-summary.use-case";
import { ListReaderSummariesUseCase } from "../../features/list-reader-summaries/list-reader-summaries.use-case";
import { RequestReaderSummaryUseCase } from "../../features/request-reader-summary/request-reader-summary.use-case";
import {
  NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
  type ReaderSummaryArtifactRepositoryPort,
  type ReaderSummaryContextProviderPort,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryJobRepositoryPort,
  type ReaderSummaryJobQueuePort,
  type ReaderSummaryPolicyRepositoryPort,
  type StoryRankingMetricsPort,
  type SummaryEventPublisherPort,
  type SummaryMemoryPort,
  type UserSummaryPreferenceReaderPort,
} from "../../ports";
import {
  READER_SUMMARY_ARTIFACT_REPOSITORY,
  READER_SUMMARY_CONTEXT_PROVIDER,
  READER_SUMMARY_EVIDENCE_SELECTOR,
  READER_SUMMARY_JOB_QUEUE,
  READER_SUMMARY_JOB_REPOSITORY,
  READER_SUMMARY_MODEL_PROVIDER_MODE,
  READER_SUMMARY_OPENAI_RESPONSES_MODEL_OPTIONS,
  READER_SUMMARY_POLICY_REPOSITORY,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_MEMORY,
  SUMMARY_USER_SUMMARY_PREFERENCE_READER,
  SUMMARY_JOB_QUEUE_MODE,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_PRISMA_CLIENT,
  SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
  SUMMARY_RABBITMQ_QUEUE_CHANNEL,
  type ReaderSummaryModelProviderMode,
  type SummaryJobQueueMode,
  type SummaryPersistenceMode,
} from "./summary-provider-tokens";

export const summaryReaderSummaryProviders: Provider[] = [
  InMemoryReaderSummaryJobRepository,
  InMemoryReaderSummaryArtifactRepository,
  InMemoryReaderSummaryPolicyRepository,
  {
    provide: StoryRankingMetricsRecorder,
    useFactory: (metrics: InMemoryMetricsRecorder): StoryRankingMetricsPort =>
      new StoryRankingMetricsRecorder(metrics),
    inject: [InMemoryMetricsRecorder],
  },
  {
    provide: READER_SUMMARY_JOB_QUEUE,
    useFactory: (
      mode: SummaryJobQueueMode,
      publisher: InMemoryQueuePublisher,
      metrics: InMemoryMetricsRecorder,
      rabbitChannel: RabbitMqQueueChannelPort | null,
      rabbitOptions: RabbitMqQueuePublisherOptions,
    ): ReaderSummaryJobQueuePort =>
      mode === "rabbitmq"
        ? new ReaderSummaryJobQueuePublisherAdapter(
            new RabbitMqQueuePublisher(
              requireRabbitMqQueueChannel(rabbitChannel),
              rabbitOptions,
              new SystemClock(),
            ),
            metrics,
          )
        : new ReaderSummaryJobQueuePublisherAdapter(publisher, metrics),
    inject: [
      SUMMARY_JOB_QUEUE_MODE,
      InMemoryQueuePublisher,
      InMemoryMetricsRecorder,
      SUMMARY_RABBITMQ_QUEUE_CHANNEL,
      SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
    ],
  },
  {
    provide: READER_SUMMARY_JOB_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryReaderSummaryJobs: InMemoryReaderSummaryJobRepository,
    ): ReaderSummaryJobRepositoryPort =>
      mode === "prisma"
        ? new PrismaReaderSummaryJobRepository(
            requirePrismaSummaryClient(prisma),
          )
        : inMemoryReaderSummaryJobs,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryReaderSummaryJobRepository,
    ],
  },
  {
    provide: READER_SUMMARY_ARTIFACT_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryReaderSummaryArtifacts: InMemoryReaderSummaryArtifactRepository,
    ): ReaderSummaryArtifactRepositoryPort =>
      mode === "prisma"
        ? new PrismaReaderSummaryArtifactRepository(
            requirePrismaSummaryClient(prisma),
          )
        : inMemoryReaderSummaryArtifacts,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryReaderSummaryArtifactRepository,
    ],
  },
  {
    provide: READER_SUMMARY_POLICY_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryReaderSummaryPolicies: InMemoryReaderSummaryPolicyRepository,
    ): ReaderSummaryPolicyRepositoryPort =>
      mode === "prisma"
        ? new PrismaReaderSummaryPolicyRepository(
            requirePrismaSummaryClient(prisma),
          )
        : inMemoryReaderSummaryPolicies,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryReaderSummaryPolicyRepository,
    ],
  },
  {
    provide: RelevanceReaderSummaryEvidenceSelector,
    useFactory: (
      rankFeedItems: RankFeedItemsUseCase,
      feedItems: FeedItemReadRepositoryPort,
      metrics: StoryRankingMetricsPort,
    ) =>
      new RelevanceReaderSummaryEvidenceSelector(
        rankFeedItems,
        feedItems,
        new SystemClock(),
        metrics,
      ),
    inject: [
      RankFeedItemsUseCase,
      FEED_ITEM_READ_REPOSITORY,
      StoryRankingMetricsRecorder,
    ],
  },
  {
    provide: READER_SUMMARY_EVIDENCE_SELECTOR,
    useFactory: (
      selector: RelevanceReaderSummaryEvidenceSelector,
    ): ReaderSummaryEvidenceSelectorPort => selector,
    inject: [RelevanceReaderSummaryEvidenceSelector],
  },
  {
    provide: FeedReaderSummaryFreshnessProbe,
    useFactory: (feedItems: FeedItemReadRepositoryPort) =>
      new FeedReaderSummaryFreshnessProbe(feedItems, new SystemClock()),
    inject: [FEED_ITEM_READ_REPOSITORY],
  },
  {
    provide: READER_SUMMARY_CONTEXT_PROVIDER,
    useFactory: (memory: SummaryMemoryPort): ReaderSummaryContextProviderPort =>
      memory === undefined
        ? NOOP_READER_SUMMARY_CONTEXT_PROVIDER
        : new SummaryMemoryReaderSummaryContextProvider(memory),
    inject: [SUMMARY_MEMORY],
  },
  DeterministicReaderSummaryModelAdapter,
  {
    provide: OpenAiResponsesReaderSummaryModelAdapter,
    useFactory: (options: OpenAiResponsesReaderSummaryModelAdapterOptions) =>
      new OpenAiResponsesReaderSummaryModelAdapter(options),
    inject: [READER_SUMMARY_OPENAI_RESPONSES_MODEL_OPTIONS],
  },
  {
    provide: MeteredReaderSummaryModelAdapter,
    useFactory: (
      mode: ReaderSummaryModelProviderMode,
      deterministicReaderSummaryModel: DeterministicReaderSummaryModelAdapter,
      openAiReaderSummaryModel: OpenAiResponsesReaderSummaryModelAdapter,
      metrics: InMemoryMetricsRecorder,
    ) =>
      new MeteredReaderSummaryModelAdapter(
        mode === "openai-responses"
          ? openAiReaderSummaryModel
          : deterministicReaderSummaryModel,
        metrics,
      ),
    inject: [
      READER_SUMMARY_MODEL_PROVIDER_MODE,
      DeterministicReaderSummaryModelAdapter,
      OpenAiResponsesReaderSummaryModelAdapter,
      InMemoryMetricsRecorder,
    ],
  },
  {
    provide: RequestReaderSummaryUseCase,
    useFactory: (
      readerSummaryJobs: ReaderSummaryJobRepositoryPort,
      readerSummaryJobQueue: ReaderSummaryJobQueuePort,
      summaryQuota: UsageSummaryQuotaAdapter,
    ) =>
      new RequestReaderSummaryUseCase(
        readerSummaryJobs,
        readerSummaryJobQueue,
        summaryQuota,
        new CryptoIdGenerator(),
        new SystemClock(),
      ),
    inject: [
      READER_SUMMARY_JOB_REPOSITORY,
      READER_SUMMARY_JOB_QUEUE,
      UsageSummaryQuotaAdapter,
    ],
  },
  {
    provide: ExecuteReaderSummaryJobUseCase,
    useFactory: (
      readerSummaryJobs: ReaderSummaryJobRepositoryPort,
      readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
      readerSummaryPolicies: ReaderSummaryPolicyRepositoryPort,
      evidenceSelector: ReaderSummaryEvidenceSelectorPort,
      readerSummaryModel: MeteredReaderSummaryModelAdapter,
      events: SummaryEventPublisherPort,
      contextProvider: ReaderSummaryContextProviderPort,
      userSummaryPreferences: UserSummaryPreferenceReaderPort,
    ) =>
      new ExecuteReaderSummaryJobUseCase(
        readerSummaryJobs,
        readerSummaryArtifacts,
        readerSummaryPolicies,
        evidenceSelector,
        readerSummaryModel,
        new ReaderSummaryLegacyEventPublisherAdapter(events),
        new CryptoIdGenerator(),
        new SystemClock(),
        contextProvider,
        userSummaryPreferences,
      ),
    inject: [
      READER_SUMMARY_JOB_REPOSITORY,
      READER_SUMMARY_ARTIFACT_REPOSITORY,
      READER_SUMMARY_POLICY_REPOSITORY,
      READER_SUMMARY_EVIDENCE_SELECTOR,
      MeteredReaderSummaryModelAdapter,
      SUMMARY_EVENT_PUBLISHER,
      READER_SUMMARY_CONTEXT_PROVIDER,
      SUMMARY_USER_SUMMARY_PREFERENCE_READER,
    ],
  },
  {
    provide: GetReaderSummaryUseCase,
    useFactory: (
      readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
      freshness: FeedReaderSummaryFreshnessProbe,
    ) => new GetReaderSummaryUseCase(readerSummaryArtifacts, freshness),
    inject: [
      READER_SUMMARY_ARTIFACT_REPOSITORY,
      FeedReaderSummaryFreshnessProbe,
    ],
  },
  {
    provide: ListReaderSummariesUseCase,
    useFactory: (
      readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
      freshness: FeedReaderSummaryFreshnessProbe,
    ) => new ListReaderSummariesUseCase(readerSummaryArtifacts, freshness),
    inject: [
      READER_SUMMARY_ARTIFACT_REPOSITORY,
      FeedReaderSummaryFreshnessProbe,
    ],
  },
  {
    provide: GetReaderSummaryJobStatusUseCase,
    useFactory: (readerSummaryJobs: ReaderSummaryJobRepositoryPort) =>
      new GetReaderSummaryJobStatusUseCase(readerSummaryJobs),
    inject: [READER_SUMMARY_JOB_REPOSITORY],
  },
];

const requirePrismaSummaryClient = (
  client: PrismaSummaryClient | null,
): PrismaSummaryClient => {
  if (client === null) {
    throw new Error(
      "Prisma summary client is required when SUMMARY_PERSISTENCE=prisma",
    );
  }

  return client;
};

const requireRabbitMqQueueChannel = (
  channel: RabbitMqQueueChannelPort | null,
): RabbitMqQueueChannelPort => {
  if (channel === null) {
    throw new Error(
      "RabbitMQ queue channel is required when SUMMARY_JOB_QUEUE_MODE=rabbitmq",
    );
  }

  return channel;
};
