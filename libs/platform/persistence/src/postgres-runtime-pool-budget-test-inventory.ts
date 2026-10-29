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

// Exact source sites, including repeated constructors in controlled lifecycle specs.
export const POSTGRES_DIRECT_CONSTRUCTION_INVENTORY = `
      libs/ingestion/adapters/persistence/prisma/article-capture-postgres.spec-support.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool-commit-ack.spec-support.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts:PrismaPg
      libs/platform/persistence/src/postgres-runtime-pool.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool.ts:PrismaPg
      prisma/seed.ts:Pool
      prisma/seed.ts:PrismaClient
      prisma/seed.ts:PrismaPg
      scripts/backfill-github-trending-feed.ts:Pool
      scripts/backfill-reader-summary-weekly-daily-certifications.ts:Pool
      scripts/backfill/rss-current-postgres-boundary-20261007/setup.ts:Pool
      scripts/backfill/rss-current-postgres-boundary-20261007/setup.ts:PrismaClient
      scripts/backfill/rss-current-postgres-boundary-20261007/setup.ts:PrismaPg
      scripts/build-reader-summary-recovery-terminal-manifest.ts:Pool
      scripts/capture-durable-backend-e2e-loop.ts:Pool
      scripts/capture-reader-summary-multi-day-quality-corpus.ts:Pool
      scripts/capture-reader-summary-multi-day-quality-target-manifest.ts:Pool
      scripts/capture-reader-summary-promotion-v2-canary-receipt.ts:Pool
      scripts/check-feed-promotion-index-recovery-postgres.ts:Pool
      scripts/check-feed-promotion-index-recovery.ts:Pool
      scripts/check-feed-promotion-keyset-plan-postgres.ts:Pool
      scripts/check-feed-promotion-keyset-plan-postgres.ts:Pool
      scripts/check-feed-promotion-keyset-plan-postgres.ts:PrismaPg
      scripts/check-github-repo-radar-prisma-live-e2e.ts:Pool
      scripts/check-hn-rss-recovery-local-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts:Pool
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts:Pool
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts:Pool
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts:Pool
      scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts:Pool
      scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts:Pool
      scripts/check-reader-summary-multi-day-quality.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts:Pool
      scripts/check-reader-summary-production-regeneration-smoke.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-publication-postgres.ts:Pool
      scripts/check-reader-summary-recovery-candidate-staging-postgres.ts:Pool
      scripts/check-reader-summary-recovery-candidate-staging-postgres.ts:Pool
      scripts/check-reader-summary-source-quality-trace.ts:Pool
      scripts/check-reader-summary-top-read-ranking.ts:Pool
      scripts/check-reader-summary-topic-map-real-data.ts:Pool
      scripts/check-reader-summary-weekly-daily-certifications-postgres.ts:Pool
      scripts/check-reader-summary-weekly-execution-receipt-postgres.ts:Pool
      scripts/check-reader-summary-weekly-production-postgres.ts:Pool
      scripts/check-source-query-planner-real-binding-canary.ts:Pool
      scripts/check-summary-feedback-calibration-report.ts:Pool
      scripts/check-summary-memory-product-loop.ts:Pool
      scripts/check-summary-topic-recommendation-rest-prisma-live.ts:Pool
      scripts/check-tenant-rls-postgres.ts:Pool
      scripts/check-tenant-rls-postgres.ts:Pool
      scripts/check-tenant-rls-postgres.ts:Pool
      scripts/check-tenant-rls-postgres.ts:Pool
      scripts/check-yesterday-reader-summary-artifact-quality.ts:Pool
      scripts/check-yesterday-social-collection-quality.ts:Pool
      scripts/import-hn-verified-remainder.ts:Pool
      scripts/import-rss-sep24-verified.postgres.spec.ts:Pool
      scripts/import-rss-sep24-verified.postgres.spec.ts:Pool
      scripts/import-rss-sep24-verified.ts:Pool
      scripts/lib/github-trending-durable-snapshot-reuse-postgres-fixture.ts:Pool
      scripts/lib/github-trending-durable-snapshot-reuse-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-delivery-c1.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-delivery-c1.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-scan-terminal-repair-cli.ts:Pool
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-summary-daily-terminal-runtime-connection.ts:Pool
      scripts/lib/reader-summary-first-publication-pg18-crash.spec-support.ts:Pool
      scripts/lib/reader-summary-first-publication-pg18.spec-support.ts:Pool
      scripts/lib/reader-summary-production-day-scope.ts:Pool
      scripts/lib/reader-summary-promotion-v2-historical-postgres.ts:Pool
      scripts/lib/reader-summary-quality-dashboard-report-builder.ts:Pool
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-successor-fixture-migrations.ts:Pool
      scripts/lib/reader-value-postgres-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-value-postgres-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-value-postgres-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-value-postgres-fixture.ts:Pool
      scripts/lib/reader-value-postgres-fixture.ts:Pool
      scripts/lib/reader-value-postgres-fixture.ts:Pool
      scripts/lib/social-source-private-input-database.ts:Pool
      scripts/lib/yesterday-social-replay-support.ts:Pool
      scripts/prepare-reader-summary-successor-fixture.ts:Pool
      scripts/prepare-reader-summary-successor-fixture.ts:Pool
      scripts/quickstart/migrate.ts:Pool
      scripts/quickstart/migrate.ts:Pool
      scripts/quickstart/seed-workspace.ts:Pool
      scripts/quickstart/seed-workspace.ts:PrismaClient
      scripts/quickstart/seed-workspace.ts:PrismaPg
      scripts/read-reader-summary-daily-terminal-set-receipt.ts:Pool
      scripts/reader-summary-publication-postgres-legacy.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/run-hn-rss-recovery.ts:Pool
      scripts/run-reader-promotion-v2-production-canary.ts:Pool
      scripts/run-reader-summary-clean-real-day-collection.ts:Pool
      scripts/run-reader-summary-promotion-v2-rollback.ts:Pool
      scripts/run-reader-summary-weekly-production.ts:Pool
      scripts/run-reader-summary-weekly-review-producer.ts:Pool
      test/feed-reader-summary-coverage-pool.integration.spec.ts:Pool
      test/feed-reader-summary-coverage-pool.integration.spec.ts:PrismaPg
`;
