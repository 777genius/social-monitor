export const POSTGRES_RUNTIME_POOL_MINIMUM = 0;
// Repository-owned consumer and reserve policy. Deployment cannot replace
// these facts with smaller operator-provided environment claims.
export const POSTGRES_DAILY_AUXILIARY_CONNECTIONS = 1;
export const POSTGRES_MIGRATION_CONNECTIONS = 1;
export const POSTGRES_BACKUP_CONNECTIONS = 1;
export const POSTGRES_CAPACITY_VERIFICATION_CONNECTIONS = 1;
export const POSTGRES_MANUAL_CONNECTIONS = 3;
export const POSTGRES_OPTIONAL_RUNTIME_CONNECTIONS = 2;
export const POSTGRES_MINIMUM_PROVIDER_RESERVE = 5;
export const POSTGRES_MINIMUM_PROVIDER_RESERVE_RATIO = 0.2;
export const POSTGRES_PRODUCTION_PERSISTENT_BUDGET = 8;
export const POSTGRES_PRODUCTION_MAXIMUM_ENVELOPE = 16;
export const POSTGRES_REPOSITORY_CONNECTION_CEILING = 17;
export type PostgresRuntimeProcessId =
  | 'api-gateway'
  | 'ingestion-worker'
  | 'intelligence-worker'
  | 'delivery-service'
  | 'event-relay'
  | 'social-research-grpc'
  | 'social-research-mcp'
  | 'daily-runner'
  | 'admin-tool';
export const POSTGRES_RUNTIME_POOL_LIMITS = {
  'api-gateway': 2,
  'ingestion-worker': 2,
  'intelligence-worker': 2,
  'delivery-service': 1,
  'event-relay': 1,
  'social-research-grpc': 1,
  'social-research-mcp': 1,
  'daily-runner': 2,
  'admin-tool': 1,
} as const satisfies Readonly<Record<PostgresRuntimeProcessId, 1 | 2>>;
export const POSTGRES_RUNTIME_CONNECTION_FACTORIES = {
  delivery: 'libs/delivery/adapters/persistence/prisma/prisma-delivery-connection.ts',
  eventStore:
    'libs/platform/events/src/adapters/prisma/prisma-event-store-connection.ts',
  feed: 'libs/feed/adapters/persistence/prisma/prisma-feed-connection.ts',
  identity:
    'libs/identity/adapters/persistence/prisma/prisma-identity-connection.ts',
  ingestion:
    'libs/ingestion/adapters/persistence/prisma/prisma-ingestion-connection.ts',
  ingestionWorker:
    'apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection.ts',
  monitoring:
    'libs/monitoring/adapters/persistence/prisma/prisma-monitoring-connection.ts',
  relevance:
    'libs/relevance/adapters/persistence/prisma/prisma-relevance-connection.ts',
  socialResearch:
    'libs/social-research/infrastructure/cache/prisma-social-research-connection.ts',
  subscriptions:
    'libs/subscriptions/adapters/persistence/prisma/prisma-subscriptions-connection.ts',
  summary:
    'libs/summary/adapters/persistence/prisma/prisma-summary-connection.ts',
  usage: 'libs/usage/adapters/persistence/prisma/prisma-usage-connection.ts',
} as const;
export type PostgresRuntimeConnectionFactoryId =
  keyof typeof POSTGRES_RUNTIME_CONNECTION_FACTORIES;
export type ProductionPostgresRuntimeInventoryItem = {
  readonly processId: string;
  readonly composeService: string | null;
  readonly imageService: string | null;
  readonly entrypoint: string;
  readonly lifecycle: 'persistent' | 'ephemeral' | 'optional' | 'no-postgres';
  readonly poolMax: number;
  readonly auxiliaryConnections: number;
  readonly connectionFactories: readonly PostgresRuntimeConnectionFactoryId[];
};
export const PRODUCTION_POSTGRES_RUNTIME_INVENTORY: readonly ProductionPostgresRuntimeInventoryItem[] =
  [
    {
      processId: 'api-gateway',
      composeService: 'api',
      imageService: 'api',
      entrypoint: 'apps/api-gateway/src/main.ts',
      lifecycle: 'persistent',
      poolMax: POSTGRES_RUNTIME_POOL_LIMITS['api-gateway'],
      auxiliaryConnections: 0,
      connectionFactories: [
        'monitoring',
        'feed',
        'ingestion',
        'relevance',
        'subscriptions',
        'summary',
        'delivery',
        'identity',
        'usage',
        'socialResearch',
      ],
    },
    {
      processId: 'ingestion-worker',
      composeService: 'ingestion-worker',
      imageService: 'ingestion',
      entrypoint: 'apps/ingestion-worker/src/main.ts',
      lifecycle: 'persistent',
      poolMax: POSTGRES_RUNTIME_POOL_LIMITS['ingestion-worker'],
      auxiliaryConnections: 0,
      connectionFactories: [
        'ingestionWorker',
        'monitoring',
        'identity',
        'usage',
      ],
    },
    {
      processId: 'intelligence-worker',
      composeService: 'intelligence-worker',
      imageService: 'intelligence',
      entrypoint: 'apps/intelligence-worker/src/main.ts',
      lifecycle: 'persistent',
      poolMax: POSTGRES_RUNTIME_POOL_LIMITS['intelligence-worker'],
      auxiliaryConnections: 0,
      connectionFactories: [
        'summary',
        'relevance',
        'feed',
        'monitoring',
        'subscriptions',
        'identity',
        'usage',
      ],
    },
    {
      processId: 'delivery-service',
      composeService: 'delivery-service',
      imageService: 'delivery',
      entrypoint: 'apps/delivery-service/src/main.ts',
      lifecycle: 'persistent',
      poolMax: POSTGRES_RUNTIME_POOL_LIMITS['delivery-service'],
      auxiliaryConnections: 0,
      connectionFactories: ['delivery', 'identity', 'usage'],
    },
    {
      processId: 'event-relay',
      composeService: 'event-relay',
      imageService: 'event-relay',
      entrypoint: 'apps/event-relay/src/main.ts',
      lifecycle: 'persistent',
      poolMax: POSTGRES_RUNTIME_POOL_LIMITS['event-relay'],
      auxiliaryConnections: 0,
      connectionFactories: ['eventStore'],
    },
    {
      processId: 'agent-runtime',
      composeService: 'agent-runtime',
      imageService: 'agent-runtime',
      entrypoint: 'apps/agent-runtime/src/main.ts',
      lifecycle: 'no-postgres',
      poolMax: 0,
      auxiliaryConnections: 0,
      connectionFactories: [],
    },
    {
      processId: 'x-collector',
      composeService: 'x-collector',
      imageService: null,
      entrypoint: 'apps/x-collector/src/x_collector/__main__.py',
      lifecycle: 'no-postgres',
      poolMax: 0,
      auxiliaryConnections: 0,
      connectionFactories: [],
    },
    {
      processId: 'migrate',
      composeService: 'migrate',
      imageService: 'api',
      entrypoint: 'npm run migrate:deploy',
      lifecycle: 'ephemeral',
      poolMax: 0,
      auxiliaryConnections: 1,
      connectionFactories: [],
    },
    {
      processId: 'daily-runner',
      composeService: 'daily-runner',
      imageService: null,
      entrypoint: '/var/data/social-monitor/control/daily-run.sh',
      lifecycle: 'ephemeral',
      poolMax: POSTGRES_RUNTIME_POOL_LIMITS['daily-runner'],
      auxiliaryConnections: 1,
      connectionFactories: [
        'ingestionWorker',
        'feed',
        'summary',
      ],
    },
    {
      processId: 'social-research-grpc',
      composeService: null,
      imageService: null,
      entrypoint: 'apps/social-research-grpc/src/main.ts',
      lifecycle: 'optional',
      poolMax: POSTGRES_RUNTIME_POOL_LIMITS['social-research-grpc'],
      auxiliaryConnections: 0,
      connectionFactories: ['monitoring', 'socialResearch'],
    },
    {
      processId: 'social-research-mcp',
      composeService: null,
      imageService: null,
      entrypoint: 'apps/social-research-mcp/src/main.ts',
      lifecycle: 'optional',
      poolMax: POSTGRES_RUNTIME_POOL_LIMITS['social-research-mcp'],
      auxiliaryConnections: 0,
      connectionFactories: ['monitoring', 'socialResearch'],
    },
  ];
export type PostgresConnectionEnvelope = {
  readonly id:
    | 'steady-and-manual'
    | 'daily-and-manual'
    | 'migration-and-manual'
    | 'backup-and-manual'
    | 'capacity-verification-and-manual'
    | 'replacement-and-manual';
  readonly persistentConnections: number;
  readonly temporaryConnections: number;
  readonly totalConnections: number;
  readonly providerReserve: number;
};
export type RenderedPostgresRuntimeTopology = {
  readonly processId: PostgresRuntimeProcessId;
  readonly poolMin: number;
  readonly poolMax: number;
  readonly replicas: number;
};
export type DeploymentPostgresBudgetConfiguration = {
  readonly providerCapacityFacts: LivePostgresProviderCapacityFacts;
  readonly runtimes: readonly RenderedPostgresRuntimeTopology[];
  /** Must be zero: deployment stops and removes replaced DB containers first. */
  readonly replacementOverlapConnections: number;
};
export type LivePostgresProviderCapacityFacts = {
  readonly serverMaxConnections: number;
  readonly superuserReservedConnections: number;
  readonly reservedConnections: number;
  /** PostgreSQL uses -1 for unlimited. */
  readonly roleConnectionLimit: number;
  readonly databaseConnectionLimit: number;
  /** Unbudgeted sessions captured after old containers stop, before replacements. */
  readonly externalConnectionOccupancy: number;
  readonly stoppedRuntimeConnectionOccupancy: number;
  readonly capturePhase: 'post-old-container-stop-pre-new-start';
};
export type DeploymentPostgresBudget = {
  readonly serverMaxConnections: number;
  readonly serverReservedConnections: number;
  readonly effectiveProviderCapacity: number;
  readonly externalConnectionOccupancy: number;
  readonly availableProviderCapacity: number;
  readonly persistentConnections: number;
  readonly maximumApplicationConnections: number;
  readonly requiredProviderReserve: number;
  readonly providerHeadroom: number;
  readonly envelopes: readonly PostgresConnectionEnvelope[];
};
export function assertDeploymentPostgresBudget(
  configuration: DeploymentPostgresBudgetConfiguration,
): DeploymentPostgresBudget {
  const capacity = deriveLivePostgresProviderCapacity(
    configuration.providerCapacityFacts,
  );
  if (configuration.replacementOverlapConnections !== 0) {
    throw new Error(
      'POSTGRES_REPLACEMENT_OVERLAP_CONNECTIONS must be exactly 0; stop replaced database services before starting replacements',
    );
  }
  const expectedPersistentProcesses = PRODUCTION_POSTGRES_RUNTIME_INVENTORY
    .filter((runtime) => runtime.lifecycle === 'persistent')
    .map((runtime) => runtime.processId)
    .sort();
  const persistentRuntimes = configuration.runtimes.filter(
    (runtime) => runtime.processId !== 'daily-runner',
  );
  const actualPersistentProcesses = persistentRuntimes
    .map((runtime) => runtime.processId)
    .sort();
  const dailyRuntime = configuration.runtimes.find(
    (runtime) => runtime.processId === 'daily-runner',
  );
  if (dailyRuntime === undefined) {
    throw new Error('Rendered PostgreSQL topology is missing daily-runner');
  }
  if (configuration.runtimes.length !== expectedPersistentProcesses.length + 1) {
    throw new Error(
      'Rendered PostgreSQL topology contains duplicate or unexpected processes',
    );
  }
  if (
    JSON.stringify(actualPersistentProcesses) !==
    JSON.stringify(expectedPersistentProcesses)
  ) {
    throw new Error(
      'Rendered PostgreSQL persistent process topology does not match the production inventory',
    );
  }
  for (const runtime of configuration.runtimes) {
    const approvedMaximum = POSTGRES_RUNTIME_POOL_LIMITS[runtime.processId];
    if (runtime.poolMin !== POSTGRES_RUNTIME_POOL_MINIMUM) {
      throw new Error(
        `Rendered PostgreSQL pool minimum for ${runtime.processId} must be exactly 0`,
      );
    }
    if (runtime.poolMax !== approvedMaximum) {
      throw new Error(
        `Rendered PostgreSQL pool maximum for ${runtime.processId} must be exactly ${approvedMaximum}`,
      );
    }
    assertPositiveInteger(
      `Rendered PostgreSQL replicas for ${runtime.processId}`,
      runtime.replicas,
    );
  }
  const persistentConnections = persistentRuntimes.reduce(
    (total, runtime) => total + runtime.poolMax * runtime.replicas,
    0,
  );
  if (persistentConnections !== POSTGRES_PRODUCTION_PERSISTENT_BUDGET) {
    throw new Error(
      `Rendered PostgreSQL persistent budget must be exactly ${POSTGRES_PRODUCTION_PERSISTENT_BUDGET}`,
    );
  }
  const uncoordinatedConnections =
    POSTGRES_MANUAL_CONNECTIONS + POSTGRES_OPTIONAL_RUNTIME_CONNECTIONS;
  const envelope = (
    id: PostgresConnectionEnvelope['id'],
    temporaryConnections: number,
  ): PostgresConnectionEnvelope => {
    const totalConnections =
      persistentConnections + temporaryConnections;
    return {
      id,
      persistentConnections,
      temporaryConnections,
      totalConnections,
      providerReserve:
        capacity.availableProviderCapacity - totalConnections,
    };
  };
  const envelopes: readonly PostgresConnectionEnvelope[] = [
    envelope('steady-and-manual', uncoordinatedConnections),
    envelope(
      'daily-and-manual',
      dailyRuntime.poolMax * dailyRuntime.replicas +
        POSTGRES_DAILY_AUXILIARY_CONNECTIONS +
        uncoordinatedConnections,
    ),
    envelope(
      'migration-and-manual',
      POSTGRES_MIGRATION_CONNECTIONS + uncoordinatedConnections,
    ),
    envelope(
      'backup-and-manual',
      POSTGRES_BACKUP_CONNECTIONS + uncoordinatedConnections,
    ),
    envelope(
      'capacity-verification-and-manual',
      POSTGRES_CAPACITY_VERIFICATION_CONNECTIONS + uncoordinatedConnections,
    ),
    envelope(
      'replacement-and-manual',
      configuration.replacementOverlapConnections +
        uncoordinatedConnections,
    ),
  ];
  const maximumApplicationConnections = Math.max(
    ...envelopes.map((candidate) => candidate.totalConnections),
  );
  if (
    maximumApplicationConnections !== POSTGRES_PRODUCTION_MAXIMUM_ENVELOPE
  ) {
    throw new Error(
      `Rendered PostgreSQL maximum envelope must be exactly ${POSTGRES_PRODUCTION_MAXIMUM_ENVELOPE}`,
    );
  }
  if (
    maximumApplicationConnections > POSTGRES_REPOSITORY_CONNECTION_CEILING
  ) {
    throw new Error(
      `Rendered PostgreSQL maximum envelope exceeds repository ceiling ${POSTGRES_REPOSITORY_CONNECTION_CEILING}`,
    );
  }
  const providerHeadroom =
    capacity.availableProviderCapacity - maximumApplicationConnections;
  if (maximumApplicationConnections > capacity.availableProviderCapacity) {
    throw new Error(
      `Deployment PostgreSQL live occupancy plus application envelope exceeds provider capacity: ${configuration.providerCapacityFacts.externalConnectionOccupancy} + ${maximumApplicationConnections} > ${capacity.effectiveProviderCapacity}`,
    );
  }
  if (providerHeadroom < capacity.requiredProviderReserve) {
    throw new Error(
      `Deployment PostgreSQL provider reserve too small: ${providerHeadroom} < ${capacity.requiredProviderReserve}`,
    );
  }
  return {
    ...capacity,
    persistentConnections,
    maximumApplicationConnections,
    providerHeadroom,
    envelopes,
  };
}
export function deriveLivePostgresProviderCapacity(
  facts: LivePostgresProviderCapacityFacts,
): {
  readonly serverMaxConnections: number;
  readonly serverReservedConnections: number;
  readonly effectiveProviderCapacity: number;
  readonly externalConnectionOccupancy: number;
  readonly availableProviderCapacity: number;
  readonly requiredProviderReserve: number;
} {
  assertPositiveInteger('live max_connections', facts.serverMaxConnections);
  assertNonNegativeInteger(
    'live superuser_reserved_connections',
    facts.superuserReservedConnections,
  );
  assertNonNegativeInteger(
    'live reserved_connections',
    facts.reservedConnections,
  );
  assertConnectionLimit('live role connection limit', facts.roleConnectionLimit);
  assertConnectionLimit(
    'live database connection limit',
    facts.databaseConnectionLimit,
  );
  assertNonNegativeInteger(
    'live external connection occupancy',
    facts.externalConnectionOccupancy,
  );
  assertNonNegativeInteger('live stopped-runtime connection occupancy', facts.stoppedRuntimeConnectionOccupancy);
  if (facts.stoppedRuntimeConnectionOccupancy !== 0) {
    throw new Error('Old PostgreSQL runtime sessions remain after container removal');
  }
  if (facts.capturePhase !== 'post-old-container-stop-pre-new-start') {
    throw new Error(
      'Live PostgreSQL occupancy must be captured after old containers stop and before replacements start',
    );
  }
  const serverReservedConnections =
    facts.superuserReservedConnections + facts.reservedConnections;
  const serverApplicationCapacity =
    facts.serverMaxConnections - serverReservedConnections;
  if (serverApplicationCapacity < 1) {
    throw new Error(
      'Live PostgreSQL reserved connections consume server capacity',
    );
  }
  const finiteLimits = [
    serverApplicationCapacity,
    facts.roleConnectionLimit,
    facts.databaseConnectionLimit,
  ].filter((limit) => limit >= 0);
  const effectiveProviderCapacity = Math.min(...finiteLimits);
  if (effectiveProviderCapacity < 1) {
    throw new Error('Live PostgreSQL role/database capacity is zero');
  }
  const availableProviderCapacity =
    effectiveProviderCapacity - facts.externalConnectionOccupancy;
  if (availableProviderCapacity < 1) {
    throw new Error(
      'Live PostgreSQL external occupancy consumes effective provider capacity',
    );
  }
  const requiredProviderReserve = Math.max(
    POSTGRES_MINIMUM_PROVIDER_RESERVE,
    Math.ceil(
      effectiveProviderCapacity * POSTGRES_MINIMUM_PROVIDER_RESERVE_RATIO,
    ),
  );
  return {
    serverMaxConnections: facts.serverMaxConnections,
    serverReservedConnections,
    effectiveProviderCapacity,
    externalConnectionOccupancy: facts.externalConnectionOccupancy,
    availableProviderCapacity,
    requiredProviderReserve,
  };
}
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive base-10 integer`);
  }
}
function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}
function assertConnectionLimit(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < -1) {
    throw new Error(`${name} must be -1 or a non-negative integer`);
  }
}
