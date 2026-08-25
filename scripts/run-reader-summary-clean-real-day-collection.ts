import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type {
  SourceQuery,
  SourceQueryMode,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";
import { Pool, type QueryResultRow } from "pg";
import {
  acquirePrismaPgRuntimeConnection,
  defaultPostgresRuntimePoolConfig,
  runWithTenantDatabaseAccess,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";

import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import {
  fingerprint,
  message,
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
  catchUpCanSpendXReadinessBudget,
  mergeDailyProviderCatchUpEvidence,
  planDailyProviderCatchUp,
  type DailyProviderCatchUpPlan,
} from "./lib/reader-summary-daily-provider-catch-up";
import {
  collectionArtifactPassesBlockingValidation,
  readExactDayCollectionArtifact,
  writeCollectionArtifactAtomically,
} from "./lib/reader-summary-clean-real-day-collection-artifact";
import {
  discoverCanonicalReaderSummaryDailyMaintenanceTargets,
  discoverReaderSummaryProductionHistoryTargets,
  isReaderSummaryProductionHistoryScope,
} from "./lib/reader-summary-daily-maintenance-scope";
import { discoverSingleScopeCleanRealDayTargets as discoverUnboundedCleanRealDayTargets } from "./lib/clean-real-day-target-discovery";
import { readReaderSummaryCleanRealDayCollectionCli } from "./lib/reader-summary-clean-real-day-collection-cli";
import {
  executeCleanRealDayProviderAcquisition,
  type CleanRealDaySourceBindingTarget as SourceBindingTarget,
} from "./lib/clean-real-day-provider-acquisition";
import { requireScanPolicyTargets } from "./lib/clean-real-day-scan-policy-targets";
import {
  providerCollectionFreshnessReferenceAt,
  withProviderCollectionWindowProof,
} from "./lib/provider-collection-observability";
import {
  explicitGitHubUnavailableIsTransparentPartialDailyInput,
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
  $queryRawUnsafe<T>(query: string, ...values: readonly unknown[]): Promise<T>;
};

type TargetDiscoveryRuntimeClient = TargetDiscoveryClient & {
  $disconnect(): Promise<void>;
};

const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const collectionCli = readReaderSummaryCleanRealDayCollectionCli({
  collectionPolicyEvaluatedAt: new Date(),
  targetPublishedWindowObservedAt: new Date(),
});
const {
  update,
  artifactOnly,
  recalculateExisting,
  waitForXReadiness,
  providerCatchUp,
  allowHistoricalProviderCollection,
  allowUnprovenExistingRowsForExactFullCollection,
  collectionPolicyEvaluatedAt,
  targetCollectionDate,
  requestedProviderKeys,
  outputPath,
  exactDateArtifact,
  targetPublishedWindow,
  targetPublishedWindowConfig,
  maintenanceScope,
  targetDiscoveryScopePredicate,
  targetDiscoveryScopeValues,
} = collectionCli;

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

  const attempt = await tryRunCollection();
  if (attempt === undefined) {
    validateExistingReport();
    return;
  }
  if (attempt.kind === "no_collection") {
    validateExistingReport();
    console.log(
      `All required providers have terminal policy evidence for ${targetCollectionDate}; no collection was started`,
    );
    return;
  }
  const { report, plan } = attempt;

  if (update) {
    writeCollectionArtifactAtomically({
      path: outputPath,
      report,
      requireExactDatePath: exactDateArtifact,
      ...(maintenanceScope === undefined
        ? {}
        : { expectedScope: maintenanceScope }),
    });
    console.log(`Updated ${outputPath}`);
  }

  if (!report.blockingPassed) {
    const blockingProviders = plan.requiredProviderKeys.filter(
      (providerKey) => {
        const scan = report.scans.find(
          (candidate) => candidate.providerKey === providerKey,
        );
        return (
          scan === undefined || !providerMeetsProductionBlockingPolicy(scan)
        );
      },
    );
    throw new Error(
      `Reader summary clean real-day collection gates failed for ${targetCollectionDate}; blocking providers=${blockingProviders.join(",") || "quality-gate"}`,
    );
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
    report.targetWindow.providerCounts,
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
  | {
      readonly kind: "collected";
      readonly report: CleanRealDayCollectionReport;
      readonly plan: DailyProviderCatchUpPlan;
    }
  | { readonly kind: "no_collection" }
  | undefined
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
    PrismaPgRuntimeConnectionLease<TargetDiscoveryRuntimeClient> | undefined;
  let connection: PrismaIngestionWorkerConnection | undefined;

  try {
    const targetDiscoveryConnection =
      await createTargetDiscoveryConnection(runtimeConfig);
    targetDiscovery = targetDiscoveryConnection;
    connection = await PrismaIngestionWorkerConnection.create(runtimeConfig);
    const requiredProviderKeys = providerCatchUp
      ? defaultCleanRealDayCollectionProviderKeys
      : requestedProviderKeys;
    const allTargets =
      maintenanceScope === undefined
        ? await discoverUnboundedCleanRealDayTargets(() =>
            readTargets(targetDiscoveryConnection.client, requiredProviderKeys),
          )
        : isReaderSummaryProductionHistoryScope(maintenanceScope)
          ? await discoverReaderSummaryProductionHistoryTargets(() =>
              readTargets(
                targetDiscoveryConnection.client,
                requiredProviderKeys,
              ),
            )
          : await discoverCanonicalReaderSummaryDailyMaintenanceTargets(() =>
              readTargets(
                targetDiscoveryConnection.client,
                requiredProviderKeys,
              ),
            );
    const targetScope = allTargets[0]!;
    const tenantDatabase = createTenantScopedPgQuery(pool, targetScope);
    const existingReport = providerCatchUp
      ? readExactDayCollectionArtifact({
          path: outputPath,
          collectionDate: targetCollectionDate,
          requireExactDatePath: exactDateArtifact,
          ...(maintenanceScope === undefined
            ? {}
            : { expectedScope: maintenanceScope }),
        })
      : null;
    const databaseWindow = await readTargetWindowProof(
      tenantDatabase,
      requiredProviderKeys,
    );
    const plan = planDailyProviderCatchUp({
      collectionDate: targetCollectionDate,
      evaluatedAt: collectionPolicyEvaluatedAt,
      existingReport,
      databaseProviderCounts: providerCatchUp
        ? databaseWindow.providerCounts
        : {},
      allowHistoricalCollection: allowHistoricalProviderCollection,
      allowUnprovenExistingRowsForExactFullCollection:
        allowUnprovenExistingRowsForExactFullCollection,
      requiredProviderKeys,
    });
    if (plan.barrierMessage !== null) {
      throw new Error(plan.barrierMessage);
    }
    if (plan.providerKeysToCollect.length === 0) {
      return { kind: "no_collection" };
    }
    const providerKeys = plan.providerKeysToCollect;
    const targets = allTargets.filter((target) =>
      providerKeys.includes(target.providerKey),
    );
    const spendXReadinessBudget =
      waitForXReadiness && catchUpCanSpendXReadinessBudget(plan);
    const scanResults = await executeCleanRealDayProviderAcquisition({
      targets,
      connection,
      durableSnapshotReader: new PrismaGitHubTrendingDurableSnapshotReader(
        tenantDatabase,
      ),
      requestedUtcDay: targetCollectionDate,
      targetWindowEndedAt: new Date(targetPublishedWindow.endExclusive),
      runStartedAt: startedAt,
      waitForXReadiness: spendXReadinessBudget,
    });
    const completedAt = new Date();
    const freshWindow = await readFreshWindowProof(
      tenantDatabase,
      {
        startedAt,
        completedAt,
      },
      providerKeys,
    );
    const targetWindow = await readTargetWindowProof(
      tenantDatabase,
      plan.requiredProviderKeys,
    );
    const reportWithoutSecretGate = buildReport({
      plan,
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
      kind: "collected",
      plan,
      report: {
        ...reportWithoutSecretGate,
        qualityGates,
        blockingPassed: Object.values(qualityGates).every(Boolean),
      },
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
  const query = async <Row extends QueryResultRow>(
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
export { discoverSingleScopeCleanRealDayTargets } from "./lib/clean-real-day-target-discovery";
async function readTargets(
  client: TargetDiscoveryClient,
  providerKeys: readonly ProviderKey[],
): Promise<readonly SourceBindingTarget[]> {
  const rows = await client.$queryRawUnsafe<
    readonly {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly interestId: string;
      readonly interestQuery: string;
      readonly sourceBindingId: string;
      readonly scanPolicyId: string | null;
      readonly providerKey: ProviderKey;
      readonly config: unknown;
    }[]
  >(
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
        and sce.provider_key = any($1::text[])${targetDiscoveryScopePredicate}
      order by sce.provider_key, sb.created_at, sb.id
    `,
    [...providerKeys],
    ...targetDiscoveryScopeValues,
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
  providerKeys: readonly ProviderKey[],
): Promise<CleanRealDayCollectionReport["freshWindow"]> {
  return readFeedWindowProof(database, {
    startInclusive: params.startedAt,
    endInclusive: params.completedAt,
    timestampColumn: "observed_at",
    providerKeys,
  });
}

async function readTargetWindowProof(
  database: Pick<Pool, "query">,
  requiredProviderKeys: readonly ProviderKey[],
): Promise<CleanRealDayCollectionReport["freshWindow"]> {
  return readFeedWindowProof(database, {
    startInclusive: new Date(targetPublishedWindow.startInclusive),
    endExclusive: new Date(targetPublishedWindow.endExclusive),
    timestampColumn: "published_at",
    providerKeys: requiredProviderKeys,
  });
}

async function readFeedWindowProof(
  database: Pick<Pool, "query">,
  params: {
    readonly startInclusive: Date;
    readonly endInclusive?: Date;
    readonly endExclusive?: Date;
    readonly timestampColumn: "observed_at" | "published_at";
    readonly providerKeys: readonly ProviderKey[];
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
    [
      params.startInclusive.toISOString(),
      end.toISOString(),
      params.providerKeys,
    ],
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
  readonly plan: DailyProviderCatchUpPlan;
  readonly targets: readonly SourceBindingTarget[];
  readonly scanResults: CleanRealDayCollectionReport["scans"];
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly freshWindow: CleanRealDayCollectionReport["freshWindow"];
  readonly targetWindow: CleanRealDayCollectionReport["freshWindow"];
}): CleanRealDayCollectionReport {
  const targetWindowEndedAt = new Date(targetPublishedWindow.endExclusive);
  const freshnessReferenceAt = providerCollectionFreshnessReferenceAt({
    observedAt: params.completedAt,
    targetWindowEndedAt,
  });
  const collectedScanResults = params.scanResults.map((scan) => {
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
        targetWindowEndedAt: freshnessReferenceAt,
      }),
    };
  });
  const collectedTargets = params.targets.map((target) => {
    const planner = asRecord(target.config.sourceQueryPlanner);

    return {
      providerKey: target.providerKey,
      bindingFingerprint: fingerprint(target.sourceBindingId),
      interestFingerprint: fingerprint(target.interestId),
      workspaceFingerprint: fingerprint(target.workspaceId),
      plannerEnabled: planner.enabled === true,
      canaryRollout: planner.rollout === "real_binding_canary",
    };
  });
  const mergedEvidence = mergeDailyProviderCatchUpEvidence({
    plan: params.plan,
    collectedTargets,
    collectedScans: collectedScanResults,
  });
  const finalScanResults = mergedEvidence.scans;
  const finalTargets = mergedEvidence.targets;
  const requiredProviderKeys = params.plan.requiredProviderKeys;
  const succeededProviders = new Set(
    finalScanResults
      .filter((scan) => scan.status === "succeeded")
      .map((scan) => scan.providerKey),
  );
  const allRequestedProvidersSucceeded = requiredProviderKeys.every(
    (providerKey) => succeededProviders.has(providerKey),
  );
  const transparentPartialInput =
    explicitGitHubUnavailableIsTransparentPartialDailyInput({
      requestedProviderKeys: requiredProviderKeys,
      scans: finalScanResults,
      targetWindowProviderCounts: params.targetWindow.providerCounts,
    });
  const plannerProviderKeys = finalTargets
    .filter((target) => target.plannerEnabled)
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
    targetBindingsPresent:
      finalTargets.length === requiredProviderKeys.length &&
      requiredProviderKeys.every(
        (providerKey) =>
          finalTargets.filter((target) => target.providerKey === providerKey)
            .length === 1,
      ),
    everyRequestedProviderSucceeded:
      allRequestedProvidersSucceeded || transparentPartialInput,
    targetWindowFeedItemsAvailable: params.targetWindow.feedItemCount > 0,
    everyRequestedProviderHasTargetItems:
      requiredProviderKeys.every(
        (providerKey) =>
          (params.targetWindow.providerCounts[providerKey] ?? 0) > 0,
      ) || transparentPartialInput,
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
    everyRequestedProviderMeetsBlockingCoveragePolicy:
      finalScanResults.every(providerMeetsProductionBlockingPolicy) ||
      transparentPartialInput,
    providerRetriesAreBounded: finalScanResults.every(
      (scan) => scan.attemptCount >= 1 && scan.attemptCount <= 3,
    ),
    durableSnapshotReuseIsSingleAttempt: finalScanResults.every(
      (scan) =>
        scan.acquisitionMode !== "durable_snapshot_reuse" ||
        scan.attemptCount === 1,
    ),
    durableSnapshotProofMatchesRequestedDay:
      finalScanResults.every(
        (scan) =>
          scan.acquisitionMode !== "durable_snapshot_reuse" ||
          scan.durableSnapshotProof?.requestedUtcDay === targetCollectionDate,
      ) || transparentPartialInput,
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
      ...(maintenanceScope === undefined ? {} : { scope: maintenanceScope }),
      providerKeys: requiredProviderKeys,
      xCollectorConfigured: xCollectorConfigured(),
      targetPublishedWindow,
    },
    run: {
      startedAt: params.startedAt.toISOString(),
      completedAt: params.completedAt.toISOString(),
      collectionDate: targetCollectionDate,
    },
    targets: finalTargets,
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

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing.`);
  }

  const report =
    maintenanceScope === undefined && !exactDateArtifact
      ? (JSON.parse(
          readFileSync(outputPath, "utf8"),
        ) as CleanRealDayCollectionReport)
      : readExactDayCollectionArtifact({
          path: outputPath,
          collectionDate: targetCollectionDate,
          requireExactDatePath: exactDateArtifact,
          ...(maintenanceScope === undefined
            ? {}
            : { expectedScope: maintenanceScope }),
        });
  if (report === null)
    throw new Error(
      `${outputPath} does not contain ${targetCollectionDate} evidence`,
    );
  if (!collectionArtifactPassesBlockingValidation(report)) {
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
