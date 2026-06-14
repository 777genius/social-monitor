import type { Provider } from '@nestjs/common';

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

export type MonitoringPersistenceMode = 'in-memory' | 'prisma';

export const MONITORING_PERSISTENCE_MODE = Symbol('MONITORING_PERSISTENCE_MODE');
export const MONITORING_PRISMA_CLIENT = Symbol('MONITORING_PRISMA_CLIENT');
export const MONITORING_TOPIC_REPOSITORY = Symbol('MONITORING_TOPIC_REPOSITORY');
export const MONITORING_SOURCE_BINDING_REPOSITORY = Symbol('MONITORING_SOURCE_BINDING_REPOSITORY');
export const MONITORING_SCAN_POLICY_REPOSITORY = Symbol('MONITORING_SCAN_POLICY_REPOSITORY');
export const MONITORING_SCAN_JOB_REPOSITORY = Symbol('MONITORING_SCAN_JOB_REPOSITORY');
export const MONITORING_SCAN_QUEUE = Symbol('MONITORING_SCAN_QUEUE');
export const MONITORING_OUTBOX = Symbol('MONITORING_OUTBOX');
export const MONITORING_IDEMPOTENCY = Symbol('MONITORING_IDEMPOTENCY');
export const MONITORING_SOURCE_CATALOG = Symbol('MONITORING_SOURCE_CATALOG');
export const MONITORING_CONFIG_PROTECTOR = Symbol('MONITORING_CONFIG_PROTECTOR');

export type MonitoringProviderTokenMap = {
  readonly [MONITORING_PERSISTENCE_MODE]: MonitoringPersistenceMode;
  readonly [MONITORING_PRISMA_CLIENT]: unknown;
  readonly [MONITORING_TOPIC_REPOSITORY]: TopicRepositoryPort;
  readonly [MONITORING_SOURCE_BINDING_REPOSITORY]: SourceBindingRepositoryPort;
  readonly [MONITORING_SCAN_POLICY_REPOSITORY]: ScanPolicyRepositoryPort;
  readonly [MONITORING_SCAN_JOB_REPOSITORY]: ScanJobRepositoryPort;
  readonly [MONITORING_SCAN_QUEUE]: ScanQueuePort;
  readonly [MONITORING_OUTBOX]: OutboxPort;
  readonly [MONITORING_IDEMPOTENCY]: IdempotencyPort;
  readonly [MONITORING_SOURCE_CATALOG]: SourceCatalogPort;
  readonly [MONITORING_CONFIG_PROTECTOR]: SourceBindingConfigProtectorPort;
};

export const monitoringPersistenceModeProvider: Provider<MonitoringPersistenceMode> = {
  provide: MONITORING_PERSISTENCE_MODE,
  useFactory: () => resolveMonitoringPersistenceMode(process.env),
};

export const resolveMonitoringPersistenceMode = (env: NodeJS.ProcessEnv): MonitoringPersistenceMode => {
  const value = env.MONITORING_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    return 'in-memory';
  }

  if (value === 'prisma') {
    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('MONITORING_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('MONITORING_PERSISTENCE must be "in-memory" or "prisma"');
};
