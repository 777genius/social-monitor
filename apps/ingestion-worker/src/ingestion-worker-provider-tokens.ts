import type {
  FeedProjectionPort,
  ScanAttemptRepositoryPort,
  ScanCursorRepositoryPort,
  ScanExecutionReporterPort,
  ScanFailureQueuePort,
  ScanRetryQueuePort,
  ScanLeasePort,
  SourceItemRepositoryPort,
} from '@social-monitor/ingestion/ports';

export type IngestionScanReporterMode = 'noop' | 'monitoring';
export type IngestionScanSchedulerLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
  readonly tenantId?: string;
  readonly workspaceId?: string;
};
export type IngestionScanQueueDrainLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
};
export type IngestionWorkerPersistenceMode = 'in-memory' | 'prisma';

export const INGESTION_WORKER_PERSISTENCE_MODE = Symbol('INGESTION_WORKER_PERSISTENCE_MODE');
export const INGESTION_WORKER_PRISMA_CLIENT = Symbol('INGESTION_WORKER_PRISMA_CLIENT');
export const INGESTION_SCAN_REPORTER_MODE = Symbol('INGESTION_SCAN_REPORTER_MODE');
export const INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS = Symbol('INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS');
export const INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS = Symbol('INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS');
export const INGESTION_SCAN_EXECUTION_REPORTER = Symbol('INGESTION_SCAN_EXECUTION_REPORTER');
export const INGESTION_SOURCE_ITEM_REPOSITORY = Symbol('INGESTION_SOURCE_ITEM_REPOSITORY');
export const INGESTION_SCAN_ATTEMPT_REPOSITORY = Symbol('INGESTION_SCAN_ATTEMPT_REPOSITORY');
export const INGESTION_SCAN_CURSOR_REPOSITORY = Symbol('INGESTION_SCAN_CURSOR_REPOSITORY');
export const INGESTION_FEED_PROJECTION = Symbol('INGESTION_FEED_PROJECTION');
export const INGESTION_SCAN_FAILURE_QUEUE = Symbol('INGESTION_SCAN_FAILURE_QUEUE');
export const INGESTION_SCAN_LEASE = Symbol('INGESTION_SCAN_LEASE');

export type IngestionWorkerProviderTokenMap = {
  readonly [INGESTION_WORKER_PERSISTENCE_MODE]: IngestionWorkerPersistenceMode;
  readonly [INGESTION_WORKER_PRISMA_CLIENT]: unknown;
  readonly [INGESTION_SCAN_REPORTER_MODE]: IngestionScanReporterMode;
  readonly [INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS]: IngestionScanSchedulerLoopOptions;
  readonly [INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS]: IngestionScanQueueDrainLoopOptions;
  readonly [INGESTION_SCAN_EXECUTION_REPORTER]: ScanExecutionReporterPort;
  readonly [INGESTION_SOURCE_ITEM_REPOSITORY]: SourceItemRepositoryPort;
  readonly [INGESTION_SCAN_ATTEMPT_REPOSITORY]: ScanAttemptRepositoryPort;
  readonly [INGESTION_SCAN_CURSOR_REPOSITORY]: ScanCursorRepositoryPort;
  readonly [INGESTION_FEED_PROJECTION]: FeedProjectionPort;
  readonly [INGESTION_SCAN_FAILURE_QUEUE]: ScanFailureQueuePort & ScanRetryQueuePort;
  readonly [INGESTION_SCAN_LEASE]: ScanLeasePort;
};

export const resolveIngestionWorkerPersistenceMode = (
  env: NodeJS.ProcessEnv,
): IngestionWorkerPersistenceMode => {
  const value = env.INGESTION_WORKER_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    return 'in-memory';
  }

  if (value === 'prisma') {
    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('INGESTION_WORKER_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('INGESTION_WORKER_PERSISTENCE must be "in-memory" or "prisma"');
};

export const resolveIngestionScanReporterMode = (env: NodeJS.ProcessEnv): IngestionScanReporterMode => {
  const value = env.INGESTION_SCAN_REPORTER ?? 'noop';

  if (value === 'noop') {
    return 'noop';
  }

  if (value === 'monitoring') {
    if (env.MONITORING_PERSISTENCE !== 'prisma') {
      throw new Error('INGESTION_SCAN_REPORTER=monitoring requires MONITORING_PERSISTENCE=prisma');
    }

    return 'monitoring';
  }

  throw new Error('INGESTION_SCAN_REPORTER must be "noop" or "monitoring"');
};

export const resolveIngestionScanSchedulerLoopOptions = (
  env: NodeJS.ProcessEnv,
): IngestionScanSchedulerLoopOptions => {
  const loopMode = env.INGESTION_SCAN_SCHEDULER_LOOP ?? (env.NODE_ENV === 'test' ? 'disabled' : 'enabled');

  if (loopMode !== 'enabled' && loopMode !== 'disabled') {
    throw new Error('INGESTION_SCAN_SCHEDULER_LOOP must be "enabled" or "disabled"');
  }

  const tenant = emptyToUndefined(env.INGESTION_SCAN_SCHEDULER_TENANT_ID);
  const workspace = emptyToUndefined(env.INGESTION_SCAN_SCHEDULER_WORKSPACE_ID);

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error('INGESTION_SCAN_SCHEDULER_TENANT_ID and INGESTION_SCAN_SCHEDULER_WORKSPACE_ID must be set together');
  }

  return {
    enabled: loopMode === 'enabled',
    intervalMs: parseBoundedInteger(env.INGESTION_SCAN_SCHEDULER_INTERVAL_MS, 60_000, 1_000, 3_600_000),
    limit: parseBoundedInteger(env.INGESTION_SCAN_SCHEDULER_LIMIT, 50, 1, 100),
    runOnStart: parseBoolean(env.INGESTION_SCAN_SCHEDULER_RUN_ON_START, true),
    tenantId: tenant,
    workspaceId: workspace,
  };
};

export const resolveIngestionScanQueueDrainLoopOptions = (
  env: NodeJS.ProcessEnv,
): IngestionScanQueueDrainLoopOptions => {
  const loopMode = env.INGESTION_SCAN_QUEUE_DRAIN_LOOP ?? (env.NODE_ENV === 'test' ? 'disabled' : 'enabled');

  if (loopMode !== 'enabled' && loopMode !== 'disabled') {
    throw new Error('INGESTION_SCAN_QUEUE_DRAIN_LOOP must be "enabled" or "disabled"');
  }

  return {
    enabled: loopMode === 'enabled',
    intervalMs: parseBoundedInteger(env.INGESTION_SCAN_QUEUE_DRAIN_INTERVAL_MS, 5_000, 500, 3_600_000),
    limit: parseBoundedInteger(env.INGESTION_SCAN_QUEUE_DRAIN_LIMIT, 20, 1, 100),
    runOnStart: parseBoolean(env.INGESTION_SCAN_QUEUE_DRAIN_RUN_ON_START, true),
  };
};

const emptyToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error('Boolean environment values must be "true" or "false"');
};

const parseBoundedInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected integer environment value between ${min} and ${max}`);
  }

  return parsed;
};
