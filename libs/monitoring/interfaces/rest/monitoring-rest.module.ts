import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryIdempotencyAdapter } from '../../adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../../adapters/messaging/in-memory-outbox.adapter';
import { InMemoryTopicRepository } from '../../adapters/persistence/in-memory-topic.repository';
import { CreateTopicUseCase } from '../../features/create-topic/create-topic.use-case';
import { TopicController } from './topic.controller';

@Module({
  controllers: [TopicController],
  providers: [
    InMemoryTopicRepository,
    InMemoryOutboxAdapter,
    InMemoryIdempotencyAdapter,
    {
      provide: CreateTopicUseCase,
      useFactory: (
        topics: InMemoryTopicRepository,
        outbox: InMemoryOutboxAdapter,
        idempotency: InMemoryIdempotencyAdapter,
      ) =>
        new CreateTopicUseCase(
          topics,
          outbox,
          idempotency,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [InMemoryTopicRepository, InMemoryOutboxAdapter, InMemoryIdempotencyAdapter],
    },
  ],
})
export class MonitoringRestModule {}
