import { Module } from '@nestjs/common';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { ReserveUsageQuotaUseCase } from '@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { InMemoryIdempotencyAdapter } from '../../adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../../adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanJobRepository } from '../../adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../../adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../../adapters/persistence/in-memory-source-binding.repository';
import { InMemoryTopicRepository } from '../../adapters/persistence/in-memory-topic.repository';
import { UsageScanRequestQuotaAdapter } from '../../adapters/quota/usage-scan-request-quota.adapter';
import { InMemoryScanQueueAdapter } from '../../adapters/queue/in-memory-scan-queue.adapter';
import { AesGcmSourceBindingConfigProtector } from '../../adapters/security/aes-gcm-source-binding-config-protector';
import { FakeSourceCatalogAdapter } from '../../adapters/source-catalog/fake-source-catalog.adapter';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { CreateTopicUseCase } from '../../features/create-topic/create-topic.use-case';
import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import { RecordScanExecutionUseCase } from '../../features/record-scan-execution/record-scan-execution.use-case';
import { RequestScanUseCase } from '../../features/request-scan/request-scan.use-case';
import { ScheduleDueScansUseCase } from '../../features/schedule-due-scans/schedule-due-scans.use-case';
import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import { ScanPolicyController } from './scan-policy.controller';
import { ScanRequestController } from './scan-request.controller';
import { ScanStatusController } from './scan-status.controller';
import { SourceBindingController } from './source-binding.controller';
import { TopicController } from './topic.controller';

@Module({
  imports: [UsageRestModule],
  controllers: [
    TopicController,
    SourceBindingController,
    ScanPolicyController,
    ScanRequestController,
    ScanStatusController,
  ],
  providers: [
    InMemoryTopicRepository,
    InMemorySourceBindingRepository,
    InMemoryScanPolicyRepository,
    InMemoryScanJobRepository,
    InMemoryQueuePublisher,
    {
      provide: InMemoryScanQueueAdapter,
      useFactory: (publisher: InMemoryQueuePublisher) => new InMemoryScanQueueAdapter(publisher),
      inject: [InMemoryQueuePublisher],
    },
    FakeSourceCatalogAdapter,
    {
      provide: AesGcmSourceBindingConfigProtector,
      useFactory: () => AesGcmSourceBindingConfigProtector.withEphemeralDevelopmentKey(),
    },
    InMemoryOutboxAdapter,
    InMemoryIdempotencyAdapter,
    {
      provide: UsageScanRequestQuotaAdapter,
      useFactory: (reserveUsageQuota: ReserveUsageQuotaUseCase) =>
        new UsageScanRequestQuotaAdapter(reserveUsageQuota),
      inject: [ReserveUsageQuotaUseCase],
    },
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
        configProtector: AesGcmSourceBindingConfigProtector,
      ) =>
        new BindSourceUseCase(
          topics,
          bindings,
          sourceCatalog,
          outbox,
          idempotency,
          configProtector,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        InMemoryTopicRepository,
        InMemorySourceBindingRepository,
        FakeSourceCatalogAdapter,
        InMemoryOutboxAdapter,
        InMemoryIdempotencyAdapter,
        AesGcmSourceBindingConfigProtector,
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
    {
      provide: RequestScanUseCase,
      useFactory: (
        bindings: InMemorySourceBindingRepository,
        scanPolicies: InMemoryScanPolicyRepository,
        scanJobs: InMemoryScanJobRepository,
        scanQueue: InMemoryScanQueueAdapter,
        outbox: InMemoryOutboxAdapter,
        idempotency: InMemoryIdempotencyAdapter,
        scanRequestQuota: UsageScanRequestQuotaAdapter,
      ) =>
        new RequestScanUseCase(
          bindings,
          scanPolicies,
          scanJobs,
          scanQueue,
          outbox,
          idempotency,
          scanRequestQuota,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        InMemorySourceBindingRepository,
        InMemoryScanPolicyRepository,
        InMemoryScanJobRepository,
        InMemoryScanQueueAdapter,
        InMemoryOutboxAdapter,
        InMemoryIdempotencyAdapter,
        UsageScanRequestQuotaAdapter,
      ],
    },
    {
      provide: ScheduleDueScansUseCase,
      useFactory: (
        bindings: InMemorySourceBindingRepository,
        scanPolicies: InMemoryScanPolicyRepository,
        scanJobs: InMemoryScanJobRepository,
        scanQueue: InMemoryScanQueueAdapter,
      ) =>
        new ScheduleDueScansUseCase(
          bindings,
          scanPolicies,
          scanJobs,
          scanQueue,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        InMemorySourceBindingRepository,
        InMemoryScanPolicyRepository,
        InMemoryScanJobRepository,
        InMemoryScanQueueAdapter,
      ],
    },
    {
      provide: GetScanStatusUseCase,
      useFactory: (scanJobs: InMemoryScanJobRepository) => new GetScanStatusUseCase(scanJobs),
      inject: [InMemoryScanJobRepository],
    },
    {
      provide: RecordScanExecutionUseCase,
      useFactory: (scanJobs: InMemoryScanJobRepository) => new RecordScanExecutionUseCase(scanJobs),
      inject: [InMemoryScanJobRepository],
    },
  ],
  exports: [ScheduleDueScansUseCase, GetScanStatusUseCase, RecordScanExecutionUseCase],
})
export class MonitoringRestModule {}
