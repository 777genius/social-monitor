import { Module } from "@nestjs/common";

import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import { AmqplibRabbitMqChannel } from "@social-monitor/platform-queue/adapters/rabbitmq";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { ExecuteSummaryJobUseCase } from "@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case";
import { ExecuteReaderSummaryJobCommandHandler } from "@social-monitor/summary/interfaces/queue/execute-reader-summary-job-command.handler";
import { ExecuteSummaryJobCommandHandler } from "@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler";
import { SummaryRestModule } from "@social-monitor/summary/interfaces/rest/summary-rest.module";
import { RelevanceRestModule } from "@social-monitor/relevance/interfaces/rest/relevance-rest.module";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import {
  WorkerRuntime,
  WorkerRuntimeModule,
} from "@social-monitor/platform-worker";
import { SystemClock } from "@social-monitor/shared-kernel";

import {
  INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS,
  INTELLIGENCE_READER_SUMMARY_JOB_LOOP_OPTIONS,
  INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_OPTIONS,
  INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS,
  INTELLIGENCE_RABBITMQ_READER_SUMMARY_QUEUE_READER_OPTIONS,
  INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
  INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
  INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP_OPTIONS,
  INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_OPTIONS,
  INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
  type IntelligenceSummaryQueueReaderMode,
  resolveIntelligenceAutoSummarySchedulerOptions,
  resolveIntelligencePeriodicReaderSummarySchedulerOptions,
  resolveIntelligenceReaderSummaryJobLoopOptions,
  resolveIntelligenceReaderSummaryQueueDrainLoopOptions,
  resolveIntelligenceRabbitMqReaderSummaryQueueReaderOptions,
  resolveIntelligenceRabbitMqSummaryQueueReaderOptions,
  resolveIntelligenceRelevanceMemoryProjectionLoopOptions,
  resolveIntelligenceSummaryJobLoopOptions,
  resolveIntelligenceSummaryQueueDrainLoopOptions,
  resolveIntelligenceSummaryQueueReaderMode,
} from "./intelligence-worker-provider-tokens";
import {
  INTELLIGENCE_READER_SUMMARY_JOB_QUEUE_READER,
  InMemorySummaryJobQueueReader,
  INTELLIGENCE_SUMMARY_JOB_QUEUE_READER,
  RabbitMqSummaryJobQueueReader,
  type SummaryJobQueueReaderPort,
  type RabbitMqSummaryQueueReaderChannelPort,
} from "./summary-job-queue-reader";
import { ReaderSummaryJobQueueDrainLoop } from "./reader-summary-job-queue-drain-loop";
import { ReaderSummaryJobPollingLoop } from "./reader-summary-job-polling-loop";
import { SummaryJobQueueDrainLoop } from "./summary-job-queue-drain-loop";
import { SummaryJobPollingLoop } from "./summary-job-polling-loop";
import { AutoSummarySchedulerLoop } from "./auto-summary-scheduler-loop";
import { PeriodicReaderSummarySchedulerLoop } from "./periodic-reader-summary-scheduler-loop";
import { RelevanceMemoryProjectionLoop } from "./relevance-memory-projection-loop";

const INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL = Symbol(
  "INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL",
);

@Module({
  imports: [
    WorkerRuntimeModule.register({ serviceName: "intelligence-worker" }),
    SummaryRestModule,
    RelevanceRestModule,
  ],
  providers: [
    {
      provide: INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceSummaryJobLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_READER_SUMMARY_JOB_LOOP_OPTIONS,
      useFactory: () => resolveIntelligenceReaderSummaryJobLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_OPTIONS,
      useFactory: () =>
        resolveIntelligenceAutoSummarySchedulerOptions(process.env),
    },
    {
      provide: INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_OPTIONS,
      useFactory: () =>
        resolveIntelligencePeriodicReaderSummarySchedulerOptions(process.env),
    },
    {
      provide: INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP_OPTIONS,
      useFactory: () =>
        resolveIntelligenceRelevanceMemoryProjectionLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
      useFactory: () => resolveIntelligenceSummaryQueueReaderMode(process.env),
    },
    {
      provide: INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS,
      useFactory: () =>
        resolveIntelligenceRabbitMqSummaryQueueReaderOptions(process.env),
    },
    {
      provide: INTELLIGENCE_RABBITMQ_READER_SUMMARY_QUEUE_READER_OPTIONS,
      useFactory: () =>
        resolveIntelligenceRabbitMqReaderSummaryQueueReaderOptions(process.env),
    },
    {
      provide: INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
      useFactory: () =>
        resolveIntelligenceSummaryQueueDrainLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
      useFactory: () =>
        resolveIntelligenceReaderSummaryQueueDrainLoopOptions(process.env),
    },
    {
      provide: INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL,
      useFactory: (
        mode: IntelligenceSummaryQueueReaderMode,
      ): RabbitMqSummaryQueueReaderChannelPort | null =>
        mode === "rabbitmq"
          ? new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? "" })
          : null,
      inject: [INTELLIGENCE_SUMMARY_QUEUE_READER_MODE],
    },
    {
      provide: INTELLIGENCE_SUMMARY_JOB_QUEUE_READER,
      useFactory: (
        mode: IntelligenceSummaryQueueReaderMode,
        queue: InMemoryQueuePublisher,
        channel: RabbitMqSummaryQueueReaderChannelPort | null,
        options: ReturnType<
          typeof resolveIntelligenceRabbitMqSummaryQueueReaderOptions
        >,
      ) =>
        mode === "rabbitmq"
          ? new RabbitMqSummaryJobQueueReader(
              requireRabbitMqSummaryQueueReaderChannel(channel),
              options,
            )
          : new InMemorySummaryJobQueueReader(queue),
      inject: [
        INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
        InMemoryQueuePublisher,
        INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL,
        INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS,
      ],
    },
    {
      provide: INTELLIGENCE_READER_SUMMARY_JOB_QUEUE_READER,
      useFactory: (
        mode: IntelligenceSummaryQueueReaderMode,
        queue: InMemoryQueuePublisher,
        channel: RabbitMqSummaryQueueReaderChannelPort | null,
        options: ReturnType<
          typeof resolveIntelligenceRabbitMqReaderSummaryQueueReaderOptions
        >,
      ) =>
        mode === "rabbitmq"
          ? new RabbitMqSummaryJobQueueReader(
              requireRabbitMqSummaryQueueReaderChannel(channel),
              options,
            )
          : new InMemorySummaryJobQueueReader(queue),
      inject: [
        INTELLIGENCE_SUMMARY_QUEUE_READER_MODE,
        InMemoryQueuePublisher,
        INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_CHANNEL,
        INTELLIGENCE_RABBITMQ_READER_SUMMARY_QUEUE_READER_OPTIONS,
      ],
    },
    {
      provide: ExecuteSummaryJobCommandHandler,
      useFactory: (
        executeSummaryJob: ExecuteSummaryJobUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) =>
        new ExecuteSummaryJobCommandHandler(
          executeSummaryJob,
          metrics,
          runtime,
        ),
      inject: [
        ExecuteSummaryJobUseCase,
        InMemoryMetricsRecorder,
        WorkerRuntime,
      ],
    },
    {
      provide: ExecuteReaderSummaryJobCommandHandler,
      useFactory: (
        executeReaderSummaryJob: ExecuteReaderSummaryJobUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) =>
        new ExecuteReaderSummaryJobCommandHandler(
          executeReaderSummaryJob,
          metrics,
          runtime,
        ),
      inject: [
        ExecuteReaderSummaryJobUseCase,
        InMemoryMetricsRecorder,
        WorkerRuntime,
      ],
    },
    SummaryJobPollingLoop,
    ReaderSummaryJobPollingLoop,
    AutoSummarySchedulerLoop,
    PeriodicReaderSummarySchedulerLoop,
    RelevanceMemoryProjectionLoop,
    {
      provide: SummaryJobQueueDrainLoop,
      useFactory: (
        queue: SummaryJobQueueReaderPort,
        handler: ExecuteSummaryJobCommandHandler,
        options: ReturnType<
          typeof resolveIntelligenceSummaryQueueDrainLoopOptions
        >,
        metrics: InMemoryMetricsRecorder,
      ) =>
        new SummaryJobQueueDrainLoop(
          queue,
          handler,
          options,
          metrics,
          new SystemClock(),
        ),
      inject: [
        INTELLIGENCE_SUMMARY_JOB_QUEUE_READER,
        ExecuteSummaryJobCommandHandler,
        INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
        InMemoryMetricsRecorder,
      ],
    },
    {
      provide: ReaderSummaryJobQueueDrainLoop,
      useFactory: (
        queue: SummaryJobQueueReaderPort,
        handler: ExecuteReaderSummaryJobCommandHandler,
        options: ReturnType<
          typeof resolveIntelligenceReaderSummaryQueueDrainLoopOptions
        >,
        metrics: InMemoryMetricsRecorder,
      ) =>
        new ReaderSummaryJobQueueDrainLoop(
          queue,
          handler,
          options,
          metrics,
          new SystemClock(),
        ),
      inject: [
        INTELLIGENCE_READER_SUMMARY_JOB_QUEUE_READER,
        ExecuteReaderSummaryJobCommandHandler,
        INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
        InMemoryMetricsRecorder,
      ],
    },
  ],
  exports: [
    ExecuteSummaryJobCommandHandler,
    ExecuteReaderSummaryJobCommandHandler,
    SummaryJobPollingLoop,
    ReaderSummaryJobPollingLoop,
    SummaryJobQueueDrainLoop,
    ReaderSummaryJobQueueDrainLoop,
    AutoSummarySchedulerLoop,
    PeriodicReaderSummarySchedulerLoop,
    RelevanceMemoryProjectionLoop,
  ],
})
export class IntelligenceWorkerModule {}

const requireRabbitMqSummaryQueueReaderChannel = (
  channel: RabbitMqSummaryQueueReaderChannelPort | null,
): RabbitMqSummaryQueueReaderChannelPort => {
  if (channel === null) {
    throw new Error(
      "RabbitMQ summary queue reader channel is required when INTELLIGENCE_SUMMARY_QUEUE_READER=rabbitmq",
    );
  }

  return channel;
};
