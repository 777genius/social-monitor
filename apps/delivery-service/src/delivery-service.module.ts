import { ProjectReaderSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { ProjectReaderSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-reader-summary-ready-event.handler';
import { SummaryReadyEventDispatcher } from '@social-monitor/delivery/interfaces/events/summary-ready-event.dispatcher';
import { Module } from '@nestjs/common';

import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import {
  AmqplibRabbitMqChannel,
  RabbitMqQueuePublisher,
  type RabbitMqQueueChannelPort,
  type RabbitMqQueuePublisherOptions,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import { DeliveryAttemptDispatchQueuePublisherAdapter } from '@social-monitor/delivery/adapters/messaging/in-memory-delivery-attempt-dispatch-queue.adapter';
import { ScheduleDueDigestsUseCase } from '@social-monitor/delivery/features/schedule-due-digests/schedule-due-digests.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { EnqueueDeliveryAttemptDispatchUseCase } from '@social-monitor/delivery/features/enqueue-delivery-attempt-dispatch/enqueue-delivery-attempt-dispatch.use-case';
import { ProjectSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-summary-ready-event/project-summary-ready-event.use-case';
import { ProjectSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-summary-ready-event.handler';
import { ScheduleDueDigestsCommandHandler } from '@social-monitor/delivery/interfaces/queue/schedule-due-digests-command.handler';
import { SendDeliveryAttemptCommandHandler } from '@social-monitor/delivery/interfaces/queue/send-delivery-attempt-command.handler';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import { DELIVERY_ATTEMPT_REPOSITORY } from '@social-monitor/delivery/interfaces/rest/delivery-provider-tokens';
import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import {
  METRICS_RECORDER,
  MetricsRuntimeModule,
} from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { WorkerRuntime, WorkerRuntimeModule } from '@social-monitor/platform-worker';
import { SystemClock } from '@social-monitor/shared-kernel';
import type {
  DeliveryAttemptDispatchQueuePort,
  DeliveryAttemptRepositoryPort,
} from '@social-monitor/delivery/ports';

import {
  DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS,
  DELIVERY_ATTEMPT_DISPATCH_QUEUE_MODE,
  DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP_OPTIONS,
  DELIVERY_ATTEMPT_QUEUE_READER_MODE,
  DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS,
  DELIVERY_RABBITMQ_ATTEMPT_QUEUE_OPTIONS,
  DELIVERY_RABBITMQ_ATTEMPT_QUEUE_READER_OPTIONS,
  DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP_OPTIONS,
  DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS,
  DELIVERY_SUMMARY_READY_EVENT_READER_MODE,
  type DeliveryAttemptDispatchQueueMode,
  type DeliveryAttemptQueueReaderMode,
  type DeliverySummaryReadyEventReaderMode,
  resolveDeliveryAttemptDispatchQueueMode,
  resolveDeliveryAttemptDispatchLoopOptions,
  resolveDeliveryAttemptQueueDrainLoopOptions,
  resolveDeliveryAttemptQueueReaderMode,
  resolveDeliveryDigestSchedulerLoopOptions,
  resolveDeliveryRabbitMqAttemptQueueOptions,
  resolveDeliveryRabbitMqAttemptQueueReaderOptions,
  resolveDeliverySummaryReadyEventDrainLoopOptions,
  resolveDeliverySummaryReadyEventQueueOptions,
  resolveDeliverySummaryReadyEventReaderMode,
} from './delivery-service-provider-tokens';
import { DeliveryAttemptDispatchLoop } from './delivery-attempt-dispatch-loop';
import {
  DELIVERY_ATTEMPT_COMMAND_QUEUE_READER,
  InMemoryDeliveryAttemptQueueReader,
  RabbitMqDeliveryAttemptQueueReader,
  type DeliveryAttemptQueueReaderPort,
  type RabbitMqDeliveryAttemptQueueReaderChannelPort,
} from './delivery-attempt-queue-reader';
import { DeliveryAttemptQueueDrainLoop } from './delivery-attempt-queue-drain-loop';
import { DigestSchedulerLoop } from './digest-scheduler-loop';
import { SummaryReadyEventDrainLoop } from './summary-ready-event-drain-loop';
import {
  DELIVERY_SUMMARY_READY_EVENT_QUEUE_READER,
  DisabledSummaryReadyEventQueueReader,
  RabbitMqSummaryReadyEventQueueReader,
  type RabbitMqSummaryReadyEventQueueReaderChannelPort,
  type SummaryReadyEventQueueReaderPort,
} from './summary-ready-event-queue-reader';

const DELIVERY_ATTEMPT_DISPATCH_QUEUE = Symbol('DELIVERY_ATTEMPT_DISPATCH_QUEUE');
const DELIVERY_RABBITMQ_ATTEMPT_QUEUE_CHANNEL = Symbol('DELIVERY_RABBITMQ_ATTEMPT_QUEUE_CHANNEL');
const DELIVERY_RABBITMQ_SUMMARY_READY_EVENT_QUEUE_CHANNEL =
  Symbol('DELIVERY_RABBITMQ_SUMMARY_READY_EVENT_QUEUE_CHANNEL');

type RabbitMqDeliveryAttemptQueueChannelPort =
  RabbitMqQueueChannelPort & RabbitMqDeliveryAttemptQueueReaderChannelPort;

@Module({
  imports: [
    MetricsRuntimeModule.register({ serviceName: 'delivery-service' }),
    WorkerRuntimeModule.register({ serviceName: 'delivery-service' }),
    DeliveryRestModule,
  ],
  providers: [
    {
      provide: DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS,
      useFactory: () => resolveDeliveryDigestSchedulerLoopOptions(process.env),
    },
    {
      provide: DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS,
      useFactory: () => resolveDeliveryAttemptDispatchLoopOptions(process.env),
    },
    {
      provide: DELIVERY_ATTEMPT_DISPATCH_QUEUE_MODE,
      useFactory: () => resolveDeliveryAttemptDispatchQueueMode(process.env),
    },
    {
      provide: DELIVERY_ATTEMPT_QUEUE_READER_MODE,
      useFactory: () => resolveDeliveryAttemptQueueReaderMode(process.env),
    },
    {
      provide: DELIVERY_SUMMARY_READY_EVENT_READER_MODE,
      useFactory: () => resolveDeliverySummaryReadyEventReaderMode(process.env),
    },
    {
      provide: DELIVERY_RABBITMQ_ATTEMPT_QUEUE_OPTIONS,
      useFactory: () => resolveDeliveryRabbitMqAttemptQueueOptions(process.env),
    },
    {
      provide: DELIVERY_RABBITMQ_ATTEMPT_QUEUE_READER_OPTIONS,
      useFactory: () => resolveDeliveryRabbitMqAttemptQueueReaderOptions(process.env),
    },
    {
      provide: DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP_OPTIONS,
      useFactory: () => resolveDeliveryAttemptQueueDrainLoopOptions(process.env),
    },
    {
      provide: DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS,
      useFactory: () => resolveDeliverySummaryReadyEventQueueOptions(process.env),
    },
    {
      provide: DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP_OPTIONS,
      useFactory: () => resolveDeliverySummaryReadyEventDrainLoopOptions(process.env),
    },
    InMemoryQueuePublisher,
    {
      provide: DELIVERY_RABBITMQ_ATTEMPT_QUEUE_CHANNEL,
      useFactory: (
        queueMode: DeliveryAttemptDispatchQueueMode,
        readerMode: DeliveryAttemptQueueReaderMode,
      ): RabbitMqDeliveryAttemptQueueChannelPort | null =>
        queueMode === 'rabbitmq' || readerMode === 'rabbitmq'
          ? new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? '' })
          : null,
      inject: [DELIVERY_ATTEMPT_DISPATCH_QUEUE_MODE, DELIVERY_ATTEMPT_QUEUE_READER_MODE],
    },
    {
      provide: DELIVERY_ATTEMPT_DISPATCH_QUEUE,
      useFactory: (
        mode: DeliveryAttemptDispatchQueueMode,
        inMemoryQueue: InMemoryQueuePublisher,
        channel: RabbitMqDeliveryAttemptQueueChannelPort | null,
        options: RabbitMqQueuePublisherOptions,
        metrics: MetricsRecorderPort,
      ): DeliveryAttemptDispatchQueuePort =>
        mode === 'rabbitmq'
          ? new DeliveryAttemptDispatchQueuePublisherAdapter(
              new RabbitMqQueuePublisher(requireRabbitMqDeliveryAttemptQueueChannel(channel), options, new SystemClock()),
              metrics,
            )
          : new DeliveryAttemptDispatchQueuePublisherAdapter(inMemoryQueue, metrics),
      inject: [
        DELIVERY_ATTEMPT_DISPATCH_QUEUE_MODE,
        InMemoryQueuePublisher,
        DELIVERY_RABBITMQ_ATTEMPT_QUEUE_CHANNEL,
        DELIVERY_RABBITMQ_ATTEMPT_QUEUE_OPTIONS,
        METRICS_RECORDER,
      ],
    },
    {
      provide: DELIVERY_ATTEMPT_COMMAND_QUEUE_READER,
      useFactory: (
        mode: DeliveryAttemptQueueReaderMode,
        queue: InMemoryQueuePublisher,
        channel: RabbitMqDeliveryAttemptQueueChannelPort | null,
        options: ReturnType<typeof resolveDeliveryRabbitMqAttemptQueueReaderOptions>,
      ): DeliveryAttemptQueueReaderPort =>
        mode === 'rabbitmq'
          ? new RabbitMqDeliveryAttemptQueueReader(requireRabbitMqDeliveryAttemptQueueChannel(channel), options)
          : new InMemoryDeliveryAttemptQueueReader(queue),
      inject: [
        DELIVERY_ATTEMPT_QUEUE_READER_MODE,
        InMemoryQueuePublisher,
        DELIVERY_RABBITMQ_ATTEMPT_QUEUE_CHANNEL,
        DELIVERY_RABBITMQ_ATTEMPT_QUEUE_READER_OPTIONS,
      ],
    },
    DisabledSummaryReadyEventQueueReader,
    {
      provide: DELIVERY_RABBITMQ_SUMMARY_READY_EVENT_QUEUE_CHANNEL,
      useFactory: (
        mode: DeliverySummaryReadyEventReaderMode,
      ): RabbitMqSummaryReadyEventQueueReaderChannelPort | null =>
        mode === 'rabbitmq'
          ? new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? '' })
          : null,
      inject: [DELIVERY_SUMMARY_READY_EVENT_READER_MODE],
    },
    {
      provide: DELIVERY_SUMMARY_READY_EVENT_QUEUE_READER,
      useFactory: (
        mode: DeliverySummaryReadyEventReaderMode,
        channel: RabbitMqSummaryReadyEventQueueReaderChannelPort | null,
        options: ReturnType<typeof resolveDeliverySummaryReadyEventQueueOptions>,
        disabled: DisabledSummaryReadyEventQueueReader,
      ): SummaryReadyEventQueueReaderPort =>
        mode === 'rabbitmq'
          ? new RabbitMqSummaryReadyEventQueueReader(requireRabbitMqSummaryReadyEventQueueChannel(channel), options)
          : disabled,
      inject: [
        DELIVERY_SUMMARY_READY_EVENT_READER_MODE,
        DELIVERY_RABBITMQ_SUMMARY_READY_EVENT_QUEUE_CHANNEL,
        DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS,
        DisabledSummaryReadyEventQueueReader,
      ],
    },
    {
      provide: EnqueueDeliveryAttemptDispatchUseCase,
      useFactory: (
        attempts: DeliveryAttemptRepositoryPort,
        queue: DeliveryAttemptDispatchQueuePort,
      ) => new EnqueueDeliveryAttemptDispatchUseCase(attempts, queue, new SystemClock()),
      inject: [DELIVERY_ATTEMPT_REPOSITORY, DELIVERY_ATTEMPT_DISPATCH_QUEUE],
    },
    {
      provide: ScheduleDueDigestsCommandHandler,
      useFactory: (
        scheduleDueDigests: ScheduleDueDigestsUseCase,
        metrics: MetricsRecorderPort,
        runtime: WorkerRuntime,
      ) => new ScheduleDueDigestsCommandHandler(scheduleDueDigests, metrics, runtime),
      inject: [ScheduleDueDigestsUseCase, METRICS_RECORDER, WorkerRuntime],
    },
    {
      provide: SendDeliveryAttemptCommandHandler,
      useFactory: (
        sendDeliveryAttempt: SendDeliveryAttemptUseCase,
        metrics: MetricsRecorderPort,
        runtime: WorkerRuntime,
      ) => new SendDeliveryAttemptCommandHandler(sendDeliveryAttempt, metrics, runtime),
      inject: [SendDeliveryAttemptUseCase, METRICS_RECORDER, WorkerRuntime],
    },
    {
      provide: ProjectReaderSummaryReadyEventHandler,
      useFactory: (project: ProjectReaderSummaryReadyEventUseCase, metrics: MetricsRecorderPort, runtime: WorkerRuntime) =>
        new ProjectReaderSummaryReadyEventHandler(project, metrics, runtime),
      inject: [ProjectReaderSummaryReadyEventUseCase, METRICS_RECORDER, WorkerRuntime],
    },
    {
      provide: SummaryReadyEventDispatcher,
      useFactory: (summary: ProjectSummaryReadyEventHandler, reader: ProjectReaderSummaryReadyEventHandler) =>
        new SummaryReadyEventDispatcher(summary, reader),
      inject: [ProjectSummaryReadyEventHandler, ProjectReaderSummaryReadyEventHandler],
    },
    {
      provide: ProjectSummaryReadyEventHandler,
      useFactory: (
        projectSummaryReady: ProjectSummaryReadyEventUseCase,
        metrics: MetricsRecorderPort,
        runtime: WorkerRuntime,
      ) => new ProjectSummaryReadyEventHandler(projectSummaryReady, metrics, runtime),
      inject: [ProjectSummaryReadyEventUseCase, METRICS_RECORDER, WorkerRuntime],
    },
    {
      provide: DeliveryAttemptDispatchLoop,
      useFactory: (
        handler: SendDeliveryAttemptCommandHandler,
        attempts: DeliveryAttemptRepositoryPort,
        options: ReturnType<typeof resolveDeliveryAttemptDispatchLoopOptions>,
        enqueueDispatch: EnqueueDeliveryAttemptDispatchUseCase,
      ) => new DeliveryAttemptDispatchLoop(handler, attempts, options, enqueueDispatch),
      inject: [
        SendDeliveryAttemptCommandHandler,
        DELIVERY_ATTEMPT_REPOSITORY,
        DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS,
        EnqueueDeliveryAttemptDispatchUseCase,
      ],
    },
    {
      provide: DeliveryAttemptQueueDrainLoop,
      useFactory: (
        queue: DeliveryAttemptQueueReaderPort,
        handler: SendDeliveryAttemptCommandHandler,
        options: ReturnType<typeof resolveDeliveryAttemptQueueDrainLoopOptions>,
        metrics: MetricsRecorderPort,
      ) => new DeliveryAttemptQueueDrainLoop(queue, handler, options, metrics, new SystemClock()),
      inject: [
        DELIVERY_ATTEMPT_COMMAND_QUEUE_READER,
        SendDeliveryAttemptCommandHandler,
        DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP_OPTIONS,
        METRICS_RECORDER,
      ],
    },
    {
      provide: SummaryReadyEventDrainLoop,
      useFactory: (
        queue: SummaryReadyEventQueueReaderPort,
        handler: SummaryReadyEventDispatcher,
        options: ReturnType<typeof resolveDeliverySummaryReadyEventDrainLoopOptions>,
        metrics: MetricsRecorderPort,
      ) => new SummaryReadyEventDrainLoop(queue, handler, options, metrics, new SystemClock()),
      inject: [
        DELIVERY_SUMMARY_READY_EVENT_QUEUE_READER,
        SummaryReadyEventDispatcher,
        DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP_OPTIONS,
        METRICS_RECORDER,
      ],
    },
    DigestSchedulerLoop,
  ],
  exports: [
    ProjectReaderSummaryReadyEventHandler,
    SummaryReadyEventDispatcher,
    ProjectSummaryReadyEventHandler,
    ScheduleDueDigestsCommandHandler,
    SendDeliveryAttemptCommandHandler,
    EnqueueDeliveryAttemptDispatchUseCase,
    DeliveryAttemptDispatchLoop,
    DeliveryAttemptQueueDrainLoop,
    SummaryReadyEventDrainLoop,
  ],
})
export class DeliveryServiceModule {}

const requireRabbitMqDeliveryAttemptQueueChannel = (
  channel: RabbitMqDeliveryAttemptQueueChannelPort | null,
): RabbitMqDeliveryAttemptQueueChannelPort => {
  if (channel === null) {
    throw new Error('RabbitMQ delivery attempt queue channel is required for delivery queue runtime');
  }

  return channel;
};

const requireRabbitMqSummaryReadyEventQueueChannel = (
  channel: RabbitMqSummaryReadyEventQueueReaderChannelPort | null,
): RabbitMqSummaryReadyEventQueueReaderChannelPort => {
  if (channel === null) {
    throw new Error(
      'RabbitMQ summary ready event queue channel is required when DELIVERY_SUMMARY_READY_EVENT_READER=rabbitmq',
    );
  }

  return channel;
};
