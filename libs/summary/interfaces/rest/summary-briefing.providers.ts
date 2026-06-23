import type { Provider } from '@nestjs/common';
import { FEED_ITEM_READ_REPOSITORY, type FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import {
  RabbitMqQueuePublisher,
  type RabbitMqQueueChannelPort,
  type RabbitMqQueuePublisherOptions,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import { RankFeedItemsUseCase } from '@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { FeedBriefingFreshnessProbe } from '../../adapters/evidence/feed-briefing-freshness.probe';
import { RelevanceBriefingEvidenceSelector } from '../../adapters/evidence/relevance-briefing-evidence.selector';
import { BriefingJobQueuePublisherAdapter } from '../../adapters/messaging/in-memory-briefing-job-queue.adapter';
import { DeterministicBriefingModelAdapter } from '../../adapters/model/deterministic-briefing-model.adapter';
import { MeteredBriefingModelAdapter } from '../../adapters/model/metered-briefing-model.adapter';
import {
  OpenAiResponsesBriefingModelAdapter,
  type OpenAiResponsesBriefingModelAdapterOptions,
} from '../../adapters/model/openai-responses-briefing-model.adapter';
import { InMemoryBriefingArtifactRepository } from '../../adapters/persistence/in-memory-briefing-artifact.repository';
import { InMemoryBriefingJobRepository } from '../../adapters/persistence/in-memory-briefing-job.repository';
import { InMemoryBriefingPolicyRepository } from '../../adapters/persistence/in-memory-briefing-policy.repository';
import { UsageSummaryQuotaAdapter } from '../../adapters/quota/usage-summary-quota.adapter';
import type { PrismaSummaryClient } from '../../adapters/persistence/prisma/prisma-summary-client';
import { PrismaBriefingArtifactRepository } from '../../adapters/persistence/prisma/prisma-briefing-artifact.repository';
import { PrismaBriefingJobRepository } from '../../adapters/persistence/prisma/prisma-briefing-job.repository';
import { PrismaBriefingPolicyRepository } from '../../adapters/persistence/prisma/prisma-briefing-policy.repository';
import { ExecuteBriefingJobUseCase } from '../../features/execute-briefing-job/execute-briefing-job.use-case';
import { GetBriefingJobStatusUseCase } from '../../features/get-briefing-job-status/get-briefing-job-status.use-case';
import { GetBriefingUseCase } from '../../features/get-briefing/get-briefing.use-case';
import { ListBriefingsUseCase } from '../../features/list-briefings/list-briefings.use-case';
import { RequestBriefingUseCase } from '../../features/request-briefing/request-briefing.use-case';
import {
  NOOP_BRIEFING_CONTEXT_PROVIDER,
  type BriefingArtifactRepositoryPort,
  type BriefingContextProviderPort,
  type BriefingEvidenceSelectorPort,
  type BriefingJobQueuePort,
  type BriefingJobRepositoryPort,
  type BriefingPolicyRepositoryPort,
  type SummaryEventPublisherPort,
} from '../../ports';
import {
  BRIEFING_ARTIFACT_REPOSITORY,
  BRIEFING_CONTEXT_PROVIDER,
  BRIEFING_EVIDENCE_SELECTOR,
  BRIEFING_JOB_QUEUE,
  BRIEFING_JOB_REPOSITORY,
  BRIEFING_MODEL_PROVIDER_MODE,
  BRIEFING_OPENAI_RESPONSES_MODEL_OPTIONS,
  BRIEFING_POLICY_REPOSITORY,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_JOB_QUEUE_MODE,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_PRISMA_CLIENT,
  SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
  SUMMARY_RABBITMQ_QUEUE_CHANNEL,
  type BriefingModelProviderMode,
  type SummaryJobQueueMode,
  type SummaryPersistenceMode,
} from './summary-provider-tokens';

export const summaryBriefingProviders: Provider[] = [
  InMemoryBriefingJobRepository,
  InMemoryBriefingArtifactRepository,
  InMemoryBriefingPolicyRepository,
  {
    provide: BRIEFING_JOB_QUEUE,
    useFactory: (
      mode: SummaryJobQueueMode,
      publisher: InMemoryQueuePublisher,
      metrics: InMemoryMetricsRecorder,
      rabbitChannel: RabbitMqQueueChannelPort | null,
      rabbitOptions: RabbitMqQueuePublisherOptions,
    ): BriefingJobQueuePort =>
      mode === 'rabbitmq'
        ? new BriefingJobQueuePublisherAdapter(
            new RabbitMqQueuePublisher(requireRabbitMqQueueChannel(rabbitChannel), rabbitOptions, new SystemClock()),
            metrics,
          )
        : new BriefingJobQueuePublisherAdapter(publisher, metrics),
    inject: [
      SUMMARY_JOB_QUEUE_MODE,
      InMemoryQueuePublisher,
      InMemoryMetricsRecorder,
      SUMMARY_RABBITMQ_QUEUE_CHANNEL,
      SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
    ],
  },
  {
    provide: BRIEFING_JOB_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryBriefingJobs: InMemoryBriefingJobRepository,
    ): BriefingJobRepositoryPort =>
      mode === 'prisma'
        ? new PrismaBriefingJobRepository(requirePrismaSummaryClient(prisma))
        : inMemoryBriefingJobs,
    inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT, InMemoryBriefingJobRepository],
  },
  {
    provide: BRIEFING_ARTIFACT_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryBriefingArtifacts: InMemoryBriefingArtifactRepository,
    ): BriefingArtifactRepositoryPort =>
      mode === 'prisma'
        ? new PrismaBriefingArtifactRepository(requirePrismaSummaryClient(prisma))
        : inMemoryBriefingArtifacts,
    inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT, InMemoryBriefingArtifactRepository],
  },
  {
    provide: BRIEFING_POLICY_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryBriefingPolicies: InMemoryBriefingPolicyRepository,
    ): BriefingPolicyRepositoryPort =>
      mode === 'prisma'
        ? new PrismaBriefingPolicyRepository(requirePrismaSummaryClient(prisma))
        : inMemoryBriefingPolicies,
    inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT, InMemoryBriefingPolicyRepository],
  },
  {
    provide: RelevanceBriefingEvidenceSelector,
    useFactory: (
      rankFeedItems: RankFeedItemsUseCase,
      feedItems: FeedItemReadRepositoryPort,
    ) => new RelevanceBriefingEvidenceSelector(rankFeedItems, feedItems, new SystemClock()),
    inject: [RankFeedItemsUseCase, FEED_ITEM_READ_REPOSITORY],
  },
  {
    provide: BRIEFING_EVIDENCE_SELECTOR,
    useFactory: (selector: RelevanceBriefingEvidenceSelector): BriefingEvidenceSelectorPort => selector,
    inject: [RelevanceBriefingEvidenceSelector],
  },
  {
    provide: FeedBriefingFreshnessProbe,
    useFactory: (feedItems: FeedItemReadRepositoryPort) =>
      new FeedBriefingFreshnessProbe(feedItems, new SystemClock()),
    inject: [FEED_ITEM_READ_REPOSITORY],
  },
  {
    provide: BRIEFING_CONTEXT_PROVIDER,
    useValue: NOOP_BRIEFING_CONTEXT_PROVIDER,
  },
  DeterministicBriefingModelAdapter,
  {
    provide: OpenAiResponsesBriefingModelAdapter,
    useFactory: (options: OpenAiResponsesBriefingModelAdapterOptions) =>
      new OpenAiResponsesBriefingModelAdapter(options),
    inject: [BRIEFING_OPENAI_RESPONSES_MODEL_OPTIONS],
  },
  {
    provide: MeteredBriefingModelAdapter,
    useFactory: (
      mode: BriefingModelProviderMode,
      deterministicBriefingModel: DeterministicBriefingModelAdapter,
      openAiBriefingModel: OpenAiResponsesBriefingModelAdapter,
      metrics: InMemoryMetricsRecorder,
    ) =>
      new MeteredBriefingModelAdapter(
        mode === 'openai-responses' ? openAiBriefingModel : deterministicBriefingModel,
        metrics,
      ),
    inject: [
      BRIEFING_MODEL_PROVIDER_MODE,
      DeterministicBriefingModelAdapter,
      OpenAiResponsesBriefingModelAdapter,
      InMemoryMetricsRecorder,
    ],
  },
  {
    provide: RequestBriefingUseCase,
    useFactory: (
      briefingJobs: BriefingJobRepositoryPort,
      briefingJobQueue: BriefingJobQueuePort,
      summaryQuota: UsageSummaryQuotaAdapter,
    ) =>
      new RequestBriefingUseCase(
        briefingJobs,
        briefingJobQueue,
        summaryQuota,
        new CryptoIdGenerator(),
        new SystemClock(),
      ),
    inject: [BRIEFING_JOB_REPOSITORY, BRIEFING_JOB_QUEUE, UsageSummaryQuotaAdapter],
  },
  {
    provide: ExecuteBriefingJobUseCase,
    useFactory: (
      briefingJobs: BriefingJobRepositoryPort,
      briefingArtifacts: BriefingArtifactRepositoryPort,
      briefingPolicies: BriefingPolicyRepositoryPort,
      evidenceSelector: BriefingEvidenceSelectorPort,
      briefingModel: MeteredBriefingModelAdapter,
      events: SummaryEventPublisherPort,
      contextProvider: BriefingContextProviderPort,
    ) =>
      new ExecuteBriefingJobUseCase(
        briefingJobs,
        briefingArtifacts,
        briefingPolicies,
        evidenceSelector,
        briefingModel,
        events,
        new CryptoIdGenerator(),
        new SystemClock(),
        contextProvider,
      ),
    inject: [
      BRIEFING_JOB_REPOSITORY,
      BRIEFING_ARTIFACT_REPOSITORY,
      BRIEFING_POLICY_REPOSITORY,
      BRIEFING_EVIDENCE_SELECTOR,
      MeteredBriefingModelAdapter,
      SUMMARY_EVENT_PUBLISHER,
      BRIEFING_CONTEXT_PROVIDER,
    ],
  },
  {
    provide: GetBriefingUseCase,
    useFactory: (
      briefingArtifacts: BriefingArtifactRepositoryPort,
      freshness: FeedBriefingFreshnessProbe,
    ) => new GetBriefingUseCase(briefingArtifacts, freshness),
    inject: [BRIEFING_ARTIFACT_REPOSITORY, FeedBriefingFreshnessProbe],
  },
  {
    provide: ListBriefingsUseCase,
    useFactory: (
      briefingArtifacts: BriefingArtifactRepositoryPort,
      freshness: FeedBriefingFreshnessProbe,
    ) => new ListBriefingsUseCase(briefingArtifacts, freshness),
    inject: [BRIEFING_ARTIFACT_REPOSITORY, FeedBriefingFreshnessProbe],
  },
  {
    provide: GetBriefingJobStatusUseCase,
    useFactory: (briefingJobs: BriefingJobRepositoryPort) => new GetBriefingJobStatusUseCase(briefingJobs),
    inject: [BRIEFING_JOB_REPOSITORY],
  },
];

const requirePrismaSummaryClient = (client: PrismaSummaryClient | null): PrismaSummaryClient => {
  if (client === null) {
    throw new Error('Prisma summary client is required when SUMMARY_PERSISTENCE=prisma');
  }

  return client;
};

const requireRabbitMqQueueChannel = (
  channel: RabbitMqQueueChannelPort | null,
): RabbitMqQueueChannelPort => {
  if (channel === null) {
    throw new Error('RabbitMQ queue channel is required when SUMMARY_JOB_QUEUE_MODE=rabbitmq');
  }

  return channel;
};
