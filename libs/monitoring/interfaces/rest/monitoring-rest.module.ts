import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryIdempotencyAdapter } from '../../adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../../adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanPolicyRepository } from '../../adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../../adapters/persistence/in-memory-source-binding.repository';
import { InMemoryTopicRepository } from '../../adapters/persistence/in-memory-topic.repository';
import { FakeSourceCatalogAdapter } from '../../adapters/source-catalog/fake-source-catalog.adapter';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { CreateTopicUseCase } from '../../features/create-topic/create-topic.use-case';
import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import { ScanPolicyController } from './scan-policy.controller';
import { SourceBindingController } from './source-binding.controller';
import { TopicController } from './topic.controller';

@Module({
  controllers: [TopicController, SourceBindingController, ScanPolicyController],
  providers: [
    InMemoryTopicRepository,
    InMemorySourceBindingRepository,
    InMemoryScanPolicyRepository,
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
    {
      provide: SetScanPolicyUseCase,
      useFactory: (
        bindings: InMemorySourceBindingRepository,
        scanPolicies: InMemoryScanPolicyRepository,
        outbox: InMemoryOutboxAdapter,
        idempotency: InMemoryIdempotencyAdapter,
      ) =>
        new SetScanPolicyUseCase(
          bindings,
          scanPolicies,
          outbox,
          idempotency,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        InMemorySourceBindingRepository,
        InMemoryScanPolicyRepository,
        InMemoryOutboxAdapter,
        InMemoryIdempotencyAdapter,
      ],
    },
  ],
})
export class MonitoringRestModule {}
