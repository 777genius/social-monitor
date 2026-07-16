import { Module } from "@nestjs/common";
import { IdentityRestModule } from "@social-monitor/identity/interfaces/rest/identity-rest.module";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import { RequestCorrelationIdFactory } from "@social-monitor/platform-request-context";
import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";
import { ReserveUsageQuotaUseCase } from "@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case";
import { UsageRestModule } from "@social-monitor/usage/interfaces/rest/usage-rest.module";
import { InMemoryIdempotencyAdapter } from "../../adapters/idempotency/in-memory-idempotency.adapter";
import { OAuth2SourceCredentialRefresher } from "../../adapters/credentials/oauth2-source-credential-refresher";
import { PrismaIdempotencyAdapter } from "../../adapters/idempotency/prisma/prisma-idempotency.adapter";
import { InMemoryOutboxAdapter } from "../../adapters/messaging/in-memory-outbox.adapter";
import { InMemoryScanJobRepository } from "../../adapters/persistence/in-memory-scan-job.repository";
import { InMemoryScanExecutionAttemptReadModel } from "../../adapters/persistence/in-memory-scan-execution-attempt-read-model";
import { InMemoryScanPolicyRepository } from "../../adapters/persistence/in-memory-scan-policy.repository";
import { InMemorySourceBindingRepository } from "../../adapters/persistence/in-memory-source-binding.repository";
import { InMemorySourceCredentialRepository } from "../../adapters/persistence/in-memory-source-credential.repository";
import { InMemoryInterestRepository } from "../../adapters/persistence/in-memory-interest.repository";
import type { PrismaMonitoringClient } from "../../adapters/persistence/prisma/prisma-monitoring-client";
import { PrismaScanJobRepository } from "../../adapters/persistence/prisma/prisma-scan-job.repository";
import { PrismaScanExecutionAttemptReadModel } from "../../adapters/persistence/prisma/prisma-scan-execution-attempt-read-model";
import { PrismaScanPolicyRepository } from "../../adapters/persistence/prisma/prisma-scan-policy.repository";
import { PrismaSourceBindingRepository } from "../../adapters/persistence/prisma/prisma-source-binding.repository";
import { PrismaSourceCredentialRepository } from "../../adapters/persistence/prisma/prisma-source-credential.repository";
import { PrismaInterestRepository } from "../../adapters/persistence/prisma/prisma-interest.repository";
import { PrismaMonitoringOutboxAdapter } from "../../adapters/persistence/prisma/prisma-monitoring-outbox.adapter";
import { UsageScanRequestQuotaAdapter } from "../../adapters/quota/usage-scan-request-quota.adapter";
import { InMemorySourceCredentialSecretVault } from "../../adapters/secrets/in-memory-source-credential.vault";
import {
  PrismaSourceCredentialVault,
  resolveSourceCredentialSecretEncryptionKey,
} from "../../adapters/secrets/prisma/prisma-source-credential.vault";
import { AesGcmSourceBindingConfigProtector } from "../../adapters/security/aes-gcm-source-binding-config-protector";
import {
  FakeSourceCatalogAdapter,
  sourceCatalogOptionsForRuntime,
} from "../../adapters/source-catalog/fake-source-catalog.adapter";
import { ArchiveInterestUseCase } from "../../features/archive-interest/archive-interest.use-case";
import { ApplyAcceptedTopicRecommendationUseCase } from "../../features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.use-case";
import { BindSourceUseCase } from "../../features/bind-source/bind-source.use-case";
import { ChangeSourceBindingStatusUseCase } from "../../features/change-source-binding-status/change-source-binding-status.use-case";
import { CreateSourceCredentialUseCase } from "../../features/create-source-credential/create-source-credential.use-case";
import { CreateInterestUseCase } from "../../features/create-interest/create-interest.use-case";
import { GetScanPolicyUseCase } from "../../features/get-scan-policy/get-scan-policy.use-case";
import { GetScanStatusUseCase } from "../../features/get-scan-status/get-scan-status.use-case";
import { GetSourceBindingHealthUseCase } from "../../features/get-source-binding-health/get-source-binding-health.use-case";
import { ListSourceCredentialsUseCase } from "../../features/list-source-credentials/list-source-credentials.use-case";
import { ListSourceBindingDailyHistoryUseCase } from "../../features/list-source-binding-daily-history/list-source-binding-daily-history.use-case";
import { ListSourceBindingOverviewUseCase } from "../../features/list-source-binding-overview/list-source-binding-overview.use-case";
import { ListSourceBindingScansUseCase } from "../../features/list-source-binding-scans/list-source-binding-scans.use-case";
import { ListSourceBindingsUseCase } from "../../features/list-source-bindings/list-source-bindings.use-case";
import { ListInterestsUseCase } from "../../features/list-interests/list-interests.use-case";
import { PlanInterestCoverageUseCase } from "../../features/plan-interest-coverage/plan-interest-coverage.use-case";
import { RecordScanExecutionUseCase } from "../../features/record-scan-execution/record-scan-execution.use-case";
import { RequestScanUseCase } from "../../features/request-scan/request-scan.use-case";
import { ResolveSourceCredentialUseCase } from "../../features/resolve-source-credential/resolve-source-credential.use-case";
import { RevokeSourceCredentialUseCase } from "../../features/revoke-source-credential/revoke-source-credential.use-case";
import { RotateSourceCredentialUseCase } from "../../features/rotate-source-credential/rotate-source-credential.use-case";
import { ScheduleDueScansUseCase } from "../../features/schedule-due-scans/schedule-due-scans.use-case";
import { SetScanPolicyUseCase } from "../../features/set-scan-policy/set-scan-policy.use-case";
import { UpdateInterestUseCase } from "../../features/update-interest/update-interest.use-case";
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
  InterestRepositoryPort,
} from "../../ports";

import {
  MONITORING_CONFIG_PROTECTOR,
  MONITORING_IDEMPOTENCY,
  MONITORING_OUTBOX,
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
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
  MONITORING_INTEREST_REPOSITORY,
  type MonitoringPersistenceMode,
  monitoringScanQueueModeProvider,
  resolveManualScanRequestQuotaPerHour,
} from "./monitoring-provider-tokens";
import { MonitoringPrismaClientModule } from "./monitoring-prisma-client.module";
import {
  parseOptionalPositiveInteger,
  resolveMonitoringCapacityLimits,
} from "./monitoring-capacity-limit-provider";
import { monitoringScanQueueProviders } from "./monitoring-scan-queue.providers";
import { monitoringSchedulerProviders } from "./monitoring-scheduler.providers";
import { ScanPolicyController } from "./scan-policy.controller";
import { ScanRequestController } from "./scan-request.controller";
import { ScanStatusController } from "./scan-status.controller";
import { SourceBindingController } from "./source-binding.controller";
import { SourceCredentialController } from "./source-credential.controller";
import { InterestController } from "./interest.controller";
import { InterestCoveragePlanController } from "./interest-coverage-plan.controller";
type MonitoringScanJobStorePort = ScanJobRepositoryPort &
  ScanJobHistoryReadPort;

@Module({
  imports: [
    UsageRestModule,
    IdentityRestModule,
    MonitoringPrismaClientModule,
  ],
  controllers: [
    InterestController,
    SourceBindingController,
    ScanPolicyController,
    ScanRequestController,
    ScanStatusController,
    SourceCredentialController,
    InterestCoveragePlanController,
  ],
  providers: [
    monitoringScanQueueModeProvider,
    {
      provide: MONITORING_INTEREST_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): InterestRepositoryPort =>
        mode === "prisma"
          ? new PrismaInterestRepository(requirePrismaMonitoringClient(prisma))
          : new InMemoryInterestRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SOURCE_BINDING_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): SourceBindingRepositoryPort =>
        mode === "prisma"
          ? new PrismaSourceBindingRepository(
              requirePrismaMonitoringClient(prisma),
            )
          : new InMemorySourceBindingRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): SourceCredentialRepositoryPort =>
        mode === "prisma"
          ? new PrismaSourceCredentialRepository(
              requirePrismaMonitoringClient(prisma),
            )
          : new InMemorySourceCredentialRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SOURCE_CREDENTIAL_VAULT,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): SourceCredentialVaultPort =>
        mode === "prisma"
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
          timeoutMs: parseOptionalPositiveInteger(
            process.env.SOURCE_CREDENTIAL_REFRESH_TIMEOUT_MS,
          ),
          refreshSkewMs: parseOptionalPositiveInteger(
            process.env.SOURCE_CREDENTIAL_REFRESH_SKEW_MS,
          ),
        }),
    },
    {
      provide: MONITORING_SOURCE_CREDENTIAL_RESOLVER,
      useFactory: (
        credentials: SourceCredentialRepositoryPort,
        vault: SourceCredentialVaultPort,
        refresher: SourceCredentialRefreshPort,
      ): SourceCredentialResolverPort =>
        new ResolveSourceCredentialUseCase(
          credentials,
          vault,
          refresher,
          new SystemClock(),
        ),
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
        mode === "prisma"
          ? new PrismaScanPolicyRepository(
              requirePrismaMonitoringClient(prisma),
            )
          : new InMemoryScanPolicyRepository(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_SCAN_JOB_REPOSITORY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): MonitoringScanJobStorePort =>
        mode === "prisma"
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
        mode === "prisma"
          ? new PrismaScanExecutionAttemptReadModel(
              requirePrismaMonitoringClient(prisma),
            )
          : new InMemoryScanExecutionAttemptReadModel(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    ...monitoringScanQueueProviders(process.env),
    RequestCorrelationIdFactory,
    {
      provide: MONITORING_SOURCE_CATALOG,
      useFactory: (): SourceCatalogPort =>
        new FakeSourceCatalogAdapter(
          sourceCatalogOptionsForRuntime(process.env),
        ),
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
        mode === "prisma"
          ? new PrismaMonitoringOutboxAdapter(
              requirePrismaMonitoringClient(prisma),
            )
          : new InMemoryOutboxAdapter(),
      inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    },
    {
      provide: MONITORING_IDEMPOTENCY,
      useFactory: (
        mode: MonitoringPersistenceMode,
        prisma: PrismaMonitoringClient | null,
      ): IdempotencyPort =>
        mode === "prisma"
          ? new PrismaIdempotencyAdapter(
              requirePrismaMonitoringClient(prisma),
              new CryptoIdGenerator(),
            )
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
      provide: CreateInterestUseCase,
      useFactory: (
        interests: InterestRepositoryPort,
        outbox: OutboxPort,
        idempotency: IdempotencyPort,
      ) =>
        new CreateInterestUseCase(
          interests,
          outbox,
          idempotency,
          new CryptoIdGenerator(),
          new SystemClock(),
          resolveMonitoringCapacityLimits(process.env),
        ),
      inject: [
        MONITORING_INTEREST_REPOSITORY,
        MONITORING_OUTBOX,
        MONITORING_IDEMPOTENCY,
      ],
    },
    {
      provide: ListInterestsUseCase,
      useFactory: (interests: InterestRepositoryPort) =>
        new ListInterestsUseCase(interests),
      inject: [MONITORING_INTEREST_REPOSITORY],
    },
    {
      provide: PlanInterestCoverageUseCase,
      useFactory: (
        interests: InterestRepositoryPort,
        sourceBindings: SourceBindingRepositoryPort,
        sourceCatalog: SourceCatalogPort,
      ) =>
        new PlanInterestCoverageUseCase(
          interests,
          sourceBindings,
          sourceCatalog,
        ),
      inject: [
        MONITORING_INTEREST_REPOSITORY,
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SOURCE_CATALOG,
      ],
    },
    {
      provide: UpdateInterestUseCase,
      useFactory: (interests: InterestRepositoryPort) =>
        new UpdateInterestUseCase(interests),
      inject: [MONITORING_INTEREST_REPOSITORY],
    },
    {
      provide: ArchiveInterestUseCase,
      useFactory: (interests: InterestRepositoryPort) =>
        new ArchiveInterestUseCase(interests, new SystemClock()),
      inject: [MONITORING_INTEREST_REPOSITORY],
    },
    {
      provide: BindSourceUseCase,
      useFactory: (
        interests: InterestRepositoryPort,
        bindings: SourceBindingRepositoryPort,
        sourceCatalog: SourceCatalogPort,
        outbox: OutboxPort,
        idempotency: IdempotencyPort,
        configProtector: SourceBindingConfigProtectorPort,
      ) =>
        new BindSourceUseCase(
          interests,
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
        MONITORING_INTEREST_REPOSITORY,
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
        interests: InterestRepositoryPort,
        bindings: SourceBindingRepositoryPort,
      ) => new ListSourceBindingsUseCase(interests, bindings),
      inject: [
        MONITORING_INTEREST_REPOSITORY,
        MONITORING_SOURCE_BINDING_REPOSITORY,
      ],
    },
    {
      provide: ApplyAcceptedTopicRecommendationUseCase,
      useFactory: (
        bindings: SourceBindingRepositoryPort,
        sourceCatalog: SourceCatalogPort,
        outbox: OutboxPort,
        idempotency: IdempotencyPort,
        configProtector: SourceBindingConfigProtectorPort,
      ) =>
        new ApplyAcceptedTopicRecommendationUseCase(
          bindings,
          sourceCatalog,
          outbox,
          idempotency,
          configProtector,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SOURCE_CATALOG,
        MONITORING_OUTBOX,
        MONITORING_IDEMPOTENCY,
        MONITORING_CONFIG_PROTECTOR,
      ],
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
      inject: [
        MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
        MONITORING_SOURCE_CREDENTIAL_VAULT,
      ],
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
      inject: [
        MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
        MONITORING_SOURCE_CREDENTIAL_VAULT,
      ],
    },
    {
      provide: RevokeSourceCredentialUseCase,
      useFactory: (
        credentials: SourceCredentialRepositoryPort,
        vault: SourceCredentialVaultPort,
      ) =>
        new RevokeSourceCredentialUseCase(
          credentials,
          vault,
          new SystemClock(),
        ),
      inject: [
        MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
        MONITORING_SOURCE_CREDENTIAL_VAULT,
      ],
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
      inject: [
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_SCAN_POLICY_REPOSITORY,
      ],
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
      inject: [
        MONITORING_SOURCE_BINDING_REPOSITORY,
        MONITORING_OUTBOX,
        MONITORING_IDEMPOTENCY,
      ],
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
      inject: [
        MONITORING_SCAN_JOB_REPOSITORY,
        MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
      ],
    },
    {
      provide: ListSourceBindingScansUseCase,
      useFactory: (
        sourceBindings: SourceBindingRepositoryPort,
        scanJobs: ScanJobRepositoryPort & ScanJobHistoryReadPort,
        scanExecutionAttempts: ScanExecutionAttemptReadPort,
      ) =>
        new ListSourceBindingScansUseCase(
          sourceBindings,
          scanJobs,
          scanExecutionAttempts,
        ),
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
      useFactory: (scanJobs: ScanJobRepositoryPort) =>
        new RecordScanExecutionUseCase(scanJobs),
      inject: [MONITORING_SCAN_JOB_REPOSITORY],
    },
  ],
  exports: [
    ApplyAcceptedTopicRecommendationUseCase,
    BindSourceUseCase,
    CreateInterestUseCase,
    PlanInterestCoverageUseCase,
    ScheduleDueScansUseCase,
    SetScanPolicyUseCase,
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

const requirePrismaMonitoringClient = (
  client: PrismaMonitoringClient | null,
): PrismaMonitoringClient => {
  if (client === null) throw new Error("Prisma monitoring client is not configured");
  return client;
};
