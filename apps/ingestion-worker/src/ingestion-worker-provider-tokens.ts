import type {
  FeedProjectionPort,
  ScanCursorRepositoryPort,
  ScanExecutionReporterPort,
  SourceItemRepositoryPort,
} from '@social-monitor/ingestion/ports';

export type IngestionScanReporterMode = 'noop' | 'monitoring';
export type IngestionWorkerPersistenceMode = 'in-memory' | 'prisma';

export const INGESTION_WORKER_PERSISTENCE_MODE = Symbol('INGESTION_WORKER_PERSISTENCE_MODE');
export const INGESTION_WORKER_PRISMA_CLIENT = Symbol('INGESTION_WORKER_PRISMA_CLIENT');
export const INGESTION_SCAN_REPORTER_MODE = Symbol('INGESTION_SCAN_REPORTER_MODE');
export const INGESTION_SCAN_EXECUTION_REPORTER = Symbol('INGESTION_SCAN_EXECUTION_REPORTER');
export const INGESTION_SOURCE_ITEM_REPOSITORY = Symbol('INGESTION_SOURCE_ITEM_REPOSITORY');
export const INGESTION_SCAN_CURSOR_REPOSITORY = Symbol('INGESTION_SCAN_CURSOR_REPOSITORY');
export const INGESTION_FEED_PROJECTION = Symbol('INGESTION_FEED_PROJECTION');

export type IngestionWorkerProviderTokenMap = {
  readonly [INGESTION_WORKER_PERSISTENCE_MODE]: IngestionWorkerPersistenceMode;
  readonly [INGESTION_WORKER_PRISMA_CLIENT]: unknown;
  readonly [INGESTION_SCAN_REPORTER_MODE]: IngestionScanReporterMode;
  readonly [INGESTION_SCAN_EXECUTION_REPORTER]: ScanExecutionReporterPort;
  readonly [INGESTION_SOURCE_ITEM_REPOSITORY]: SourceItemRepositoryPort;
  readonly [INGESTION_SCAN_CURSOR_REPOSITORY]: ScanCursorRepositoryPort;
  readonly [INGESTION_FEED_PROJECTION]: FeedProjectionPort;
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
