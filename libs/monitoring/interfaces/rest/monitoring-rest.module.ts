import { Module } from '@nestjs/common';
import { IdentityAuthorizationModule } from '@social-monitor/identity/interfaces/authorization/identity-authorization.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
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
import { PrismaMonitoringConnection } from '../../adapters/persistence/prisma/prisma-monitoring-connection';
import type { PrismaMonitoringClient } from '../../adapters/persistence/prisma/prisma-monitoring-client';
import { PrismaScanJobRepository } from '../../adapters/persistence/prisma/prisma-scan-job.repository';
import { PrismaScanPolicyRepository } from '../../adapters/persistence/prisma/prisma-scan-policy.repository';
import { PrismaSourceBindingRepository } from '../../adapters/persistence/prisma/prisma-source-binding.repository';
import { PrismaTopicRepository } from '../../adapters/persistence/prisma/prisma-topic.repository';
import { UsageScanRequestQuotaAdapter } from '../../adapters/quota/usage-scan-request-quota.adapter';
import { InMemoryScanQueueAdapter } from '../../adapters/queue/in-memory-scan-queue.adapter';
import { AesGcmSourceBindingConfigProtector } from '../../adapters/security/aes-gcm-source-binding-config-protector';
import { FakeSourceCatalogAdapter } from '../../adapters/source-catalog/fake-source-catalog.adapter';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { ChangeSourceBindingStatusUseCase } from '../../features/change-source-binding-status/change-source-binding-status.use-case';
import { CreateTopicUseCase } from '../../features/create-topic/create-topic.use-case';
import { GetScanPolicyUseCase } from '../../features/get-scan-policy/get-scan-policy.use-case';
import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import { ListSourceBindingsUseCase } from '../../features/list-source-bindings/list-source-bindings.use-case';
import { ListTopicsUseCase } from '../../features/list-topics/list-topics.use-case';
import { RecordScanExecutionUseCase } from '../../features/record-scan-execution/record-scan-execution.use-case';
import { RequestScanUseCase } from '../../features/request-scan/request-scan.use-case';
import { ScheduleDueScansUseCase } from '../../features/schedule-due-scans/schedule-due-scans.use-case';
import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import type {
  IdempotencyPort,
  OutboxPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  ScanQueuePort,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
  TopicRepositoryPort,
} from '../../ports';
import {
  MONITORING_CONFIG_PROTECTOR,
  MONITORING_IDEMPOTENCY,
  MONITORING_OUTBOX,
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_POLICY_REPOSITORY,
  MONITORING_SCAN_QUEUE,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_CATALOG,
  MONITORING_TOPIC_REPOSITORY,
  type MonitoringPersistenceMode,
  monitoringPersistenceModeProvider,
} from './monitoring-provider-tokens';
import { ScanPolicyController } from './scan-policy.controller';
import { ScanRequestController } from './scan-request.controller';
import { ScanStatusController } from './scan-status.controller';
import { SourceBindingController } from './source-binding.controller';
import { TopicController } from './topic.controller';

@Module({
  imports: [UsageRestModule, IdentityAuthorizationModule],
  controllers: [
    TopicController,
    SourceBindingController,
    ScanPolicyController,
    ScanRequestController,
    ScanStatusController,
  ],
  providers: [
    monitoringPersistenceModeProvider,
    {
      provide: MONITORING_PRISMA_CLIENT,
      useFactory: (mode: MonitoringPersistenceMode): PrismaMonitoringClient | null =>
        mode === 'prisma' ? new PrismaMonitoringConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [MONITORING_PERSISTENCE_MODE],
    },
    {
      provide: MONITORING_TOPIC_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): TopicRepositoryPort =>
        mode === 'prisma'
          ? new PrismaTopicRepository(requirePrismaMonitoringClient(prisma))
          : new InMemoryTopicRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SOURCE_BINDING_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): SourceBindingRepositoryPort =>
        mode === 'prisma'
          ? new PrismaSourceBindingRepository(requirePrismaMonitoringClient(prisma))
          : new InMemorySourceBindingRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SCAN_POLICY_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): ScanPolicyRepositoryPort =>
        mode === 'prisma'
          ? new PrismaScanPolicyRepository(requirePrismaMonitoringClient(prisma))
          : new InMemoryScanPolicyRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SCAN_JOB_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): ScanJobRepositoryPort =>
        mode === 'prisma'
          ? new PrismaScanJobRepository(requirePrismaMonitoringClient(prisma))
          : new InMemoryScanJobRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    InMemoryQueuePublisher,
    InMemoryMetricsRecorder,
    {
      provide: MONITORING_SCAN_QUEUE,
      useFactory: (publisher: InMemoryQueuePublisher, metrics: InMemoryMetricsRecorder): ScanQueuePort =>
        new InMemoryScanQueueAdapter(publisher, metrics),
      inject: [InMemoryQueuePublisher, InMemoryMetricsRecorder],
    },
    {
      provide: MONITORING_SOURCE_CATALOG,
      useClass: FakeSourceCatalogAdapter,
    },
    {
      provide: MONITORING_CONFIG_PROTECTOR,
      useFactory: (): SourceBindingConfigProtectorPort =>
        AesGcmSourceBindingConfigProtector.withEphemeralDevelopmentKey(),
    },
    {
      provide: MONITORING_OUTBOX,
      useClass: InMemoryOutboxAdapter,
    },
    {
      provide: MONITORING_IDEMPOTENCY,
      useClass: InMemoryIdempotencyAdapter,
    },
    {
      provide: UsageScanRequestQuotaAdapter,
      useFactory: (reserveUsageQuota: ReserveUsageQuotaUseCase) =>
        new UsageScanRequestQuotaAdapter(reserveUsageQuota),
      inject: [ReserveUsageQuotaUseCase],
    },
    {
      provide: CreateTopicUseCase,
      useFactory: (
        topics: TopicRepositoryPort,
        outbox: OutboxPort,
        idempotency: IdempotencyPort,
      ) =>
        new CreateTopicUseCase(
          topics,
          outbox,
          idempotency,
          new CryptoIdGenerator(),
          new SystemClock(),
      ),
      inject: [MONITORING_TOPIC_REPOSITORY, MONITORING_OUTBOX, MONITORING_IDEMPOTENCY],
    },
    {
      provide: ListTopicsUseCase,
      useFactory: (topics: TopicRepositoryPort) => new ListTopicsUseCase(topics),
      inject: [MONITORING_TOPIC_REPOSITORY],
    },
    {
      provide: BindSourceUseCase,
      useFactory: (
        topics: TopicRepositoryPort,
        bindings: SourceBindingRepositoryPort,
        sourceCatalog: SourceCatalogPort,
        outbox: OutboxPort,
        idempotency: IdempotencyPort,
        configProtector: SourceBindingConfigProtectorPort,
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
        MONITORING_TOPIC_REPOSITORY,
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SOURCE_CATALOG,
        MONITORING_OUTBOX,
        MONITORING_IDEMPOTENCY,
        MONITORING_CONFIG_PROTECTOR,
      ],
    },
    {
      provide: ListSourceBindingsUseCase,
      useFactory: (
        topics: TopicRepositoryPort,
        bindings: SourceBindingRepositoryPort,
      ) => new ListSourceBindingsUseCase(topics, bindings),
      inject: [MONITORING_TOPIC_REPOSITORY, MONITORING_SOURCE_BINDING_REPOSITORY],
    },
    {
      provide: SetScanPolicyUseCase,
      useFactory: (
        bindings: SourceBindingRepositoryPort,
        scanPolicies: ScanPolicyRepositoryPort,
        outbox: OutboxPort,
        idempotency: IdempotencyPort,
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
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SCAN_POLICY_REPOSITORY,
        MONITORING_OUTBOX,
        MONITORING_IDEMPOTENCY,
      ],
    },
    {
      provide: GetScanPolicyUseCase,
      useFactory: (
        bindings: SourceBindingRepositoryPort,
        scanPolicies: ScanPolicyRepositoryPort,
      ) => new GetScanPolicyUseCase(bindings, scanPolicies),
      inject: [MONITORING_SOURCE_BINDING_REPOSITORY, MONITORING_SCAN_POLICY_REPOSITORY],
    },
    {
      provide: ChangeSourceBindingStatusUseCase,
      useFactory: (
        bindings: SourceBindingRepositoryPort,
        outbox: OutboxPort,
        idempotency: IdempotencyPort,
      ) =>
        new ChangeSourceBindingStatusUseCase(
          bindings,
          outbox,
          idempotency,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [MONITORING_SOURCE_BINDING_REPOSITORY, MONITORING_OUTBOX, MONITORING_IDEMPOTENCY],
    },
    {
      provide: RequestScanUseCase,
      useFactory: (
        bindings: SourceBindingRepositoryPort,
        scanPolicies: ScanPolicyRepositoryPort,
        scanJobs: ScanJobRepositoryPort,
        scanQueue: ScanQueuePort,
        outbox: OutboxPort,
        idempotency: IdempotencyPort,
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
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SCAN_POLICY_REPOSITORY,
        MONITORING_SCAN_JOB_REPOSITORY,
        MONITORING_SCAN_QUEUE,
        MONITORING_OUTBOX,
        MONITORING_IDEMPOTENCY,
        UsageScanRequestQuotaAdapter,
      ],
    },
    {
      provide: ScheduleDueScansUseCase,
      useFactory: (
        bindings: SourceBindingRepositoryPort,
        scanPolicies: ScanPolicyRepositoryPort,
        scanJobs: ScanJobRepositoryPort,
        scanQueue: ScanQueuePort,
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
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SCAN_POLICY_REPOSITORY,
        MONITORING_SCAN_JOB_REPOSITORY,
        MONITORING_SCAN_QUEUE,
      ],
    },
    {
      provide: GetScanStatusUseCase,
      useFactory: (scanJobs: ScanJobRepositoryPort) => new GetScanStatusUseCase(scanJobs),
      inject: [MONITORING_SCAN_JOB_REPOSITORY],
    },
    {
      provide: RecordScanExecutionUseCase,
      useFactory: (scanJobs: ScanJobRepositoryPort) => new RecordScanExecutionUseCase(scanJobs),
      inject: [MONITORING_SCAN_JOB_REPOSITORY],
    },
  ],
  exports: [ScheduleDueScansUseCase, GetScanStatusUseCase, RecordScanExecutionUseCase],
})
export class MonitoringRestModule {}

const requirePrismaMonitoringClient = (client: PrismaMonitoringClient | null): PrismaMonitoringClient => {
  if (client === null) {
    throw new Error('Prisma monitoring client is not configured');
  }

  return client;
};
