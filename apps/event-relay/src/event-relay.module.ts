import { Module } from '@nestjs/common';
import {
  PrismaEventStoreConnection,
  PrismaOutboxStoreAdapter,
} from '@social-monitor/platform-events/adapters/prisma';
import {
  RabbitMqEventPublisher,
  type RabbitMqEventPublisherOptions,
} from '@social-monitor/platform-events/adapters/rabbitmq';
import { OutboxDispatcher } from '@social-monitor/platform-events';
import { resolvePostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import {
  AmqplibRabbitMqChannel,
  type RabbitMqQueueChannelPort,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import { WorkerRuntimeModule } from '@social-monitor/platform-worker';
import { SystemClock } from '@social-monitor/shared-kernel';

import {
  EVENT_RELAY_LOOP_OPTIONS,
  EVENT_RELAY_RABBITMQ_EVENT_OPTIONS,
  requireEventRelayRuntimeEnv,
  resolveEventRelayLoopOptions,
  resolveEventRelayRabbitMqEventOptions,
} from './event-relay-provider-tokens';
import { OutboxRelayLoop } from './outbox-relay-loop';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'event-relay' })],
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
      provide: OutboxDispatcher,
      useFactory: (
        outbox: PrismaOutboxStoreAdapter,
        publisher: RabbitMqEventPublisher,
      ) => new OutboxDispatcher(outbox, publisher),
      inject: [PrismaOutboxStoreAdapter, RabbitMqEventPublisher],
    },
    OutboxRelayLoop,
  ],
  exports: [OutboxRelayLoop],
})
export class EventRelayModule {}
