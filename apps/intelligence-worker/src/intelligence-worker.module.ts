import { Module } from '@nestjs/common';

import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { ExecuteSummaryJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime, WorkerRuntimeModule } from '@social-monitor/platform-worker';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'intelligence-worker' }), SummaryRestModule],
  providers: [
    {
      provide: ExecuteSummaryJobCommandHandler,
      useFactory: (
        executeSummaryJob: ExecuteSummaryJobUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new ExecuteSummaryJobCommandHandler(executeSummaryJob, metrics, runtime),
      inject: [ExecuteSummaryJobUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
  ],
  exports: [ExecuteSummaryJobCommandHandler],
})
export class IntelligenceWorkerModule {}
