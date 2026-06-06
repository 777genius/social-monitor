import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { EmptySummaryEvidenceSelector } from '../../adapters/evidence/empty-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '../../adapters/model/deterministic-summary-model.adapter';
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
  controllers: [SummaryController, SummaryJobController, SummaryRequestController],
  providers: [
    InMemorySummaryJobRepository,
    InMemorySummaryArtifactRepository,
    EmptySummaryEvidenceSelector,
    DeterministicSummaryModelAdapter,
    {
      provide: RequestSummaryUseCase,
      useFactory: (summaryJobs: InMemorySummaryJobRepository) =>
        new RequestSummaryUseCase(
          summaryJobs,
          new CryptoIdGenerator(),
          new SystemClock(),
      ),
      inject: [InMemorySummaryJobRepository],
    },
    {
      provide: ExecuteSummaryJobUseCase,
      useFactory: (
        summaryJobs: InMemorySummaryJobRepository,
        summaryArtifacts: InMemorySummaryArtifactRepository,
        evidenceSelector: EmptySummaryEvidenceSelector,
        summaryModel: DeterministicSummaryModelAdapter,
      ) =>
        new ExecuteSummaryJobUseCase(
          summaryJobs,
          summaryArtifacts,
          evidenceSelector,
          summaryModel,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        InMemorySummaryJobRepository,
        InMemorySummaryArtifactRepository,
        EmptySummaryEvidenceSelector,
        DeterministicSummaryModelAdapter,
      ],
    },
    {
      provide: EvaluateSummaryQualityUseCase,
      useFactory: (summaryModel: DeterministicSummaryModelAdapter) => new EvaluateSummaryQualityUseCase(summaryModel),
      inject: [DeterministicSummaryModelAdapter],
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
      ) =>
        new RegenerateSummaryUseCase(
          summaryArtifacts,
          summaryJobs,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [InMemorySummaryArtifactRepository, InMemorySummaryJobRepository],
    },
  ],
  exports: [
    EvaluateSummaryQualityUseCase,
    ExecuteSummaryJobUseCase,
    GetSummaryJobStatusUseCase,
    InMemorySummaryArtifactRepository,
    InMemorySummaryJobRepository,
    RegenerateSummaryUseCase,
  ],
})
export class SummaryRestModule {}
