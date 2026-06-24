import { Module } from '@nestjs/common';

import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { AmqplibRabbitMqChannel } from '@social-monitor/platform-queue/adapters/rabbitmq';
import { ExecuteBriefingJobUseCase } from '@social-monitor/summary/features/execute-briefing-job/execute-briefing-job.use-case';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { ExecuteBriefingJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-briefing-job-command.handler';
import { ExecuteSummaryJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import { RelevanceRestModule } from '@social-monitor/relevance/interfaces/rest/relevance-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime, WorkerRuntimeModule } from '@social-monitor/platform-worker';
import { SystemClock } from '@social-monitor/shared-kernel';

import {
  INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS,
  INTELLIGENCE_BRIEFING_JOB_LOOP_OPTIONS,
  INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_OPTIONS,
  INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS,
  INTELLIGENCE_RABBITMQ_BRIEFING_QUEUE_READER_OPTIONS,
  INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
  INTELLIGENCE_BRIEFING_QUEUE_DRAIN_LOOP_OPTIONS,
  INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP_OPTIONS,
  INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
  type IntelligenceSummaryQueueReaderMode,
  resolveIntelligenceAutoSummarySchedulerOptions,
  resolveIntelligenceBriefingJobLoopOptions,
  resolveIntelligenceBriefingQueueDrainLoopOptions,
  resolveIntelligenceRabbitMqBriefingQueueReaderOptions,
  resolveIntelligenceRabbitMqSummaryQueueReaderOptions,
  resolveIntelligenceRelevanceMemoryProjectionLoopOptions,
  resolveIntelligenceSummaryJobLoopOptions,
  resolveIntelligenceSummaryQueueDrainLoopOptions,
  resolveIntelligenceSummaryQueueReaderMode,
} from './intelligence-worker-provider-tokens';
import {
  INTELLIGENCE_BRIEFING_JOB_QUEUE_READER,
  InMemorySummaryJobQueueReader,
  INTELLIGENCE_SUMMARY_JOB_QUEUE_READER,
  RabbitMqSummaryJobQueueReader,
  type SummaryJobQueueReaderPort,
  type RabbitMqSummaryQueueReaderChannelPort,
} from './summary-job-queue-reader';
import { BriefingJobQueueDrainLoop } from './briefing-job-queue-drain-loop';
import { BriefingJobPollingLoop } from './briefing-job-polling-loop';
import { SummaryJobQueueDrainLoop } from './summary-job-queue-drain-loop';
import { SummaryJobPollingLoop } from './summary-job-polling-loop';
import { AutoSummarySchedulerLoop } from './auto-summary-scheduler-loop';
import { RelevanceMemoryProjectionLoop } from './relevance-memory-projection-loop';

const INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL = Symbol('INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL');

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'intelligence-worker' }), SummaryRestModule, RelevanceRestModule],
  providers: [
    {
      provide: INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceSummaryJobLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_BRIEFING_JOB_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceBriefingJobLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_OPTIONS,
      useFactory: () => resolveIntelligenceAutoSummarySchedulerOptions(process.env),
    },
    {
      provide: INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceRelevanceMemoryProjectionLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
      useFactory: () => resolveIntelligenceSummaryQueueReaderMode(process.env),
    },
    {
      provide: INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS,
      useFactory: () => resolveIntelligenceRabbitMqSummaryQueueReaderOptions(process.env),
    },
    {
      provide: INTELLIGENCE_RABBITMQ_BRIEFING_QUEUE_READER_OPTIONS,
      useFactory: () => resolveIntelligenceRabbitMqBriefingQueueReaderOptions(process.env),
    },
    {
      provide: INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceSummaryQueueDrainLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_BRIEFING_QUEUE_DRAIN_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceBriefingQueueDrainLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL,
      useFactory: (mode: IntelligenceSummaryQueueReaderMode): RabbitMqSummaryQueueReaderChannelPort | null =>
        mode === 'rabbitmq'
          ? new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? '' })
          : null,
      inject: [INTELLIGENCE_SUMMARY_QUEUE_READER_MODE],
    },
    {
      provide: INTELLIGENCE_SUMMARY_JOB_QUEUE_READER,
      useFactory: (
        mode: IntelligenceSummaryQueueReaderMode,
        queue: InMemoryQueuePublisher,
        channel: RabbitMqSummaryQueueReaderChannelPort | null,
        options: ReturnType<typeof resolveIntelligenceRabbitMqSummaryQueueReaderOptions>,
      ) =>
        mode === 'rabbitmq'
          ? new RabbitMqSummaryJobQueueReader(requireRabbitMqSummaryQueueReaderChannel(channel), options)
          : new InMemorySummaryJobQueueReader(queue),
      inject: [
        INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
        InMemoryQueuePublisher,
        INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL,
        INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS,
      ],
    },
    {
      provide: INTELLIGENCE_BRIEFING_JOB_QUEUE_READER,
      useFactory: (
        mode: IntelligenceSummaryQueueReaderMode,
        queue: InMemoryQueuePublisher,
        channel: RabbitMqSummaryQueueReaderChannelPort | null,
        options: ReturnType<typeof resolveIntelligenceRabbitMqBriefingQueueReaderOptions>,
      ) =>
        mode === 'rabbitmq'
          ? new RabbitMqSummaryJobQueueReader(requireRabbitMqSummaryQueueReaderChannel(channel), options)
          : new InMemorySummaryJobQueueReader(queue),
      inject: [
        INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
        InMemoryQueuePublisher,
        INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL,
        INTELLIGENCE_RABBITMQ_BRIEFING_QUEUE_READER_OPTIONS,
      ],
    },
    {
      provide: ExecuteSummaryJobCommandHandler,
      useFactory: (
        executeSummaryJob: ExecuteSummaryJobUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new ExecuteSummaryJobCommandHandler(executeSummaryJob, metrics, runtime),
      inject: [ExecuteSummaryJobUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
    {
      provide: ExecuteBriefingJobCommandHandler,
      useFactory: (
        executeBriefingJob: ExecuteBriefingJobUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new ExecuteBriefingJobCommandHandler(executeBriefingJob, metrics, runtime),
      inject: [ExecuteBriefingJobUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
    SummaryJobPollingLoop,
    BriefingJobPollingLoop,
    AutoSummarySchedulerLoop,
    RelevanceMemoryProjectionLoop,
    {
      provide: SummaryJobQueueDrainLoop,
      useFactory: (
        queue: SummaryJobQueueReaderPort,
        handler: ExecuteSummaryJobCommandHandler,
        options: ReturnType<typeof resolveIntelligenceSummaryQueueDrainLoopOptions>,
        metrics: InMemoryMetricsRecorder,
      ) => new SummaryJobQueueDrainLoop(queue, handler, options, metrics, new SystemClock()),
      inject: [
        INTELLIGENCE_SUMMARY_JOB_QUEUE_READER,
        ExecuteSummaryJobCommandHandler,
        INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
        InMemoryMetricsRecorder,
      ],
    },
    {
      provide: BriefingJobQueueDrainLoop,
      useFactory: (
        queue: SummaryJobQueueReaderPort,
        handler: ExecuteBriefingJobCommandHandler,
        options: ReturnType<typeof resolveIntelligenceBriefingQueueDrainLoopOptions>,
        metrics: InMemoryMetricsRecorder,
      ) => new BriefingJobQueueDrainLoop(queue, handler, options, metrics, new SystemClock()),
      inject: [
        INTELLIGENCE_BRIEFING_JOB_QUEUE_READER,
        ExecuteBriefingJobCommandHandler,
        INTELLIGENCE_BRIEFING_QUEUE_DRAIN_LOOP_OPTIONS,
        InMemoryMetricsRecorder,
      ],
    },
  ],
  exports: [
    ExecuteSummaryJobCommandHandler,
    ExecuteBriefingJobCommandHandler,
    SummaryJobPollingLoop,
    BriefingJobPollingLoop,
    SummaryJobQueueDrainLoop,
    BriefingJobQueueDrainLoop,
    AutoSummarySchedulerLoop,
    RelevanceMemoryProjectionLoop,
  ],
})
export class IntelligenceWorkerModule {}

const requireRabbitMqSummaryQueueReaderChannel = (
  channel: RabbitMqSummaryQueueReaderChannelPort | null,
): RabbitMqSummaryQueueReaderChannelPort => {
  if (channel === null) {
    throw new Error('RabbitMQ summary queue reader channel is required when INTELLIGENCE_SUMMARY_QUEUE_READER=rabbitmq');
  }

  return channel;
};
