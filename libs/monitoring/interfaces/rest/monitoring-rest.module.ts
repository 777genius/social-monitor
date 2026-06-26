import { Module } from '@nestjs/common';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import {
  AmqplibRabbitMqChannel,
  parseRabbitMqDeadLetterExchange,
  parseRabbitMqDeliveryLimit,
  parseRabbitMqQueueType,
  RabbitMqQueuePublisher,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import {
  type QueuePublisherPort,
} from '@social-monitor/platform-queue';
import { RequestCorrelationIdFactory } from '@social-monitor/platform-request-context';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { ReserveUsageQuotaUseCase } from '@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { InMemoryIdempotencyAdapter } from '../../adapters/idempotency/in-memory-idempotency.adapter';
import { OAuth2SourceCredentialRefresher } from '../../adapters/credentials/oauth2-source-credential-refresher';
import { PrismaIdempotencyAdapter } from '../../adapters/idempotency/prisma/prisma-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../../adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanJobRepository } from '../../adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanExecutionAttemptReadModel } from '../../adapters/persistence/in-memory-scan-execution-attempt-read-model';
import { InMemoryScanPolicyRepository } from '../../adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../../adapters/persistence/in-memory-source-binding.repository';
import { InMemorySourceCredentialRepository } from '../../adapters/persistence/in-memory-source-credential.repository';
import { InMemoryTopicRepository } from '../../adapters/persistence/in-memory-topic.repository';
import { PrismaMonitoringConnection } from '../../adapters/persistence/prisma/prisma-monitoring-connection';
import type { PrismaMonitoringClient } from '../../adapters/persistence/prisma/prisma-monitoring-client';
import { PrismaScanJobRepository } from '../../adapters/persistence/prisma/prisma-scan-job.repository';
import { PrismaScanExecutionAttemptReadModel } from '../../adapters/persistence/prisma/prisma-scan-execution-attempt-read-model';
import { PrismaScanPolicyRepository } from '../../adapters/persistence/prisma/prisma-scan-policy.repository';
import { PrismaSourceBindingRepository } from '../../adapters/persistence/prisma/prisma-source-binding.repository';
import { PrismaSourceCredentialRepository } from '../../adapters/persistence/prisma/prisma-source-credential.repository';
import { PrismaTopicRepository } from '../../adapters/persistence/prisma/prisma-topic.repository';
import { PrismaMonitoringOutboxAdapter } from '../../adapters/persistence/prisma/prisma-monitoring-outbox.adapter';
import { UsageScanRequestQuotaAdapter } from '../../adapters/quota/usage-scan-request-quota.adapter';
import { InMemoryScanQueueAdapter } from '../../adapters/queue/in-memory-scan-queue.adapter';
import { InMemorySourceCredentialSecretVault } from '../../adapters/secrets/in-memory-source-credential.vault';
import {
  PrismaSourceCredentialVault,
  resolveSourceCredentialSecretEncryptionKey,
} from '../../adapters/secrets/prisma/prisma-source-credential.vault';
import { AesGcmSourceBindingConfigProtector } from '../../adapters/security/aes-gcm-source-binding-config-protector';
import {
  FakeSourceCatalogAdapter,
  shouldIncludeFixtureSourceCatalogEntries,
} from '../../adapters/source-catalog/fake-source-catalog.adapter';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { ChangeSourceBindingStatusUseCase } from '../../features/change-source-binding-status/change-source-binding-status.use-case';
import { CreateSourceCredentialUseCase } from '../../features/create-source-credential/create-source-credential.use-case';
import { CreateTopicUseCase } from '../../features/create-topic/create-topic.use-case';
import { GetScanPolicyUseCase } from '../../features/get-scan-policy/get-scan-policy.use-case';
import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import { GetSourceBindingHealthUseCase } from '../../features/get-source-binding-health/get-source-binding-health.use-case';
import { ListSourceCredentialsUseCase } from '../../features/list-source-credentials/list-source-credentials.use-case';
import { ListSourceBindingDailyHistoryUseCase } from '../../features/list-source-binding-daily-history/list-source-binding-daily-history.use-case';
import { ListSourceBindingOverviewUseCase } from '../../features/list-source-binding-overview/list-source-binding-overview.use-case';
import { ListSourceBindingScansUseCase } from '../../features/list-source-binding-scans/list-source-binding-scans.use-case';
import { ListSourceBindingsUseCase } from '../../features/list-source-bindings/list-source-bindings.use-case';
import { ListTopicsUseCase } from '../../features/list-topics/list-topics.use-case';
import { RecordScanExecutionUseCase } from '../../features/record-scan-execution/record-scan-execution.use-case';
import { RequestScanUseCase } from '../../features/request-scan/request-scan.use-case';
import { ResolveSourceCredentialUseCase } from '../../features/resolve-source-credential/resolve-source-credential.use-case';
import { RevokeSourceCredentialUseCase } from '../../features/revoke-source-credential/revoke-source-credential.use-case';
import { RotateSourceCredentialUseCase } from '../../features/rotate-source-credential/rotate-source-credential.use-case';
import { ScheduleDueScansUseCase } from '../../features/schedule-due-scans/schedule-due-scans.use-case';
import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import {
  defaultMonitoringCapacityLimits,
  type MonitoringCapacityLimits,
} from '../../features/shared/monitoring-capacity-limits';
import type {
  IdempotencyPort,
  OutboxPort,
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  ScanSchedulerDecisionHistoryPort,
  ScanQueuePort,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCredentialRefreshPort,
  SourceCredentialRepositoryPort,
  SourceCredentialResolverPort,
  SourceCredentialVaultPort,
  SourceCatalogPort,
  TopicRepositoryPort,
} from '../../ports';

import {
  MONITORING_CONFIG_PROTECTOR,
  MONITORING_IDEMPOTENCY,
  MONITORING_OUTBOX,
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
  MONITORING_SCAN_QUEUE_MODE,
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
  MONITORING_SCAN_POLICY_REPOSITORY,
  MONITORING_SCAN_QUEUE,
  MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_CATALOG,
  MONITORING_SOURCE_CREDENTIAL_REFRESHER,
  MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
  MONITORING_SOURCE_CREDENTIAL_RESOLVER,
  MONITORING_SOURCE_CREDENTIAL_VAULT,
  MONITORING_TOPIC_REPOSITORY,
  type MonitoringPersistenceMode,
  type MonitoringScanQueueMode,
  monitoringPersistenceModeProvider,
  monitoringScanQueueModeProvider,
  resolveManualScanRequestQuotaPerHour,
} from './monitoring-provider-tokens';
import { monitoringSchedulerProviders } from './monitoring-scheduler.providers';
import { ScanPolicyController } from './scan-policy.controller';
import { ScanRequestController } from './scan-request.controller';
import { ScanStatusController } from './scan-status.controller';
import { SourceBindingController } from './source-binding.controller';
import { SourceCredentialController } from './source-credential.controller';
import { TopicController } from './topic.controller';

type MonitoringScanJobStorePort = ScanJobRepositoryPort & ScanJobHistoryReadPort;

const MONITORING_RABBITMQ_CHANNEL = Symbol('MONITORING_RABBITMQ_CHANNEL');
const MONITORING_QUEUE_PUBLISHER = Symbol('MONITORING_QUEUE_PUBLISHER');

@Module({
  imports: [UsageRestModule, IdentityRestModule],
  controllers: [
    TopicController,
    SourceBindingController,
    ScanPolicyController,
    ScanRequestController,
    ScanStatusController,
    SourceCredentialController,
  ],
  providers: [
    monitoringPersistenceModeProvider,
    monitoringScanQueueModeProvider,
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
      provide: MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): SourceCredentialRepositoryPort =>
        mode === 'prisma'
          ? new PrismaSourceCredentialRepository(requirePrismaMonitoringClient(prisma))
          : new InMemorySourceCredentialRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SOURCE_CREDENTIAL_VAULT,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): SourceCredentialVaultPort =>
        mode === 'prisma'
          ? new PrismaSourceCredentialVault(
              requirePrismaMonitoringClient(prisma),
              resolveSourceCredentialSecretEncryptionKey(process.env),
            )
          : new InMemorySourceCredentialSecretVault(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SOURCE_CREDENTIAL_REFRESHER,
      useFactory: (): SourceCredentialRefreshPort =>
        new OAuth2SourceCredentialRefresher({
          timeoutMs: parseOptionalPositiveInteger(process.env.SOURCE_CREDENTIAL_REFRESH_TIMEOUT_MS),
          refreshSkewMs: parseOptionalPositiveInteger(process.env.SOURCE_CREDENTIAL_REFRESH_SKEW_MS),
        }),
    },
    {
      provide: MONITORING_SOURCE_CREDENTIAL_RESOLVER,
      useFactory: (
        credentials: SourceCredentialRepositoryPort,
        vault: SourceCredentialVaultPort,
        refresher: SourceCredentialRefreshPort,
      ): SourceCredentialResolverPort =>
        new ResolveSourceCredentialUseCase(credentials, vault, refresher, new SystemClock()),
      inject: [
        MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
        MONITORING_SOURCE_CREDENTIAL_VAULT,
        MONITORING_SOURCE_CREDENTIAL_REFRESHER,
      ],
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
      ): MonitoringScanJobStorePort =>
        mode === 'prisma'
          ? new PrismaScanJobRepository(requirePrismaMonitoringClient(prisma))
          : new InMemoryScanJobRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    ...monitoringSchedulerProviders,
    {
      provide: MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): ScanExecutionAttemptReadPort =>
        mode === 'prisma'
          ? new PrismaScanExecutionAttemptReadModel(requirePrismaMonitoringClient(prisma))
          : new InMemoryScanExecutionAttemptReadModel(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    InMemoryQueuePublisher,
    InMemoryMetricsRecorder,
    RequestCorrelationIdFactory,
    {
      provide: MONITORING_RABBITMQ_CHANNEL,
      useFactory: (mode: MonitoringScanQueueMode): AmqplibRabbitMqChannel | null =>
        mode === 'rabbitmq' ? new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? '' }) : null,
      inject: [MONITORING_SCAN_QUEUE_MODE],
    },
    {
      provide: MONITORING_QUEUE_PUBLISHER,
      useFactory: (
        mode: MonitoringScanQueueMode,
        inMemoryPublisher: InMemoryQueuePublisher,
        rabbitMqChannel: AmqplibRabbitMqChannel | null,
      ): QueuePublisherPort =>
        mode === 'rabbitmq'
          ? new RabbitMqQueuePublisher(
              requireRabbitMqChannel(rabbitMqChannel),
              monitoringScanQueueRabbitMqOptions(process.env),
              new SystemClock(),
            )
          : inMemoryPublisher,
      inject: [MONITORING_SCAN_QUEUE_MODE, InMemoryQueuePublisher, MONITORING_RABBITMQ_CHANNEL],
    },
    {
      provide: MONITORING_SCAN_QUEUE,
      useFactory: (publisher: QueuePublisherPort, metrics: InMemoryMetricsRecorder): ScanQueuePort =>
        new InMemoryScanQueueAdapter(publisher, metrics),
      inject: [MONITORING_QUEUE_PUBLISHER, InMemoryMetricsRecorder],
    },
    {
      provide: MONITORING_SOURCE_CATALOG,
      useFactory: (): SourceCatalogPort =>
        new FakeSourceCatalogAdapter({
          includeFixtureProviders: shouldIncludeFixtureSourceCatalogEntries(process.env),
        }),
    },
    {
      provide: MONITORING_CONFIG_PROTECTOR,
      useFactory: (): SourceBindingConfigProtectorPort =>
        AesGcmSourceBindingConfigProtector.fromEnvironment(process.env),
    },
    {
      provide: MONITORING_OUTBOX,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): OutboxPort =>
        mode === 'prisma'
          ? new PrismaMonitoringOutboxAdapter(requirePrismaMonitoringClient(prisma))
          : new InMemoryOutboxAdapter(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_IDEMPOTENCY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): IdempotencyPort =>
        mode === 'prisma'
          ? new PrismaIdempotencyAdapter(requirePrismaMonitoringClient(prisma), new CryptoIdGenerator())
          : new InMemoryIdempotencyAdapter(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: UsageScanRequestQuotaAdapter,
      useFactory: (reserveUsageQuota: ReserveUsageQuotaUseCase) =>
        new UsageScanRequestQuotaAdapter(reserveUsageQuota, {
          quotaPerHour: resolveManualScanRequestQuotaPerHour(process.env),
        }),
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
          resolveMonitoringCapacityLimits(process.env),
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
          resolveMonitoringCapacityLimits(process.env),
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
      provide: CreateSourceCredentialUseCase,
      useFactory: (
        credentials: SourceCredentialRepositoryPort,
        vault: SourceCredentialVaultPort,
      ) =>
        new CreateSourceCredentialUseCase(
          credentials,
          vault,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [MONITORING_SOURCE_CREDENTIAL_REPOSITORY, MONITORING_SOURCE_CREDENTIAL_VAULT],
    },
    {
      provide: RotateSourceCredentialUseCase,
      useFactory: (
        credentials: SourceCredentialRepositoryPort,
        vault: SourceCredentialVaultPort,
      ) =>
        new RotateSourceCredentialUseCase(
          credentials,
          vault,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [MONITORING_SOURCE_CREDENTIAL_REPOSITORY, MONITORING_SOURCE_CREDENTIAL_VAULT],
    },
    {
      provide: RevokeSourceCredentialUseCase,
      useFactory: (
        credentials: SourceCredentialRepositoryPort,
        vault: SourceCredentialVaultPort,
      ) => new RevokeSourceCredentialUseCase(credentials, vault, new SystemClock()),
      inject: [MONITORING_SOURCE_CREDENTIAL_REPOSITORY, MONITORING_SOURCE_CREDENTIAL_VAULT],
    },
    {
      provide: ListSourceCredentialsUseCase,
      useFactory: (credentials: SourceCredentialRepositoryPort) =>
        new ListSourceCredentialsUseCase(credentials),
      inject: [MONITORING_SOURCE_CREDENTIAL_REPOSITORY],
    },
    {
      provide: GetSourceBindingHealthUseCase,
      useFactory: (
        bindings: SourceBindingRepositoryPort,
        scanPolicies: ScanPolicyRepositoryPort,
        scanJobs: ScanJobRepositoryPort & ScanJobHistoryReadPort,
        scanExecutionAttempts: ScanExecutionAttemptReadPort,
      ) =>
        new GetSourceBindingHealthUseCase(
          bindings,
          scanPolicies,
          scanJobs,
          scanExecutionAttempts,
          new SystemClock(),
        ),
      inject: [
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SCAN_POLICY_REPOSITORY,
        MONITORING_SCAN_JOB_REPOSITORY,
        MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
      ],
    },
    {
      provide: ListSourceBindingOverviewUseCase,
      useFactory: (
        listSourceBindings: ListSourceBindingsUseCase,
        getSourceBindingHealth: GetSourceBindingHealthUseCase,
      ) =>
        new ListSourceBindingOverviewUseCase(
          listSourceBindings,
          getSourceBindingHealth,
      ),
      inject: [ListSourceBindingsUseCase, GetSourceBindingHealthUseCase],
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
        scanJobs: MonitoringScanJobStorePort,
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
      provide: GetScanStatusUseCase,
      useFactory: (
        scanJobs: ScanJobRepositoryPort,
        scanExecutionAttempts: ScanExecutionAttemptReadPort,
      ) => new GetScanStatusUseCase(scanJobs, scanExecutionAttempts),
      inject: [MONITORING_SCAN_JOB_REPOSITORY, MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL],
    },
    {
      provide: ListSourceBindingScansUseCase,
      useFactory: (
        sourceBindings: SourceBindingRepositoryPort,
        scanJobs: ScanJobRepositoryPort & ScanJobHistoryReadPort,
        scanExecutionAttempts: ScanExecutionAttemptReadPort,
      ) => new ListSourceBindingScansUseCase(sourceBindings, scanJobs, scanExecutionAttempts),
      inject: [
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SCAN_JOB_REPOSITORY,
        MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
      ],
    },
    {
      provide: ListSourceBindingDailyHistoryUseCase,
      useFactory: (
        sourceBindings: SourceBindingRepositoryPort,
        scanPolicies: ScanPolicyRepositoryPort,
        scanJobs: ScanJobRepositoryPort & ScanJobHistoryReadPort,
        scanExecutionAttempts: ScanExecutionAttemptReadPort,
        schedulerDecisions: ScanSchedulerDecisionHistoryPort,
      ) =>
        new ListSourceBindingDailyHistoryUseCase(
          sourceBindings,
          scanPolicies,
          scanJobs,
          scanExecutionAttempts,
          new SystemClock(),
          schedulerDecisions,
        ),
      inject: [
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SCAN_POLICY_REPOSITORY,
        MONITORING_SCAN_JOB_REPOSITORY,
        MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
        MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
      ],
    },
    {
      provide: RecordScanExecutionUseCase,
      useFactory: (scanJobs: ScanJobRepositoryPort) => new RecordScanExecutionUseCase(scanJobs),
      inject: [MONITORING_SCAN_JOB_REPOSITORY],
    },
  ],
  exports: [
    ScheduleDueScansUseCase,
    GetScanStatusUseCase,
    ListSourceBindingDailyHistoryUseCase,
    ListSourceBindingScansUseCase,
    RecordScanExecutionUseCase,
    InMemoryQueuePublisher,
    MONITORING_CONFIG_PROTECTOR,
    MONITORING_SOURCE_BINDING_REPOSITORY,
    MONITORING_SOURCE_CREDENTIAL_RESOLVER,
  ],
})
export class MonitoringRestModule {}

const requirePrismaMonitoringClient = (client: PrismaMonitoringClient | null): PrismaMonitoringClient => {
  if (client === null) {
    throw new Error('Prisma monitoring client is not configured');
  }

  return client;
};

const requireRabbitMqChannel = (channel: AmqplibRabbitMqChannel | null): AmqplibRabbitMqChannel => {
  if (channel === null) {
    throw new Error('RabbitMQ channel is not configured');
  }

  return channel;
};

const monitoringScanQueueRabbitMqOptions = (env: NodeJS.ProcessEnv) => ({
  exchange: envValue(env.RABBITMQ_COMMAND_EXCHANGE, 'social-monitor.jobs'),
  routes: {
    'ingestion.scan.execute': {
      queue: envValue(env.RABBITMQ_SCAN_QUEUE, 'jobs.freshness.scan'),
      routingKey: envValue(env.RABBITMQ_SCAN_ROUTING_KEY, 'scan.execute'),
      deadLetterExchange: parseRabbitMqDeadLetterExchange(env.RABBITMQ_DEAD_LETTER_EXCHANGE, {
        runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
        settingName: 'MONITORING_SCAN_QUEUE=rabbitmq',
      }),
      queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
      deliveryLimit: parseRabbitMqDeliveryLimit(env.RABBITMQ_QUEUE_DELIVERY_LIMIT),
    },
  },
});

const envValue = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const parseOptionalPositiveInteger = (value: string | undefined): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const resolveMonitoringCapacityLimits = (env: NodeJS.ProcessEnv): Required<MonitoringCapacityLimits> => ({
  maxTopicsPerWorkspace: parseOptionalPositiveInteger(env.MONITORING_MAX_TOPICS_PER_WORKSPACE) ??
    defaultMonitoringCapacityLimits.maxTopicsPerWorkspace,
  maxEnabledSourcesPerTopic: parseOptionalPositiveInteger(env.MONITORING_MAX_ENABLED_SOURCES_PER_TOPIC) ??
    defaultMonitoringCapacityLimits.maxEnabledSourcesPerTopic,
});
