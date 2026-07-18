import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import {
  POSTGRES_BACKUP_CONNECTIONS,
  POSTGRES_CAPACITY_VERIFICATION_CONNECTIONS,
  POSTGRES_DAILY_AUXILIARY_CONNECTIONS,
  POSTGRES_MANUAL_CONNECTIONS,
  POSTGRES_MIGRATION_CONNECTIONS,
  POSTGRES_MINIMUM_PROVIDER_RESERVE,
  POSTGRES_MINIMUM_PROVIDER_RESERVE_RATIO,
  POSTGRES_OPTIONAL_RUNTIME_CONNECTIONS,
  POSTGRES_PRODUCTION_MAXIMUM_ENVELOPE,
  POSTGRES_PRODUCTION_PERSISTENT_BUDGET,
  POSTGRES_REPOSITORY_CONNECTION_CEILING,
  POSTGRES_RUNTIME_CONNECTION_FACTORIES,
  POSTGRES_RUNTIME_POOL_MINIMUM,
  POSTGRES_RUNTIME_POOL_LIMITS,
  PRODUCTION_POSTGRES_RUNTIME_INVENTORY,
  assertDeploymentPostgresBudget,
  type DeploymentPostgresBudgetConfiguration,
} from './postgres-runtime-pool-budget';

describe('deployment PostgreSQL budget', () => {
  it('derives effective capacity and meaningful reserve from live PostgreSQL facts', () => {
    const budget = assertDeploymentPostgresBudget(productionBudgetFixture());

    expect(budget).toEqual({
      serverMaxConnections: 25,
      serverReservedConnections: 3,
      effectiveProviderCapacity: 22,
      externalConnectionOccupancy: 0,
      availableProviderCapacity: 22,
      persistentConnections: 8,
      maximumApplicationConnections: 16,
      requiredProviderReserve: 5,
      providerHeadroom: 6,
      envelopes: [
        envelope('steady-and-manual', 5, 13),
        envelope('daily-and-manual', 8, 16),
        envelope('migration-and-manual', 6, 14),
        envelope('backup-and-manual', 6, 14),
        envelope('capacity-verification-and-manual', 6, 14),
        envelope('replacement-and-manual', 5, 13),
      ],
    });
    expect(
      budget.externalConnectionOccupancy +
        budget.maximumApplicationConnections +
        budget.providerHeadroom,
    ).toBe(budget.effectiveProviderCapacity);
  });

  it('keeps the real restart incident evidence tied to the executable budget', () => {
    const incident = JSON.parse(
      readSource(
        'ops/deploy/evidence/postgres-runtime-incident-2026-07-14.json',
      ),
    ) as {
      readonly database: { readonly managedProviderMaxConnections: number };
      readonly api: {
        readonly observedRestartCount: number;
        readonly tooManyConnectionsSqlState: string;
      };
      readonly workers: {
        readonly ingestionScanDrainFailureCountAtInitialAudit: number;
        readonly latestIngestionScanDrainRetryNumber: number;
        readonly latestIngestionScanDrainErrorClassification: string;
      };
      readonly acceptanceInvariants: {
        readonly persistentConnectionBudget: number;
        readonly maximumApplicationEnvelope: number;
        readonly repositoryConnectionCeiling: number;
        readonly replacementOverlapConnections: number;
      };
    };

    expect(incident.database.managedProviderMaxConnections).toBe(25);
    expect(incident.api).toMatchObject({
      observedRestartCount: 7,
      tooManyConnectionsSqlState: '53300',
    });
    expect(incident.workers.ingestionScanDrainFailureCountAtInitialAudit).toBe(38);
    expect(incident.workers).toMatchObject({
      latestIngestionScanDrainRetryNumber: 2,
      latestIngestionScanDrainErrorClassification: 'unknown',
    });
    expect(incident.acceptanceInvariants).toEqual({
      persistentConnectionBudget: POSTGRES_PRODUCTION_PERSISTENT_BUDGET,
      maximumApplicationEnvelope: POSTGRES_PRODUCTION_MAXIMUM_ENVELOPE,
      repositoryConnectionCeiling: POSTGRES_REPOSITORY_CONNECTION_CEILING,
      replacementOverlapConnections: 0,
      databaseAwareReadinessRequired: true,
      restartAndProxySoakRequired: true,
    });
  });

  it('fails closed when live capacity facts are absent, malformed, or insufficient', () => {
    const fixture = productionBudgetFixture();
    expect(() =>
      assertDeploymentPostgresBudget({
        ...fixture,
        providerCapacityFacts: {
          ...fixture.providerCapacityFacts,
          serverMaxConnections: 0,
        },
      }),
    ).toThrow('live max_connections');
    expect(() =>
      assertDeploymentPostgresBudget({
        ...fixture,
        providerCapacityFacts: {
          ...fixture.providerCapacityFacts,
          roleConnectionLimit: 20,
        },
      }),
    ).toThrow('provider reserve too small');
    expect(() =>
      assertDeploymentPostgresBudget({
        ...fixture,
        providerCapacityFacts: {
          ...fixture.providerCapacityFacts,
          reservedConnections: 25,
        },
      }),
    ).toThrow('reserved connections consume');
  });

  it('rejects hostile live occupancy even when the static envelope alone fits', () => {
    const fixture = productionBudgetFixture();

    expect(() =>
      assertDeploymentPostgresBudget({
        ...fixture,
        providerCapacityFacts: {
          ...fixture.providerCapacityFacts,
          externalConnectionOccupancy: 7,
        },
      }),
    ).toThrow('occupancy plus application envelope');
  });
  it('rejects lingering old-runtime sessions after container removal', () => {
    const fixture = productionBudgetFixture();
    expect(() =>
      assertDeploymentPostgresBudget({
        ...fixture,
        providerCapacityFacts: {
          ...fixture.providerCapacityFacts,
          stoppedRuntimeConnectionOccupancy: 1,
        },
      }),
    ).toThrow('Old PostgreSQL runtime sessions remain');
  });

  it('rejects any declared old/new database connection overlap', () => {
    expect(() =>
      assertDeploymentPostgresBudget({
        ...productionBudgetFixture(),
        replacementOverlapConnections: 1,
      }),
    ).toThrow('must be exactly 0');
  });

  it('rejects replica fanout that drifts the exact persistent budget', () => {
    const fixture = productionBudgetFixture();
    expect(() =>
      assertDeploymentPostgresBudget({
        ...fixture,
        runtimes: fixture.runtimes.map((runtime) =>
          runtime.processId === 'api-gateway'
            ? { ...runtime, replicas: 2 }
            : runtime,
        ),
      }),
    ).toThrow('persistent budget');
  });

  it('rejects missing, duplicate, or malformed rendered runtime topology', () => {
    const fixture = productionBudgetFixture();
    expect(() =>
      assertDeploymentPostgresBudget({
        ...fixture,
        runtimes: fixture.runtimes.filter(
          (runtime) => runtime.processId !== 'daily-runner',
        ),
      }),
    ).toThrow('missing daily-runner');
    expect(() =>
      assertDeploymentPostgresBudget({
        ...fixture,
        runtimes: [...fixture.runtimes, fixture.runtimes[0]!],
      }),
    ).toThrow('duplicate or unexpected');
    for (const runtimeOverride of [
      { poolMin: 1 },
      { poolMax: 1 },
      { replicas: 0 },
    ]) {
      expect(() =>
        assertDeploymentPostgresBudget({
          ...fixture,
          runtimes: fixture.runtimes.map((runtime) =>
            runtime.processId === 'api-gateway'
              ? { ...runtime, ...runtimeOverride }
              : runtime,
          ),
        }),
      ).toThrow();
    }
  });

  it('keeps the approved persistent process maxima explicit', () => {
    expect(POSTGRES_RUNTIME_POOL_MINIMUM).toBe(0);
    expect(POSTGRES_RUNTIME_POOL_LIMITS).toMatchObject({
      'api-gateway': 2,
      'ingestion-worker': 2,
      'intelligence-worker': 2,
      'delivery-service': 1,
      'event-relay': 1,
    });
    expect(
      PRODUCTION_POSTGRES_RUNTIME_INVENTORY.filter(
        (runtime) => runtime.lifecycle === 'persistent',
      ).map(({ processId, poolMax }) => [processId, poolMax]),
    ).toEqual([
      ['api-gateway', 2],
      ['ingestion-worker', 2],
      ['intelligence-worker', 2],
      ['delivery-service', 1],
      ['event-relay', 1],
    ]);
  });

  it('keeps deploy-time live capacity policy aligned with the TypeScript proof', () => {
    const verifier = readSource(
      'ops/deploy/verify-postgres-runtime-topology.py',
    );
    for (const [name, value] of [
      ['DAILY_AUXILIARY_CONNECTIONS', POSTGRES_DAILY_AUXILIARY_CONNECTIONS],
      ['MIGRATION_CONNECTIONS', POSTGRES_MIGRATION_CONNECTIONS],
      ['BACKUP_CONNECTIONS', POSTGRES_BACKUP_CONNECTIONS],
      [
        'CAPACITY_VERIFICATION_CONNECTIONS',
        POSTGRES_CAPACITY_VERIFICATION_CONNECTIONS,
      ],
      ['MANUAL_CONNECTIONS', POSTGRES_MANUAL_CONNECTIONS],
      ['OPTIONAL_RUNTIME_CONNECTIONS', POSTGRES_OPTIONAL_RUNTIME_CONNECTIONS],
      ['MINIMUM_PROVIDER_RESERVE', POSTGRES_MINIMUM_PROVIDER_RESERVE],
      [
        'PRODUCTION_PERSISTENT_BUDGET',
        POSTGRES_PRODUCTION_PERSISTENT_BUDGET,
      ],
      [
        'PRODUCTION_MAXIMUM_ENVELOPE',
        POSTGRES_PRODUCTION_MAXIMUM_ENVELOPE,
      ],
      [
        'REPOSITORY_CONNECTION_CEILING',
        POSTGRES_REPOSITORY_CONNECTION_CEILING,
      ],
    ] as const) {
      expect(verifier).toContain(`${name} = ${value}`);
    }
    expect(verifier).toContain(
      `MINIMUM_PROVIDER_RESERVE_RATIO = ${POSTGRES_MINIMUM_PROVIDER_RESERVE_RATIO.toFixed(2)}`,
    );
  });

  it('documents optional, ephemeral, and non-Postgres production entrypoints', () => {
    expect(
      PRODUCTION_POSTGRES_RUNTIME_INVENTORY.filter(
        (runtime) => runtime.lifecycle !== 'persistent',
      ).map(({ processId, lifecycle, poolMax, auxiliaryConnections }) => ({
        processId,
        lifecycle,
        poolMax,
        auxiliaryConnections,
      })),
    ).toEqual([
      {
        processId: 'agent-runtime',
        lifecycle: 'no-postgres',
        poolMax: 0,
        auxiliaryConnections: 0,
      },
      {
        processId: 'x-collector',
        lifecycle: 'no-postgres',
        poolMax: 0,
        auxiliaryConnections: 0,
      },
      {
        processId: 'migrate',
        lifecycle: 'ephemeral',
        poolMax: 0,
        auxiliaryConnections: 1,
      },
      {
        processId: 'daily-runner',
        lifecycle: 'ephemeral',
        poolMax: 2,
        auxiliaryConnections: 1,
      },
      {
        processId: 'social-research-grpc',
        lifecycle: 'optional',
        poolMax: 1,
        auxiliaryConnections: 0,
      },
      {
        processId: 'social-research-mcp',
        lifecycle: 'optional',
        poolMax: 1,
        auxiliaryConnections: 0,
      },
    ]);
  });
});

describe('production PostgreSQL construction and entrypoint inventory', () => {
  const publicationPostgresTestOnlyFiles = new Set([
    'scripts/check-reader-summary-publication-postgres.ts',
    'scripts/reader-summary-publication-postgres-legacy.ts',
    'scripts/reader-summary-publication-postgres-privileges.ts',
    'scripts/reader-summary-publication-postgres-runtime-guard.ts',
  ]);
  const sourceFiles = [...runtimeSourceFiles('apps'), ...runtimeSourceFiles('libs')];
  const completeDatabaseSourceFiles = [
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

    expect(rawConstructions).toEqual([
      'libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts:Pool',
      'libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts:PrismaPg',
      'libs/platform/persistence/src/postgres-runtime-pool.ts:Pool',
      'libs/platform/persistence/src/postgres-runtime-pool.ts:PrismaPg',
      'prisma/seed.ts:Pool',
      'prisma/seed.ts:PrismaClient',
      'prisma/seed.ts:PrismaPg',
      'scripts/backfill-github-trending-feed.ts:Pool',
      'scripts/capture-durable-backend-e2e-loop.ts:Pool',
      'scripts/check-github-repo-radar-prisma-live-e2e.ts:Pool',
      'scripts/check-reader-summary-multi-day-quality.ts:Pool',
      'scripts/check-reader-summary-production-regeneration-smoke.ts:Pool',
      'scripts/check-reader-summary-publication-postgres.ts:Pool',
      'scripts/check-reader-summary-publication-postgres.ts:Pool',
      'scripts/check-reader-summary-publication-postgres.ts:Pool',
      'scripts/check-reader-summary-publication-postgres.ts:Pool',
      'scripts/check-reader-summary-publication-postgres.ts:Pool',
      'scripts/check-reader-summary-quality-dashboard.ts:Pool',
      'scripts/check-reader-summary-source-quality-trace.ts:Pool',
      'scripts/check-reader-summary-top-read-ranking.ts:Pool',
      'scripts/check-reader-summary-topic-map-real-data.ts:Pool',
      'scripts/check-source-query-planner-real-binding-canary.ts:Pool',
      'scripts/check-summary-feedback-calibration-report.ts:Pool',
      'scripts/check-summary-memory-product-loop.ts:Pool',
      'scripts/check-summary-topic-recommendation-rest-prisma-live.ts:Pool',
      'scripts/check-yesterday-reader-summary-artifact-quality.ts:Pool',
      'scripts/check-yesterday-social-collection-quality.ts:Pool',
      'scripts/lib/yesterday-social-replay-support.ts:Pool',
      'scripts/reader-summary-publication-postgres-legacy.ts:Pool',
      'scripts/reader-summary-publication-postgres-privileges.ts:Pool',
      'scripts/reader-summary-publication-postgres-privileges.ts:Pool',
      'scripts/reader-summary-publication-postgres-privileges.ts:Pool',
      'scripts/reader-summary-publication-postgres-privileges.ts:Pool',
      'scripts/reader-summary-publication-postgres-privileges.ts:Pool',
      'scripts/reader-summary-publication-postgres-privileges.ts:Pool',
      'scripts/run-reader-summary-clean-real-day-collection.ts:Pool',
      'scripts/run-reader-summary-production-day.ts:Pool',
    ]);
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

    expect(rawDependencyFiles).toEqual([
      'libs/platform/persistence/src/postgres-runtime-pool-cleanup.ts',
      'libs/platform/persistence/src/postgres-runtime-pool-concurrency.spec.ts',
      'libs/platform/persistence/src/postgres-runtime-pool.spec.ts',
      'libs/platform/persistence/src/postgres-runtime-pool.ts',
      'prisma/seed.ts',
      'scripts/backfill-github-trending-feed.ts',
      'scripts/capture-durable-backend-e2e-loop.ts',
      'scripts/check-github-repo-radar-prisma-live-e2e.ts',
      'scripts/check-reader-summary-multi-day-quality.ts',
      'scripts/check-reader-summary-production-regeneration-smoke.ts',
      'scripts/check-reader-summary-publication-postgres.ts',
      'scripts/check-reader-summary-quality-dashboard.ts',
      'scripts/check-reader-summary-source-quality-trace.ts',
      'scripts/check-reader-summary-top-read-ranking.ts',
      'scripts/check-reader-summary-topic-map-real-data.ts',
      'scripts/check-source-query-planner-real-binding-canary.ts',
      'scripts/check-summary-feedback-calibration-report.ts',
      'scripts/check-summary-memory-product-loop.ts',
      'scripts/check-summary-topic-recommendation-rest-prisma-live.ts',
      'scripts/check-yesterday-reader-summary-artifact-quality.ts',
      'scripts/check-yesterday-social-collection-quality.ts',
      'scripts/lib/reader-summary-quality-dashboard-published-window.spec.ts',
      'scripts/lib/reader-summary-quality-dashboard-published-window.ts',
      'scripts/lib/reader-summary-quality-eval-support.spec.ts',
      'scripts/lib/reader-summary-quality-eval-support.ts',
      'scripts/lib/yesterday-social-replay-support.ts',
      'scripts/reader-summary-publication-postgres-legacy.ts',
      'scripts/reader-summary-publication-postgres-privileges.ts',
      'scripts/reader-summary-publication-postgres-runtime-guard.ts',
      'scripts/run-reader-summary-clean-real-day-collection.ts',
      'scripts/run-reader-summary-production-day.ts',
    ]);
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
    const expectedPoolMaximums = new Map<string, readonly number[]>([
      [
        'scripts/check-reader-summary-publication-postgres.ts',
        [1, 1, 2, 4, 1],
      ],
      ['scripts/reader-summary-publication-postgres-legacy.ts', [1]],
      [
        'scripts/reader-summary-publication-postgres-privileges.ts',
        [1, 1, 1, 1, 1, 1],
      ],
      ['scripts/reader-summary-publication-postgres-runtime-guard.ts', []],
    ]);
    for (const [path, expectedMaximums] of expectedPoolMaximums) {
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
    expect(productionImporters).toEqual([]);
    expect(readSource('package.json')).toContain(
      'check:reader-summary-publication-postgres',
    );
  });

  it('keeps the production daily dispatcher sequential and within its budget', () => {
    const dispatcher = readSource(
      'scripts/run-reader-summary-production-day.ts',
    );
    const main = dispatcher.slice(dispatcher.indexOf('async function main()'));
    expect(dispatcher).toContain('import { spawnSync }');
    expect(main.indexOf('runNpm("migrate"')).toBeLessThan(
      main.indexOf('await readProductionDayScope()'),
    );
    expect(dispatcher).toMatch(
      /readProductionDayScope[\s\S]*?new Pool\(\{[\s\S]*?max: 1/,
    );
    for (const path of [
      'scripts/run-reader-summary-clean-real-day-collection.ts',
      'scripts/capture-durable-reader-summary-from-postgres.ts',
      'scripts/check-reader-summary-source-quality-trace.ts',
    ]) {
      expect(readSource(path)).toContain(
        'defaultPostgresRuntimePoolConfig',
      );
      expect(readSource(path)).toMatch(
        /defaultPostgresRuntimePoolConfig\([\s\S]*?["']daily-runner["']\s*,?\s*\)/,
      );
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
    for (const externallyComposedService of ['daily-runner', 'x-collector']) {
      expect(deploy).toContain(`"${externallyComposedService}"`);
    }
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
    expect(productionDailyUnit).toContain('TimeoutStartSec=23400');
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
    ).toBeLessThan(publicationDeploy.indexOf('exec npm run migrate:deploy'));
    expect(publicationDeploy.indexOf('exec npm run migrate:deploy')).toBeLessThan(
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

function envelope(
  id:
    | 'steady-and-manual'
    | 'daily-and-manual'
    | 'migration-and-manual'
    | 'backup-and-manual'
    | 'capacity-verification-and-manual'
    | 'replacement-and-manual',
  temporaryConnections: number,
  totalConnections: number,
) {
  return {
    id,
    persistentConnections: 8,
    temporaryConnections,
    totalConnections,
    providerReserve: 22 - totalConnections,
  };
}

function productionBudgetFixture(): DeploymentPostgresBudgetConfiguration {
  return {
    providerCapacityFacts: {
      serverMaxConnections: 25,
      superuserReservedConnections: 3,
      reservedConnections: 0,
      roleConnectionLimit: -1,
      databaseConnectionLimit: -1,
      externalConnectionOccupancy: 0,
      stoppedRuntimeConnectionOccupancy: 0,
      capturePhase: 'post-old-container-stop-pre-new-start',
    },
    runtimes: [
      topology('api-gateway', 2),
      topology('ingestion-worker', 2),
      topology('intelligence-worker', 2),
      topology('delivery-service', 1),
      topology('event-relay', 1),
      topology('daily-runner', 2),
    ],
    replacementOverlapConnections: 0,
  };
}

function topology(
  processId: DeploymentPostgresBudgetConfiguration['runtimes'][number]['processId'],
  poolMax: DeploymentPostgresBudgetConfiguration['runtimes'][number]['poolMax'],
): DeploymentPostgresBudgetConfiguration['runtimes'][number] {
  return {
    processId,
    poolMin: 0,
    poolMax,
    replicas: 1,
  };
}

function runtimeSourceFiles(directory: string): readonly string[] {
  if (directory === 'prisma/generated') {
    return [];
  }
  const absoluteDirectory = join(process.cwd(), directory);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absolutePath = join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...runtimeSourceFiles(join(directory, entry.name)));
      continue;
    }
    if (['.ts', '.js', '.mjs', '.cjs', '.py'].includes(extname(entry.name))) {
      files.push(relative(process.cwd(), absolutePath));
    }
  }

  return files;
}

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function directDatabaseConstructions(
  source: string,
): readonly ('Pool' | 'PrismaPg' | 'PrismaClient')[] {
  const imported = databaseConstructorAliases(source);
  const constructions: ('Pool' | 'PrismaPg' | 'PrismaClient')[] = [];
  for (const [localName, canonical] of imported) {
    const constructorPattern = new RegExp(
      `new\\s+${escapeRegularExpression(localName)}\\s*\\(`,
      'g',
    );
    constructions.push(
      ...(source.match(constructorPattern) ?? []).map(() => canonical),
    );
  }
  return constructions;
}

function databaseConstructorAliases(
  source: string,
): ReadonlyMap<string, 'Pool' | 'PrismaPg' | 'PrismaClient'> {
  const imported = new Map<string, 'Pool' | 'PrismaPg' | 'PrismaClient'>();
  for (const match of source.matchAll(
    /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    const moduleName = match[2] ?? '';
    const canonical =
      moduleName === 'pg'
        ? 'Pool'
        : moduleName === '@prisma/adapter-pg'
          ? 'PrismaPg'
          : moduleName.includes('generated/client/client')
            ? 'PrismaClient'
            : undefined;
    if (canonical === undefined) {
      continue;
    }
    for (const specifier of (match[1] ?? '').split(',')) {
      const importedName = new RegExp(
        `^(?:type\\s+)?${canonical}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?$`,
      ).exec(specifier.trim());
      if (importedName !== null) {
        imported.set(importedName[1] ?? canonical, canonical);
      }
    }
  }
  return imported;
}

function directPoolOptions(source: string): readonly string[] {
  const options: string[] = [];
  for (const [localName, canonical] of databaseConstructorAliases(source)) {
    if (canonical !== 'Pool') {
      continue;
    }
    const poolPattern = new RegExp(
      `new\\s+${escapeRegularExpression(localName)}\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*(?:as[\\s\\S]*?)?\\)`,
      'g',
    );
    for (const match of source.matchAll(poolPattern)) {
      options.push(match[1] ?? '');
    }
  }
  return options;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readComposeService(compose: string, service: string): string {
  const startMarker = `  ${service}:\n`;
  const start = compose.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Compose service is missing: ${service}`);
  }
  const remainder = compose.slice(start + startMarker.length);
  const nextService = /^ {2}[a-z0-9-]+:\s*$/m.exec(remainder);
  const end =
    nextService === null
      ? undefined
      : start + startMarker.length + nextService.index;
  return compose.slice(start, end);
}
