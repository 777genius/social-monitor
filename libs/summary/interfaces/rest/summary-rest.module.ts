import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { EmptySummaryEvidenceSelector } from '../../adapters/evidence/empty-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '../../adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryArtifactRepository } from '../../adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '../../adapters/persistence/in-memory-summary-job.repository';
import { ExecuteSummaryJobUseCase } from '../../features/execute-summary-job/execute-summary-job.use-case';
import { RequestSummaryUseCase } from '../../features/request-summary/request-summary.use-case';
import { SummaryRequestController } from './summary-request.controller';

@Module({
  controllers: [SummaryRequestController],
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
  ],
  exports: [ExecuteSummaryJobUseCase, InMemorySummaryArtifactRepository, InMemorySummaryJobRepository],
})
export class SummaryRestModule {}
