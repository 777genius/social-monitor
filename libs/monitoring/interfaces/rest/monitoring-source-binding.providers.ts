import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { AesGcmSourceBindingConfigProtector } from '../../adapters/security/aes-gcm-source-binding-config-protector';
import {
  FakeSourceCatalogAdapter,
  sourceCatalogOptionsForRuntime,
} from '../../adapters/source-catalog/fake-source-catalog.adapter';
import { ApplyAcceptedTopicRecommendationUseCase } from '../../features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.use-case';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { ChangeSourceBindingStatusUseCase } from '../../features/change-source-binding-status/change-source-binding-status.use-case';
import { GetSourceBindingHealthUseCase } from '../../features/get-source-binding-health/get-source-binding-health.use-case';
import { ListSourceBindingOverviewUseCase } from '../../features/list-source-binding-overview/list-source-binding-overview.use-case';
import { ListSourceBindingsUseCase } from '../../features/list-source-bindings/list-source-bindings.use-case';
import type {
  IdempotencyPort,
  InterestRepositoryPort,
  OutboxPort,
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
} from '../../ports';
import { resolveMonitoringCapacityLimits } from './monitoring-capacity-limit-provider';
import {
  MONITORING_CONFIG_PROTECTOR,
  MONITORING_IDEMPOTENCY,
  MONITORING_INTEREST_REPOSITORY,
  MONITORING_OUTBOX,
  MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_POLICY_REPOSITORY,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_CATALOG,
} from './monitoring-provider-tokens';

type MonitoringScanJobStorePort =
  ScanJobRepositoryPort & ScanJobHistoryReadPort;

export const monitoringSourceBindingProviders = (
  env: NodeJS.ProcessEnv,
): Provider[] => [
  {
    provide: MONITORING_SOURCE_CATALOG,
    useFactory: (): SourceCatalogPort =>
      new FakeSourceCatalogAdapter(sourceCatalogOptionsForRuntime(env)),
  },
  {
    provide: MONITORING_CONFIG_PROTECTOR,
    useFactory: (): SourceBindingConfigProtectorPort =>
      AesGcmSourceBindingConfigProtector.fromEnvironment(env),
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
        resolveMonitoringCapacityLimits(env),
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
    provide: GetSourceBindingHealthUseCase,
    useFactory: (
      bindings: SourceBindingRepositoryPort,
      scanPolicies: ScanPolicyRepositoryPort,
      scanJobs: MonitoringScanJobStorePort,
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
];
