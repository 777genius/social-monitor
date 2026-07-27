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

type ScopeDiscoveryRow = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

type ScopeEnv = Readonly<Record<string, string | undefined>>;

const tenantScopeEnvName = "READER_SUMMARY_PRODUCTION_RECOVERY_TENANT_ID";
const workspaceScopeEnvName = "READER_SUMMARY_PRODUCTION_RECOVERY_WORKSPACE_ID";

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

export const discoverReaderSummaryProductionRecoveryScope = async (
  client: ReaderSummaryProductionRecoveryScopeDiscoveryClient,
): Promise<ReaderSummaryProductionRecoveryScope> => {
  const rows = await client.$queryRaw<readonly ScopeDiscoveryRow[]>`
    SELECT DISTINCT
      feed."tenant_id"::TEXT AS "tenantId",
      feed."workspace_id"::TEXT AS "workspaceId"
    FROM "feed_items" AS feed
    JOIN "source_items" AS source
      ON source."id" = feed."source_item_id"
      AND source."tenant_id" = feed."tenant_id"
      AND source."workspace_id" = feed."workspace_id"
      AND source."source_binding_id" = feed."source_binding_id"
      AND source."provider_key" = feed."provider_key"
      AND source."canonical_url" = feed."canonical_url"
    JOIN "tenants" AS tenant
      ON tenant."id" = feed."tenant_id"
      AND tenant."deleted_at" IS NULL
    JOIN "workspaces" AS workspace
      ON workspace."id" = feed."workspace_id"
      AND workspace."tenant_id" = feed."tenant_id"
      AND workspace."deleted_at" IS NULL
    WHERE feed."status" = 'VISIBLE'
      AND feed."provider_key" = ANY(ARRAY[
        'github-trending-page',
        'hacker-news',
        'reddit',
        'rss',
        'x-twitter'
      ])
      AND feed."observed_at" >=
        (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
      AND feed."observed_at" <
        (DATE '2026-07-26'::TIMESTAMP AT TIME ZONE 'UTC')
    ORDER BY feed."tenant_id", feed."workspace_id"
  `;
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error(
      `Reader summary production recovery scope discovery expected exactly one scope, found ${rows.length}`,
    );
  }
  return {
    tenantId: rows[0].tenantId,
    workspaceId: rows[0].workspaceId,
  };
};

async function main(): Promise<void> {
  const { loadDotenvIfPresent } = await import("./lib/env-file");
  loadDotenvIfPresent(".env");

  if (!process.argv.slice(2).includes("--apply")) {
    throw new Error("Pass --apply to run Jul23/Jul24 production recovery");
  }
  const databaseUrl = requiredEnv("DATABASE_URL");
  const agentRuntimeAddress = requiredEnv("AGENT_RUNTIME_GRPC_ADDRESS");
  const {
    defaultPostgresRuntimePoolConfig,
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
  const clock = new SystemClock();
  const runtimePoolConfig = defaultPostgresRuntimePoolConfig(
    databaseUrl,
    "admin-tool",
  );
  const summaryConnection =
    await PrismaSummaryConnection.create(runtimePoolConfig);

  try {
    const scope = await resolveReaderSummaryProductionRecoveryScope({
      env: process.env,
      discover: () =>
        runWithSystemDatabaseAccess(
          "reader summary production recovery scope discovery",
          () => discoverReaderSummaryProductionRecoveryScope(summaryConnection),
        ),
    });
    const feedConnection = await PrismaFeedConnection.create(runtimePoolConfig);
    try {
      const agentRuntimeClient = GrpcAgentRuntimeClient.connect({
        address: agentRuntimeAddress,
        clock,
        options: {
          timeoutMs:
            READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs,
          serviceToken: readEnv("AGENT_RUNTIME_SERVICE_TOKEN"),
        },
      });
      const result = await runWithTenantDatabaseAccess(scope, () =>
        runReaderSummaryProductionRecovery({
          apply: true,
          authority: new PrismaReaderSummaryProductionRecoveryAuthority(
            summaryConnection,
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
              summaryConnection,
            ),
            feedItems: new PrismaFeedItemReadRepository(feedConnection),
            githubProjectionReader:
              new PrismaReaderSummaryGitHubProjectionReader(
                summaryConnection,
              ),
            ids: new CryptoIdGenerator(),
            clock,
          }),
        }),
      );
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
    } finally {
      await feedConnection.close();
    }
  } finally {
    await summaryConnection.close();
  }
}

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
