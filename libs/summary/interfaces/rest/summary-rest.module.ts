import { Module } from '@nestjs/common';
import { FeedRestModule } from '@social-monitor/feed/interfaces/rest/feed-rest.module';
import { FEED_ITEM_READ_REPOSITORY, type FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import {
  AmqplibRabbitMqChannel,
  InMemoryQueuePublisher,
  RabbitMqQueuePublisher,
  type RabbitMqQueueChannelPort,
  type RabbitMqQueuePublisherOptions,
} from '@social-monitor/platform-queue';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { ReserveUsageQuotaUseCase } from '@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { UsageSummaryQuotaAdapter } from '../../adapters/quota/usage-summary-quota.adapter';
import { FeedSummaryEvidenceSelector } from '../../adapters/evidence/feed-summary-evidence.selector';
import { FeedSummaryFreshnessProbe } from '../../adapters/evidence/feed-summary-freshness.probe';
import { InMemorySummaryEventPublisher } from '../../adapters/messaging/in-memory-summary-event-publisher';
import {
  InMemorySummaryJobQueueAdapter,
  SummaryJobQueuePublisherAdapter,
} from '../../adapters/messaging/in-memory-summary-job-queue.adapter';
import { DeterministicSummaryModelAdapter } from '../../adapters/model/deterministic-summary-model.adapter';
import { MeteredSummaryModelAdapter } from '../../adapters/model/metered-summary-model.adapter';
import { InMemorySummaryArtifactRepository } from '../../adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryFeedbackRepository } from '../../adapters/persistence/in-memory-summary-feedback.repository';
import { InMemorySummaryJobRepository } from '../../adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '../../adapters/persistence/in-memory-summary-policy.repository';
import { PrismaSummaryConnection } from '../../adapters/persistence/prisma/prisma-summary-connection';
import type { PrismaSummaryClient } from '../../adapters/persistence/prisma/prisma-summary-client';
import { PrismaSummaryArtifactRepository } from '../../adapters/persistence/prisma/prisma-summary-artifact.repository';
import { PrismaSummaryEventPublisher } from '../../adapters/persistence/prisma/prisma-summary-event.publisher';
import { PrismaSummaryFeedbackRepository } from '../../adapters/persistence/prisma/prisma-summary-feedback.repository';
import { PrismaSummaryJobRepository } from '../../adapters/persistence/prisma/prisma-summary-job.repository';
import { PrismaSummaryPolicyRepository } from '../../adapters/persistence/prisma/prisma-summary-policy.repository';
import { EvaluateSummaryQualityUseCase } from '../../features/evaluate-summary-quality/evaluate-summary-quality.use-case';
import { ExecuteSummaryJobUseCase } from '../../features/execute-summary-job/execute-summary-job.use-case';
import { GetSummaryPolicyUseCase } from '../../features/get-summary-policy/get-summary-policy.use-case';
import { GetSummaryJobStatusUseCase } from '../../features/get-summary-job-status/get-summary-job-status.use-case';
import { GetSummaryUseCase } from '../../features/get-summary/get-summary.use-case';
import { ListSummaryFeedbackUseCase } from '../../features/list-summary-feedback/list-summary-feedback.use-case';
import { ListSummariesUseCase } from '../../features/list-summaries/list-summaries.use-case';
import { RecordSummaryFeedbackUseCase } from '../../features/record-summary-feedback/record-summary-feedback.use-case';
import { RegenerateSummaryUseCase } from '../../features/regenerate-summary/regenerate-summary.use-case';
import { RequestSummaryUseCase } from '../../features/request-summary/request-summary.use-case';
import { UpsertSummaryPolicyUseCase } from '../../features/upsert-summary-policy/upsert-summary-policy.use-case';
import type {
  SummaryArtifactRepositoryPort,
  SummaryEventPublisherPort,
  SummaryFeedbackRepositoryPort,
  SummaryJobQueuePort,
  SummaryJobRepositoryPort,
  SummaryPolicyRepositoryPort,
} from '../../ports';
import { SummaryFeedbackController } from './summary-feedback.controller';
import { SummaryJobController } from './summary-job.controller';
import { SummaryPolicyController } from './summary-policy.controller';
import {
  SUMMARY_ARTIFACT_REPOSITORY,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_JOB_QUEUE_MODE,
  SUMMARY_FEEDBACK_REPOSITORY,
  SUMMARY_JOB_QUEUE,
  SUMMARY_JOB_REPOSITORY,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_POLICY_REPOSITORY,
  SUMMARY_PRISMA_CLIENT,
  SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
  SUMMARY_RABBITMQ_QUEUE_CHANNEL,
  type SummaryJobQueueMode,
  type SummaryPersistenceMode,
  summaryJobQueueModeProvider,
  summaryPersistenceModeProvider,
  summaryRabbitMqJobQueueOptionsProvider,
} from './summary-provider-tokens';
import { SummaryRequestController } from './summary-request.controller';
import { SummaryController } from './summary.controller';

@Module({
  imports: [UsageRestModule, IdentityRestModule, FeedRestModule],
  controllers: [
    SummaryController,
    SummaryFeedbackController,
    SummaryJobController,
    SummaryPolicyController,
    SummaryRequestController,
  ],
  providers: [
    summaryPersistenceModeProvider,
    summaryJobQueueModeProvider,
    summaryRabbitMqJobQueueOptionsProvider,
    {
      provide: SUMMARY_PRISMA_CLIENT,
      useFactory: (mode: SummaryPersistenceMode): PrismaSummaryClient | null =>
        mode === 'prisma' ? new PrismaSummaryConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [SUMMARY_PERSISTENCE_MODE],
    },
    InMemorySummaryJobRepository,
    InMemorySummaryArtifactRepository,
    InMemorySummaryFeedbackRepository,
    InMemorySummaryPolicyRepository,
    InMemoryQueuePublisher,
    {
      provide: SUMMARY_RABBITMQ_QUEUE_CHANNEL,
      useFactory: (mode: SummaryJobQueueMode): RabbitMqQueueChannelPort | null =>
        mode === 'rabbitmq'
          ? new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? '' })
          : null,
      inject: [SUMMARY_JOB_QUEUE_MODE],
    },
    {
      provide: SUMMARY_JOB_QUEUE,
      useFactory: (
        mode: SummaryJobQueueMode,
        publisher: InMemoryQueuePublisher,
        metrics: InMemoryMetricsRecorder,
        rabbitChannel: RabbitMqQueueChannelPort | null,
        rabbitOptions: RabbitMqQueuePublisherOptions,
      ): SummaryJobQueuePort =>
        mode === 'rabbitmq'
          ? new SummaryJobQueuePublisherAdapter(
              new RabbitMqQueuePublisher(requireRabbitMqQueueChannel(rabbitChannel), rabbitOptions),
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
        mode === 'prisma'
          ? new PrismaSummaryJobRepository(requirePrismaSummaryClient(prisma))
          : inMemorySummaryJobs,
      inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT, InMemorySummaryJobRepository],
    },
    {
      provide: SUMMARY_ARTIFACT_REPOSITORY,
      useFactory: (
        mode: SummaryPersistenceMode,
        prisma: PrismaSummaryClient | null,
        inMemorySummaryArtifacts: InMemorySummaryArtifactRepository,
      ): SummaryArtifactRepositoryPort =>
        mode === 'prisma'
          ? new PrismaSummaryArtifactRepository(requirePrismaSummaryClient(prisma))
          : inMemorySummaryArtifacts,
      inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT, InMemorySummaryArtifactRepository],
    },
    {
      provide: SUMMARY_FEEDBACK_REPOSITORY,
      useFactory: (
        mode: SummaryPersistenceMode,
        prisma: PrismaSummaryClient | null,
        inMemorySummaryFeedback: InMemorySummaryFeedbackRepository,
      ): SummaryFeedbackRepositoryPort =>
        mode === 'prisma'
          ? new PrismaSummaryFeedbackRepository(requirePrismaSummaryClient(prisma))
          : inMemorySummaryFeedback,
      inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT, InMemorySummaryFeedbackRepository],
    },
    {
      provide: SUMMARY_POLICY_REPOSITORY,
      useFactory: (
        mode: SummaryPersistenceMode,
        prisma: PrismaSummaryClient | null,
        inMemorySummaryPolicies: InMemorySummaryPolicyRepository,
      ): SummaryPolicyRepositoryPort =>
        mode === 'prisma'
          ? new PrismaSummaryPolicyRepository(requirePrismaSummaryClient(prisma))
          : inMemorySummaryPolicies,
      inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT, InMemorySummaryPolicyRepository],
    },
    InMemorySummaryEventPublisher,
    {
      provide: SUMMARY_EVENT_PUBLISHER,
      useFactory: (
        mode: SummaryPersistenceMode,
        prisma: PrismaSummaryClient | null,
        inMemoryEvents: InMemorySummaryEventPublisher,
      ): SummaryEventPublisherPort =>
        mode === 'prisma'
          ? new PrismaSummaryEventPublisher(requirePrismaSummaryClient(prisma))
          : inMemoryEvents,
      inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT, InMemorySummaryEventPublisher],
    },
    {
      provide: FeedSummaryEvidenceSelector,
      useFactory: (feedItems: FeedItemReadRepositoryPort) => new FeedSummaryEvidenceSelector(feedItems),
      inject: [FEED_ITEM_READ_REPOSITORY],
    },
    {
      provide: FeedSummaryFreshnessProbe,
      useFactory: (feedItems: FeedItemReadRepositoryPort) =>
        new FeedSummaryFreshnessProbe(feedItems, new SystemClock()),
      inject: [FEED_ITEM_READ_REPOSITORY],
    },
    InMemoryMetricsRecorder,
    DeterministicSummaryModelAdapter,
    {
      provide: MeteredSummaryModelAdapter,
      useFactory: (summaryModel: DeterministicSummaryModelAdapter, metrics: InMemoryMetricsRecorder) =>
        new MeteredSummaryModelAdapter(summaryModel, metrics),
      inject: [DeterministicSummaryModelAdapter, InMemoryMetricsRecorder],
    },
    {
      provide: UsageSummaryQuotaAdapter,
      useFactory: (reserveUsageQuota: ReserveUsageQuotaUseCase) =>
        new UsageSummaryQuotaAdapter(reserveUsageQuota),
      inject: [ReserveUsageQuotaUseCase],
    },
    {
      provide: RequestSummaryUseCase,
      useFactory: (
        summaryJobs: SummaryJobRepositoryPort,
        summaryJobQueue: SummaryJobQueuePort,
        summaryQuota: UsageSummaryQuotaAdapter,
      ) =>
        new RequestSummaryUseCase(
          summaryJobs,
          summaryJobQueue,
          summaryQuota,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [SUMMARY_JOB_REPOSITORY, SUMMARY_JOB_QUEUE, UsageSummaryQuotaAdapter],
    },
    {
      provide: ExecuteSummaryJobUseCase,
      useFactory: (
        summaryJobs: SummaryJobRepositoryPort,
        summaryArtifacts: SummaryArtifactRepositoryPort,
        summaryPolicies: SummaryPolicyRepositoryPort,
        evidenceSelector: FeedSummaryEvidenceSelector,
        summaryModel: MeteredSummaryModelAdapter,
        events: SummaryEventPublisherPort,
      ) =>
        new ExecuteSummaryJobUseCase(
          summaryJobs,
          summaryArtifacts,
          summaryPolicies,
          evidenceSelector,
          summaryModel,
          events,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        SUMMARY_JOB_REPOSITORY,
        SUMMARY_ARTIFACT_REPOSITORY,
        SUMMARY_POLICY_REPOSITORY,
        FeedSummaryEvidenceSelector,
        MeteredSummaryModelAdapter,
        SUMMARY_EVENT_PUBLISHER,
      ],
    },
    {
      provide: EvaluateSummaryQualityUseCase,
      useFactory: (summaryModel: MeteredSummaryModelAdapter) => new EvaluateSummaryQualityUseCase(summaryModel),
      inject: [MeteredSummaryModelAdapter],
    },
    {
      provide: GetSummaryPolicyUseCase,
      useFactory: (summaryPolicies: SummaryPolicyRepositoryPort) =>
        new GetSummaryPolicyUseCase(summaryPolicies, new CryptoIdGenerator(), new SystemClock()),
      inject: [SUMMARY_POLICY_REPOSITORY],
    },
    {
      provide: UpsertSummaryPolicyUseCase,
      useFactory: (summaryPolicies: SummaryPolicyRepositoryPort) =>
        new UpsertSummaryPolicyUseCase(summaryPolicies, new CryptoIdGenerator(), new SystemClock()),
      inject: [SUMMARY_POLICY_REPOSITORY],
    },
    {
      provide: GetSummaryUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        freshness: FeedSummaryFreshnessProbe,
      ) => new GetSummaryUseCase(summaryArtifacts, freshness),
      inject: [SUMMARY_ARTIFACT_REPOSITORY, FeedSummaryFreshnessProbe],
    },
    {
      provide: ListSummariesUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        freshness: FeedSummaryFreshnessProbe,
      ) => new ListSummariesUseCase(summaryArtifacts, freshness),
      inject: [SUMMARY_ARTIFACT_REPOSITORY, FeedSummaryFreshnessProbe],
    },
    {
      provide: GetSummaryJobStatusUseCase,
      useFactory: (summaryJobs: SummaryJobRepositoryPort) => new GetSummaryJobStatusUseCase(summaryJobs),
      inject: [SUMMARY_JOB_REPOSITORY],
    },
    {
      provide: ListSummaryFeedbackUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        feedback: SummaryFeedbackRepositoryPort,
      ) => new ListSummaryFeedbackUseCase(summaryArtifacts, feedback),
      inject: [SUMMARY_ARTIFACT_REPOSITORY, SUMMARY_FEEDBACK_REPOSITORY],
    },
    {
      provide: RecordSummaryFeedbackUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        feedback: SummaryFeedbackRepositoryPort,
      ) =>
        new RecordSummaryFeedbackUseCase(
          summaryArtifacts,
          feedback,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [SUMMARY_ARTIFACT_REPOSITORY, SUMMARY_FEEDBACK_REPOSITORY],
    },
    {
      provide: RegenerateSummaryUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        summaryJobs: SummaryJobRepositoryPort,
        summaryQuota: UsageSummaryQuotaAdapter,
      ) =>
        new RegenerateSummaryUseCase(
          summaryArtifacts,
          summaryJobs,
          summaryQuota,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [SUMMARY_ARTIFACT_REPOSITORY, SUMMARY_JOB_REPOSITORY, UsageSummaryQuotaAdapter],
    },
  ],
  exports: [
    EvaluateSummaryQualityUseCase,
    ExecuteSummaryJobUseCase,
    GetSummaryJobStatusUseCase,
    InMemoryMetricsRecorder,
    InMemoryQueuePublisher,
    InMemorySummaryEventPublisher,
    InMemorySummaryArtifactRepository,
    InMemorySummaryFeedbackRepository,
    InMemorySummaryJobRepository,
    InMemorySummaryPolicyRepository,
    ListSummaryFeedbackUseCase,
    SUMMARY_ARTIFACT_REPOSITORY,
    SUMMARY_FEEDBACK_REPOSITORY,
    SUMMARY_EVENT_PUBLISHER,
    SUMMARY_JOB_QUEUE,
    SUMMARY_JOB_REPOSITORY,
    SUMMARY_POLICY_REPOSITORY,
    GetSummaryPolicyUseCase,
    RecordSummaryFeedbackUseCase,
    RegenerateSummaryUseCase,
    UpsertSummaryPolicyUseCase,
  ],
})
export class SummaryRestModule {}

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
