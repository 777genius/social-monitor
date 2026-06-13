import { Module } from '@nestjs/common';
import { FeedRestModule } from '@social-monitor/feed/interfaces/rest/feed-rest.module';
import { FEED_ITEM_READ_REPOSITORY, type FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import { IdentityAuthorizationModule } from '@social-monitor/identity/interfaces/authorization/identity-authorization.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { ReserveUsageQuotaUseCase } from '@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { UsageSummaryQuotaAdapter } from '../../adapters/quota/usage-summary-quota.adapter';
import { FeedSummaryEvidenceSelector } from '../../adapters/evidence/feed-summary-evidence.selector';
import { InMemorySummaryEventPublisher } from '../../adapters/messaging/in-memory-summary-event-publisher';
import { DeterministicSummaryModelAdapter } from '../../adapters/model/deterministic-summary-model.adapter';
import { MeteredSummaryModelAdapter } from '../../adapters/model/metered-summary-model.adapter';
import { InMemorySummaryArtifactRepository } from '../../adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '../../adapters/persistence/in-memory-summary-job.repository';
import { EvaluateSummaryQualityUseCase } from '../../features/evaluate-summary-quality/evaluate-summary-quality.use-case';
import { ExecuteSummaryJobUseCase } from '../../features/execute-summary-job/execute-summary-job.use-case';
import { GetSummaryJobStatusUseCase } from '../../features/get-summary-job-status/get-summary-job-status.use-case';
import { GetSummaryUseCase } from '../../features/get-summary/get-summary.use-case';
import { ListSummariesUseCase } from '../../features/list-summaries/list-summaries.use-case';
import { RegenerateSummaryUseCase } from '../../features/regenerate-summary/regenerate-summary.use-case';
import { RequestSummaryUseCase } from '../../features/request-summary/request-summary.use-case';
import { SummaryJobController } from './summary-job.controller';
import { SummaryRequestController } from './summary-request.controller';
import { SummaryController } from './summary.controller';

@Module({
  imports: [UsageRestModule, IdentityAuthorizationModule, FeedRestModule],
  controllers: [SummaryController, SummaryJobController, SummaryRequestController],
  providers: [
    InMemorySummaryJobRepository,
    InMemorySummaryArtifactRepository,
    InMemorySummaryEventPublisher,
    {
      provide: FeedSummaryEvidenceSelector,
      useFactory: (feedItems: FeedItemReadRepositoryPort) => new FeedSummaryEvidenceSelector(feedItems),
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
        summaryJobs: InMemorySummaryJobRepository,
        summaryQuota: UsageSummaryQuotaAdapter,
      ) =>
        new RequestSummaryUseCase(summaryJobs, summaryQuota, new CryptoIdGenerator(), new SystemClock()),
      inject: [InMemorySummaryJobRepository, UsageSummaryQuotaAdapter],
    },
    {
      provide: ExecuteSummaryJobUseCase,
      useFactory: (
        summaryJobs: InMemorySummaryJobRepository,
        summaryArtifacts: InMemorySummaryArtifactRepository,
        evidenceSelector: FeedSummaryEvidenceSelector,
        summaryModel: MeteredSummaryModelAdapter,
        events: InMemorySummaryEventPublisher,
      ) =>
        new ExecuteSummaryJobUseCase(
          summaryJobs,
          summaryArtifacts,
          evidenceSelector,
          summaryModel,
          events,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        InMemorySummaryJobRepository,
        InMemorySummaryArtifactRepository,
        FeedSummaryEvidenceSelector,
        MeteredSummaryModelAdapter,
        InMemorySummaryEventPublisher,
      ],
    },
    {
      provide: EvaluateSummaryQualityUseCase,
      useFactory: (summaryModel: MeteredSummaryModelAdapter) => new EvaluateSummaryQualityUseCase(summaryModel),
      inject: [MeteredSummaryModelAdapter],
    },
    {
      provide: GetSummaryUseCase,
      useFactory: (summaryArtifacts: InMemorySummaryArtifactRepository) => new GetSummaryUseCase(summaryArtifacts),
      inject: [InMemorySummaryArtifactRepository],
    },
    {
      provide: ListSummariesUseCase,
      useFactory: (summaryArtifacts: InMemorySummaryArtifactRepository) => new ListSummariesUseCase(summaryArtifacts),
      inject: [InMemorySummaryArtifactRepository],
    },
    {
      provide: GetSummaryJobStatusUseCase,
      useFactory: (summaryJobs: InMemorySummaryJobRepository) => new GetSummaryJobStatusUseCase(summaryJobs),
      inject: [InMemorySummaryJobRepository],
    },
    {
      provide: RegenerateSummaryUseCase,
      useFactory: (
        summaryArtifacts: InMemorySummaryArtifactRepository,
        summaryJobs: InMemorySummaryJobRepository,
        summaryQuota: UsageSummaryQuotaAdapter,
      ) =>
        new RegenerateSummaryUseCase(
          summaryArtifacts,
          summaryJobs,
          summaryQuota,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [InMemorySummaryArtifactRepository, InMemorySummaryJobRepository, UsageSummaryQuotaAdapter],
    },
  ],
  exports: [
    EvaluateSummaryQualityUseCase,
    ExecuteSummaryJobUseCase,
    GetSummaryJobStatusUseCase,
    InMemoryMetricsRecorder,
    InMemorySummaryEventPublisher,
    InMemorySummaryArtifactRepository,
    InMemorySummaryJobRepository,
    RegenerateSummaryUseCase,
  ],
})
export class SummaryRestModule {}
