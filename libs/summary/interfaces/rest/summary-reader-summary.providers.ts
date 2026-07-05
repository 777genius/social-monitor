import type { Provider } from "@nestjs/common";
import {
  CONVERSATION_SIGNAL_BASELINE_REPOSITORY,
  CONVERSATION_UNIT_REPOSITORY,
  type ConversationSignalBaselineRepositoryPort,
  type ConversationUnitRepositoryPort,
} from "@social-monitor/conversation/ports";
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

import { ReaderSummaryArtifactContextProvider } from "../../adapters/context/reader-summary-artifact-context.provider";
import { ConversationEvidenceContextReader } from "../../adapters/evidence/conversation-evidence-context.reader";
import { ConversationReaderSummaryEvidenceSelector } from "../../adapters/evidence/conversation-reader-summary-evidence.selector";
import { FeedReaderSummaryCoverageCounter } from "../../adapters/evidence/feed-reader-summary-coverage.counter";
import { FeedReaderSummaryFreshnessProbe } from "../../adapters/evidence/feed-reader-summary-freshness.probe";
import { FeedReaderSummaryPreviewMediaEnricher } from "../../adapters/evidence/feed-reader-summary-preview-media.enricher";
import { FeedReaderSummaryTopicCollectionMetricsReader } from "../../adapters/evidence/feed-reader-summary-topic-collection-metrics.reader";
import { RelevanceReaderSummaryEvidenceSelector } from "../../adapters/evidence/relevance-reader-summary-evidence.selector";
import { SummaryMemoryReaderSummaryContextProvider } from "../../adapters/memory/summary-memory-reader-summary-context.provider";
import { StoryRankingMetricsRecorder } from "../../adapters/metrics/story-ranking-metrics.recorder";
import { ReaderSummaryJobQueuePublisherAdapter } from "../../adapters/messaging/reader-summary-job-queue.adapter";
import { AgentRuntimeReaderSummaryModelAdapter } from "../../adapters/model/agent-runtime-reader-summary-model.adapter";
import { AgentRuntimeReaderSummaryTopicLabeler } from "../../adapters/model/agent-runtime-reader-summary-topic-labeler.adapter";
import { DeterministicReaderSummaryModelAdapter } from "../../adapters/model/deterministic-reader-summary-model.adapter";
import { MeteredReaderSummaryModelAdapter } from "../../adapters/model/metered-reader-summary-model.adapter";
import {
  OpenAiResponsesReaderSummaryModelAdapter,
  type OpenAiResponsesReaderSummaryModelAdapterOptions,
} from "../../adapters/model/openai-responses-reader-summary-model.adapter";
import { InMemoryReaderSummaryArtifactRepository } from "../../adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "../../adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPolicyRepository } from "../../adapters/persistence/in-memory-reader-summary-policy.repository";
import { InMemoryReaderSummaryTopicRecommendationDecisionRepository } from "../../adapters/persistence/in-memory-reader-summary-topic-recommendation-decision.repository";
import { UsageSummaryQuotaAdapter } from "../../adapters/quota/usage-summary-quota.adapter";
import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import { PrismaReaderSummaryArtifactRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryPolicyRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import { PrismaReaderSummaryTopicRecommendationDecisionRepository } from "../../adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision.repository";
import { BuildReaderSummaryTopicMapUseCase } from "../../features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { GetReaderSummaryJobStatusUseCase } from "../../features/get-reader-summary-job-status/get-reader-summary-job-status.use-case";
import { GetReaderSummaryQualityRejectionUseCase } from "../../features/get-reader-summary-quality-rejection/get-reader-summary-quality-rejection.use-case";
import { GetReaderSummaryUseCase } from "../../features/get-reader-summary/get-reader-summary.use-case";
import { ListReaderSummaryPeriodsUseCase } from "../../features/list-reader-summary-periods/list-reader-summary-periods.use-case";
import { ListReaderSummariesUseCase } from "../../features/list-reader-summaries/list-reader-summaries.use-case";
import { RequestReaderSummaryUseCase } from "../../features/request-reader-summary/request-reader-summary.use-case";
import {
  NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
  READER_SUMMARY_COVERAGE_COUNTER,
  READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER,
  READER_SUMMARY_TOPIC_RECOMMENDATION_DECISION_REPOSITORY,
  type ReaderSummaryArtifactRepositoryPort,
  type ReaderSummaryContextProviderPort,
  type ReaderSummaryCoverageCounterPort,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryJobRepositoryPort,
  type ReaderSummaryJobQueuePort,
  type ReaderSummaryPolicyRepositoryPort,
  type ReaderSummaryPreviewMediaEnricherPort,
  type ReaderSummaryTopicCollectionMetricsReaderPort,
  type ReaderSummaryTopicRecommendationDecisionRepositoryPort,
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
  READER_SUMMARY_PREVIEW_MEDIA_ENRICHER,
  READER_SUMMARY_TOPIC_LABELER_MODE,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_MEMORY,
  SUMMARY_USER_SUMMARY_PREFERENCE_READER,
  SUMMARY_JOB_QUEUE_MODE,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_PRISMA_CLIENT,
  SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
  SUMMARY_RABBITMQ_QUEUE_CHANNEL,
  type ReaderSummaryModelProviderMode,
  type ReaderSummaryTopicLabelerMode,
  type SummaryJobQueueMode,
  type SummaryPersistenceMode,
} from "./summary-provider-tokens";

export const summaryReaderSummaryProviders: Provider[] = [
  InMemoryReaderSummaryJobRepository,
  InMemoryReaderSummaryArtifactRepository,
  InMemoryReaderSummaryPolicyRepository,
  InMemoryReaderSummaryTopicRecommendationDecisionRepository,
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
      conversationUnits: ConversationUnitRepositoryPort,
      conversationBaselines: ConversationSignalBaselineRepositoryPort,
    ): ReaderSummaryEvidenceSelectorPort =>
      new ConversationReaderSummaryEvidenceSelector(
        selector,
        new ConversationEvidenceContextReader(
          conversationUnits,
          conversationBaselines,
          new SystemClock(),
        ),
      ),
    inject: [
      RelevanceReaderSummaryEvidenceSelector,
      CONVERSATION_UNIT_REPOSITORY,
      CONVERSATION_SIGNAL_BASELINE_REPOSITORY,
    ],
  },
  {
    provide: FeedReaderSummaryFreshnessProbe,
    useFactory: (feedItems: FeedItemReadRepositoryPort) =>
      new FeedReaderSummaryFreshnessProbe(feedItems, new SystemClock()),
    inject: [FEED_ITEM_READ_REPOSITORY],
  },
  {
    provide: READER_SUMMARY_COVERAGE_COUNTER,
    useFactory: (
      feedItems: FeedItemReadRepositoryPort,
    ): ReaderSummaryCoverageCounterPort =>
      new FeedReaderSummaryCoverageCounter(feedItems),
    inject: [FEED_ITEM_READ_REPOSITORY],
  },
  {
    provide: READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER,
    useFactory: (
      feedItems: FeedItemReadRepositoryPort,
    ): ReaderSummaryTopicCollectionMetricsReaderPort =>
      new FeedReaderSummaryTopicCollectionMetricsReader(feedItems),
    inject: [FEED_ITEM_READ_REPOSITORY],
  },
  {
    provide: READER_SUMMARY_TOPIC_RECOMMENDATION_DECISION_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      repository: InMemoryReaderSummaryTopicRecommendationDecisionRepository,
    ): ReaderSummaryTopicRecommendationDecisionRepositoryPort =>
      mode === "prisma"
        ? new PrismaReaderSummaryTopicRecommendationDecisionRepository(
            requirePrismaSummaryClient(prisma),
            new CryptoIdGenerator(),
          )
        : repository,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryReaderSummaryTopicRecommendationDecisionRepository,
    ],
  },
  {
    provide: READER_SUMMARY_PREVIEW_MEDIA_ENRICHER,
    useFactory: (
      feedItems: FeedItemReadRepositoryPort,
    ): ReaderSummaryPreviewMediaEnricherPort =>
      new FeedReaderSummaryPreviewMediaEnricher(feedItems),
    inject: [FEED_ITEM_READ_REPOSITORY],
  },
  {
    provide: READER_SUMMARY_CONTEXT_PROVIDER,
    useFactory: (
      readerSummaries: ReaderSummaryArtifactRepositoryPort,
      memory: SummaryMemoryPort,
    ): ReaderSummaryContextProviderPort =>
      new ReaderSummaryArtifactContextProvider(
        readerSummaries,
        memory === undefined
          ? NOOP_READER_SUMMARY_CONTEXT_PROVIDER
          : new SummaryMemoryReaderSummaryContextProvider(memory),
      ),
    inject: [READER_SUMMARY_ARTIFACT_REPOSITORY, SUMMARY_MEMORY],
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
      agentRuntimeReaderSummaryModel: AgentRuntimeReaderSummaryModelAdapter,
      openAiReaderSummaryModel: OpenAiResponsesReaderSummaryModelAdapter,
      metrics: InMemoryMetricsRecorder,
    ) => {
      const selectedModel =
        mode === "openai-responses"
          ? openAiReaderSummaryModel
          : mode === "agent-runtime"
            ? agentRuntimeReaderSummaryModel
            : deterministicReaderSummaryModel;

      return new MeteredReaderSummaryModelAdapter(selectedModel, metrics);
    },
    inject: [
      READER_SUMMARY_MODEL_PROVIDER_MODE,
      DeterministicReaderSummaryModelAdapter,
      AgentRuntimeReaderSummaryModelAdapter,
      OpenAiResponsesReaderSummaryModelAdapter,
      InMemoryMetricsRecorder,
    ],
  },
  {
    provide: BuildReaderSummaryTopicMapUseCase,
    useFactory: (
      mode: ReaderSummaryTopicLabelerMode,
      agentRuntimeTopicLabeler: AgentRuntimeReaderSummaryTopicLabeler,
    ) =>
      new BuildReaderSummaryTopicMapUseCase({
        mode,
        labeler: mode === "agent-runtime" ? agentRuntimeTopicLabeler : null,
      }),
    inject: [
      READER_SUMMARY_TOPIC_LABELER_MODE,
      AgentRuntimeReaderSummaryTopicLabeler,
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
      topicMapBuilder: BuildReaderSummaryTopicMapUseCase,
    ) =>
      new ExecuteReaderSummaryJobUseCase(
        readerSummaryJobs,
        readerSummaryArtifacts,
        readerSummaryPolicies,
        evidenceSelector,
        readerSummaryModel,
        events,
        new CryptoIdGenerator(),
        new SystemClock(),
        contextProvider,
        userSummaryPreferences,
        topicMapBuilder,
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
      BuildReaderSummaryTopicMapUseCase,
    ],
  },
  {
    provide: GetReaderSummaryUseCase,
    useFactory: (
      readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
      freshness: FeedReaderSummaryFreshnessProbe,
      previewMediaEnricher: ReaderSummaryPreviewMediaEnricherPort,
      coverageCounter: ReaderSummaryCoverageCounterPort,
    ) =>
      new GetReaderSummaryUseCase(
        readerSummaryArtifacts,
        freshness,
        previewMediaEnricher,
        coverageCounter,
      ),
    inject: [
      READER_SUMMARY_ARTIFACT_REPOSITORY,
      FeedReaderSummaryFreshnessProbe,
      READER_SUMMARY_PREVIEW_MEDIA_ENRICHER,
      READER_SUMMARY_COVERAGE_COUNTER,
    ],
  },
  {
    provide: ListReaderSummariesUseCase,
    useFactory: (
      readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
      freshness: FeedReaderSummaryFreshnessProbe,
      previewMediaEnricher: ReaderSummaryPreviewMediaEnricherPort,
      coverageCounter: ReaderSummaryCoverageCounterPort,
    ) =>
      new ListReaderSummariesUseCase(
        readerSummaryArtifacts,
        freshness,
        previewMediaEnricher,
        coverageCounter,
      ),
    inject: [
      READER_SUMMARY_ARTIFACT_REPOSITORY,
      FeedReaderSummaryFreshnessProbe,
      READER_SUMMARY_PREVIEW_MEDIA_ENRICHER,
      READER_SUMMARY_COVERAGE_COUNTER,
    ],
  },
  {
    provide: ListReaderSummaryPeriodsUseCase,
    useFactory: (readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort) =>
      new ListReaderSummaryPeriodsUseCase(readerSummaryArtifacts),
    inject: [READER_SUMMARY_ARTIFACT_REPOSITORY],
  },
  {
    provide: GetReaderSummaryJobStatusUseCase,
    useFactory: (readerSummaryJobs: ReaderSummaryJobRepositoryPort) =>
      new GetReaderSummaryJobStatusUseCase(readerSummaryJobs),
    inject: [READER_SUMMARY_JOB_REPOSITORY],
  },
  {
    provide: GetReaderSummaryQualityRejectionUseCase,
    useFactory: (
      readerSummaryJobs: ReaderSummaryJobRepositoryPort,
      readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
    ) =>
      new GetReaderSummaryQualityRejectionUseCase(
        readerSummaryJobs,
        readerSummaryArtifacts,
      ),
    inject: [READER_SUMMARY_JOB_REPOSITORY, READER_SUMMARY_ARTIFACT_REPOSITORY],
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
