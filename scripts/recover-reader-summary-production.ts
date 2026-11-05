import type {
  FeedItemReadRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
} from "@social-monitor/feed/ports";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReadReaderSummaryGitHubProjectionQuery,
  ReadReaderSummaryGitHubProjectionResult,
} from "@social-monitor/summary/ports";
import type { ReaderSummaryGitHubProjectionItem } from "@social-monitor/summary/domain";
import {
  verifyPersistedProductionRecoveryAuthority,
} from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority-row";

import {
  isReaderSummaryProductionRecoveryGapDate,
  parseReaderSummaryProductionRecoveryCliArguments,
  type ReaderSummaryProductionRecoveryDate,
  type ReaderSummaryProductionRecoveryDayExecutor,
} from "./lib/reader-summary-production-recovery-cli";
import type {
  ReaderSummaryProductionRecoveryGapAuthorityBinding,
  ReaderSummaryProductionRecoveryGapDate,
} from "./lib/reader-summary-production-recovery-gap-authority";

type QueryClient = Readonly<{
  $queryRaw<T = unknown>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T>;
}>;

export const limitRecoveryAgentRuntimeToOneCall = (
  client: AgentRuntimeClientPort,
  enabled = true,
): AgentRuntimeClientPort => {
  if (!enabled) return client;
  let called = false;
  return {
    runTask: async (command) => {
      if (called) {
        throw new Error(
          "Reader summary production recovery gap permits one model call per date",
        );
      }
      called = true;
      return client.runTask(command);
    },
    checkHealth: client.checkHealth.bind(client),
  };
};

type PersistedAuthorityProofRow = Readonly<{
  authorityCount: number;
  selectedDayCount: number;
  dryRunCount: number;
  dryRunBytesEqual: boolean;
  dryRunHashesEqual: boolean;
  dryRunAuthorityHashesEqual: boolean;
  dryRunBytesHashValid: boolean;
  authorityBytesHashValid: boolean;
}>;

type PersistedAuthorityRow = Readonly<{
  requestHash: string;
  responsePayload: unknown;
}>;

export type ReaderSummaryProductionRecoveryScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

const canonicalTenantId = "00000000-0000-7000-8000-000000000901";
const canonicalWorkspaceId = "00000000-0000-7000-8000-000000000902";
const tenantScopeEnvName =
  "READER_SUMMARY_PRODUCTION_RECOVERY_TENANT_ID";
const workspaceScopeEnvName =
  "READER_SUMMARY_PRODUCTION_RECOVERY_WORKSPACE_ID";

export const resolveReaderSummaryProductionRecoveryScope = (
  env: Readonly<Record<string, string | undefined>>,
): ReaderSummaryProductionRecoveryScope => {
  const tenantId = readEnvValue(env, tenantScopeEnvName);
  const workspaceId = readEnvValue(env, workspaceScopeEnvName);
  if ((tenantId === undefined) !== (workspaceId === undefined)) {
    throw new Error(
      "Reader summary production recovery tenant/workspace scope must be supplied together",
    );
  }
  const scope = {
    tenantId: tenantId ?? canonicalTenantId,
    workspaceId: workspaceId ?? canonicalWorkspaceId,
  };
  if (
    scope.tenantId !== canonicalTenantId ||
    scope.workspaceId !== canonicalWorkspaceId
  ) {
    throw new Error(
      "Reader summary production recovery scope is not the reviewed production scope",
    );
  }
  return scope;
};

export const configureProductionRecoverySession = async (
  client: QueryClient,
  scope: ReaderSummaryProductionRecoveryScope,
): Promise<void> => {
  const rows = await client.$queryRaw<
    readonly { configured: boolean }[]
  >`
    SELECT
      set_config(
        'social_monitor.tenant_id',
        ${scope.tenantId},
        false
      ) = ${scope.tenantId}
      AND set_config(
        'social_monitor.workspace_id',
        ${scope.workspaceId},
        false
      ) = ${scope.workspaceId}
      AND set_config(
        'social_monitor.database_access_mode',
        'tenant',
        false
      ) = 'tenant' AS "configured"
  `;
  if (rows.length !== 1 || rows[0]?.configured !== true) {
    throw new Error(
      "Reader summary production recovery tenant session was not configured",
    );
  }
};

export const assertPersistedReaderSummaryProductionRecoveryAuthority =
  async (
    client: QueryClient,
    params: Readonly<{
      scope: ReaderSummaryProductionRecoveryScope;
      dates: readonly ReaderSummaryProductionRecoveryDate[];
    }>,
  ): Promise<void> => {
    const rows = await client.$queryRaw<
      readonly PersistedAuthorityProofRow[]
    >`
      WITH selected AS (
        SELECT value::DATE AS "requestedUtcDate"
        FROM jsonb_array_elements_text(
          ${JSON.stringify(params.dates)}::jsonb
        )
      ),
      authority AS (
        SELECT lease.*
        FROM "reader_summary_production_recovery_leases" AS lease
        WHERE lease."tenant_id" = ${params.scope.tenantId}::uuid
          AND lease."workspace_id" = ${params.scope.workspaceId}::uuid
          AND lease."state" = 'CONSUMED'
          AND lease."consumed_at" IS NOT NULL
          AND lease."canonical_record"->>'schemaVersion' =
            'reader_summary.production_recovery_authority.v2'
          AND lease."canonical_record"->'requestedUtcDates' =
            '[
              "2026-07-23",
              "2026-07-24",
              "2026-07-25",
              "2026-07-26",
              "2026-07-27",
              "2026-07-28"
            ]'::jsonb
          AND lease."canonical_record"->'boundaries' =
            jsonb_build_object(
              'stage', 'pre_model',
              'modelCallPerformed', false,
              'publicationPerformed', false,
              'recollectionPerformed', false
            )
          AND NOT EXISTS (
            SELECT 1
            FROM selected
            WHERE NOT (
              lease."canonical_record"->'requestedUtcDates' @>
                to_jsonb(ARRAY[selected."requestedUtcDate"::TEXT])
            )
          )
        ORDER BY lease."id"
      ),
      selected_days AS (
        SELECT day.*
        FROM authority
        JOIN "reader_summary_production_recovery_days" AS day
          ON day."recovery_id" = authority."id"
          AND day."tenant_id" = authority."tenant_id"
          AND day."workspace_id" = authority."workspace_id"
        JOIN selected
          ON selected."requestedUtcDate" = day."requested_utc_date"
      ),
      dry_runs AS (
        SELECT dry.*
        FROM authority
        JOIN "reader_summary_production_recovery_dry_runs" AS dry
          ON dry."recovery_id" = authority."id"
          AND dry."tenant_id" = authority."tenant_id"
          AND dry."workspace_id" = authority."workspace_id"
        WHERE dry."ordinal" IN (1, 2)
      )
      SELECT
        (SELECT count(*)::INTEGER FROM authority) AS "authorityCount",
        (SELECT count(*)::INTEGER FROM selected_days) AS
          "selectedDayCount",
        (SELECT count(*)::INTEGER FROM dry_runs) AS "dryRunCount",
        (
          SELECT count(DISTINCT encode("canonical_bytes", 'hex')) = 1
          FROM dry_runs
        ) AS "dryRunBytesEqual",
        (
          SELECT count(DISTINCT btrim("canonical_sha256")) = 1
          FROM dry_runs
        ) AS "dryRunHashesEqual",
        (
          SELECT bool_and(
            btrim(dry_runs."canonical_sha256") =
              btrim(authority."canonical_sha256")
          )
          FROM dry_runs
          JOIN authority
            ON authority."id" = dry_runs."recovery_id"
        ) AS "dryRunAuthorityHashesEqual",
        (
          SELECT bool_and(
            encode(sha256("canonical_bytes"), 'hex') =
              btrim("canonical_sha256")
          )
          FROM dry_runs
        ) AS "dryRunBytesHashValid",
        (
          SELECT bool_and(
            encode(sha256("canonical_bytes"), 'hex') =
              btrim("canonical_sha256")
          )
          FROM authority
        ) AS "authorityBytesHashValid"
    `;
    const proof = rows[0];
    if (
      rows.length !== 1 ||
      proof?.authorityCount !== 1 ||
      proof.selectedDayCount !== params.dates.length ||
      proof.dryRunCount !== 2 ||
      !proof.dryRunBytesEqual ||
      !proof.dryRunHashesEqual ||
      !proof.dryRunAuthorityHashesEqual ||
      !proof.dryRunBytesHashValid ||
      !proof.authorityBytesHashValid
    ) {
      throw new Error(
        "Reader summary production recovery requires two byte-identical persisted pre-AI dry-run plans for every selected date",
      );
    }
  };

export const loadPersistedReaderSummaryProductionRecoveryAuthority =
  async (
    client: QueryClient,
    scope: ReaderSummaryProductionRecoveryScope,
  ): Promise<ReaderSummaryProductionRecoveryAuthorityBinding> => {
    const rows = await client.$queryRaw<
      readonly PersistedAuthorityRow[]
    >`
      WITH target AS (
        SELECT lease.*
        FROM "reader_summary_production_recovery_leases" AS lease
        WHERE lease."tenant_id" = ${scope.tenantId}::uuid
          AND lease."workspace_id" = ${scope.workspaceId}::uuid
          AND lease."canonical_record"->>'schemaVersion' =
            'reader_summary.production_recovery_authority.v2'
          AND lease."canonical_record"->'requestedUtcDates' =
            '[
              "2026-07-23",
              "2026-07-24",
              "2026-07-25",
              "2026-07-26",
              "2026-07-27",
              "2026-07-28"
            ]'::jsonb
        ORDER BY lease."id"
      )
      SELECT
        btrim(lease."canonical_sha256") AS "requestHash",
        jsonb_build_object(
          'schemaVersion',
            'reader_summary.production_recovery_authority.v2',
          'recoveryId', lease."id"::TEXT,
          'identity', lease."identity",
          'tenantId', lease."tenant_id"::TEXT,
          'workspaceId', lease."workspace_id"::TEXT,
          'requestedUtcDates',
            lease."canonical_record"->'requestedUtcDates',
          'canonicalSha256', btrim(lease."canonical_sha256"),
          'dryRunCanonicalSha256s', (
            SELECT jsonb_agg(
              btrim(dry."canonical_sha256")
              ORDER BY dry."ordinal"
            )
            FROM "reader_summary_production_recovery_dry_runs" AS dry
            WHERE dry."recovery_id" = lease."id"
              AND dry."tenant_id" = lease."tenant_id"
              AND dry."workspace_id" = lease."workspace_id"
          ),
          'lease', jsonb_build_object(
            'state', lease."state",
            'issuedAt', to_char(
              lease."issued_at" AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'consumedAt', to_char(
              lease."consumed_at" AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          ),
          'boundaries', lease."canonical_record"->'boundaries',
          'days', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'schemaVersion',
                  day."canonical_record"->>'schemaVersion',
                'identity', day."identity",
                'requestedUtcDate',
                  to_char(day."requested_utc_date", 'YYYY-MM-DD'),
                'period', day."canonical_record"->'period',
                'providerCounts', day."provider_counts",
                'providerEvidence', day."provider_evidence",
                'providerEvidenceSha256',
                  btrim(day."provider_evidence_sha256"),
                'githubEvidence', day."github_evidence",
                'canonicalSha256', btrim(day."canonical_sha256"),
                'planSha256s', plan.entry->'planSha256s'
              )
              ORDER BY day."requested_utc_date"
            )
            FROM "reader_summary_production_recovery_days" AS day
            JOIN LATERAL (
              SELECT entry
              FROM jsonb_array_elements(
                lease."canonical_record"->'days'
              ) AS planned(entry)
              WHERE entry->>'requestedUtcDate' =
                to_char(day."requested_utc_date", 'YYYY-MM-DD')
            ) AS plan ON TRUE
            WHERE day."recovery_id" = lease."id"
              AND day."tenant_id" = lease."tenant_id"
              AND day."workspace_id" = lease."workspace_id"
          )
        ) AS "responsePayload"
      FROM target AS lease
    `;
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error(
        "Reader summary production recovery persisted authority is absent or ambiguous",
      );
    }
    return verifyPersistedProductionRecoveryAuthority(
      rows[0].responsePayload,
      rows[0].requestHash,
    );
  };

export const createPersistedRecoveryGitHubProjectionReader = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding |
    ReaderSummaryProductionRecoveryGapAuthorityBinding,
): ReaderSummaryGitHubProjectionReaderPort => {
  const days = new Map<
    string,
    ReadReaderSummaryGitHubProjectionResult
  >();
  for (const day of binding.days) {
    if (day.githubEvidence.mode !== "verified_existing") {
      continue;
    }
    const rows =
      day.providerEvidence["github-trending-page"].map(
        authorityGitHubProjectionItem,
      );
    days.set(day.requestedUtcDate, {
      eligibleBindingIds: [
        ...new Set(rows.map((row) => row.sourceBindingId)),
      ].sort(),
      items: rows,
      pageCount: rows.length === 0 ? 0 : 1,
    });
  }
  return {
    read: async (
      query: ReadReaderSummaryGitHubProjectionQuery,
    ): Promise<ReadReaderSummaryGitHubProjectionResult> => {
      if (
        query.tenantId !== binding.tenantId ||
        query.workspaceId !== binding.workspaceId
      ) {
        return { eligibleBindingIds: [], items: [], pageCount: 0 };
      }
      const key = query.dayStartedAt.toISOString().slice(0, 10);
      return cloneProjection(
        days.get(key) ?? {
          eligibleBindingIds: [],
          items: [],
          pageCount: 0,
        },
      );
    },
  };
};

class PersistedAuthorityFeedItems
  implements FeedItemReadRepositoryPort
{
  async list(_query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    void _query;
    throw new Error(
      "Reader summary production recovery never recollects provider rows",
    );
  }

  async findById(): Promise<null> {
    return null;
  }
}

async function main(): Promise<void> {
  // This must remain the first operation: invalid dates cannot read env or DB.
  const cli = parseReaderSummaryProductionRecoveryCliArguments(
    process.argv.slice(2),
  );

  const { loadDotenvIfPresent } = await import("./lib/env-file");
  loadDotenvIfPresent(".env");
  const databaseUrl = requiredEnv("DATABASE_URL");
  const scope = resolveReaderSummaryProductionRecoveryScope(process.env);
  const {
    resolvePostgresRuntimePoolConfig,
    runWithTenantDatabaseAccess,
  } = await import("@social-monitor/platform-persistence");
  const { PrismaSummaryConnection } = await import(
    "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection"
  );
  const { PrismaReaderSummaryRecoveryFinalization } = await import(
    "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-recovery-finalization"
  );
  const { AgentRuntimeReaderSummaryModelAdapter } = await import(
    "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter"
  );
  const { frozenLegacyReaderSummaryRecoveryContract } = await import(
    "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile"
  );
  const { GrpcAgentRuntimeClient } = await import(
    "@social-monitor/summary/adapters/model/grpc-agent-runtime-client"
  );
  const { CryptoIdGenerator, SystemClock } = await import(
    "@social-monitor/shared-kernel"
  );
  const { InMemoryMetricsRecorder } = await import(
    "@social-monitor/platform-metrics"
  );
  const { ReaderSummaryPromotionMetricsRecorder } = await import(
    "@social-monitor/summary/adapters/metrics/reader-summary-promotion-metrics.recorder"
  );
  const { readerSummaryPromotionControl } = await import(
    "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control"
  );
  const { READER_SUMMARY_PRODUCTION_RUNTIME_POLICY } = await import(
    "./lib/reader-summary-production-runtime-policy"
  );
  const {
    createProductionRecoveryDayExecutor,
    runReaderSummaryProductionRecovery,
    runReaderSummaryProductionRecoveryGap,
  } = await import(
    "./lib/reader-summary-production-recovery-cli"
  );
  const {
    PrismaReaderSummaryProductionRecoveryExecutionGuard,
    PrismaReaderSummaryProductionRecoveryGapExecutionGuard,
  } = await import(
    "./lib/reader-summary-production-recovery-replay-guard"
  );
  const { prepareReaderSummaryProductionRecoveryGapAuthority } = await import(
    "./lib/reader-summary-production-recovery-gap-authority"
  );
  const {
    assertReaderSummaryProductionRecoveryModelSelection,
    requireReaderSummaryProductionRecoveryAttestation,
    readerSummaryProductionRecoveryGenerationProfile,
    readerSummaryProductionRecoveryModelContract,
  } = await import(
    "./lib/reader-summary-production-recovery-model-contract"
  );
  const config = resolvePostgresRuntimePoolConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
  });
  const connection = await PrismaSummaryConnection.create(config);
  try {
    const result = await runWithTenantDatabaseAccess(scope, async () => {
      await configureProductionRecoverySession(connection, scope);
      const gapRun = cli.dates.every(isReaderSummaryProductionRecoveryGapDate);
      const binding = gapRun
        ? (await prepareReaderSummaryProductionRecoveryGapAuthority(
            connection,
            scope,
          )).binding
        : await loadLegacyRecoveryBinding(
            connection,
            scope,
            cli.dates as readonly ReaderSummaryProductionRecoveryDate[],
          );
      const githubProjectionReader =
        createPersistedRecoveryGitHubProjectionReader(binding);
      const clock = new SystemClock();
      const metrics = new InMemoryMetricsRecorder();
      const promotionControl = readerSummaryPromotionControl(
        new ReaderSummaryPromotionMetricsRecorder(metrics),
      );
      const modelContract = assertReaderSummaryProductionRecoveryModelSelection({
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
        runtimeEngine: "subscription-runtime-cli",
      });
      const executeDay: ReaderSummaryProductionRecoveryDayExecutor = (params) => {
        const executor = createProductionRecoveryDayExecutor(
          {
            model: new AgentRuntimeReaderSummaryModelAdapter({
              client: limitRecoveryAgentRuntimeToOneCall(
                requireReaderSummaryProductionRecoveryAttestation(
                  GrpcAgentRuntimeClient.connect({
                  address: requiredEnv("AGENT_RUNTIME_GRPC_ADDRESS"),
                  clock,
                  options: {
                    timeoutMs:
                      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY
                        .summaryModelTimeoutMs,
                    serviceToken: requiredEnv("AGENT_RUNTIME_SERVICE_TOKEN"),
                  },
                  }),
                ),
                gapRun,
              ),
              agentProvider: modelContract.provider,
              model: modelContract.model,
              reasoningEffort: modelContract.reasoningEffort,
              legacyRecoveryContract:
                frozenLegacyReaderSummaryRecoveryContract,
              timeoutMs:
                READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs,
            }),
            finalization: new PrismaReaderSummaryRecoveryFinalization(
              connection,
            ),
            feedItems: new PersistedAuthorityFeedItems(),
            githubProjectionReader,
            ids: new CryptoIdGenerator(),
            clock,
            promotionControl,
          },
          connection,
        );
        return executor(params);
      };
      if (gapRun) {
        const gapBinding =
          binding as ReaderSummaryProductionRecoveryGapAuthorityBinding;
        return runReaderSummaryProductionRecoveryGap({
          apply: true,
          dates: cli.dates as readonly ReaderSummaryProductionRecoveryGapDate[],
          generationProfile: readerSummaryProductionRecoveryGenerationProfile,
          modelContract: readerSummaryProductionRecoveryModelContract,
          binding: gapBinding,
          executionGuard:
            new PrismaReaderSummaryProductionRecoveryGapExecutionGuard(
              connection,
            ),
          executeDay: async ({ requestedUtcDate }) => {
            const dayResult = await executeDay({
              binding:
                gapBinding as unknown as ReaderSummaryProductionRecoveryAuthorityBinding,
              requestedUtcDate:
                requestedUtcDate as unknown as ReaderSummaryProductionRecoveryDate,
            });
            return { ...dayResult, requestedUtcDate };
          },
        });
      }
      return runReaderSummaryProductionRecovery({
        apply: true,
        dates: cli.dates as readonly ReaderSummaryProductionRecoveryDate[],
        generationProfile: readerSummaryProductionRecoveryGenerationProfile,
        binding: binding as ReaderSummaryProductionRecoveryAuthorityBinding,
        executionGuard:
          new PrismaReaderSummaryProductionRecoveryExecutionGuard(connection),
        executeDay,
      });
    });
    console.log(`outcome=${result.outcome}`);
    for (const day of result.dayResults) {
      console.log(
        `date=${day.requestedUtcDate} outcome=${day.outcome}`,
      );
    }
  } finally {
    await connection.close();
  }
}

const loadLegacyRecoveryBinding = async (
  client: QueryClient,
  scope: ReaderSummaryProductionRecoveryScope,
  dates: readonly ReaderSummaryProductionRecoveryDate[],
): Promise<ReaderSummaryProductionRecoveryAuthorityBinding> => {
  await assertPersistedReaderSummaryProductionRecoveryAuthority(client, {
    scope,
    dates,
  });
  return loadPersistedReaderSummaryProductionRecoveryAuthority(client, scope);
};

const authorityGitHubProjectionItem = (
  row: (ReaderSummaryProductionRecoveryAuthorityBinding |
    ReaderSummaryProductionRecoveryGapAuthorityBinding)["days"][number]["providerEvidence"]["github-trending-page"][number],
): ReaderSummaryGitHubProjectionItem => {
  if (row.github === undefined) {
    throw new Error(
      "Reader summary production recovery persisted GitHub authority is incomplete",
    );
  }
  if (row.sourceProviderContentHash === null) {
    throw new Error(
      "Reader summary production recovery persisted GitHub provider hash is incomplete",
    );
  }
  return {
    feedItemId: row.feedItemId,
    sourceItemId: row.sourceItemId,
    sourceBindingId: row.sourceBindingId,
    providerKey: row.providerKey,
    metadataKind: "github_trending_page_repository",
    scanJobId: row.github.scanJobId,
    canonicalUrl: row.canonicalUrl,
    repositoryFullName: row.github.repositoryIdentity,
    rank: row.github.rank,
    window: "daily",
    checkedAt: new Date(row.github.checkedAt),
    publishedAt: new Date(row.publishedAt),
    observedAt: new Date(row.observedAt),
    sourceContentHash: row.sourceContentHash,
    sourceProviderContentHash: row.sourceProviderContentHash,
  };
};

const cloneProjection = (
  value: ReadReaderSummaryGitHubProjectionResult,
): ReadReaderSummaryGitHubProjectionResult => ({
  eligibleBindingIds: [...value.eligibleBindingIds],
  items: value.items.map((item) => ({
    ...item,
    publishedAt: new Date(item.publishedAt),
    observedAt: new Date(item.observedAt),
    ...(item.checkedAt === undefined
      ? {}
      : { checkedAt: new Date(item.checkedAt) }),
  })),
  pageCount: value.pageCount,
});

const requiredEnv = (name: string): string => {
  const value = readEnvValue(process.env, name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const readEnvValue = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined => {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

if (require.main === module) {
  // Keep the historical implementation type-checked for evidence readers,
  // but never dispatch it as an executable production route.
  void main;
  console.error(
    "Legacy reader-summary production recovery execution is retired; use the authorized daily canonical-recovery v2 route",
  );
  process.exitCode = 1;
}
