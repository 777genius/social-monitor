import type {
  FeedItemReadRepositoryPort,
  FeedSourceContentItem,
  ListFeedItemsQuery,
  ListFeedItemsResult,
} from "@social-monitor/feed/ports";
import type {
  PrepareReaderSummaryProductionRecoveryResult,
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryAuthorityHandle,
  ReaderSummaryProductionRecoveryAuthorityPort,
  ReadReaderSummaryGitHubProjectionQuery,
  ReadReaderSummaryGitHubProjectionResult,
} from "@social-monitor/summary/ports";
import type { ReaderSummaryGitHubProjectionItem } from "@social-monitor/summary/domain";
import type { PostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";

export type ReaderSummaryProductionRecoveryScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

export type ReaderSummaryProductionRecoveryScopeDiscoveryClient = Readonly<{
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<T>;
}>;

export type ReaderSummaryProductionRecoverySessionConfigurationClient = Readonly<{
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<T>;
}>;

type ScopeDiscoveryRow = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

type ScopeDiagnosticsRow = Readonly<{
  timestamp_column: string;
  tenant_sha256_12: string;
  workspace_sha256_12: string;
  utc_date: string;
  provider_key: string;
  normalized_status: string;
  count: number;
}>;

type CloseableConnection = Readonly<{
  close(): Promise<void>;
}>;

type ScopeEnv = Readonly<Record<string, string | undefined>>;
type RuntimePoolConfigResolver = (
  env: NodeJS.ProcessEnv,
) => PostgresRuntimePoolConfig;

const tenantScopeEnvName = "READER_SUMMARY_PRODUCTION_RECOVERY_TENANT_ID";
const workspaceScopeEnvName = "READER_SUMMARY_PRODUCTION_RECOVERY_WORKSPACE_ID";
const sourceDatabaseEnvName =
  "READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL";
const millisecondsPerUtcDay = 86_400_000;

type SnapshotFeedItem = NonNullable<
  Awaited<ReturnType<FeedItemReadRepositoryPort["findById"]>>
>;
type FindFeedItemByIdQuery = Parameters<
  FeedItemReadRepositoryPort["findById"]
>[0];
type ReadSourceContentQuery = Parameters<
  NonNullable<FeedItemReadRepositoryPort["readSourceContent"]>
>[0];

type SourceSnapshotFeedItemReadRepositoryInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  feedItemsById: ReadonlyMap<string, SnapshotFeedItem>;
  sourceContentByFeedItemId: ReadonlyMap<string, FeedSourceContentItem>;
}>;

type GitHubProjectionSnapshot = Readonly<{
  tenantId: string;
  workspaceId: string;
  dayStartedAt: Date;
  dayEndedAt: Date;
  result: ReadReaderSummaryGitHubProjectionResult;
}>;

export type ReaderSummaryProductionRecoverySourceSnapshot = Readonly<{
  scope: ReaderSummaryProductionRecoveryScope;
  binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  authority: ReaderSummaryProductionRecoveryAuthorityPort;
  feedItems: FeedItemReadRepositoryPort;
  githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
}>;

export type ReaderSummaryProductionRecoveryRuntimePoolConfigs = Readonly<{
  productionRuntimePoolConfig: PostgresRuntimePoolConfig;
  sourceRuntimePoolConfig: PostgresRuntimePoolConfig;
}>;

export type ReaderSummaryProductionRecoveryPhaseOptions<
  SourceSummaryConnection extends ReaderSummaryProductionRecoveryScopeDiscoveryClient &
    CloseableConnection,
  SourceFeedConnection extends CloseableConnection,
  ProductionSummaryConnection extends ReaderSummaryProductionRecoverySessionConfigurationClient &
    CloseableConnection,
  Result,
> = Readonly<{
  env: ScopeEnv;
  createSourceSummaryConnection(): Promise<SourceSummaryConnection>;
  createSourceFeedConnection(): Promise<SourceFeedConnection>;
  createProductionSummaryConnection(): Promise<ProductionSummaryConnection>;
  discoverScope(
    sourceSummaryConnection: SourceSummaryConnection,
  ): Promise<ReaderSummaryProductionRecoveryScope>;
  createProductionAuthority(
    productionSummaryConnection: ProductionSummaryConnection,
  ): ReaderSummaryProductionRecoveryAuthorityPort;
  createSourceFeedItems(
    sourceFeedConnection: SourceFeedConnection,
  ): FeedItemReadRepositoryPort;
  createSourceGitHubProjectionReader(
    sourceSummaryConnection: SourceSummaryConnection,
  ): ReaderSummaryGitHubProjectionReaderPort;
  runProduction(params: {
    readonly sourceSnapshot: ReaderSummaryProductionRecoverySourceSnapshot;
    readonly productionSummaryConnection: ProductionSummaryConnection;
  }): Promise<Result>;
}>;

export const resolveReaderSummaryProductionRecoveryScope = async (params: {
  readonly env: ScopeEnv;
  readonly discover: () => Promise<ReaderSummaryProductionRecoveryScope>;
}): Promise<ReaderSummaryProductionRecoveryScope> => {
  const tenantId = readEnvValue(params.env, tenantScopeEnvName);
  const workspaceId = readEnvValue(params.env, workspaceScopeEnvName);
  if (tenantId !== undefined && workspaceId !== undefined) {
    return { tenantId, workspaceId };
  }
  return params.discover();
};

export const resolveReaderSummaryProductionRecoverySourceDatabaseUrl = (
  params: Readonly<{
    env: ScopeEnv;
    productionDatabaseUrl: string;
  }>,
): string =>
  readEnvValue(params.env, sourceDatabaseEnvName) ?? params.productionDatabaseUrl;

export const resolveReaderSummaryProductionRecoveryRuntimePoolConfigs = (
  params: Readonly<{
    env: NodeJS.ProcessEnv;
    sourceDatabaseUrl: string;
    resolveRuntimePoolConfig: RuntimePoolConfigResolver;
  }>,
): ReaderSummaryProductionRecoveryRuntimePoolConfigs => {
  const productionRuntimePoolConfig = params.resolveRuntimePoolConfig(
    params.env,
  );
  if (params.sourceDatabaseUrl !== productionRuntimePoolConfig.connectionString) {
    throw new Error(
      `${sourceDatabaseEnvName} must match DATABASE_URL when reader summary production recovery runs inside the shared PostgreSQL runtime pool process`,
    );
  }
  return {
    productionRuntimePoolConfig,
    sourceRuntimePoolConfig: productionRuntimePoolConfig,
  };
};

export const discoverReaderSummaryProductionRecoveryScope = async (
  client: ReaderSummaryProductionRecoveryScopeDiscoveryClient,
): Promise<ReaderSummaryProductionRecoveryScope> => {
  const rows = await client.$queryRaw<readonly ScopeDiscoveryRow[]>`
    WITH expected("utcDate", "providerKey", "expectedCount") AS (
      VALUES
        (DATE '2026-07-23', 'github-trending-page', 0),
        (DATE '2026-07-23', 'hacker-news', 100),
        (DATE '2026-07-23', 'reddit', 100),
        (DATE '2026-07-23', 'rss', 75),
        (DATE '2026-07-23', 'x-twitter', 67),
        (DATE '2026-07-24', 'github-trending-page', 10),
        (DATE '2026-07-24', 'hacker-news', 100),
        (DATE '2026-07-24', 'reddit', 100),
        (DATE '2026-07-24', 'rss', 67),
        (DATE '2026-07-24', 'x-twitter', 73),
        (DATE '2026-07-25', 'github-trending-page', 10),
        (DATE '2026-07-25', 'hacker-news', 100),
        (DATE '2026-07-25', 'reddit', 100),
        (DATE '2026-07-25', 'rss', 62),
        (DATE '2026-07-25', 'x-twitter', 96),
        (DATE '2026-07-26', 'github-trending-page', 10),
        (DATE '2026-07-26', 'hacker-news', 78),
        (DATE '2026-07-26', 'reddit', 100),
        (DATE '2026-07-26', 'rss', 59),
        (DATE '2026-07-26', 'x-twitter', 94)
    ),
    scopes AS (
      SELECT DISTINCT feed."tenant_id", feed."workspace_id"
      FROM "feed_items" AS feed
      WHERE upper(feed."status"::TEXT) = 'VISIBLE'
        AND feed."published_at" >=
          (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."published_at" <
          (DATE '2026-07-27'::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."provider_key" = ANY(ARRAY[
          'github-trending-page',
          'hacker-news',
          'reddit',
          'rss',
          'x-twitter'
        ])
    ),
    exact_counts AS (
      SELECT
        scope."tenant_id",
        scope."workspace_id",
        expected."utcDate",
        expected."providerKey"
      FROM scopes AS scope
      CROSS JOIN expected
      LEFT JOIN "feed_items" AS feed
        ON feed."tenant_id" = scope."tenant_id"
        AND feed."workspace_id" = scope."workspace_id"
        AND upper(feed."status"::TEXT) = 'VISIBLE'
        AND feed."provider_key" = expected."providerKey"
        AND (feed."published_at" AT TIME ZONE 'UTC')::DATE =
          expected."utcDate"
      GROUP BY
        scope."tenant_id",
        scope."workspace_id",
        expected."utcDate",
        expected."providerKey",
        expected."expectedCount"
      HAVING count(feed."id") = expected."expectedCount"
    )
    SELECT
      exact."tenant_id"::TEXT AS "tenantId",
      exact."workspace_id"::TEXT AS "workspaceId"
    FROM exact_counts AS exact
    GROUP BY exact."tenant_id", exact."workspace_id"
    HAVING count(*) = 20
    ORDER BY "tenantId", "workspaceId"
  `;
  if (rows.length !== 1 || rows[0] === undefined) {
    const diagnostics =
      await readReaderSummaryProductionRecoveryScopeDiagnostics(client);
    throw new Error(
      `Reader summary production recovery scope discovery expected exactly one scope, found ${rows.length}; ${JSON.stringify({
        scope_diagnostics: diagnostics.map((row) => ({
          timestamp_column: row.timestamp_column,
          tenant_sha256_12: row.tenant_sha256_12,
          workspace_sha256_12: row.workspace_sha256_12,
          utc_date: row.utc_date,
          provider_key: row.provider_key,
          normalized_status: row.normalized_status,
          count: Number(row.count),
        })),
      })}`,
    );
  }
  return {
    tenantId: rows[0].tenantId,
    workspaceId: rows[0].workspaceId,
  };
};

const readReaderSummaryProductionRecoveryScopeDiagnostics = (
  client: ReaderSummaryProductionRecoveryScopeDiscoveryClient,
): Promise<readonly ScopeDiagnosticsRow[]> =>
  client.$queryRaw<readonly ScopeDiagnosticsRow[]>`
    SELECT
      diagnostics."timestamp_column",
      diagnostics."tenant_sha256_12",
      diagnostics."workspace_sha256_12",
      diagnostics."utc_date",
      diagnostics."provider_key",
      diagnostics."normalized_status",
      diagnostics."count"
    FROM (
      SELECT 'observed_at'::TEXT AS "timestamp_column",
        left(encode(sha256(convert_to(feed."tenant_id"::TEXT, 'UTF8')), 'hex'), 12) AS "tenant_sha256_12",
        left(encode(sha256(convert_to(feed."workspace_id"::TEXT, 'UTF8')), 'hex'), 12) AS "workspace_sha256_12",
        (feed."observed_at" AT TIME ZONE 'UTC')::DATE::TEXT AS "utc_date",
        feed."provider_key"::TEXT AS "provider_key",
        COALESCE(upper(feed."status"::TEXT), 'UNKNOWN') AS "normalized_status",
        count(*)::INTEGER AS "count"
      FROM "feed_items" AS feed
      WHERE feed."observed_at" >= (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."observed_at" < (DATE '2026-07-27'::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."provider_key" = ANY(ARRAY['github-trending-page','hacker-news','reddit','rss','x-twitter'])
      GROUP BY 1, 2, 3, 4, 5, 6
      UNION ALL
      SELECT 'created_at'::TEXT AS "timestamp_column",
        left(encode(sha256(convert_to(feed."tenant_id"::TEXT, 'UTF8')), 'hex'), 12) AS "tenant_sha256_12",
        left(encode(sha256(convert_to(feed."workspace_id"::TEXT, 'UTF8')), 'hex'), 12) AS "workspace_sha256_12",
        (feed."created_at" AT TIME ZONE 'UTC')::DATE::TEXT AS "utc_date",
        feed."provider_key"::TEXT AS "provider_key",
        COALESCE(upper(feed."status"::TEXT), 'UNKNOWN') AS "normalized_status",
        count(*)::INTEGER AS "count"
      FROM "feed_items" AS feed
      WHERE feed."created_at" >= (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."created_at" < (DATE '2026-07-27'::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."provider_key" = ANY(ARRAY['github-trending-page','hacker-news','reddit','rss','x-twitter'])
      GROUP BY 1, 2, 3, 4, 5, 6
      UNION ALL
      SELECT 'published_at'::TEXT AS "timestamp_column",
        left(encode(sha256(convert_to(feed."tenant_id"::TEXT, 'UTF8')), 'hex'), 12) AS "tenant_sha256_12",
        left(encode(sha256(convert_to(feed."workspace_id"::TEXT, 'UTF8')), 'hex'), 12) AS "workspace_sha256_12",
        (feed."published_at" AT TIME ZONE 'UTC')::DATE::TEXT AS "utc_date",
        feed."provider_key"::TEXT AS "provider_key",
        COALESCE(upper(feed."status"::TEXT), 'UNKNOWN') AS "normalized_status",
        count(*)::INTEGER AS "count"
      FROM "feed_items" AS feed
      WHERE feed."published_at" >= (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."published_at" < (DATE '2026-07-27'::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."provider_key" = ANY(ARRAY['github-trending-page','hacker-news','reddit','rss','x-twitter'])
      GROUP BY 1, 2, 3, 4, 5, 6
    ) AS diagnostics
    ORDER BY
      diagnostics."timestamp_column",
      diagnostics."tenant_sha256_12",
      diagnostics."workspace_sha256_12",
      diagnostics."utc_date",
      diagnostics."provider_key",
      diagnostics."normalized_status",
      diagnostics."count"
  `;

export const configureProductionRecoverySession = async (
  client: ReaderSummaryProductionRecoverySessionConfigurationClient,
  scope: ReaderSummaryProductionRecoveryScope,
): Promise<void> => {
  await client.$queryRaw<readonly unknown[]>`
    SELECT
      set_config('social_monitor.tenant_id', ${scope.tenantId}, false),
      set_config('social_monitor.workspace_id', ${scope.workspaceId}, false),
      set_config('social_monitor.system_access', 'false', false)
  `;
};

export const runReaderSummaryProductionRecoveryPhases = async <
  SourceSummaryConnection extends ReaderSummaryProductionRecoveryScopeDiscoveryClient &
    CloseableConnection,
  SourceFeedConnection extends CloseableConnection,
  ProductionSummaryConnection extends ReaderSummaryProductionRecoverySessionConfigurationClient &
    CloseableConnection,
  Result,
>(
  options: ReaderSummaryProductionRecoveryPhaseOptions<
    SourceSummaryConnection,
    SourceFeedConnection,
    ProductionSummaryConnection,
    Result
  >,
): Promise<Result> => {
  const productionSummaryConnection =
    await options.createProductionSummaryConnection();
  let sourceSummaryConnection: SourceSummaryConnection | undefined;
  try {
    const recoveryScope = await resolveReaderSummaryProductionRecoveryScope({
      env: options.env,
      discover: async () => {
        sourceSummaryConnection =
          await options.createSourceSummaryConnection();
        return options.discoverScope(sourceSummaryConnection);
      },
    });
    await configureProductionRecoverySession(
      productionSummaryConnection,
      recoveryScope,
    );
    const productionAuthority = options.createProductionAuthority(
      productionSummaryConnection,
    );
    const prepared = await productionAuthority.prepare();
    const binding = productionAuthority.readVerifiedBinding(
      prepared.authority,
    );
    assertRecoveryScopeMatchesProductionAuthority(recoveryScope, binding);
    const sourceSummaryConnectionForSnapshot = sourceSummaryConnection;
    sourceSummaryConnection = undefined;
    const sourceSnapshot =
      await prepareReaderSummaryProductionRecoverySourceSnapshot(options, {
        scope: recoveryScope,
        prepared,
        binding,
        sourceSummaryConnection: sourceSummaryConnectionForSnapshot,
      });
    return await options.runProduction({
      sourceSnapshot,
      productionSummaryConnection,
    });
  } finally {
    await sourceSummaryConnection?.close();
    await productionSummaryConnection.close();
  }
};

export const createReaderSummaryProductionRecoveryGitHubProjectionSnapshot =
  async (params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly sourceReader: ReaderSummaryGitHubProjectionReaderPort;
  }): Promise<ReaderSummaryGitHubProjectionReaderPort> => {
    const snapshots: GitHubProjectionSnapshot[] = [];
    for (const day of params.binding.days) {
      if (day.githubEvidence.mode !== "verified_existing") {
        continue;
      }
      const query = githubProjectionQueryForRecoveryDay({
        binding: params.binding,
        dayStartedAt: new Date(day.period.startedAt),
        dayEndedAt: new Date(day.period.endedAt),
        observedThrough: new Date(params.binding.lease.consumedAt),
      });
      snapshots.push({
        tenantId: params.binding.tenantId,
        workspaceId: params.binding.workspaceId,
        dayStartedAt: query.dayStartedAt,
        dayEndedAt: query.dayEndedAt,
        result: cloneGitHubProjectionResult(
          await params.sourceReader.read(query),
        ),
      });
    }
    return new ReaderSummaryProductionRecoveryGitHubProjectionSnapshotReader(
      snapshots,
    );
  };

async function main(): Promise<void> {
  const { loadDotenvIfPresent } = await import("./lib/env-file");
  loadDotenvIfPresent(".env");

  if (!process.argv.slice(2).includes("--apply")) {
    throw new Error("Pass --apply to run Jul23-Jul26 production recovery");
  }
  const productionDatabaseUrl = requiredEnv("DATABASE_URL");
  const sourceDatabaseUrl =
    resolveReaderSummaryProductionRecoverySourceDatabaseUrl({
      env: process.env,
      productionDatabaseUrl,
    });
  const agentRuntimeAddress = requiredEnv("AGENT_RUNTIME_GRPC_ADDRESS");
  const {
    resolvePostgresRuntimePoolConfig,
    runWithSystemDatabaseAccess,
    runWithTenantDatabaseAccess,
  } = await import("@social-monitor/platform-persistence");
  const { PrismaFeedConnection } = await import(
    "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection"
  );
  const { PrismaFeedItemReadRepository } = await import(
    "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository"
  );
  const { AgentRuntimeReaderSummaryModelAdapter } = await import(
    "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter"
  );
  const { GrpcAgentRuntimeClient } = await import(
    "@social-monitor/summary/adapters/model/grpc-agent-runtime-client"
  );
  const { PrismaReaderSummaryGitHubProjectionReader } = await import(
    "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-github-projection.reader"
  );
  const { PrismaReaderSummaryProductionRecoveryAuthority } = await import(
    "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority"
  );
  const { PrismaReaderSummaryRecoveryFinalization } = await import(
    "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-recovery-finalization"
  );
  const { PrismaSummaryConnection } = await import(
    "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection"
  );
  const { CryptoIdGenerator, SystemClock } = await import(
    "@social-monitor/shared-kernel"
  );
  const { READER_SUMMARY_PRODUCTION_RUNTIME_POLICY } = await import(
    "./lib/reader-summary-production-runtime-policy"
  );
  const {
    createProductionRecoveryDayExecutor,
    runReaderSummaryProductionRecovery,
  } = await import("./lib/reader-summary-production-recovery-cli");
  const {
    PrismaReaderSummaryProductionRecoveryExecutionGuard,
  } = await import("./lib/reader-summary-production-recovery-replay-guard");
  const clock = new SystemClock();
  const { productionRuntimePoolConfig, sourceRuntimePoolConfig } =
    resolveReaderSummaryProductionRecoveryRuntimePoolConfigs({
      env: process.env,
      sourceDatabaseUrl,
      resolveRuntimePoolConfig: resolvePostgresRuntimePoolConfig,
    });

  const result = await runReaderSummaryProductionRecoveryPhases({
    env: process.env,
    createSourceSummaryConnection: () =>
      PrismaSummaryConnection.create(sourceRuntimePoolConfig),
    createSourceFeedConnection: () =>
      PrismaFeedConnection.create(sourceRuntimePoolConfig),
    createProductionSummaryConnection: () =>
      PrismaSummaryConnection.create(productionRuntimePoolConfig),
    discoverScope: (sourceSummary) =>
      runWithSystemDatabaseAccess(
        "reader summary production recovery scope discovery",
        () =>
          discoverReaderSummaryProductionRecoveryScope(
            sourceSummary,
          ),
      ),
    createProductionAuthority: (productionSummary) =>
      new PrismaReaderSummaryProductionRecoveryAuthority(productionSummary),
    createSourceFeedItems: (feedConnection) =>
      new PrismaFeedItemReadRepository(feedConnection),
    createSourceGitHubProjectionReader: (sourceSummary) =>
      new PrismaReaderSummaryGitHubProjectionReader(sourceSummary),
    runProduction: async ({
      sourceSnapshot,
      productionSummaryConnection,
    }) => {
      const agentRuntimeClient = GrpcAgentRuntimeClient.connect({
        address: agentRuntimeAddress,
        clock,
        options: {
          timeoutMs:
            READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs,
          serviceToken: readEnv("AGENT_RUNTIME_SERVICE_TOKEN"),
        },
      });
      return runWithTenantDatabaseAccess(sourceSnapshot.scope, () =>
        runReaderSummaryProductionRecovery({
          apply: true,
          authority: sourceSnapshot.authority,
          executionGuard: new PrismaReaderSummaryProductionRecoveryExecutionGuard(
            productionSummaryConnection,
          ),
          executeDay: createProductionRecoveryDayExecutor({
            model: new AgentRuntimeReaderSummaryModelAdapter({
              client: agentRuntimeClient,
              agentProvider: "codex",
              model: "gpt-5.5",
              reasoningEffort: "xhigh",
              timeoutMs:
                READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs,
            }),
            finalization: new PrismaReaderSummaryRecoveryFinalization(
              productionSummaryConnection,
            ),
            feedItems: sourceSnapshot.feedItems,
            githubProjectionReader: sourceSnapshot.githubProjectionReader,
            ids: new CryptoIdGenerator(),
            clock,
          }),
        }),
      );
    },
  });

  console.log(`outcome=${result.outcome}`);
  console.log(`recovery=${result.plan.recoveryId}`);
  for (const day of result.dayResults) {
    console.log(
      [
        `date=${day.requestedUtcDate}`,
        `outcome=${day.outcome}`,
        day.readerSummaryJobId === undefined
          ? undefined
          : `job=${day.readerSummaryJobId}`,
        day.readerSummaryId === undefined
          ? undefined
          : `artifact=${day.readerSummaryId}`,
      ]
        .filter((part): part is string => part !== undefined)
        .join(" "),
    );
  }
}

const prepareReaderSummaryProductionRecoverySourceSnapshot = async <
  SourceSummaryConnection extends ReaderSummaryProductionRecoveryScopeDiscoveryClient &
    CloseableConnection,
  SourceFeedConnection extends CloseableConnection,
  ProductionSummaryConnection extends ReaderSummaryProductionRecoverySessionConfigurationClient &
    CloseableConnection,
  Result,
>(
  options: ReaderSummaryProductionRecoveryPhaseOptions<
    SourceSummaryConnection,
    SourceFeedConnection,
    ProductionSummaryConnection,
    Result
  >,
  authority: Readonly<{
    scope: ReaderSummaryProductionRecoveryScope;
    prepared: PrepareReaderSummaryProductionRecoveryResult;
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    sourceSummaryConnection: SourceSummaryConnection | undefined;
  }>,
): Promise<ReaderSummaryProductionRecoverySourceSnapshot> => {
  const scope = authority.scope;
  let sourceSummaryConnection = authority.sourceSummaryConnection;
  let sourceFeedConnection: SourceFeedConnection | undefined;
  if (authority.prepared.outcome === "replayed") {
    try {
      return sourceSnapshotFromPreparedAuthority({
        scope,
        prepared: authority.prepared,
        binding: authority.binding,
        feedItems: new UnavailableSourceSnapshotFeedItemReadRepository(),
        githubProjectionReader:
          new ReaderSummaryProductionRecoveryGitHubProjectionSnapshotReader([]),
      });
    } finally {
      await sourceSummaryConnection?.close();
    }
  }
  try {
    sourceSummaryConnection ??=
      await options.createSourceSummaryConnection();
    sourceFeedConnection = await options.createSourceFeedConnection();
    const feedItems = await createSourceSnapshotFeedItems({
      binding: authority.binding,
      sourceFeedItems: options.createSourceFeedItems(sourceFeedConnection),
    });
    const githubProjectionReader =
      await createReaderSummaryProductionRecoveryGitHubProjectionSnapshot({
        binding: authority.binding,
        sourceReader:
          options.createSourceGitHubProjectionReader(sourceSummaryConnection),
      });
    return sourceSnapshotFromPreparedAuthority({
      scope,
      prepared: authority.prepared,
      binding: authority.binding,
      feedItems,
      githubProjectionReader,
    });
  } finally {
    await sourceFeedConnection?.close();
    await sourceSummaryConnection?.close();
  }
};

const assertRecoveryScopeMatchesProductionAuthority = (
  recoveryScope: ReaderSummaryProductionRecoveryScope,
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): void => {
  if (
    recoveryScope.tenantId !== binding.tenantId ||
    recoveryScope.workspaceId !== binding.workspaceId
  ) {
    throw new Error(
      "Reader summary production recovery session scope diverged from production authority",
    );
  }
};

const sourceSnapshotFromPreparedAuthority = (params: {
  readonly scope: ReaderSummaryProductionRecoveryScope;
  readonly prepared: PrepareReaderSummaryProductionRecoveryResult;
  readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  readonly feedItems: FeedItemReadRepositoryPort;
  readonly githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
}): ReaderSummaryProductionRecoverySourceSnapshot => ({
  scope: params.scope,
  binding: params.binding,
  authority: new ReaderSummaryProductionRecoverySnapshotAuthority(
    params.prepared.outcome,
    params.binding,
  ),
  feedItems: params.feedItems,
  githubProjectionReader: params.githubProjectionReader,
});

const createSourceSnapshotFeedItems = async (params: {
  readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  readonly sourceFeedItems: FeedItemReadRepositoryPort;
}): Promise<FeedItemReadRepositoryPort> => {
  const feedItemIds = [
    ...new Set(
      params.binding.days.flatMap((day) =>
        Object.values(day.providerEvidence).flatMap((rows) =>
          rows
            .filter((row) => row.providerKey !== "github-trending-page")
            .map((row) => row.feedItemId),
        ),
      ),
    ),
  ].sort();
  const sourceContent = await params.sourceFeedItems.readSourceContent?.({
    tenantId: params.binding.tenantId as ReadSourceContentQuery["tenantId"],
    workspaceId:
      params.binding.workspaceId as ReadSourceContentQuery["workspaceId"],
    feedItemIds,
  });
  const sourceContentByFeedItemId = new Map(
    (sourceContent ?? []).map((item) => [item.feedItemId, item] as const),
  );
  const feedItemsById = new Map<string, SnapshotFeedItem>();
  for (const feedItemId of feedItemIds) {
    const feedItem = await params.sourceFeedItems.findById({
      tenantId: params.binding.tenantId as FindFeedItemByIdQuery["tenantId"],
      workspaceId:
        params.binding.workspaceId as FindFeedItemByIdQuery["workspaceId"],
      feedItemId,
    });
    if (feedItem === null) {
      throw new Error(
        `Reader summary production recovery source snapshot missing feed item ${feedItemId}`,
      );
    }
    feedItemsById.set(feedItemId, feedItem);
  }
  return new SourceSnapshotFeedItemReadRepository({
    tenantId: params.binding.tenantId,
    workspaceId: params.binding.workspaceId,
    feedItemsById,
    sourceContentByFeedItemId,
  });
};

class ReaderSummaryProductionRecoverySnapshotAuthority
  implements ReaderSummaryProductionRecoveryAuthorityPort
{
  private readonly handle =
    {} as ReaderSummaryProductionRecoveryAuthorityHandle;

  constructor(
    private readonly outcome: PrepareReaderSummaryProductionRecoveryResult["outcome"],
    private readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  ) {}

  async prepare(): Promise<PrepareReaderSummaryProductionRecoveryResult> {
    return { outcome: this.outcome, authority: this.handle };
  }

  readVerifiedBinding(
    authority: ReaderSummaryProductionRecoveryAuthorityHandle,
  ): ReaderSummaryProductionRecoveryAuthorityBinding {
    if (authority !== this.handle) {
      throw new Error(
        "Reader summary production recovery source snapshot authority handle diverged",
      );
    }
    return this.binding;
  }
}

class SourceSnapshotFeedItemReadRepository
  implements FeedItemReadRepositoryPort
{
  constructor(private readonly input: SourceSnapshotFeedItemReadRepositoryInput) {}

  async list(_query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    void _query;
    throw new Error(
      "Reader summary production recovery source snapshot does not support feed list queries",
    );
  }

  async findById(
    query: FindFeedItemByIdQuery,
  ): Promise<SnapshotFeedItem | null> {
    if (
      query.tenantId !== this.input.tenantId ||
      query.workspaceId !== this.input.workspaceId
    ) {
      return null;
    }
    const feedItem = this.input.feedItemsById.get(query.feedItemId);
    if (feedItem === undefined) {
      return null;
    }
    const observedAt = feedItem.toSnapshot().observedAt;
    if (
      query.observedBefore !== undefined &&
      observedAt.getTime() >= query.observedBefore.getTime()
    ) {
      return null;
    }
    return feedItem;
  }

  async readSourceContent(
    query: ReadSourceContentQuery,
  ): Promise<readonly FeedSourceContentItem[]> {
    if (
      query.tenantId !== this.input.tenantId ||
      query.workspaceId !== this.input.workspaceId
    ) {
      return [];
    }
    return query.feedItemIds.flatMap((feedItemId) => {
      const feedItem = this.input.feedItemsById.get(feedItemId);
      const sourceContent =
        this.input.sourceContentByFeedItemId.get(feedItemId);
      if (feedItem === undefined || sourceContent === undefined) {
        return [];
      }
      const observedAt = feedItem.toSnapshot().observedAt;
      if (
        query.observedBefore !== undefined &&
        observedAt.getTime() >= query.observedBefore.getTime()
      ) {
        return [];
      }
      return [sourceContent];
    });
  }
}

class UnavailableSourceSnapshotFeedItemReadRepository
  implements FeedItemReadRepositoryPort
{
  async list(_query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    void _query;
    return { items: [] };
  }

  async findById(): Promise<null> {
    return null;
  }
}

class ReaderSummaryProductionRecoveryGitHubProjectionSnapshotReader
  implements ReaderSummaryGitHubProjectionReaderPort
{
  private readonly snapshotsByDay = new Map<string, GitHubProjectionSnapshot>();

  constructor(snapshots: readonly GitHubProjectionSnapshot[]) {
    for (const snapshot of snapshots) {
      this.snapshotsByDay.set(
        recoveryUtcDayKey(snapshot.dayStartedAt, snapshot.dayEndedAt),
        snapshot,
      );
    }
  }

  async read(
    query: ReadReaderSummaryGitHubProjectionQuery,
  ): Promise<ReadReaderSummaryGitHubProjectionResult> {
    const dayKey = recoveryUtcDayKey(query.dayStartedAt, query.dayEndedAt);
    if (query.observedThrough.getTime() < query.dayEndedAt.getTime()) {
      throw new Error(
        "Reader summary production recovery GitHub projection snapshot requires observedThrough at or after UTC day end",
      );
    }
    const snapshot = this.snapshotsByDay.get(dayKey);
    if (
      snapshot === undefined ||
      query.tenantId !== snapshot.tenantId ||
      query.workspaceId !== snapshot.workspaceId
    ) {
      return { eligibleBindingIds: [], items: [], pageCount: 0 };
    }
    return cloneGitHubProjectionResult(snapshot.result);
  }
}

const githubProjectionQueryForRecoveryDay = (params: {
  readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  readonly dayStartedAt: Date;
  readonly dayEndedAt: Date;
  readonly observedThrough: Date;
}): ReadReaderSummaryGitHubProjectionQuery => ({
  tenantId: params.binding.tenantId as ReadReaderSummaryGitHubProjectionQuery["tenantId"],
  workspaceId: params.binding.workspaceId as ReadReaderSummaryGitHubProjectionQuery["workspaceId"],
  dayStartedAt: params.dayStartedAt,
  dayEndedAt: params.dayEndedAt,
  observedThrough: params.observedThrough,
});

const recoveryUtcDayKey = (dayStartedAt: Date, dayEndedAt: Date): string => {
  if (
    !Number.isFinite(dayStartedAt.getTime()) ||
    !Number.isFinite(dayEndedAt.getTime())
  ) {
    throw new Error(
      "Reader summary production recovery GitHub projection snapshot requires finite UTC day bounds",
    );
  }
  const dayKey = dayStartedAt.toISOString().slice(0, 10);
  const expectedStart = new Date(`${dayKey}T00:00:00.000Z`);
  const expectedEnd = new Date(
    expectedStart.getTime() + millisecondsPerUtcDay,
  );
  if (
    dayStartedAt.getTime() !== expectedStart.getTime() ||
    dayEndedAt.getTime() !== expectedEnd.getTime()
  ) {
    throw new Error(
      "Reader summary production recovery GitHub projection snapshot requires an exact UTC day",
    );
  }
  return dayKey;
};

const cloneGitHubProjectionResult = (
  result: ReadReaderSummaryGitHubProjectionResult,
): ReadReaderSummaryGitHubProjectionResult => ({
  eligibleBindingIds: [...result.eligibleBindingIds],
  items: result.items.map(cloneGitHubProjectionItem),
  pageCount: result.pageCount,
});

const cloneGitHubProjectionItem = (
  item: ReaderSummaryGitHubProjectionItem,
): ReaderSummaryGitHubProjectionItem => ({
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  sourceBindingId: item.sourceBindingId,
  providerKey: item.providerKey,
  ...(item.metadataKind === undefined ? {} : { metadataKind: item.metadataKind }),
  ...(item.scanJobId === undefined ? {} : { scanJobId: item.scanJobId }),
  canonicalUrl: item.canonicalUrl,
  ...(item.repositoryFullName === undefined
    ? {}
    : { repositoryFullName: item.repositoryFullName }),
  ...(item.rank === undefined ? {} : { rank: item.rank }),
  ...(item.starsGained === undefined ? {} : { starsGained: item.starsGained }),
  ...(item.window === undefined ? {} : { window: item.window }),
  ...(item.fetchStartedAt === undefined
    ? {}
    : { fetchStartedAt: new Date(item.fetchStartedAt) }),
  ...(item.checkedAt === undefined
    ? {}
    : { checkedAt: new Date(item.checkedAt) }),
  publishedAt: new Date(item.publishedAt),
  observedAt: new Date(item.observedAt),
  sourceContentHash: item.sourceContentHash,
  sourceProviderContentHash: item.sourceProviderContentHash,
});

function requiredEnv(name: string): string {
  const value = readEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readEnv(name: string): string | undefined {
  return readEnvValue(process.env, name);
}

function readEnvValue(env: ScopeEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

if (require.main === module) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Reader summary production recovery failed: ${message}`);
    process.exitCode = 1;
  });
}
