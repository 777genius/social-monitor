import {
  CONVERSATION_SIGNAL_BASELINE_REPOSITORY,
  CONVERSATION_UNIT_REPOSITORY,
  type ConversationSignalBaselineRepositoryPort,
  type ConversationUnitRepositoryPort,
} from "@social-monitor/conversation/ports";
import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import {
  FEED_ITEM_READ_REPOSITORY,
  type FeedItemReadRepositoryPort,
} from "@social-monitor/feed/ports";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import {
  AmqplibRabbitMqChannel,
  RabbitMqQueuePublisher,
  type RabbitMqQueueChannelPort,
  type RabbitMqQueuePublisherOptions,
} from "@social-monitor/platform-queue/adapters/rabbitmq";
import { RequestCorrelationIdFactory } from "@social-monitor/platform-request-context";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { SystemClock } from "@social-monitor/shared-kernel";
import { SubscriptionUserSummaryPreferenceReaderAdapter } from "@social-monitor/subscriptions/adapters/summary/subscription-user-summary-preference.reader";
import { SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY } from "@social-monitor/subscriptions/interfaces/rest/subscriptions-provider-tokens";
import type { UserSummaryPreferenceRepositoryPort } from "@social-monitor/subscriptions/ports";
import { ReserveUsageQuotaUseCase } from "@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case";

import { FeedSummaryEvidenceSelector } from "../../adapters/evidence/feed-summary-evidence.selector";
import { ConversationSummaryEvidenceSelector } from "../../adapters/evidence/conversation-summary-evidence.selector";
import { FeedSummaryFreshnessProbe } from "../../adapters/evidence/feed-summary-freshness.probe";
import { RelevanceSummaryEvidenceSelector } from "../../adapters/evidence/relevance-summary-evidence.selector";
import { YoutubeVideoSummaryEvidenceSelector } from "../../adapters/evidence/youtube-video-summary-evidence.selector";
import { AgentRuntimeSummaryModelAdapter } from "../../adapters/model/agent-runtime-summary-model.adapter";
import { InMemorySummaryEventPublisher } from "../../adapters/messaging/in-memory-summary-event-publisher";
import {
  InMemorySummaryJobQueueAdapter,
  SummaryJobQueuePublisherAdapter,
} from "../../adapters/messaging/in-memory-summary-job-queue.adapter";
import {
  MemoStackSummaryMemoryAdapter,
  resolveMemoStackSummaryMemoryOptions,
} from "../../adapters/memory/memo-stack-summary-memory.adapter";
import { NoopSummaryMemoryAdapter } from "../../adapters/memory/noop-summary-memory.adapter";
import { DeterministicSummaryModelAdapter } from "../../adapters/model/deterministic-summary-model.adapter";
import { MeteredSummaryModelAdapter } from "../../adapters/model/metered-summary-model.adapter";
import {
  OpenAiResponsesSummaryModelAdapter,
  resolveOpenAiResponsesSummaryModelOptions,
} from "../../adapters/model/openai-responses-summary-model.adapter";
import { InMemoryAutoSummaryCandidateRepository } from "../../adapters/persistence/in-memory-auto-summary-candidate.repository";
import { InMemorySummaryArtifactRepository } from "../../adapters/persistence/in-memory-summary-artifact.repository";
import { InMemorySummaryFeedbackRepository } from "../../adapters/persistence/in-memory-summary-feedback.repository";
import { InMemorySummaryJobRepository } from "../../adapters/persistence/in-memory-summary-job.repository";
import { InMemorySummaryPolicyRepository } from "../../adapters/persistence/in-memory-summary-policy.repository";
import { PrismaAutoSummaryCandidateRepository } from "../../adapters/persistence/prisma/prisma-auto-summary-candidate.repository";
import { PrismaSummaryArtifactRepository } from "../../adapters/persistence/prisma/prisma-summary-artifact.repository";
import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import { PrismaSummaryConnection } from "../../adapters/persistence/prisma/prisma-summary-connection";
import { PrismaSummaryEventPublisher } from "../../adapters/persistence/prisma/prisma-summary-event.publisher";
import { PrismaSummaryFeedbackRepository } from "../../adapters/persistence/prisma/prisma-summary-feedback.repository";
import { PrismaSummaryJobRepository } from "../../adapters/persistence/prisma/prisma-summary-job.repository";
import { PrismaSummaryPolicyRepository } from "../../adapters/persistence/prisma/prisma-summary-policy.repository";
import { UsageSummaryQuotaAdapter } from "../../adapters/quota/usage-summary-quota.adapter";
import { DeterministicYoutubeVideoSummaryProvider } from "../../adapters/video/deterministic-youtube-video-summary.provider";
import { DisabledYoutubeVideoSummaryProvider } from "../../adapters/video/disabled-youtube-video-summary.provider";
import { GoogleGeminiYoutubeVideoSummaryProvider } from "../../adapters/video/google-gemini-youtube-video-summary.provider";
import {
  type AutoSummaryCandidateRepositoryPort,
  type SummaryArtifactRepositoryPort,
  type SummaryEvidenceSelectorPort,
  type SummaryEventPublisherPort,
  type SummaryFeedbackRepositoryPort,
  type SummaryJobQueuePort,
  type SummaryJobRepositoryPort,
  type SummaryMemoryPort,
  type SummaryPolicyRepositoryPort,
  type UserSummaryPreferenceReaderPort,
  type YoutubeVideoSummaryProviderPort,
} from "../../ports";
import {
  SUMMARY_ARTIFACT_REPOSITORY,
  SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY,
  SUMMARY_EVIDENCE_SELECTOR,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_FEEDBACK_REPOSITORY,
  SUMMARY_JOB_QUEUE,
  SUMMARY_JOB_QUEUE_MODE,
  SUMMARY_JOB_REPOSITORY,
  SUMMARY_MEMORY,
  SUMMARY_MEMORY_MODE,
  SUMMARY_MODEL_PROVIDER_MODE,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_POLICY_REPOSITORY,
  SUMMARY_PRISMA_CLIENT,
  SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
  SUMMARY_RABBITMQ_QUEUE_CHANNEL,
  SUMMARY_USER_SUMMARY_PREFERENCE_READER,
  SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER,
  SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE,
  type SummaryJobQueueMode,
  type SummaryMemoryMode,
  type SummaryModelProviderMode,
  type SummaryPersistenceMode,
  type SummaryYoutubeVideoSummaryProviderMode,
  resolveSummaryGeminiYoutubeVideoSummaryTimeoutMs,
  resolveSummaryJobQuotaPerHour,
  resolveSummaryYoutubeVideoSummaryMaxItems,
  resolveSummaryYoutubeVideoSummaryMaxPreviewCharacters,
} from "./summary-provider-tokens";
import { summaryConversationPersistenceProviders } from "./summary-conversation-persistence.providers";

export const summaryRestInfrastructureProviders = [
  {
    provide: SUMMARY_PRISMA_CLIENT,
    useFactory: (mode: SummaryPersistenceMode): PrismaSummaryClient | null =>
      mode === "prisma"
        ? new PrismaSummaryConnection(process.env.DATABASE_URL ?? "")
        : null,
    inject: [SUMMARY_PERSISTENCE_MODE],
  },
  InMemorySummaryJobRepository,
  InMemorySummaryArtifactRepository,
  InMemorySummaryFeedbackRepository,
  InMemorySummaryPolicyRepository,
  InMemoryQueuePublisher,
  {
    provide: SUMMARY_RABBITMQ_QUEUE_CHANNEL,
    useFactory: (
      mode: SummaryJobQueueMode,
    ): RabbitMqQueueChannelPort | null =>
      mode === "rabbitmq"
        ? new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? "" })
        : null,
    inject: [SUMMARY_JOB_QUEUE_MODE],
  },
  ...summaryConversationPersistenceProviders,
  {
    provide: SUMMARY_JOB_QUEUE,
    useFactory: (
      mode: SummaryJobQueueMode,
      publisher: InMemoryQueuePublisher,
      metrics: InMemoryMetricsRecorder,
      rabbitChannel: RabbitMqQueueChannelPort | null,
      rabbitOptions: RabbitMqQueuePublisherOptions,
    ): SummaryJobQueuePort =>
      mode === "rabbitmq"
        ? new SummaryJobQueuePublisherAdapter(
            new RabbitMqQueuePublisher(
              requireRabbitMqQueueChannel(rabbitChannel),
              rabbitOptions,
              new SystemClock(),
            ),
            metrics,
          )
        : new InMemorySummaryJobQueueAdapter(publisher, metrics),
    inject: [
      SUMMARY_JOB_QUEUE_MODE,
      InMemoryQueuePublisher,
      InMemoryMetricsRecorder,
      SUMMARY_RABBITMQ_QUEUE_CHANNEL,
      SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
    ],
  },
  {
    provide: SUMMARY_JOB_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemorySummaryJobs: InMemorySummaryJobRepository,
    ): SummaryJobRepositoryPort =>
      mode === "prisma"
        ? new PrismaSummaryJobRepository(requirePrismaSummaryClient(prisma))
        : inMemorySummaryJobs,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemorySummaryJobRepository,
    ],
  },
  {
    provide: SUMMARY_ARTIFACT_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemorySummaryArtifacts: InMemorySummaryArtifactRepository,
    ): SummaryArtifactRepositoryPort =>
      mode === "prisma"
        ? new PrismaSummaryArtifactRepository(
            requirePrismaSummaryClient(prisma),
          )
        : inMemorySummaryArtifacts,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemorySummaryArtifactRepository,
    ],
  },
  {
    provide: SUMMARY_FEEDBACK_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemorySummaryFeedback: InMemorySummaryFeedbackRepository,
    ): SummaryFeedbackRepositoryPort =>
      mode === "prisma"
        ? new PrismaSummaryFeedbackRepository(
            requirePrismaSummaryClient(prisma),
          )
        : inMemorySummaryFeedback,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemorySummaryFeedbackRepository,
    ],
  },
  {
    provide: SUMMARY_POLICY_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemorySummaryPolicies: InMemorySummaryPolicyRepository,
    ): SummaryPolicyRepositoryPort =>
      mode === "prisma"
        ? new PrismaSummaryPolicyRepository(
            requirePrismaSummaryClient(prisma),
          )
        : inMemorySummaryPolicies,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemorySummaryPolicyRepository,
    ],
  },
  {
    provide: SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      policies: InMemorySummaryPolicyRepository,
      jobs: InMemorySummaryJobRepository,
      feedItems: FeedItemReadRepositoryPort,
    ): AutoSummaryCandidateRepositoryPort => {
      if (mode === "prisma") {
        return new PrismaAutoSummaryCandidateRepository(
          requirePrismaSummaryClient(prisma),
        );
      }
      if (!(feedItems instanceof InMemoryFeedItemReadRepository)) {
        throw new Error(
          "In-memory auto-summary candidates require InMemoryFeedItemReadRepository",
        );
      }

      return new InMemoryAutoSummaryCandidateRepository(
        policies,
        jobs,
        feedItems,
      );
    },
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemorySummaryPolicyRepository,
      InMemorySummaryJobRepository,
      FEED_ITEM_READ_REPOSITORY,
    ],
  },
  InMemorySummaryEventPublisher,
  NoopSummaryMemoryAdapter,
  {
    provide: SUMMARY_MEMORY,
    useFactory: (
      mode: SummaryMemoryMode,
      noop: NoopSummaryMemoryAdapter,
    ): SummaryMemoryPort =>
      mode === "memo-stack"
        ? new MemoStackSummaryMemoryAdapter(
            resolveMemoStackSummaryMemoryOptions(process.env),
          )
        : noop,
    inject: [SUMMARY_MEMORY_MODE, NoopSummaryMemoryAdapter],
  },
  {
    provide: SUMMARY_EVENT_PUBLISHER,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryEvents: InMemorySummaryEventPublisher,
    ): SummaryEventPublisherPort =>
      mode === "prisma"
        ? new PrismaSummaryEventPublisher(requirePrismaSummaryClient(prisma))
        : inMemoryEvents,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemorySummaryEventPublisher,
    ],
  },
  {
    provide: FeedSummaryEvidenceSelector,
    useFactory: (feedItems: FeedItemReadRepositoryPort) =>
      new FeedSummaryEvidenceSelector(feedItems, new SystemClock()),
    inject: [FEED_ITEM_READ_REPOSITORY],
  },
  {
    provide: SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER,
    useFactory: (
      mode: SummaryYoutubeVideoSummaryProviderMode,
    ): YoutubeVideoSummaryProviderPort => {
      if (mode === "deterministic") {
        return new DeterministicYoutubeVideoSummaryProvider();
      }

      if (mode === "google-gemini") {
        return new GoogleGeminiYoutubeVideoSummaryProvider({
          apiKey: process.env.GEMINI_API_KEY ?? "",
          model:
            process.env.GEMINI_YOUTUBE_VIDEO_SUMMARY_MODEL ??
            "gemini-3.1-flash-lite",
          promptVersion:
            process.env.GEMINI_YOUTUBE_VIDEO_SUMMARY_PROMPT_VERSION,
          timeoutMs: resolveSummaryGeminiYoutubeVideoSummaryTimeoutMs(
            process.env,
          ),
        });
      }

      return new DisabledYoutubeVideoSummaryProvider();
    },
    inject: [SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE],
  },
  {
    provide: RelevanceSummaryEvidenceSelector,
    useFactory: (rankFeedItems: RankFeedItemsUseCase) =>
      new RelevanceSummaryEvidenceSelector(rankFeedItems, new SystemClock()),
    inject: [RankFeedItemsUseCase],
  },
  {
    provide: SUMMARY_EVIDENCE_SELECTOR,
    useFactory: (
      feedEvidenceSelector: RelevanceSummaryEvidenceSelector,
      youtubeVideoSummaryProvider: YoutubeVideoSummaryProviderPort,
      conversationUnits: ConversationUnitRepositoryPort,
      conversationBaselines: ConversationSignalBaselineRepositoryPort,
    ): SummaryEvidenceSelectorPort =>
      new ConversationSummaryEvidenceSelector(
        new YoutubeVideoSummaryEvidenceSelector(
          feedEvidenceSelector,
          youtubeVideoSummaryProvider,
          {
            maxVideosPerSelection: resolveSummaryYoutubeVideoSummaryMaxItems(
              process.env,
            ),
            maxPreviewCharacters:
              resolveSummaryYoutubeVideoSummaryMaxPreviewCharacters(
                process.env,
              ),
            continueOnProviderError: true,
          },
        ),
        conversationUnits,
        conversationBaselines,
        new SystemClock(),
      ),
    inject: [
      RelevanceSummaryEvidenceSelector,
      SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER,
      CONVERSATION_UNIT_REPOSITORY,
      CONVERSATION_SIGNAL_BASELINE_REPOSITORY,
    ],
  },
  {
    provide: FeedSummaryFreshnessProbe,
    useFactory: (feedItems: FeedItemReadRepositoryPort) =>
      new FeedSummaryFreshnessProbe(feedItems, new SystemClock()),
    inject: [FEED_ITEM_READ_REPOSITORY],
  },
  InMemoryMetricsRecorder,
  RequestCorrelationIdFactory,
  DeterministicSummaryModelAdapter,
  {
    provide: OpenAiResponsesSummaryModelAdapter,
    useFactory: (mode: SummaryModelProviderMode) =>
      new OpenAiResponsesSummaryModelAdapter(
        resolveOpenAiResponsesSummaryModelOptions(process.env, {
          requireApiKey: mode === "openai-responses",
        }),
      ),
    inject: [SUMMARY_MODEL_PROVIDER_MODE],
  },
  {
    provide: MeteredSummaryModelAdapter,
    useFactory: (
      mode: SummaryModelProviderMode,
      deterministicSummaryModel: DeterministicSummaryModelAdapter,
      agentRuntimeSummaryModel: AgentRuntimeSummaryModelAdapter,
      openAiSummaryModel: OpenAiResponsesSummaryModelAdapter,
      metrics: InMemoryMetricsRecorder,
    ) => {
      const selectedModel =
        mode === "openai-responses"
          ? openAiSummaryModel
          : mode === "agent-runtime"
            ? agentRuntimeSummaryModel
            : deterministicSummaryModel;

      return new MeteredSummaryModelAdapter(selectedModel, metrics);
    },
    inject: [
      SUMMARY_MODEL_PROVIDER_MODE,
      DeterministicSummaryModelAdapter,
      AgentRuntimeSummaryModelAdapter,
      OpenAiResponsesSummaryModelAdapter,
      InMemoryMetricsRecorder,
    ],
  },
  {
    provide: UsageSummaryQuotaAdapter,
    useFactory: (reserveUsageQuota: ReserveUsageQuotaUseCase) =>
      new UsageSummaryQuotaAdapter(reserveUsageQuota, {
        quotaPerHour: resolveSummaryJobQuotaPerHour(process.env),
      }),
    inject: [ReserveUsageQuotaUseCase],
  },
  {
    provide: SUMMARY_USER_SUMMARY_PREFERENCE_READER,
    useFactory: (
      preferences: UserSummaryPreferenceRepositoryPort,
    ): UserSummaryPreferenceReaderPort =>
      new SubscriptionUserSummaryPreferenceReaderAdapter(preferences),
    inject: [SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY],
  },
];

export const summaryRestInfrastructureExports = [
  InMemoryMetricsRecorder,
  InMemoryQueuePublisher,
  InMemorySummaryEventPublisher,
  InMemorySummaryArtifactRepository,
  InMemorySummaryFeedbackRepository,
  InMemorySummaryJobRepository,
  InMemorySummaryPolicyRepository,
  SUMMARY_ARTIFACT_REPOSITORY,
  SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY,
  SUMMARY_EVIDENCE_SELECTOR,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_FEEDBACK_REPOSITORY,
  SUMMARY_JOB_QUEUE,
  SUMMARY_JOB_REPOSITORY,
  SUMMARY_POLICY_REPOSITORY,
  SUMMARY_USER_SUMMARY_PREFERENCE_READER,
  SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER,
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
