import { Module } from '@nestjs/common';

import {
  AmqplibRabbitMqChannel,
  InMemoryQueuePublisher,
  RabbitMqQueuePublisher,
  type RabbitMqQueueChannelPort,
  type RabbitMqQueuePublisherOptions,
} from '@social-monitor/platform-queue';
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
import { InMemoryMetricsRecorder, type MetricsRecorderPort } from '@social-monitor/platform-metrics';
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
  type DeliveryAttemptDispatchQueueMode,
  type DeliveryAttemptQueueReaderMode,
  resolveDeliveryAttemptDispatchQueueMode,
  resolveDeliveryAttemptDispatchLoopOptions,
  resolveDeliveryAttemptQueueDrainLoopOptions,
  resolveDeliveryAttemptQueueReaderMode,
  resolveDeliveryDigestSchedulerLoopOptions,
  resolveDeliveryRabbitMqAttemptQueueOptions,
  resolveDeliveryRabbitMqAttemptQueueReaderOptions,
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

const DELIVERY_ATTEMPT_DISPATCH_QUEUE = Symbol('DELIVERY_ATTEMPT_DISPATCH_QUEUE');
const DELIVERY_RABBITMQ_ATTEMPT_QUEUE_CHANNEL = Symbol('DELIVERY_RABBITMQ_ATTEMPT_QUEUE_CHANNEL');

type RabbitMqDeliveryAttemptQueueChannelPort =
  RabbitMqQueueChannelPort & RabbitMqDeliveryAttemptQueueReaderChannelPort;

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'delivery-service' }), DeliveryRestModule],
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
              new RabbitMqQueuePublisher(requireRabbitMqDeliveryAttemptQueueChannel(channel), options),
              metrics,
            )
          : new DeliveryAttemptDispatchQueuePublisherAdapter(inMemoryQueue, metrics),
      inject: [
        DELIVERY_ATTEMPT_DISPATCH_QUEUE_MODE,
        InMemoryQueuePublisher,
        DELIVERY_RABBITMQ_ATTEMPT_QUEUE_CHANNEL,
        DELIVERY_RABBITMQ_ATTEMPT_QUEUE_OPTIONS,
        InMemoryMetricsRecorder,
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
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new ScheduleDueDigestsCommandHandler(scheduleDueDigests, metrics, runtime),
      inject: [ScheduleDueDigestsUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
    {
      provide: SendDeliveryAttemptCommandHandler,
      useFactory: (
        sendDeliveryAttempt: SendDeliveryAttemptUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new SendDeliveryAttemptCommandHandler(sendDeliveryAttempt, metrics, runtime),
      inject: [SendDeliveryAttemptUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
    {
      provide: ProjectSummaryReadyEventHandler,
      useFactory: (
        projectSummaryReady: ProjectSummaryReadyEventUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new ProjectSummaryReadyEventHandler(projectSummaryReady, metrics, runtime),
      inject: [ProjectSummaryReadyEventUseCase, InMemoryMetricsRecorder, WorkerRuntime],
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
    DeliveryAttemptQueueDrainLoop,
    DigestSchedulerLoop,
  ],
  exports: [
    ProjectSummaryReadyEventHandler,
    ScheduleDueDigestsCommandHandler,
    SendDeliveryAttemptCommandHandler,
    EnqueueDeliveryAttemptDispatchUseCase,
    DeliveryAttemptDispatchLoop,
    DeliveryAttemptQueueDrainLoop,
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
