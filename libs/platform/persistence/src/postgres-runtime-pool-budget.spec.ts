import {
  POSTGRES_RUNTIME_CONNECTION_FACTORIES,
  POSTGRES_RUNTIME_POOL_MINIMUM,
  POSTGRES_RUNTIME_POOL_LIMITS,
  PRODUCTION_POSTGRES_RUNTIME_INVENTORY,
} from './postgres-runtime-pool-budget';
import {
  PUBLICATION_POSTGRES_TEST_ONLY_FILES,
  PUBLICATION_POSTGRES_TEST_POOL_MAXIMUMS,
} from './postgres-runtime-pool-budget-test-inventory';
import {
  directDatabaseConstructions,
  directPoolOptions,
  expectedSourceList,
  readComposeService,
  readSource,
  runtimeSourceFiles,
} from './postgres-runtime-pool-budget-test-source';

describe('production PostgreSQL construction and entrypoint inventory', () => {
  const publicationPostgresTestOnlyFiles =
    PUBLICATION_POSTGRES_TEST_ONLY_FILES;
  const sourceFiles = [...runtimeSourceFiles('apps'), ...runtimeSourceFiles('libs')];
  const completeDatabaseSourceFiles = [
    'test/feed-reader-summary-coverage-pool.integration.spec.ts',
    ...sourceFiles,
    ...runtimeSourceFiles('scripts'),
    ...runtimeSourceFiles('prisma').filter(
      (path) => !path.startsWith('prisma/generated/'),
    ),
  ];
  const productionSourceFiles = sourceFiles.filter(
    (path) => !path.endsWith('.spec.ts') && !path.endsWith('.test.ts'),
  );

  it('fails when a new Prisma runtime connection factory is not budgeted', () => {
    const discoveredFactories = productionSourceFiles
      .filter((path) =>
        readSource(path).includes('createPrismaPgRuntimeConnection('),
      )
      .filter(
        (path) => path !== 'libs/platform/persistence/src/postgres-runtime-pool.ts',
      )
      .sort();

    expect(discoveredFactories).toEqual(
      Object.values(POSTGRES_RUNTIME_CONNECTION_FACTORIES).sort(),
    );
  });

  it('inventories every direct pg Pool, PrismaPg, and PrismaClient construction', () => {
    const rawConstructions = completeDatabaseSourceFiles
      .flatMap((path) =>
        directDatabaseConstructions(readSource(path)).map(
          (constructor) => `${path}:${constructor}`,
        ),
      )
      .sort();

    // Cursor cleanup regression uses installed Pool lifecycle with a controlled wire client and an unused pool.
    expect(rawConstructions).toEqual(expectedSourceList(`
      libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts:PrismaPg
      libs/platform/persistence/src/postgres-runtime-pool.ts:Pool
      libs/platform/persistence/src/postgres-runtime-pool.ts:PrismaPg
      prisma/seed.ts:Pool
      prisma/seed.ts:PrismaClient
      prisma/seed.ts:PrismaPg
      scripts/backfill-github-trending-feed.ts:Pool
      scripts/backfill-reader-summary-weekly-daily-certifications.ts:Pool
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
      scripts/lib/github-trending-durable-snapshot-reuse-postgres-fixture.ts:Pool
      scripts/lib/github-trending-durable-snapshot-reuse-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-delivery-c1.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-delivery-c1.ts:Pool
      scripts/lib/reader-summary-daily-canonical-recovery-v4-scan-terminal-repair-cli.ts:Pool
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.spec.ts:Pool
      scripts/lib/reader-summary-daily-terminal-runtime-connection.ts:Pool
      scripts/lib/reader-summary-production-day-scope.ts:Pool
      scripts/lib/reader-summary-promotion-v2-historical-postgres.ts:Pool
      scripts/lib/reader-summary-quality-dashboard-report-builder.ts:Pool
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-successor-fixture-migrations.ts:Pool
      scripts/lib/yesterday-social-replay-support.ts:Pool
      scripts/prepare-reader-summary-successor-fixture.ts:Pool
      scripts/prepare-reader-summary-successor-fixture.ts:Pool
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
    `));
  });
  it('keeps the historical refresh race writer reachable only from its native test gate', () => {
    const helper = 'scripts/lib/reader-summary-new-input-refresh-native-concurrency.ts';
    const consumers = completeDatabaseSourceFiles.filter((path) =>
      path !== helper && !path.endsWith('.spec.ts') &&
      readSource(path).includes('reader-summary-new-input-refresh-native-concurrency'),
    );
    expect(consumers).toEqual(['scripts/check-reader-summary-new-input-refresh-postgres.ts']);
  });
  it('fails on every future raw database-client dependency bypass', () => {
    const rawDependencyFiles = completeDatabaseSourceFiles
      .filter((path) => {
        const source = readSource(path);
        return (
          /from\s+['"]pg['"]|require\s*\(\s*['"]pg['"]\s*\)|import\s*\(\s*['"]pg['"]\s*\)/.test(
            source,
          ) ||
          /from\s+['"]@prisma\/adapter-pg['"]|require\s*\(\s*['"]@prisma\/adapter-pg['"]\s*\)|import\s*\(\s*['"]@prisma\/adapter-pg['"]\s*\)/.test(
            source,
          ) ||
          /from\s+['"][^'"]*generated\/client\/client['"]/.test(source)
        );
      })
      .sort();

    // The large-daily and linear-UTF16 synthetic PostgreSQL contracts receive
    // existing clients and import only the PoolClient type. Inventory their
    // exact paths even though they construct no runtime pools.
    // The replay dispatch spec imports pg only to assert its throwing mock stays unused.
    // Cursor cleanup helper imports only the Pool type; its spec exercises the installed Pool lifecycle.
    // The socket regression spec imports only the Pool type for its mocked client.
    expect(rawDependencyFiles).toEqual(expectedSourceList(`
      libs/platform/persistence/src/postgres-runtime-pool-cleanup.ts
      libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts
      libs/platform/persistence/src/postgres-runtime-pool.spec.ts
      libs/platform/persistence/src/postgres-runtime-pool.ts
      prisma/seed.ts
      scripts/backfill-github-trending-feed.ts
      scripts/backfill-reader-summary-weekly-daily-certifications.ts
      scripts/build-reader-summary-recovery-terminal-manifest.ts
      scripts/capture-durable-backend-e2e-loop.ts
      scripts/capture-reader-summary-multi-day-quality-corpus.ts
      scripts/capture-reader-summary-multi-day-quality-target-manifest.ts
      scripts/capture-reader-summary-promotion-v2-canary-receipt.ts
      scripts/check-feed-promotion-index-recovery-postgres.ts
      scripts/check-feed-promotion-index-recovery.ts
      scripts/check-feed-promotion-keyset-plan-postgres.ts
      scripts/check-github-repo-radar-prisma-live-e2e.ts
      scripts/check-hn-rss-recovery-local-postgres.ts
      scripts/check-reader-summary-daily-delivery-c1-postgres.ts
      scripts/check-reader-summary-daily-execution-cursor-postgres.ts
      scripts/check-reader-summary-daily-scan-terminal-repair-c1-postgres.ts
      scripts/check-reader-summary-multi-day-quality.ts
      scripts/check-reader-summary-original-cutoff-prisma-catalog.ts
      scripts/check-reader-summary-production-regeneration-smoke.ts
      scripts/check-reader-summary-publication-postgres.ts
      scripts/check-reader-summary-ready-delivery-postgres.ts
      scripts/check-reader-summary-ready-recovery-postgres.ts
      scripts/check-reader-summary-recovery-candidate-staging-postgres.ts
      scripts/check-reader-summary-source-quality-trace.ts
      scripts/check-reader-summary-top-read-ranking.ts
      scripts/check-reader-summary-topic-map-real-data.ts
      scripts/check-reader-summary-weekly-daily-certifications-postgres.ts
      scripts/check-reader-summary-weekly-execution-receipt-postgres.ts
      scripts/check-reader-summary-weekly-production-postgres.ts
      scripts/check-source-query-planner-real-binding-canary.ts
      scripts/check-summary-feedback-calibration-report.ts
      scripts/check-summary-memory-product-loop.ts
      scripts/check-summary-topic-recommendation-rest-prisma-live.ts
      scripts/check-tenant-rls-postgres.ts
      scripts/check-yesterday-reader-summary-artifact-quality.ts
      scripts/check-yesterday-social-collection-quality.ts
      scripts/lib/github-trending-durable-snapshot-reuse-postgres-fixture.ts
      scripts/lib/github-trending-durable-snapshot-reuse.postgres.spec.ts
      scripts/lib/github-trending-durable-snapshot-reuse.prisma.spec.ts
      scripts/lib/github-trending-durable-snapshot-reuse.ts
      scripts/lib/reader-promotion-v2-production-canary-postgres-store.ts
      scripts/lib/reader-summary-current-publication-bindings.spec.ts
      scripts/lib/reader-summary-current-publication-bindings.ts
      scripts/lib/reader-summary-daily-canonical-recovery-v4-delivery-c1.ts
      scripts/lib/reader-summary-daily-canonical-recovery-v4-scan-terminal-repair-cli.ts
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.spec.ts
      scripts/lib/reader-summary-daily-cursor-fixture-cleanup.ts
      scripts/lib/reader-summary-daily-production-owner-topology-postgres.ts
      scripts/lib/reader-summary-daily-terminal-runtime-connection.spec.ts
      scripts/lib/reader-summary-daily-terminal-runtime-connection.ts
      scripts/lib/reader-summary-large-daily-publication-postgres-contract.ts
      scripts/lib/reader-summary-linear-utf16-postgres-contract.ts
      scripts/lib/reader-summary-new-input-refresh-native-concurrency.ts
      scripts/lib/reader-summary-production-day-scope.spec.ts
      scripts/lib/reader-summary-production-day-scope.ts
      scripts/lib/reader-summary-promotion-v2-historical-postgres.ts
      scripts/lib/reader-summary-promotion-v2-rollback-lifecycle-fixture.spec.ts
      scripts/lib/reader-summary-promotion-v2-rollback-lifecycle-fixture.ts
      scripts/lib/reader-summary-promotion-v2-rollback-postgres-contract.ts
      scripts/lib/reader-summary-publication-postgres-running-fixture.ts
      scripts/lib/reader-summary-quality-dashboard-collection-strategy.ts
      scripts/lib/reader-summary-quality-dashboard-feedback-shadow.ts
      scripts/lib/reader-summary-quality-dashboard-published-window.spec.ts
      scripts/lib/reader-summary-quality-dashboard-published-window.ts
      scripts/lib/reader-summary-quality-dashboard-report-builder.ts
      scripts/lib/reader-summary-quality-eval-support.spec.ts
      scripts/lib/reader-summary-quality-eval-support.ts
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts
      scripts/lib/reader-summary-ready-recovery-postgres-fixture.ts
      scripts/lib/reader-summary-recovery-postgres-contract.ts
      scripts/lib/reader-summary-successor-fixture-migrations.ts
      scripts/lib/reader-summary-successor-fixture-observer.spec.ts
      scripts/lib/reader-summary-successor-fixture-observer.ts
      scripts/lib/reader-summary-successor-fixture-safety.ts
      scripts/lib/reader-summary-successor-fixture-seed.spec.ts
      scripts/lib/reader-summary-successor-fixture-seed.ts
      scripts/lib/reader-summary-successor-native-scenarios.ts
      scripts/lib/reader-summary-successor-native-support.ts
      scripts/lib/reader-summary-successor-publication-github.spec.ts
      scripts/lib/reader-summary-successor-publication-github.ts
      scripts/lib/reader-summary-weekly-atomic-publication-postgres-contract.ts
      scripts/lib/reader-summary-weekly-certification-seal-postgres-contract.ts
      scripts/lib/reader-summary-weekly-daily-certification-backfill-postgres-contract.ts
      scripts/lib/reader-summary-weekly-projection-postgres-contract.ts
      scripts/lib/reader-summary-weekly-publication-evidence-postgres-contract.ts
      scripts/lib/reader-summary-weekly-publication-github-fixture.ts
      scripts/lib/reader-summary-weekly-review-manifest-postgres-contract.ts
      scripts/lib/yesterday-reader-summary-artifact-quality-store.spec.ts
      scripts/lib/yesterday-reader-summary-artifact-quality-store.ts
      scripts/lib/yesterday-replay-dispatch.spec.ts
      scripts/lib/yesterday-social-collection-quality-summary-counts.ts
      scripts/lib/yesterday-social-replay-support.ts
      scripts/prepare-reader-summary-successor-fixture.ts
      scripts/read-reader-summary-daily-terminal-set-receipt.spec.ts
      scripts/read-reader-summary-daily-terminal-set-receipt.ts
      scripts/reader-summary-publication-postgres-legacy.ts
      scripts/reader-summary-publication-postgres-privileges.ts
      scripts/reader-summary-publication-postgres-runtime-guard.ts
      scripts/reader-summary-publication-postgres18-regression.spec.ts
      scripts/reader-summary-publication-postgres18-regression.ts
      scripts/run-hn-rss-recovery.ts
      scripts/run-reader-promotion-v2-production-canary.ts
      scripts/run-reader-summary-clean-real-day-collection.ts
      scripts/run-reader-summary-promotion-v2-rollback.ts
      scripts/run-reader-summary-weekly-production.ts
      scripts/run-reader-summary-weekly-review-producer.ts
      test/feed-reader-summary-coverage-pool.integration.spec.ts
    `));
    for (const path of rawDependencyFiles) {
      expect(readSource(path)).not.toMatch(
        /(?:require\s*\(\s*['"](?:pg|@prisma\/adapter-pg)['"]\s*\)|import\s*\(\s*['"](?:pg|@prisma\/adapter-pg)['"]\s*\)|import\s+\*\s+as\s+\w+\s+from\s+['"](?:pg|@prisma\/adapter-pg)['"])/,
      );
    }
  });

  it('requires explicit min=0 and max on every direct pool outside the shared factory', () => {
    const directPoolFiles = completeDatabaseSourceFiles.filter(
      (path) => directPoolOptions(readSource(path)).length > 0,
    );

    for (const path of directPoolFiles) {
      if (publicationPostgresTestOnlyFiles.has(path)) {
        continue;
      }
      const options = directPoolOptions(readSource(path));
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        if (path.endsWith('postgres-runtime-pool-concurrency.spec.ts')) {
          expect(option).toContain('...poolConfig');
        } else {
          expect(option).toMatch(/\bmin:\s*0\b/);
          expect(option).toMatch(/\bmax:\s*[12]\b/);
        }
      }
    }
  });

  it('requires every production composition root to await bounded construction', () => {
    const productionConstructionSites = productionSourceFiles.filter((path) =>
      /Prisma[A-Za-z]+Connection\.create\s*\(/.test(readSource(path)),
    );

    expect(productionConstructionSites).toHaveLength(12);
    for (const path of productionConstructionSites) {
      const source = readSource(path);
      expect(source).toContain('resolvePostgresRuntimePoolConfig(process.env)');
      expect(source).toMatch(/useFactory:\s*async|useFactory:\s*\([^)]*\)\s*=>/s);
    }
  });

  it('keeps every direct script and seed pool at two connections or fewer', () => {
    const scriptSources = [
      ...runtimeSourceFiles('scripts').filter(
        (path) => !publicationPostgresTestOnlyFiles.has(path),
      ),
      'prisma/seed.ts',
    ].map(readSource);
    const scriptPoolOptions = scriptSources.flatMap(directPoolOptions);

    expect(scriptPoolOptions.length).toBeGreaterThan(0);
    for (const options of scriptPoolOptions) {
      expect(options).toMatch(/\bmin:\s*0\b/);
      expect(options).toMatch(/\bmax:\s*[12]\b/);
    }
  });

  it('keeps seed cleanup ordered and guarantees pool end after disconnect failure', () => {
    const seed = readSource('prisma/seed.ts');
    const cleanup = seed.slice(seed.indexOf('async function run()'));

    expect(seed).toContain('min: 0, max: 1');
    expect(seed).toContain('disposeExternalPool: false');
    expect(cleanup.indexOf('await prisma.$disconnect()')).toBeLessThan(
      cleanup.indexOf('await pool.end()'),
    );
    expect(cleanup).toMatch(
      /try \{\s*await prisma\.\$disconnect\(\);[\s\S]*?catch[\s\S]*?try \{\s*await pool\.end\(\);/,
    );
    expect(cleanup).not.toContain('process.exit(1)');
  });

  it('keeps one admitted manual or daily script process within the declared three-connection group', () => {
    for (const path of runtimeSourceFiles('scripts')) {
      if (publicationPostgresTestOnlyFiles.has(path)) {
        continue;
      }
      const source = readSource(path);
      const directMaximum = directPoolOptions(source)
        .map((options) => Number(/\bmax:\s*([12])\b/.exec(options)?.[1] ?? 0))
        .reduce((total, maximum) => total + maximum, 0);
      const sharedRuntimeMaximum = Math.max(
        0,
        ...Array.from(
          source.matchAll(
            /(?:defaultPostgresRuntimePoolConfig|createForProcess)\([\s\S]{0,200}?["'](daily-runner|api-gateway|admin-tool)["']/g,
          ),
          (match) =>
            POSTGRES_RUNTIME_POOL_LIMITS[
              match[1] as keyof typeof POSTGRES_RUNTIME_POOL_LIMITS
            ],
        ),
      );

      expect(directMaximum + sharedRuntimeMaximum).toBeLessThanOrEqual(3);
    }
  });

  it('keeps the PostgreSQL publication harness test-only and explicitly bounded', () => {
    for (const [
      path,
      expectedMaximums,
    ] of PUBLICATION_POSTGRES_TEST_POOL_MAXIMUMS) {
      const maximums = directPoolOptions(readSource(path)).map((options) =>
        Number(/\bmax:\s*([124])\b/.exec(options)?.[1] ?? 0),
      );
      expect(maximums).toEqual(expectedMaximums);
    }

    const productionImporters = completeDatabaseSourceFiles
      .filter((path) => !publicationPostgresTestOnlyFiles.has(path))
      .filter(
        (path) =>
          path !==
          'libs/platform/persistence/src/postgres-runtime-pool-budget.spec.ts',
      )
      .filter((path) =>
        /reader-summary-publication-postgres-(?:legacy|privileges|runtime-guard)/.test(
          readSource(path),
        ),
      );
    // The disposable successor bootstrap reuses protected-role provisioning.
    // Keep this exact importer inventoried without exempting its pool caps.
    // The callback spec isolates mocked privilege helpers without constructing pools.
    expect(productionImporters).toEqual([
      'scripts/check-reader-summary-publication-postgres.spec.ts',
      'scripts/lib/reader-summary-successor-fixture-migrations.ts',
    ]);
    expect(readSource('package.json')).toContain(
      'check:reader-summary-publication-postgres',
    );
  });
  it('keeps the production daily dispatcher sequential and within its budget', () => {
    const dispatcher = readSource(
      'scripts/run-reader-summary-production-day.ts',
    );
    const scopeReader = readSource(
      'scripts/lib/reader-summary-production-day-scope.ts',
    );
    const main = dispatcher.slice(dispatcher.indexOf('async function main()'));
    const scopeIndex = main.indexOf('await readProductionDayScope({');
    expect(dispatcher).toContain('import { spawnSync }');
    expect(dispatcher).not.toMatch(/runNpm\(\s*["']migrate["']/);
    expect(scopeIndex).toBeGreaterThanOrEqual(0);
    expect(scopeReader).toMatch(/new Pool\(\{[\s\S]*?max: 1/);
    expect(scopeReader).toContain('await pool.end()');
    for (const path of [
      'scripts/run-reader-summary-clean-real-day-collection.ts',
      'scripts/capture-durable-reader-summary-from-postgres.ts',
      'scripts/check-reader-summary-source-quality-trace.ts',
    ]) {
      const source = readSource(path);
      const usesDefaultBudget =
        /defaultPostgresRuntimePoolConfig\([\s\S]*?["']daily-runner["']\s*,?\s*\)/.test(
          source,
        );
      const usesValidatedRuntimeBudget =
        /resolvePostgresRuntimePoolConfig\(\{[\s\S]*?POSTGRES_RUNTIME_PROCESS:\s*["']daily-runner["']/.test(
          source,
        );
      expect(usesDefaultBudget || usesValidatedRuntimeBudget).toBe(true);
    }
  });

  it('matches the image dispatcher, base Compose, and production deploy inventory', () => {
    const dockerfile = readSource('Dockerfile');
    const dockerServices = Array.from(
      dockerfile.matchAll(
        /([a-z-]+)\) exec node dist\/apps\/([a-z-]+)\/src\/main\.js/g,
      ),
      (match) => [match[1], match[2]],
    );
    expect(dockerServices).toEqual([
      ['api', 'api-gateway'],
      ['agent-runtime', 'agent-runtime'],
      ['ingestion', 'ingestion-worker'],
      ['intelligence', 'intelligence-worker'],
      ['delivery', 'delivery-service'],
      ['event-relay', 'event-relay'],
    ]);

    const compose = readSource('docker-compose.yml');
    for (const service of [
      'api',
      'ingestion-worker',
      'intelligence-worker',
      'delivery-service',
      'event-relay',
      'agent-runtime',
      'migrate',
    ]) {
      expect(compose).toMatch(new RegExp(`^  ${service}:$`, 'm'));
    }
    for (const runtime of PRODUCTION_POSTGRES_RUNTIME_INVENTORY.filter(
      (candidate) => candidate.lifecycle === 'persistent',
    )) {
      const service = runtime.composeService;
      expect(service).not.toBeNull();
      const serviceSource = readComposeService(compose, service as string);
      expect(serviceSource).toContain(
        `POSTGRES_RUNTIME_PROCESS: ${runtime.processId}`,
      );
      expect(serviceSource).toContain(
        `POSTGRES_RUNTIME_POOL_MIN: "${POSTGRES_RUNTIME_POOL_MINIMUM}"`,
      );
      expect(serviceSource).toContain(
        `POSTGRES_RUNTIME_POOL_MAX: "${runtime.poolMax}"`,
      );
      expect(serviceSource).toMatch(/deploy:\s*\n\s+replicas: 1/);
    }

    expect(compose).not.toContain('POSTGRES_PROVIDER_MAX_CONNECTIONS');
    expect(compose).not.toContain('POSTGRES_PROVIDER_REQUIRED_RESERVE');
    const productionPoolOverlay = readSource(
      'ops/deploy/production-runtime/compose.postgres-runtime.yml',
    );
    const dailyRunner = readComposeService(
      productionPoolOverlay,
      'daily-runner',
    );
    expect(dailyRunner).toContain('POSTGRES_RUNTIME_PROCESS: daily-runner');
    expect(dailyRunner).toContain('POSTGRES_RUNTIME_POOL_MIN: "0"');
    expect(dailyRunner).toContain('POSTGRES_RUNTIME_POOL_MAX: "2"');
    expect(dailyRunner).toMatch(/deploy:\s*\n\s+replicas: 1/);

    const deploy = readSource('ops/deploy/social-monitor-production-deploy.sh');
    const composeScopeChecker = readSource(
      'ops/deploy/production-compose-scope-check.py',
    );
    const serviceAllowlist = composeScopeChecker.match(/expected_services = \{([^}]+)\}/)?.[1];
    for (const externallyComposedService of ['daily-runner', 'x-collector']) {
      expect(serviceAllowlist).toContain(`"${externallyComposedService}"`);
    }
    expect(composeScopeChecker).toContain('if set(services) != expected_services:');
    expect(deploy).toContain(
      'local scope_checker=$REPO/ops/deploy/production-compose-scope-check.py',
    );
    expect(deploy).toContain('python3 "$scope_checker" \\');
    expect(deploy).toContain('"$rendered" "$ROOT" "$REPO" "$CONTROL"');
    expect(deploy).toContain('exec 8>"$POSTGRES_ADMISSION_LOCK"');
    expect(deploy).toContain(
      'acquire_postgres_admission_with_daily_priority 8',
    );
    const deployControl = readSource('ops/deploy/deploy-control-lib.sh');
    expect(deployControl).toContain('probe_daily_singleton_clear');
    expect(deployControl).toContain('flock -n "$admission_fd"');
    expect(deployControl).toContain('flock -u "$admission_fd"');
    expect(deploy).toContain(
      'activate_postgres_runtime_control "$sha" "$compatible_backend_sha"',
    );
    const productionDaily = readSource(
      'ops/deploy/production-runtime/daily-run.sh',
    );
    expect(productionDaily).toContain('control/daily-run-singleton.lock');
    expect(productionDaily).toContain('control/daily-run.lock');
    expect(productionDaily).toContain(
      'POSTGRES_ADMISSION_WAIT_SECONDS=7500',
    );
    const productionDailyUnit = readSource(
      'ops/deploy/production-runtime/social-monitor-daily.service',
    );
    expect(productionDailyUnit).toContain('TimeoutStartSec=19800');
    expect(productionDailyUnit).toContain('Restart=no');
    expect(deploy).toContain(
      'verify_live_postgres_admission "$postgres_env"',
    );
    expect(deploy).toContain('verify-postgres-runtime-topology.py');
    const deployBackend = deploy.slice(deploy.indexOf('deploy_backend()'));
    expect(deployBackend.indexOf('backup_database "$sha"')).toBeLessThan(
      deployBackend.indexOf('deploy_reader_summary_publication_migrations'),
    );
    expect(
      deployBackend.indexOf('deploy_reader_summary_publication_migrations'),
    ).toBeLessThan(
      deployBackend.indexOf('up -d --no-deps --force-recreate'),
    );
    const publicationDeploy = readSource(
      'ops/deploy/reader-summary-publication-deploy-lib.sh',
    );
    expect(
      publicationDeploy.indexOf(
        '"$secret" "$ca_certificate" "$runtime_role" pre',
      ),
    ).toBeLessThan(publicationDeploy.indexOf('npm run migrate:deploy'));
    expect(publicationDeploy.indexOf('npm run migrate:deploy')).toBeLessThan(
      publicationDeploy.indexOf(
        '"$secret" "$ca_certificate" "$runtime_role" post',
      ),
    );
    expect(
      deployBackend.indexOf(
        'stop_and_remove_database_services "${persistent[@]}"',
      ),
    ).toBeLessThan(
      deployBackend.indexOf('up -d --no-deps --force-recreate'),
    );
  });

  it('binds every database entrypoint to its declared process identity', () => {
    for (const runtime of PRODUCTION_POSTGRES_RUNTIME_INVENTORY.filter(
      (candidate) =>
        candidate.lifecycle === 'persistent' ||
        candidate.lifecycle === 'optional',
    )) {
      expect(readSource(runtime.entrypoint)).toContain(
        `bindPostgresRuntimeProcessIdentity(process.env, '${runtime.processId}')`,
      );
    }
  });

  it('keeps worker drain hooks in an earlier Nest phase than database cleanup', () => {
    const workerDrainFiles = [
      'apps/ingestion-worker/src/scan-queue-drain-loop.ts',
      'apps/ingestion-worker/src/scan-scheduler-loop.ts',
      'apps/intelligence-worker/src/summary-job-polling-loop.ts',
      'apps/intelligence-worker/src/reader-summary-job-polling-loop.ts',
      'apps/intelligence-worker/src/summary-job-queue-drain-loop.ts',
      'apps/intelligence-worker/src/reader-summary-job-queue-drain-loop.ts',
      'apps/intelligence-worker/src/auto-summary-scheduler-loop.ts',
      'apps/intelligence-worker/src/periodic-reader-summary-scheduler-loop.ts',
      'apps/intelligence-worker/src/relevance-memory-projection-loop.ts',
      'apps/delivery-service/src/delivery-attempt-dispatch-loop.ts',
      'apps/delivery-service/src/delivery-attempt-queue-drain-loop.ts',
      'apps/delivery-service/src/digest-scheduler-loop.ts',
      'apps/delivery-service/src/summary-ready-event-drain-loop.ts',
      'apps/event-relay/src/outbox-relay-loop.ts',
    ];
    for (const path of workerDrainFiles) {
      expect(readSource(path)).toContain('onModuleDestroy(');
    }
    for (const path of [
      'apps/ingestion-worker/src/scan-queue-drain-loop.ts',
      'apps/intelligence-worker/src/summary-job-queue-drain-loop.ts',
      'apps/intelligence-worker/src/reader-summary-job-queue-drain-loop.ts',
      'apps/delivery-service/src/delivery-attempt-queue-drain-loop.ts',
      'apps/delivery-service/src/summary-ready-event-drain-loop.ts',
    ]) {
      const source = readSource(path);
      expect(source).toContain('delivery.nack({ requeue: true })');
      expect(source).toContain('operation.backpressure');
    }
    for (const path of Object.values(POSTGRES_RUNTIME_CONNECTION_FACTORIES)) {
      const source = readSource(path);
      expect(source).toContain('onApplicationShutdown(');
      expect(source).not.toContain('onModuleDestroy(');
    }
    const workerRuntime = readSource('libs/platform/worker/src/worker-runtime.ts');
    expect(workerRuntime).not.toContain('onModuleDestroy(');
    expect(workerRuntime).toContain('beforeApplicationShutdown(');
    expect(workerRuntime).toMatch(
      /onApplicationShutdown[\s\S]*?return this\.beforeApplicationShutdown\(signal\)/,
    );
  });

  it('handles optional runtime close rejections at signal entrypoints', () => {
    const grpcMain = readSource('apps/social-research-grpc/src/main.ts');
    const mcpMain = readSource('apps/social-research-mcp/src/main.ts');
    expect(grpcMain).toMatch(/runtime\s*\.close\(\)\s*\.catch\(/s);
    expect(mcpMain).toMatch(/runtime\.close\(\)\.catch\(/s);
  });
});
