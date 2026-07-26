import type { Provider } from '@nestjs/common';
import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';

import type {
  IdempotencyPort,
  OutboxPort,
  ScanExecutionAttemptReadPort,
  ScanJobRepositoryPort,
  ScanDispatchPort,
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
} from '../../ports';

export type MonitoringPersistenceMode = 'in-memory' | 'prisma';
export type MonitoringScanQueueMode = 'in-memory' | 'rabbitmq';

export const MONITORING_PERSISTENCE_MODE = Symbol('MONITORING_PERSISTENCE_MODE');
export const MONITORING_SCAN_QUEUE_MODE = Symbol('MONITORING_SCAN_QUEUE_MODE');
export const MONITORING_PRISMA_CLIENT = Symbol('MONITORING_PRISMA_CLIENT');
export const MONITORING_INTEREST_REPOSITORY = Symbol('MONITORING_INTEREST_REPOSITORY');
export const MONITORING_SOURCE_BINDING_REPOSITORY = Symbol('MONITORING_SOURCE_BINDING_REPOSITORY');
export const MONITORING_SCAN_POLICY_REPOSITORY = Symbol('MONITORING_SCAN_POLICY_REPOSITORY');
export const MONITORING_SCAN_JOB_REPOSITORY = Symbol('MONITORING_SCAN_JOB_REPOSITORY');
export const MONITORING_SCAN_DISPATCH = Symbol('MONITORING_SCAN_DISPATCH');
export const MONITORING_SCAN_SCHEDULER_DECISION_HISTORY =
  Symbol('MONITORING_SCAN_SCHEDULER_DECISION_HISTORY');
export const MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL =
  Symbol('MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL');
export const MONITORING_SCAN_QUEUE = Symbol('MONITORING_SCAN_QUEUE');
export const MONITORING_OUTBOX = Symbol('MONITORING_OUTBOX');
export const MONITORING_IDEMPOTENCY = Symbol('MONITORING_IDEMPOTENCY');
export const MONITORING_SOURCE_CATALOG = Symbol('MONITORING_SOURCE_CATALOG');
export const MONITORING_CONFIG_PROTECTOR = Symbol('MONITORING_CONFIG_PROTECTOR');
export const MONITORING_SOURCE_CREDENTIAL_REPOSITORY = Symbol('MONITORING_SOURCE_CREDENTIAL_REPOSITORY');
export const MONITORING_SOURCE_CREDENTIAL_VAULT = Symbol('MONITORING_SOURCE_CREDENTIAL_VAULT');
export const MONITORING_SOURCE_CREDENTIAL_REFRESHER = Symbol('MONITORING_SOURCE_CREDENTIAL_REFRESHER');
export const MONITORING_SOURCE_CREDENTIAL_RESOLVER = Symbol('MONITORING_SOURCE_CREDENTIAL_RESOLVER');

export type MonitoringProviderTokenMap = {
  readonly [MONITORING_PERSISTENCE_MODE]: MonitoringPersistenceMode;
  readonly [MONITORING_SCAN_QUEUE_MODE]: MonitoringScanQueueMode;
  readonly [MONITORING_PRISMA_CLIENT]: unknown;
  readonly [MONITORING_INTEREST_REPOSITORY]: InterestRepositoryPort;
  readonly [MONITORING_SOURCE_BINDING_REPOSITORY]: SourceBindingRepositoryPort;
  readonly [MONITORING_SCAN_POLICY_REPOSITORY]: ScanPolicyRepositoryPort;
  readonly [MONITORING_SCAN_JOB_REPOSITORY]: ScanJobRepositoryPort;
  readonly [MONITORING_SCAN_DISPATCH]: ScanDispatchPort;
  readonly [MONITORING_SCAN_SCHEDULER_DECISION_HISTORY]: ScanSchedulerDecisionHistoryPort;
  readonly [MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL]: ScanExecutionAttemptReadPort;
  readonly [MONITORING_SCAN_QUEUE]: ScanQueuePort;
  readonly [MONITORING_OUTBOX]: OutboxPort;
  readonly [MONITORING_IDEMPOTENCY]: IdempotencyPort;
  readonly [MONITORING_SOURCE_CATALOG]: SourceCatalogPort;
  readonly [MONITORING_CONFIG_PROTECTOR]: SourceBindingConfigProtectorPort;
  readonly [MONITORING_SOURCE_CREDENTIAL_REPOSITORY]: SourceCredentialRepositoryPort;
  readonly [MONITORING_SOURCE_CREDENTIAL_VAULT]: SourceCredentialVaultPort;
  readonly [MONITORING_SOURCE_CREDENTIAL_REFRESHER]: SourceCredentialRefreshPort;
  readonly [MONITORING_SOURCE_CREDENTIAL_RESOLVER]: SourceCredentialResolverPort;
};

export const monitoringPersistenceModeProvider: Provider<MonitoringPersistenceMode> = {
  provide: MONITORING_PERSISTENCE_MODE,
  useFactory: () => resolveMonitoringPersistenceMode(process.env),
};

export const monitoringScanQueueModeProvider: Provider<MonitoringScanQueueMode> = {
  provide: MONITORING_SCAN_QUEUE_MODE,
  useFactory: () => resolveMonitoringScanQueueMode(process.env),
};

export const resolveMonitoringPersistenceMode = (env: NodeJS.ProcessEnv): MonitoringPersistenceMode => {
  const value = env.MONITORING_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'MONITORING_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    return 'in-memory';
  }

  if (value === 'prisma') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'MONITORING_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('MONITORING_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('MONITORING_PERSISTENCE must be "in-memory" or "prisma"');
};

export const resolveMonitoringScanQueueMode = (env: NodeJS.ProcessEnv): MonitoringScanQueueMode => {
  const value = env.MONITORING_SCAN_QUEUE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'MONITORING_SCAN_QUEUE',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    return 'in-memory';
  }

  if (value === 'rabbitmq') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'MONITORING_SCAN_QUEUE',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    if ((env.RABBITMQ_URL ?? '').trim().length === 0) {
      throw new Error('MONITORING_SCAN_QUEUE=rabbitmq requires RABBITMQ_URL');
    }

    return 'rabbitmq';
  }

  throw new Error('MONITORING_SCAN_QUEUE must be "in-memory" or "rabbitmq"');
};

export const resolveManualScanRequestQuotaPerHour = (env: NodeJS.ProcessEnv): number =>
  parsePositiveInteger(env.MANUAL_SCAN_REQUEST_QUOTA_PER_HOUR, 60);

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
};
