import { Module } from '@nestjs/common';

import {
  AmqplibRabbitMqChannel,
  InMemoryQueuePublisher,
} from '@social-monitor/platform-queue';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { ExecuteSummaryJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime, WorkerRuntimeModule } from '@social-monitor/platform-worker';

import {
  INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS,
  INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS,
  INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
  INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
  type IntelligenceSummaryQueueReaderMode,
  resolveIntelligenceRabbitMqSummaryQueueReaderOptions,
  resolveIntelligenceSummaryJobLoopOptions,
  resolveIntelligenceSummaryQueueDrainLoopOptions,
  resolveIntelligenceSummaryQueueReaderMode,
} from './intelligence-worker-provider-tokens';
import {
  InMemorySummaryJobQueueReader,
  INTELLIGENCE_SUMMARY_JOB_QUEUE_READER,
  RabbitMqSummaryJobQueueReader,
  type RabbitMqSummaryQueueReaderChannelPort,
} from './summary-job-queue-reader';
import { SummaryJobQueueDrainLoop } from './summary-job-queue-drain-loop';
import { SummaryJobPollingLoop } from './summary-job-polling-loop';

const INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL = Symbol('INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL');

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'intelligence-worker' }), SummaryRestModule],
  providers: [
    {
      provide: INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceSummaryJobLoopOptions(process.env),
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
      provide: INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceSummaryQueueDrainLoopOptions(process.env),
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
      provide: ExecuteSummaryJobCommandHandler,
      useFactory: (
        executeSummaryJob: ExecuteSummaryJobUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new ExecuteSummaryJobCommandHandler(executeSummaryJob, metrics, runtime),
      inject: [ExecuteSummaryJobUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
    SummaryJobPollingLoop,
    SummaryJobQueueDrainLoop,
  ],
  exports: [ExecuteSummaryJobCommandHandler, SummaryJobPollingLoop, SummaryJobQueueDrainLoop],
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
