import type { ScanExecutionReporterPort } from '@social-monitor/ingestion/ports';

export type IngestionScanReporterMode = 'noop' | 'monitoring';

export const INGESTION_SCAN_REPORTER_MODE = Symbol('INGESTION_SCAN_REPORTER_MODE');
export const INGESTION_SCAN_EXECUTION_REPORTER = Symbol('INGESTION_SCAN_EXECUTION_REPORTER');

export type IngestionWorkerProviderTokenMap = {
  readonly [INGESTION_SCAN_REPORTER_MODE]: IngestionScanReporterMode;
  readonly [INGESTION_SCAN_EXECUTION_REPORTER]: ScanExecutionReporterPort;
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
