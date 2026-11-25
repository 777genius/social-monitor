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
  POSTGRES_RUNTIME_POOL_MINIMUM,
  POSTGRES_RUNTIME_POOL_LIMITS,
  PRODUCTION_POSTGRES_RUNTIME_INVENTORY,
  assertDeploymentPostgresBudget,
  type DeploymentPostgresBudgetConfiguration,
} from './postgres-runtime-pool-budget';
import { readSource } from './postgres-runtime-pool-budget-test-source';

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
