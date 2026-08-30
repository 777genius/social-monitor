import type { FactoryProvider, Provider, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { MetricsRuntimeModule } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { ApplyAcceptedTopicRecommendationUseCase } from '../../features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.use-case';
import { UsageScanRequestQuotaAdapter } from '../../adapters/quota/usage-scan-request-quota.adapter';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { CreateInterestUseCase } from '../../features/create-interest/create-interest.use-case';
import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import { ListSourceBindingDailyHistoryUseCase } from '../../features/list-source-binding-daily-history/list-source-binding-daily-history.use-case';
import { ListSourceBindingScansUseCase } from '../../features/list-source-binding-scans/list-source-binding-scans.use-case';
import { PlanInterestCoverageUseCase } from '../../features/plan-interest-coverage/plan-interest-coverage.use-case';
import { RecordScanExecutionUseCase } from '../../features/record-scan-execution/record-scan-execution.use-case';
import { RequestScanUseCase } from '../../features/request-scan/request-scan.use-case';
import { ScheduleDueScansUseCase } from '../../features/schedule-due-scans/schedule-due-scans.use-case';
import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import { InterestCoveragePlanController } from './interest-coverage-plan.controller';
import { InterestController } from './interest.controller';
import { MonitoringPrismaClientModule } from './monitoring-prisma-client.module';
import {
  MONITORING_CONFIG_PROTECTOR,
  MONITORING_IDEMPOTENCY,
  MONITORING_INTEREST_REPOSITORY,
  MONITORING_OUTBOX,
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
  MONITORING_SCAN_DISPATCH,
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_POLICY_REPOSITORY,
  MONITORING_SCAN_QUEUE,
  MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_CREDENTIAL_REFRESHER,
  MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
  MONITORING_SOURCE_CREDENTIAL_RESOLVER,
  MONITORING_SOURCE_CREDENTIAL_VAULT,
} from './monitoring-provider-tokens';
import { MonitoringRestModule } from './monitoring-rest.module';
import { ScanPolicyController } from './scan-policy.controller';
import { ScanRequestController } from './scan-request.controller';
import { ScanStatusController } from './scan-status.controller';
import { SourceBindingController } from './source-binding.controller';
import { SourceCredentialController } from './source-credential.controller';

const MODULE_IMPORTS = 'imports';
const MODULE_CONTROLLERS = 'controllers';
const MODULE_PROVIDERS = 'providers';
const MODULE_EXPORTS = 'exports';
const SCOPE_OPTIONS = 'scope:options';

describe('MonitoringRestModule composition', () => {
  it('keeps the public imports, controllers, and exports explicit', () => {
    expect(moduleMetadata(MODULE_IMPORTS)).toEqual([
      UsageRestModule,
      IdentityRestModule,
      MonitoringPrismaClientModule,
    ]);
    expect(moduleMetadata(MODULE_CONTROLLERS)).toEqual([
      InterestController,
      SourceBindingController,
      ScanPolicyController,
      ScanRequestController,
      ScanStatusController,
      SourceCredentialController,
      InterestCoveragePlanController,
    ]);
    expect(moduleMetadata(MODULE_EXPORTS)).toEqual([
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
    ]);
  });

  it('keeps critical tokens bound to the same dependencies as singleton providers', () => {
    const providers = moduleMetadata<Provider[]>(MODULE_PROVIDERS);

    expect(providers).toHaveLength(46);
    expect(factoryProvider(MONITORING_SOURCE_BINDING_REPOSITORY).inject).toEqual(
      [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
    );
    expect(factoryProvider(MONITORING_SOURCE_CREDENTIAL_RESOLVER).inject).toEqual(
      [
        MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
        MONITORING_SOURCE_CREDENTIAL_VAULT,
        MONITORING_SOURCE_CREDENTIAL_REFRESHER,
      ],
    );
    expect(factoryProvider(CreateInterestUseCase).inject).toEqual([
      MONITORING_INTEREST_REPOSITORY,
      MONITORING_OUTBOX,
      MONITORING_IDEMPOTENCY,
    ]);
    expect(factoryProvider(RequestScanUseCase).inject).toEqual([
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_POLICY_REPOSITORY,
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_QUEUE,
      MONITORING_OUTBOX,
      MONITORING_IDEMPOTENCY,
      UsageScanRequestQuotaAdapter,
      MONITORING_SCAN_DISPATCH,
    ]);
    expect(factoryProvider(ScheduleDueScansUseCase).inject).toEqual([
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_POLICY_REPOSITORY,
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_QUEUE,
      MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
      MONITORING_SCAN_DISPATCH,
    ]);

    for (const provider of providers) {
      expect(explicitScope(provider)).toBeUndefined();
    }

    const providerTokens = providers.map(providerToken);
    for (const exportedProvider of moduleMetadata<unknown[]>(MODULE_EXPORTS)) {
      expect(providerTokens).toContain(exportedProvider);
    }
  });

  it('compiles with every REST controller available', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetricsRuntimeModule.register({
          serviceName: 'monitoring-rest-module-spec',
        }),
        MonitoringRestModule,
      ],
    }).compile();

    try {
      for (const controller of moduleMetadata<Type<unknown>[]>(
        MODULE_CONTROLLERS,
      )) {
        expect(moduleRef.get(controller, { strict: false })).toBeInstanceOf(
          controller,
        );
      }
    } finally {
      await moduleRef.close();
    }
  });
});

const moduleMetadata = <T = unknown>(key: string): T => {
  const metadata = Reflect.getMetadata(key, MonitoringRestModule) as
    | T
    | undefined;

  if (metadata === undefined) {
    throw new Error(`MonitoringRestModule is missing ${key} metadata`);
  }

  return metadata;
};

const factoryProvider = (token: unknown): FactoryProvider => {
  const provider = moduleMetadata<Provider[]>(MODULE_PROVIDERS).find(
    (candidate) => providerToken(candidate) === token,
  );

  if (provider === undefined || typeof provider === 'function') {
    throw new Error('Expected a factory provider for monitoring token');
  }

  if (!('useFactory' in provider)) {
    throw new Error('Expected monitoring token to use a factory provider');
  }

  return provider;
};

const providerToken = (provider: Provider): unknown =>
  typeof provider === 'function' ? provider : provider.provide;

const explicitScope = (provider: Provider): unknown => {
  if (typeof provider === 'function') {
    const options = Reflect.getMetadata(SCOPE_OPTIONS, provider) as
      | { readonly scope?: unknown }
      | undefined;
    return options?.scope;
  }

  return 'scope' in provider ? provider.scope : undefined;
};
