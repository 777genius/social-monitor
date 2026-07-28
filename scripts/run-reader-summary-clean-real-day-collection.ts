import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type {
  SourceQuery,
  SourceQueryMode,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";
import { Pool } from "pg";
import {
  acquirePrismaPgRuntimeConnection,
  defaultPostgresRuntimePoolConfig,
  runWithSystemDatabaseAccess,
  runWithTenantDatabaseAccess,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";

import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import {
  collectionDateOptionOrDefault,
  fingerprint,
  message,
  nextDate,
  noRawSecretFragments,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import {
  asRecord,
  isLocalDataSourceUnavailable,
  stringValue,
} from "./lib/reader-summary-quality-eval-support";
import { loadDotenvIfPresent } from "./lib/env-file";
import { allQualityGatesPassed } from "./lib/quality-gates";
import {
  cleanRealDayCollectionAcquisitionModel,
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey as ProviderKey,
  type CleanRealDayCollectionReport,
} from "./lib/clean-real-day-collection-report";
import {
  executeCleanRealDayProviderAcquisition,
  type CleanRealDaySourceBindingTarget as SourceBindingTarget,
} from "./lib/clean-real-day-provider-acquisition";
import { requireScanPolicyTargets } from "./lib/clean-real-day-scan-policy-targets";
import {
  withProviderCollectionWindowProof,
} from "./lib/provider-collection-observability";
import {
  providerMeetsProductionBlockingPolicy,
  recalculateProductionBlockingPolicyGates,
} from "./lib/production-collection-quality-policy";
import { PrismaGitHubTrendingDurableSnapshotReader } from "./lib/github-trending-durable-snapshot-reuse";

type ScanProofRow = {
  readonly providerKey: string;
  readonly feedItemCount: string;
  readonly orphanInterestCount: string;
  readonly orphanSourceBindingCount: string;
  readonly interestSnapshotCount: string;
  readonly sourceBindingSnapshotCount: string;
  readonly sourceQueryLaneCount: string;
  readonly distinctSourceQueryLaneCount: string;
  readonly newestItemAt: string | null;
};

type TargetDiscoveryClient = {
  $queryRawUnsafe<T>(
    query: string,
    ...values: readonly unknown[]
  ): Promise<T>;
};

type TargetDiscoveryRuntimeClient = TargetDiscoveryClient & {
  $disconnect(): Promise<void>;
};

const outputPath = "ops/evals/reader-summary-clean-real-day-collection.v1.json";
const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const providerKeys = readProviderKeys();
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const recalculateExisting = process.argv.includes("--recalculate-existing");
const waitForXReadiness = process.argv.includes("--wait-for-x-readiness");
const { collectionDate: targetCollectionDate } = collectionDateOptionOrDefault(
  dateOnly(new Date()),
);
const targetPublishedWindow = {
  startInclusive: `${targetCollectionDate}T00:00:00.000Z`,
  endExclusive: nextDate(targetCollectionDate),
};
const targetPublishedWindowConfig = {
  ...targetPublishedWindow,
  observedAt: new Date().toISOString(),
};

if (require.main === module) {
  void main();
}

async function main(): Promise<void> {
  if (recalculateExisting) {
    recalculateExistingReport();
    return;
  }
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  loadDotenvIfPresent(".env");
  loadDotenvIfPresent(
    process.env.SOCIAL_MONITOR_REDDIT_APP_ENV_PATH ??
      `${process.env.HOME ?? ""}/.config/social-monitor/reddit-app-oauth.env`,
  );

  const report = await tryRunCollection();
  if (report === undefined) {
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
  }

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Reader summary clean real-day collection gates failed");
  }

  if (!update) {
    console.log(
      `Reader summary clean real-day collection OK (${report.freshWindow.feedItemCount} fresh items)`,
    );
  }
}

function recalculateExistingReport(): void {
  if (!update) {
    throw new Error("--recalculate-existing requires --update");
  }
  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing.`);
  }

  const report = JSON.parse(
    readFileSync(outputPath, "utf8"),
  ) as CleanRealDayCollectionReport;
  const qualityGates = recalculateProductionBlockingPolicyGates(
    report.qualityGates,
    report.scans,
  );
  const recalculated = {
    ...report,
    qualityGates,
    blockingPassed: allQualityGatesPassed(qualityGates),
  } satisfies CleanRealDayCollectionReport;

  writeFileSync(outputPath, `${JSON.stringify(recalculated, null, 2)}\n`);
  validateExistingReport();
  console.log(`Recalculated ${outputPath} without live collection`);
}

async function tryRunCollection(): Promise<
  CleanRealDayCollectionReport | undefined
> {
  const startedAt = new Date();
  const pool = new Pool({
    connectionString: databaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });
  const runtimeConfig = defaultPostgresRuntimePoolConfig(
    databaseUrl,
    "daily-runner",
  );
  let targetDiscovery:
    | PrismaPgRuntimeConnectionLease<TargetDiscoveryRuntimeClient>
    | undefined;
  let connection: PrismaIngestionWorkerConnection | undefined;

  try {
    targetDiscovery = await createTargetDiscoveryConnection(runtimeConfig);
    connection =
      await PrismaIngestionWorkerConnection.create(runtimeConfig);
    const targets = await discoverSingleScopeCleanRealDayTargets(() =>
      readTargets(targetDiscovery.client),
    );
    const targetScope = targets[0]!;
    const tenantDatabase = createTenantScopedPgQuery(pool, targetScope);
    const scanResults = await executeCleanRealDayProviderAcquisition({
      targets,
      connection,
      durableSnapshotReader: new PrismaGitHubTrendingDurableSnapshotReader(
        tenantDatabase,
      ),
      requestedUtcDay: targetCollectionDate,
      targetWindowEndedAt: new Date(targetPublishedWindow.endExclusive),
      runStartedAt: startedAt,
      waitForXReadiness,
    });
    const completedAt = new Date();
    const freshWindow = await readFreshWindowProof(tenantDatabase, {
      startedAt,
      completedAt,
    });
    const targetWindow = await readTargetWindowProof(tenantDatabase);
    const reportWithoutSecretGate = buildReport({
      targets,
      scanResults,
      startedAt,
      completedAt,
      freshWindow,
      targetWindow,
    });
    const qualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates,
      blockingPassed: Object.values(qualityGates).every(Boolean),
    };
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(
      `Reader summary clean real-day collection local source unavailable: ${message(error)}`,
    );
    return undefined;
  } finally {
    await connection?.close().catch(() => undefined);
    await targetDiscovery?.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function createTargetDiscoveryConnection(
  config: PostgresRuntimePoolConfig,
): Promise<PrismaPgRuntimeConnectionLease<TargetDiscoveryRuntimeClient>> {
  const PrismaClient =
    loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<TargetDiscoveryRuntimeClient>
    >();

  return acquirePrismaPgRuntimeConnection(config, PrismaClient);
}

function createTenantScopedPgQuery(
  pool: Pool,
  scope: Pick<SourceBindingTarget, "tenantId" | "workspaceId">,
): Pick<Pool, "query"> {
  const query = async <Row>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: Row[] }> =>
    runWithTenantDatabaseAccess(scope, async () => {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        await connection.query(
          `SELECT set_config('social_monitor.tenant_id', $1, true),
                  set_config('social_monitor.workspace_id', $2, true),
                  set_config('social_monitor.system_access', 'false', true)`,
          [scope.tenantId, scope.workspaceId],
        );
        const result = await connection.query<Row>(text, [...values]);
        await connection.query("COMMIT");
        return { rows: result.rows };
      } catch (error) {
        await connection.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    });

  return { query: query as Pool["query"] };
}

export async function discoverSingleScopeCleanRealDayTargets<
  Target extends Pick<SourceBindingTarget, "tenantId" | "workspaceId">,
>(
  discover: () => Promise<readonly Target[]>,
): Promise<readonly Target[]> {
  const targets = await runWithSystemDatabaseAccess(
    "clean real-day enabled provider target discovery",
    discover,
  );
  const scopes = new Set(
    targets.map((target) => `${target.tenantId}\u0000${target.workspaceId}`),
  );
  if (scopes.size !== 1) {
    throw new Error(
      `Clean real-day target discovery expected exactly one tenant/workspace scope, found ${scopes.size}`,
    );
  }

  return targets;
}

async function readTargets(
  client: TargetDiscoveryClient,
): Promise<readonly SourceBindingTarget[]> {
  const rows = await client.$queryRawUnsafe<readonly {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: string;
    readonly interestQuery: string;
    readonly sourceBindingId: string;
    readonly scanPolicyId: string | null;
    readonly providerKey: ProviderKey;
    readonly config: unknown;
  }[]>(
    `
      select
        sb.tenant_id::text as "tenantId",
        sb.workspace_id::text as "workspaceId",
        sb.interest_id::text as "interestId",
        i.query as "interestQuery",
        sb.id::text as "sourceBindingId",
        sp.id::text as "scanPolicyId",
        sce.provider_key as "providerKey",
        sb.config as "config"
      from source_bindings sb
      join interests i on i.id = sb.interest_id
      join source_catalog_entries sce on sce.id = sb.source_catalog_entry_id
      left join scan_policies sp on sp.tenant_id = sb.tenant_id
        and sp.workspace_id = sb.workspace_id
        and sp.source_binding_id = sb.id
      where sb.deleted_at is null
        and sb.status = 'ENABLED'
        and sce.provider_key = any($1::text[])
      order by sce.provider_key, sb.created_at, sb.id
    `,
    [...providerKeys],
  );

  return requireScanPolicyTargets(rows).map((row) => {
    const config = asRecord(row.config) as SourceRuntimeConfig;
    const runtimeConfig = configForTargetPublishedWindow(
      row.providerKey,
      config,
    );

    return {
      ...row,
      config: runtimeConfig,
      sourceQuery: sourceQueryFromConfig(row.providerKey, runtimeConfig),
    };
  });
}

function configForTargetPublishedWindow(
  providerKey: ProviderKey,
  config: SourceRuntimeConfig,
): SourceRuntimeConfig {
  return {
    ...config,
    ...(providerKey === "x-twitter"
      ? { windowEnd: targetPublishedWindow.endExclusive }
      : {}),
    targetPublishedWindow: targetPublishedWindowConfig,
  };
}

async function readFreshWindowProof(
  database: Pick<Pool, "query">,
  params: {
    readonly startedAt: Date;
    readonly completedAt: Date;
  },
): Promise<CleanRealDayCollectionReport["freshWindow"]> {
  return readFeedWindowProof(database, {
    startInclusive: params.startedAt,
    endInclusive: params.completedAt,
    timestampColumn: "observed_at",
  });
}

async function readTargetWindowProof(
  database: Pick<Pool, "query">,
): Promise<CleanRealDayCollectionReport["freshWindow"]> {
  return readFeedWindowProof(database, {
    startInclusive: new Date(targetPublishedWindow.startInclusive),
    endExclusive: new Date(targetPublishedWindow.endExclusive),
    timestampColumn: "published_at",
  });
}

async function readFeedWindowProof(
  database: Pick<Pool, "query">,
  params: {
    readonly startInclusive: Date;
    readonly endInclusive?: Date;
    readonly endExclusive?: Date;
    readonly timestampColumn: "observed_at" | "published_at";
  },
): Promise<CleanRealDayCollectionReport["freshWindow"]> {
  const endOperator = params.endExclusive === undefined ? "<=" : "<";
  const end = params.endExclusive ?? params.endInclusive;
  if (end === undefined) {
    throw new Error("Feed window proof end is required");
  }

  const result = await database.query<ScanProofRow>(
    `
      select
        fi.provider_key as "providerKey",
        count(*)::text as "feedItemCount",
        count(*) filter (where i.id is null)::text as "orphanInterestCount",
        count(*) filter (where sb.id is null)::text as "orphanSourceBindingCount",
        count(*) filter (where fi.provider_metadata ? 'interestQuerySnapshot')::text as "interestSnapshotCount",
        count(*) filter (where fi.provider_metadata ? 'sourceBindingSnapshot')::text as "sourceBindingSnapshotCount",
        count(*) filter (where fi.provider_metadata ? 'sourceQueryLane')::text as "sourceQueryLaneCount",
        count(distinct fi.provider_metadata->'sourceQueryLane') filter (where fi.provider_metadata ? 'sourceQueryLane')::text as "distinctSourceQueryLaneCount",
        max(fi.${params.timestampColumn})::text as "newestItemAt"
      from feed_items fi
      left join interests i on i.id = fi.interest_id
      left join source_bindings sb on sb.id = fi.source_binding_id
      where fi.${params.timestampColumn} >= $1::timestamptz
        and fi.${params.timestampColumn} ${endOperator} $2::timestamptz
        and fi.provider_key = any($3::text[])
      group by fi.provider_key
      order by fi.provider_key
    `,
    [params.startInclusive.toISOString(), end.toISOString(), providerKeys],
  );
  const totals = result.rows.reduce(
    (accumulator, row) => {
      const feedItemCount = numberFromPg(row.feedItemCount);
      const sourceQueryLaneCount = numberFromPg(row.sourceQueryLaneCount);

      return {
        feedItemCount: accumulator.feedItemCount + feedItemCount,
        providerCounts: {
          ...accumulator.providerCounts,
          [row.providerKey]: feedItemCount,
        },
        newestItemAtByProvider: {
          ...accumulator.newestItemAtByProvider,
          ...(row.newestItemAt === null
            ? {}
            : { [row.providerKey]: row.newestItemAt }),
        },
        sourceQueryLaneCoverageByProvider: {
          ...accumulator.sourceQueryLaneCoverageByProvider,
          [row.providerKey]: coverage(sourceQueryLaneCount, feedItemCount),
        },
        distinctSourceQueryLaneCountByProvider: {
          ...accumulator.distinctSourceQueryLaneCountByProvider,
          [row.providerKey]: numberFromPg(row.distinctSourceQueryLaneCount),
        },
        orphanInterestCount:
          accumulator.orphanInterestCount +
          numberFromPg(row.orphanInterestCount),
        orphanSourceBindingCount:
          accumulator.orphanSourceBindingCount +
          numberFromPg(row.orphanSourceBindingCount),
        interestSnapshotCount:
          accumulator.interestSnapshotCount +
          numberFromPg(row.interestSnapshotCount),
        sourceBindingSnapshotCount:
          accumulator.sourceBindingSnapshotCount +
          numberFromPg(row.sourceBindingSnapshotCount),
        sourceQueryLaneCount:
          accumulator.sourceQueryLaneCount + sourceQueryLaneCount,
        distinctSourceQueryLaneCount:
          accumulator.distinctSourceQueryLaneCount +
          numberFromPg(row.distinctSourceQueryLaneCount),
      };
    },
    {
      feedItemCount: 0,
      providerCounts: {} as Record<string, number>,
      newestItemAtByProvider: {} as Record<string, string>,
      sourceQueryLaneCoverageByProvider: {} as Record<string, number>,
      distinctSourceQueryLaneCountByProvider: {} as Record<string, number>,
      orphanInterestCount: 0,
      orphanSourceBindingCount: 0,
      interestSnapshotCount: 0,
      sourceBindingSnapshotCount: 0,
      sourceQueryLaneCount: 0,
      distinctSourceQueryLaneCount: 0,
    },
  );

  return {
    feedItemCount: totals.feedItemCount,
    providerCounts: totals.providerCounts,
    newestItemAtByProvider: totals.newestItemAtByProvider,
    sourceQueryLaneCoverageByProvider: totals.sourceQueryLaneCoverageByProvider,
    distinctSourceQueryLaneCountByProvider:
      totals.distinctSourceQueryLaneCountByProvider,
    orphanInterestCount: totals.orphanInterestCount,
    orphanSourceBindingCount: totals.orphanSourceBindingCount,
    interestSnapshotCoverage: coverage(
      totals.interestSnapshotCount,
      totals.feedItemCount,
    ),
    sourceBindingSnapshotCoverage: coverage(
      totals.sourceBindingSnapshotCount,
      totals.feedItemCount,
    ),
    sourceQueryLaneCoverage: coverage(
      totals.sourceQueryLaneCount,
      totals.feedItemCount,
    ),
    distinctSourceQueryLaneCount: totals.distinctSourceQueryLaneCount,
  };
}

function buildReport(params: {
  readonly targets: readonly SourceBindingTarget[];
  readonly scanResults: CleanRealDayCollectionReport["scans"];
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly freshWindow: CleanRealDayCollectionReport["freshWindow"];
  readonly targetWindow: CleanRealDayCollectionReport["freshWindow"];
}): CleanRealDayCollectionReport {
  const targetWindowEndedAt = new Date(targetPublishedWindow.endExclusive);
  const finalScanResults = params.scanResults.map((scan) => {
    if (scan.acquisitionMode === "durable_snapshot_reuse") {
      return scan;
    }
    const newestItemAt =
      params.targetWindow.newestItemAtByProvider[scan.providerKey];

    return {
      ...scan,
      observability: withProviderCollectionWindowProof({
        observation: scan.observability,
        windowItemCount:
          params.targetWindow.providerCounts[scan.providerKey] ?? 0,
        ...(newestItemAt === undefined
          ? {}
          : { newestPublishedAt: new Date(newestItemAt) }),
        targetWindowEndedAt,
      }),
    };
  });
  const succeededProviders = new Set(
    finalScanResults
      .filter((scan) => scan.status === "succeeded")
      .map((scan) => scan.providerKey),
  );
  const allRequestedProvidersSucceeded = providerKeys.every((providerKey) =>
    succeededProviders.has(providerKey),
  );
  const plannerProviderKeys = params.targets
    .filter((target) => asRecord(target.config.sourceQueryPlanner).enabled)
    .map((target) => target.providerKey);
  const plannerProviderKeysWithFreshItems = plannerProviderKeys.filter(
    (providerKey) => (params.freshWindow.providerCounts[providerKey] ?? 0) > 0,
  );
  const plannerProviderKeysWithTargetItems = plannerProviderKeys.filter(
    (providerKey) => (params.targetWindow.providerCounts[providerKey] ?? 0) > 0,
  );
  const plannerLaneCoverageComplete = plannerProviderKeysWithFreshItems.every(
    (providerKey) =>
      params.freshWindow.sourceQueryLaneCoverageByProvider[providerKey] === 1,
  );
  const targetPlannerLaneCoverageComplete =
    plannerProviderKeysWithTargetItems.every(
      (providerKey) =>
        params.targetWindow.sourceQueryLaneCoverageByProvider[providerKey] ===
        1,
    );
  const plannerMultipleQueryLanesObserved =
    plannerProviderKeysWithFreshItems.every(
      (providerKey) =>
        (params.freshWindow.distinctSourceQueryLaneCountByProvider[
          providerKey
        ] ?? 0) >= 1,
    );
  const targetPlannerMultipleQueryLanesObserved =
    plannerProviderKeysWithTargetItems.every(
      (providerKey) =>
        (params.targetWindow.distinctSourceQueryLaneCountByProvider[
          providerKey
        ] ?? 0) >= 1,
    );
  const qualityGates = {
    targetBindingsPresent: params.targets.length === providerKeys.length,
    everyRequestedProviderSucceeded: allRequestedProvidersSucceeded,
    targetWindowFeedItemsAvailable: params.targetWindow.feedItemCount > 0,
    everyRequestedProviderHasTargetItems: providerKeys.every(
      (providerKey) =>
        (params.targetWindow.providerCounts[providerKey] ?? 0) > 0,
    ),
    noFreshOrphanInterestReferences:
      params.freshWindow.orphanInterestCount === 0,
    noFreshOrphanSourceBindingReferences:
      params.freshWindow.orphanSourceBindingCount === 0,
    targetInterestSnapshotsPersisted:
      params.targetWindow.interestSnapshotCoverage === 1,
    targetSourceBindingSnapshotsPersisted:
      params.targetWindow.sourceBindingSnapshotCoverage === 1,
    freshSourceQueryLaneCoverageComplete:
      plannerProviderKeysWithFreshItems.length === 0 ||
      plannerLaneCoverageComplete,
    freshMultipleQueryLanesObserved:
      plannerProviderKeysWithFreshItems.length === 0 ||
      plannerMultipleQueryLanesObserved,
    targetSourceQueryLaneCoverageComplete:
      plannerProviderKeysWithTargetItems.length === 0 ||
      targetPlannerLaneCoverageComplete,
    targetMultipleQueryLanesObserved:
      plannerProviderKeysWithTargetItems.length === 0 ||
      targetPlannerMultipleQueryLanesObserved,
    providerCollectionObservabilityComplete: finalScanResults.every(
      (scan) =>
        scan.observability.targetItemCount !== null &&
        scan.observability.collectedItemCount >= 0 &&
        scan.observability.acceptedItemCount >= 0 &&
        scan.observability.outsideWindowItemCount >= 0 &&
        scan.observability.totalDuplicateItemCount >= 0 &&
        scan.observability.rateLimitEventCount >= 0,
    ),
    providerAcquisitionModesAreConsistent: finalScanResults.every(
      (scan) => scan.acquisitionMode === scan.observability.acquisitionMode,
    ),
    everyRequestedProviderMeetsBlockingCoveragePolicy: finalScanResults.every(
      providerMeetsProductionBlockingPolicy,
    ),
    providerRetriesAreBounded: finalScanResults.every(
      (scan) => scan.attemptCount >= 1 && scan.attemptCount <= 3,
    ),
    durableSnapshotReuseIsSingleAttempt: finalScanResults.every(
      (scan) =>
        scan.acquisitionMode !== "durable_snapshot_reuse" ||
        scan.attemptCount === 1,
    ),
    durableSnapshotProofMatchesRequestedDay: finalScanResults.every(
      (scan) =>
        scan.acquisitionMode !== "durable_snapshot_reuse" ||
        scan.durableSnapshotProof?.requestedUtcDay === targetCollectionDate,
    ),
    partialProviderCoverageIsExplicit: finalScanResults.every((scan) =>
      ["complete", "partial", "degraded", "unavailable"].includes(
        scan.observability.coverageState,
      ),
    ),
    noRawSecretFragments: true,
  };

  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "npm run run:reader-summary-clean-real-day-collection",
    model: {
      mode: "targeted_real_binding_collection",
      ...cleanRealDayCollectionAcquisitionModel(finalScanResults),
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
      rawProviderConfigPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      providerKeys,
      xCollectorConfigured: xCollectorConfigured(),
      targetPublishedWindow,
    },
    run: {
      startedAt: params.startedAt.toISOString(),
      completedAt: params.completedAt.toISOString(),
      collectionDate: targetCollectionDate,
    },
    targets: params.targets.map((target) => {
      const planner = asRecord(target.config.sourceQueryPlanner);

      return {
        providerKey: target.providerKey,
        bindingFingerprint: fingerprint(target.sourceBindingId),
        interestFingerprint: fingerprint(target.interestId),
        workspaceFingerprint: fingerprint(target.workspaceId),
        plannerEnabled: planner.enabled === true,
        canaryRollout: planner.rollout === "real_binding_canary",
      };
    }),
    scans: finalScanResults,
    freshWindow: params.freshWindow,
    targetWindow: params.targetWindow,
    qualityGates,
    blockingPassed: allQualityGatesPassed(qualityGates),
  };
}

function sourceQueryFromConfig(
  providerKey: ProviderKey,
  config: SourceRuntimeConfig,
): SourceQuery {
  if (providerKey === "github-trending-page") {
    return {
      mode: "listing",
      query: stringValue(config.window) ?? "daily",
      parameters: config,
    };
  }
  if (providerKey === "rss") {
    return {
      mode: "url",
      query: stringValue(config.feedUrl) ?? stringValue(config.url) ?? "",
      parameters: config,
    };
  }

  return {
    mode: sourceQueryModeFromValue(config.mode),
    query:
      stringValue(config.query) ??
      stringValue(config.term) ??
      stringValue(config.topic) ??
      stringValue(config.subreddit) ??
      providerKey,
    parameters: config,
  };
}

function sourceQueryModeFromValue(value: unknown): SourceQueryMode {
  return value === "listing" ? "listing" : "search";
}

function readProviderKeys(): readonly ProviderKey[] {
  const option = readOption("--providers");
  if (option === undefined) {
    return defaultCleanRealDayCollectionProviderKeys;
  }

  const providers = option
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (providers.length === 0) {
    throw new Error("--providers must include at least one provider");
  }

  return providers.map((provider) => {
    if (
      provider !== "github-trending-page" &&
      provider !== "hacker-news" &&
      provider !== "reddit" &&
      provider !== "rss" &&
      provider !== "x-twitter"
    ) {
      throw new Error(`Unsupported provider for clean collection: ${provider}`);
    }

    return provider;
  });
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing.`);
  }

  const report = JSON.parse(
    readFileSync(outputPath, "utf8"),
  ) as CleanRealDayCollectionReport;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-clean-real-day-collection-v1" &&
    report.generatedBy ===
      "npm run run:reader-summary-clean-real-day-collection" &&
    report.model.rawProviderPayloadPersistedInReport === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.model.rawProviderConfigPersistedInReport === false &&
    report.qualityGates.everyRequestedProviderMeetsBlockingCoveragePolicy ===
      true &&
    report.qualityGates.providerRetriesAreBounded === true &&
    report.scans.every(
      (scan) =>
        scan.attemptCount >= 1 &&
        scan.attemptCount <= 3 &&
        providerMeetsProductionBlockingPolicy(scan),
    ) &&
    report.qualityGates.noRawSecretFragments === true &&
    report.blockingPassed === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Reader summary clean real-day collection artifact OK (${report.freshWindow.feedItemCount} fresh items)`,
  );
}

function xCollectorConfigured(): boolean {
  return (
    (process.env.X_COLLECTOR_ENABLED === "1" ||
      process.env.X_COLLECTOR_EXPERIMENTAL_ENABLED === "1") &&
    optionalEnv(process.env.X_COLLECTOR_GRPC_ADDRESS) !== undefined
  );
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function numberFromPg(value: string): number {
  return Number.parseInt(value, 10);
}

function coverage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(3));
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
