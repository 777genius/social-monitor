import type { Provider } from '@nestjs/common';

import type { ScanFailureInspectionPort } from '../../ports';

export type IngestionSupportPersistenceMode = 'in-memory' | 'prisma';

export const INGESTION_SUPPORT_PERSISTENCE_MODE = Symbol('INGESTION_SUPPORT_PERSISTENCE_MODE');
export const INGESTION_SUPPORT_PRISMA_CLIENT = Symbol('INGESTION_SUPPORT_PRISMA_CLIENT');
export const INGESTION_SCAN_FAILURE_INSPECTION = Symbol('INGESTION_SCAN_FAILURE_INSPECTION');

export type IngestionSupportProviderTokenMap = {
  readonly [INGESTION_SUPPORT_PERSISTENCE_MODE]: IngestionSupportPersistenceMode;
  readonly [INGESTION_SUPPORT_PRISMA_CLIENT]: unknown;
  readonly [INGESTION_SCAN_FAILURE_INSPECTION]: ScanFailureInspectionPort;
};

export const ingestionSupportPersistenceModeProvider: Provider<IngestionSupportPersistenceMode> = {
  provide: INGESTION_SUPPORT_PERSISTENCE_MODE,
  useFactory: () => resolveIngestionSupportPersistenceMode(process.env),
};

export const resolveIngestionSupportPersistenceMode = (
  env: NodeJS.ProcessEnv,
): IngestionSupportPersistenceMode => {
  const value = env.INGESTION_SUPPORT_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    return 'in-memory';
  }

  if (value === 'prisma') {
    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('INGESTION_SUPPORT_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('INGESTION_SUPPORT_PERSISTENCE must be "in-memory" or "prisma"');
};
