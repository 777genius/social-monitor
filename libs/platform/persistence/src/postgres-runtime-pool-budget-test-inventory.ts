export const BOUNDED_POSTGRES_TEST_ONLY_FILES = new Set([
  'libs/ingestion/adapters/persistence/prisma/article-capture-postgres.spec-support.ts',
  'libs/platform/persistence/src/postgres-runtime-pool-budget-test-inventory.ts',
  'libs/platform/persistence/src/postgres-runtime-pool-commit-ack.spec-support.ts',
  // Existing native fixture debt: exact paths, never a spec-support wildcard.
  'scripts/lib/reader-summary-first-publication-pg18-crash.spec-support.ts',
  'scripts/lib/reader-summary-first-publication-pg18.spec-support.ts',
  'scripts/lib/reader-summary-v3-migration-integration.spec.ts',
  'scripts/lib/reader-value-postgres-fixture.ts',
  'scripts/check-reader-summary-daily-execution-cursor-postgres.ts',
  'scripts/check-reader-summary-daily-delivery-c1-postgres.ts',
  'scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts',
  'scripts/check-reader-summary-daily-terminal-authority-postgres.ts',
  'scripts/check-reader-summary-original-cutoff-prisma-catalog.ts',
  'scripts/check-reader-summary-production-recovery-postgres.ts',
  'scripts/check-reader-summary-publication-postgres.ts',
  'scripts/check-reader-summary-weekly-execution-receipt-postgres.ts',
  'scripts/check-tenant-rls-postgres.ts',
  'scripts/import-rss-sep24-verified.postgres.spec.ts',
  'scripts/reader-summary-publication-postgres-legacy.ts',
  'scripts/reader-summary-publication-postgres-privileges.ts',
  'scripts/reader-summary-publication-postgres-runtime-guard.ts',
]);

export const BOUNDED_POSTGRES_TEST_POOL_MAXIMUMS = new Map<
  string,
  readonly number[]
>([
  [
    'libs/ingestion/adapters/persistence/prisma/article-capture-postgres.spec-support.ts',
    [4],
  ],
  ['scripts/lib/reader-value-postgres-fixture.ts', [1, 2, 2]],
  ['scripts/lib/reader-summary-first-publication-pg18-crash.spec-support.ts', [1]],
  ['scripts/lib/reader-summary-first-publication-pg18.spec-support.ts', [4]],
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
  ['scripts/import-rss-sep24-verified.postgres.spec.ts', [2, 2]],
  ['scripts/reader-summary-publication-postgres-legacy.ts', [1]],
  [
    'scripts/reader-summary-publication-postgres-privileges.ts',
    [1, 1, 1, 1, 1, 1, 1],
  ],
  ['scripts/reader-summary-publication-postgres-runtime-guard.ts', []],
  ['scripts/check-reader-summary-weekly-execution-receipt-postgres.ts', [2]],
]);
