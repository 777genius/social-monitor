import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryIdempotencyAdapter } from '../../adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../../adapters/messaging/in-memory-outbox.adapter';
import { InMemorySourceBindingRepository } from '../../adapters/persistence/in-memory-source-binding.repository';
import { InMemoryTopicRepository } from '../../adapters/persistence/in-memory-topic.repository';
import { FakeSourceCatalogAdapter } from '../../adapters/source-catalog/fake-source-catalog.adapter';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { CreateTopicUseCase } from '../../features/create-topic/create-topic.use-case';
import { SourceBindingController } from './source-binding.controller';
import { TopicController } from './topic.controller';

@Module({
  controllers: [TopicController, SourceBindingController],
  providers: [
    InMemoryTopicRepository,
    InMemorySourceBindingRepository,
    FakeSourceCatalogAdapter,
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
    {
      provide: BindSourceUseCase,
      useFactory: (
        topics: InMemoryTopicRepository,
        bindings: InMemorySourceBindingRepository,
        sourceCatalog: FakeSourceCatalogAdapter,
        outbox: InMemoryOutboxAdapter,
        idempotency: InMemoryIdempotencyAdapter,
      ) =>
        new BindSourceUseCase(
          topics,
          bindings,
          sourceCatalog,
          outbox,
          idempotency,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        InMemoryTopicRepository,
        InMemorySourceBindingRepository,
        FakeSourceCatalogAdapter,
        InMemoryOutboxAdapter,
        InMemoryIdempotencyAdapter,
      ],
    },
  ],
})
export class MonitoringRestModule {}
