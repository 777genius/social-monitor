import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemorySummaryJobRepository } from '../../adapters/persistence/in-memory-summary-job.repository';
import { RequestSummaryUseCase } from '../../features/request-summary/request-summary.use-case';
import { SummaryRequestController } from './summary-request.controller';

@Module({
  controllers: [SummaryRequestController],
  providers: [
    InMemorySummaryJobRepository,
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
  ],
  exports: [InMemorySummaryJobRepository],
})
export class SummaryRestModule {}
