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
      { processId: 'agent-runtime', lifecycle: 'no-postgres', poolMax: 0, auxiliaryConnections: 0 },
      { processId: 'x-collector', lifecycle: 'no-postgres', poolMax: 0, auxiliaryConnections: 0 },
      { processId: 'migrate', lifecycle: 'ephemeral', poolMax: 0, auxiliaryConnections: 1 },
      { processId: 'daily-runner', lifecycle: 'ephemeral', poolMax: 2, auxiliaryConnections: 1 },
      { processId: 'social-research-grpc', lifecycle: 'optional', poolMax: 1, auxiliaryConnections: 0 },
      { processId: 'social-research-mcp', lifecycle: 'optional', poolMax: 1, auxiliaryConnections: 0 },
    ]);
  });
});

describe('production PostgreSQL construction and entrypoint inventory', () => {
  const publicationPostgresTestOnlyFiles =
    PUBLICATION_POSTGRES_TEST_ONLY_FILES;
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
      scripts/lib/reader-summary-daily-terminal-runtime-connection.ts:Pool
      scripts/lib/reader-summary-production-day-scope.ts:Pool
      scripts/lib/reader-summary-promotion-v2-historical-postgres.ts:Pool
      scripts/lib/reader-summary-quality-dashboard-report-builder.ts:Pool
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts:Pool
      scripts/lib/reader-summary-ready-delivery-postgres-fixture.ts:Pool
      scripts/lib/yesterday-social-replay-support.ts:Pool
      scripts/read-reader-summary-daily-terminal-set-receipt.ts:Pool
      scripts/reader-summary-publication-postgres-legacy.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/reader-summary-publication-postgres-privileges.ts:Pool
      scripts/run-reader-promotion-v2-production-canary.ts:Pool
      scripts/run-reader-summary-clean-real-day-collection.ts:Pool
      scripts/run-reader-summary-promotion-v2-rollback.ts:Pool
      scripts/run-reader-summary-weekly-production.ts:Pool
      scripts/run-reader-summary-weekly-review-producer.ts:Pool
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
      scripts/lib/reader-summary-weekly-atomic-publication-postgres-contract.ts
      scripts/lib/reader-summary-weekly-certification-seal-postgres-contract.ts
      scripts/lib/reader-summary-weekly-daily-certification-backfill-postgres-contract.ts
      scripts/lib/reader-summary-weekly-projection-postgres-contract.ts
      scripts/lib/reader-summary-weekly-publication-evidence-postgres-contract.ts
      scripts/lib/reader-summary-weekly-publication-github-fixture.ts
      scripts/lib/reader-summary-weekly-review-manifest-postgres-contract.ts
      scripts/lib/yesterday-reader-summary-artifact-quality-store.spec.ts
      scripts/lib/yesterday-reader-summary-artifact-quality-store.ts
      scripts/lib/yesterday-social-collection-quality-summary-counts.ts
      scripts/lib/yesterday-social-replay-support.ts
      scripts/read-reader-summary-daily-terminal-set-receipt.spec.ts
      scripts/read-reader-summary-daily-terminal-set-receipt.ts
      scripts/reader-summary-publication-postgres-legacy.ts
      scripts/reader-summary-publication-postgres-privileges.ts
      scripts/reader-summary-publication-postgres-runtime-guard.ts
      scripts/reader-summary-publication-postgres18-regression.ts
      scripts/run-reader-promotion-v2-production-canary.ts
      scripts/run-reader-summary-clean-real-day-collection.ts
      scripts/run-reader-summary-promotion-v2-rollback.ts
      scripts/run-reader-summary-weekly-production.ts
      scripts/run-reader-summary-weekly-review-producer.ts
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
    expect(productionImporters).toEqual([]);
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
