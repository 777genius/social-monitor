export const PUBLICATION_POSTGRES_TEST_ONLY_FILES = new Set([
  'libs/platform/persistence/src/postgres-runtime-pool-budget-test-inventory.ts',
  'scripts/check-reader-summary-daily-execution-cursor-postgres.ts',
  'scripts/check-reader-summary-daily-delivery-c1-postgres.ts',
  'scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts',
  'scripts/check-reader-summary-daily-terminal-authority-postgres.ts',
  'scripts/check-reader-summary-original-cutoff-prisma-catalog.ts',
  'scripts/check-reader-summary-production-recovery-postgres.ts',
  'scripts/check-reader-summary-publication-postgres.ts',
  'scripts/check-reader-summary-weekly-execution-receipt-postgres.ts',
  'scripts/check-tenant-rls-postgres.ts',
  'scripts/reader-summary-publication-postgres-legacy.ts',
  'scripts/reader-summary-publication-postgres-privileges.ts',
  'scripts/reader-summary-publication-postgres-runtime-guard.ts',
]);

export const PUBLICATION_POSTGRES_TEST_POOL_MAXIMUMS = new Map<
  string,
  readonly number[]
>([
  [
    'scripts/check-reader-summary-daily-execution-cursor-postgres.ts',
    [1, 1, 1, 1],
  ],
  ['scripts/check-reader-summary-daily-delivery-c1-postgres.ts', [1, 1, 1, 1, 1]],
  ['scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts', [1, 1, 1]],
  [
    'scripts/check-reader-summary-original-cutoff-prisma-catalog.ts',
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  ['scripts/check-reader-summary-production-recovery-postgres.ts', []],
  [
    'scripts/check-reader-summary-publication-postgres.ts',
    [1, 1, 2, 4, 1, 1, 1],
  ],
  ['scripts/check-tenant-rls-postgres.ts', [1, 1, 1, 1]],
  ['scripts/reader-summary-publication-postgres-legacy.ts', [1]],
  [
    'scripts/reader-summary-publication-postgres-privileges.ts',
    [1, 1, 1, 1, 1, 1, 1],
  ],
  ['scripts/reader-summary-publication-postgres-runtime-guard.ts', []],
  ['scripts/check-reader-summary-weekly-execution-receipt-postgres.ts', [2]],
]);
