import { Module } from '@nestjs/common';
import {
  PrismaEventStoreConnection,
  PrismaOutboxStoreAdapter,
} from '@social-monitor/platform-events/adapters/prisma';
import {
  RabbitMqEventPublisher,
  type RabbitMqEventPublisherOptions,
} from '@social-monitor/platform-events/adapters/rabbitmq';
import { monitoringScanQueueRabbitMqOptions } from '@social-monitor/monitoring/interfaces/rest/monitoring-scan-queue.providers';
import { deliveryCommandQueueOptions } from '@social-monitor/delivery/interfaces/rest/delivery-command-queue-options';
import { OutboxDispatcher } from '@social-monitor/platform-events';
import { resolvePostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import {
  CommandOutboxDispatcher,
} from '@social-monitor/platform-queue';
import { MetricsRuntimeModule } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { PrismaCommandOutboxStoreAdapter } from '@social-monitor/platform-queue/adapters/prisma';
import {
  AmqplibRabbitMqChannel,
  RabbitMqQueuePublisher,
  type RabbitMqQueueChannelPort,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import { WorkerRuntimeModule } from '@social-monitor/platform-worker';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import {
  EVENT_RELAY_LOOP_OPTIONS,
  EVENT_RELAY_RABBITMQ_EVENT_OPTIONS,
  requireEventRelayRuntimeEnv,
  resolveEventRelayLoopOptions,
  resolveEventRelayRabbitMqEventOptions,
} from './event-relay-provider-tokens';
import { OutboxRelayLoop } from './outbox-relay-loop';
import { ScanCommandRelayLoop } from './scan-command-relay-loop';

@Module({
  imports: [
    MetricsRuntimeModule.register({ serviceName: 'event-relay' }),
    WorkerRuntimeModule.register({ serviceName: 'event-relay' }),
  ],
  providers: [
    {
      provide: EVENT_RELAY_LOOP_OPTIONS,
      useFactory: () => resolveEventRelayLoopOptions(process.env),
    },
    {
      provide: EVENT_RELAY_RABBITMQ_EVENT_OPTIONS,
      useFactory: () => resolveEventRelayRabbitMqEventOptions(process.env),
    },
    {
      provide: PrismaEventStoreConnection,
      useFactory: async () => {
        requireEventRelayRuntimeEnv(process.env);

        return PrismaEventStoreConnection.create(
          resolvePostgresRuntimePoolConfig(process.env),
        );
      },
    },
    {
      provide: AmqplibRabbitMqChannel,
      useFactory: () => {
        requireEventRelayRuntimeEnv(process.env);

        return new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? '' });
      },
    },
    {
      provide: RabbitMqEventPublisher,
      useFactory: (
        channel: RabbitMqQueueChannelPort,
        options: RabbitMqEventPublisherOptions,
      ) => new RabbitMqEventPublisher(channel, options),
      inject: [AmqplibRabbitMqChannel, EVENT_RELAY_RABBITMQ_EVENT_OPTIONS],
    },
    {
      provide: PrismaOutboxStoreAdapter,
      useFactory: (prisma: PrismaEventStoreConnection) => new PrismaOutboxStoreAdapter(prisma, new SystemClock()),
      inject: [PrismaEventStoreConnection],
    },
    {
      provide: PrismaCommandOutboxStoreAdapter,
      useFactory: (prisma: PrismaEventStoreConnection) =>
        new PrismaCommandOutboxStoreAdapter(prisma),
      inject: [PrismaEventStoreConnection],
    },
    {
      provide: RabbitMqQueuePublisher,
      useFactory: (channel: RabbitMqQueueChannelPort) =>
        new RabbitMqQueuePublisher(
          channel,
          monitoringScanQueueRabbitMqOptions(process.env),
          new SystemClock(),
        ),
      inject: [AmqplibRabbitMqChannel],
    },
    {
      provide: CommandOutboxDispatcher,
      useFactory: (
        outbox: PrismaCommandOutboxStoreAdapter,
        publisher: RabbitMqQueuePublisher,
        channel: RabbitMqQueueChannelPort,
      ) => {
        const deliveryPublisher = new RabbitMqQueuePublisher(channel, deliveryCommandQueueOptions(process.env), new SystemClock());
        return new CommandOutboxDispatcher(
          outbox,
          { publish: (command) => command.commandType === 'delivery.attempt.send'
              ? deliveryPublisher.publish(command) : publisher.publish(command) },
          new CryptoIdGenerator(),
          new SystemClock(),
        );
      },
      inject: [PrismaCommandOutboxStoreAdapter, RabbitMqQueuePublisher, AmqplibRabbitMqChannel],
    },
    {
      provide: OutboxDispatcher,
      useFactory: (
        outbox: PrismaOutboxStoreAdapter,
        publisher: RabbitMqEventPublisher,
      ) => new OutboxDispatcher(outbox, publisher),
      inject: [PrismaOutboxStoreAdapter, RabbitMqEventPublisher],
    },
    OutboxRelayLoop,
    ScanCommandRelayLoop,
  ],
  exports: [OutboxRelayLoop, ScanCommandRelayLoop],
})
export class EventRelayModule {}
