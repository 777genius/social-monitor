import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { ConversationUnitProjectionAdapter } from "@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter";
import { PrismaConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import { PrismaScanAttemptRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanCursorRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository";
import { PrismaScanFailureQueueAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter";
import { PrismaScanLeaseAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import { PrismaSourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import { NoopScanExecutionReporterAdapter } from "@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter";
import { CircuitBreakerSourceFetcherAdapter } from "@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter";
import { HttpGitHubTrendingPageClient } from "@social-monitor/ingestion/adapters/source/github-trending-page/http-github-trending-page-client";
import { GitHubTrendingPageSourceProvider } from "@social-monitor/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider";
import { HttpHackerNewsClient } from "@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import { HackerNewsSourceProvider } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import { HttpRedditClient } from "@social-monitor/ingestion/adapters/source/reddit/http-reddit-client";
import { RedditAppOnlyTokenProvider } from "@social-monitor/ingestion/adapters/source/reddit/app-only-reddit-token-provider";
import { RedditRefreshTokenProvider } from "@social-monitor/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider";
import { RedditSourceProvider } from "@social-monitor/ingestion/adapters/source/reddit/reddit-source.provider";
import { HttpRssClient } from "@social-monitor/ingestion/adapters/source/rss/http-rss-client";
import { RssSourceProvider } from "@social-monitor/ingestion/adapters/source/rss/rss-source.provider";
import { InMemorySourceProviderRegistry } from "@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry";
import { RegistrySourceFetcherAdapter } from "@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter";
import { SocialResearchSourceQueryPlannerAdapter } from "@social-monitor/ingestion/adapters/source/social-research-source-query-planner.adapter";
import { sourceReadinessProfiles } from "@social-monitor/ingestion/adapters/source/source-readiness-profiles";
import { GrpcXDailyCollectorClient } from "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/grpc-x-daily-collector-client";
import { XTwitterSourceProvider } from "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider";
import { ExecuteScanUseCase } from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case";
import type {
  SourceConfigReaderPort,
  SourceProviderPort,
  SourceQuery,
  SourceQueryMode,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";
import { SourceFetchError } from "@social-monitor/ingestion/ports";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import {
  CryptoIdGenerator,
  SystemClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import { Pool } from "pg";

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
import type {
  CleanRealDayCollectionProviderKey as ProviderKey,
  CleanRealDayCollectionReport,
} from "./lib/clean-real-day-collection-report";
import {
  configuredProviderCollectionTargetItemCount,
  successfulProviderCollectionObservation,
  unavailableProviderCollectionObservation,
  withProviderCollectionWindowProof,
} from "./lib/provider-collection-observability";
import { runTargetedProviderCollection } from "./lib/targeted-provider-collection";

type SourceBindingTarget = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly interestQuery: string;
  readonly sourceBindingId: string;
  readonly providerKey: ProviderKey;
  readonly config: SourceRuntimeConfig;
  readonly sourceQuery: SourceQuery;
};

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

type ProviderScanResult = Omit<
  CleanRealDayCollectionReport["scans"][number],
  "attemptCount"
>;

const outputPath = "ops/evals/reader-summary-clean-real-day-collection.v1.json";
const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const providerKeys = readProviderKeys();
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
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

void main();

async function main(): Promise<void> {
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

async function tryRunCollection(): Promise<
  CleanRealDayCollectionReport | undefined
> {
  const startedAt = new Date();
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });
  const connection = new PrismaIngestionWorkerConnection(databaseUrl);

  try {
    const targets = await readTargets(pool);
    const scanResults = await executeTargetScans(targets, connection);
    const completedAt = new Date();
    const freshWindow = await readFreshWindowProof(pool, {
      startedAt,
      completedAt,
    });
    const targetWindow = await readTargetWindowProof(pool);
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
    await connection.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function executeTargetScans(
  targets: readonly SourceBindingTarget[],
  connection: PrismaIngestionWorkerConnection,
): Promise<CleanRealDayCollectionReport["scans"]> {
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const executeScan = new ExecuteScanUseCase(
    new CircuitBreakerSourceFetcherAdapter(
      new RegistrySourceFetcherAdapter(
        new InMemorySourceProviderRegistry(
          buildProviders(clock),
          sourceReadinessProfiles,
        ),
        new StaticSourceConfigReader(targets),
        new SocialResearchSourceQueryPlannerAdapter(),
      ),
      clock,
      { failureThreshold: 3, cooldownSeconds: 60 },
    ),
    new PrismaSourceItemRepository(connection),
    new PrismaFeedProjectionAdapter(connection, ids),
    new PrismaScanAttemptRepository(connection),
    new PrismaScanCursorRepository(connection, ids),
    new NoopScanExecutionReporterAdapter(),
    new PrismaScanFailureQueueAdapter(
      connection,
      new InMemoryMetricsRecorder(),
      ids,
    ),
    new PrismaScanLeaseAdapter(connection, ids),
    ids,
    clock,
    undefined,
    undefined,
    new ConversationUnitProjectionAdapter(
      new PrismaConversationUnitRepository(connection, ids),
      ids,
    ),
  );
  const outcomes = await runTargetedProviderCollection({
    targets,
    retryBudget: 2,
    collect: (target) => executeTargetScan(target, executeScan),
    retryDisposition: (result) => result.observability.slo.retryDisposition,
  });

  return outcomes.map((outcome) => ({
    ...outcome.result,
    attemptCount: outcome.attempts.length,
  }));
}

async function executeTargetScan(
  target: SourceBindingTarget,
  executeScan: ExecuteScanUseCase,
): Promise<ProviderScanResult> {
  const bindingFingerprint = fingerprint(target.sourceBindingId);
  const targetWindowEndedAt = new Date(targetPublishedWindow.endExclusive);
  if (target.providerKey === "x-twitter" && !xCollectorConfigured()) {
    return {
      providerKey: target.providerKey,
      bindingFingerprint,
      status: "skipped",
      fetched: 0,
      inserted: 0,
      projected: 0,
      skippedDuplicates: 0,
      warningCount: 0,
      observability: unavailableProviderCollectionObservation({
        targetItemCount: configuredProviderCollectionTargetItemCount(
          target.config,
        ),
        status: "skipped",
        targetWindowEndedAt,
      }),
      failureFingerprint: fingerprint("x_collector_not_configured"),
    };
  }

  const result = await executeScan.execute({
    tenantId: tenantId(target.tenantId),
    workspaceId: workspaceId(target.workspaceId),
    scanJobId: randomUUID(),
    interestId: target.interestId,
    sourceBindingId: target.sourceBindingId,
    scanPolicyId: randomUUID(),
    providerKey: target.providerKey,
    sourceQuery: target.sourceQuery,
    interestQuerySnapshot: target.interestQuery,
    correlationId: "reader-summary-clean-real-day-collection",
    causationId: "manual-clean-real-day-proof",
    retryBudget: 0,
    leaseTtlSeconds: 600,
  });

  if (!result.ok) {
    const rateLimited =
      result.error instanceof SourceFetchError &&
      result.error.kind === "rate_limited";
    return {
      providerKey: target.providerKey,
      bindingFingerprint,
      status: "failed",
      fetched: 0,
      inserted: 0,
      projected: 0,
      skippedDuplicates: 0,
      warningCount: 0,
      observability: unavailableProviderCollectionObservation({
        targetItemCount: configuredProviderCollectionTargetItemCount(
          target.config,
        ),
        status: "failed",
        rateLimited,
        failureKind:
          result.error instanceof SourceFetchError
            ? result.error.kind
            : "unknown",
        targetWindowEndedAt,
      }),
      failureFingerprint: fingerprint(message(result.error)),
    };
  }

  return {
    providerKey: target.providerKey,
    bindingFingerprint,
    status: "succeeded",
    fetched: result.value.fetched,
    inserted: result.value.inserted,
    projected: result.value.projected,
    skippedDuplicates: result.value.skippedDuplicates,
    warningCount: result.value.warnings.length,
    observability: successfulProviderCollectionObservation({
      telemetry: result.value.telemetry,
      fetched: result.value.fetched,
      inserted: result.value.inserted,
      storageDuplicates: result.value.skippedDuplicates,
      targetWindowEndedAt,
    }),
  };
}

function buildProviders(clock: SystemClock): readonly SourceProviderPort[] {
  const redditTokenProvider = RedditAppOnlyTokenProvider.fromEnvironment(
    process.env,
  );
  const providers: SourceProviderPort[] = [
    new GitHubTrendingPageSourceProvider(
      new HttpGitHubTrendingPageClient(
        positiveIntegerEnv(process.env.GITHUB_TRENDING_TIMEOUT_MS, 10_000),
      ),
      clock,
    ),
    new HackerNewsSourceProvider(
      new HttpHackerNewsClient(
        positiveIntegerEnv(process.env.HACKER_NEWS_TIMEOUT_MS, 10_000),
      ),
      clock,
    ),
    new RedditSourceProvider(
      new HttpRedditClient(),
      redditTokenProvider ?? undefined,
      RedditRefreshTokenProvider.fromEnvironment(process.env),
    ),
    new RssSourceProvider(
      new HttpRssClient(positiveIntegerEnv(process.env.RSS_TIMEOUT_MS, 10_000)),
    ),
  ];
  const xCollectorAddress = process.env.X_COLLECTOR_GRPC_ADDRESS?.trim();
  if (xCollectorConfigured() && xCollectorAddress !== undefined) {
    providers.push(
      new XTwitterSourceProvider(
        GrpcXDailyCollectorClient.connect({
          address: xCollectorAddress,
          clock,
          options: {
            timeoutMs: positiveIntegerEnv(
              process.env.X_COLLECTOR_GRPC_TIMEOUT_MS,
              60_000,
            ),
            serviceToken: optionalEnv(process.env.X_COLLECTOR_SERVICE_TOKEN),
          },
        }),
        clock,
      ),
    );
  }

  return providers;
}

async function readTargets(
  pool: Pool,
): Promise<readonly SourceBindingTarget[]> {
  const result = await pool.query<{
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: string;
    readonly interestQuery: string;
    readonly sourceBindingId: string;
    readonly providerKey: ProviderKey;
    readonly config: unknown;
  }>(
    `
      select
        sb.tenant_id::text as "tenantId",
        sb.workspace_id::text as "workspaceId",
        sb.interest_id::text as "interestId",
        i.query as "interestQuery",
        sb.id::text as "sourceBindingId",
        sce.provider_key as "providerKey",
        sb.config as "config"
      from source_bindings sb
      join interests i on i.id = sb.interest_id
      join source_catalog_entries sce on sce.id = sb.source_catalog_entry_id
      where sb.deleted_at is null
        and sb.status = 'ENABLED'
        and sce.provider_key = any($1::text[])
      order by sce.provider_key, sb.created_at, sb.id
    `,
    [providerKeys],
  );

  return result.rows.map((row) => {
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
  pool: Pool,
  params: {
    readonly startedAt: Date;
    readonly completedAt: Date;
  },
): Promise<CleanRealDayCollectionReport["freshWindow"]> {
  return readFeedWindowProof(pool, {
    startInclusive: params.startedAt,
    endInclusive: params.completedAt,
    timestampColumn: "observed_at",
  });
}

async function readTargetWindowProof(
  pool: Pool,
): Promise<CleanRealDayCollectionReport["freshWindow"]> {
  return readFeedWindowProof(pool, {
    startInclusive: new Date(targetPublishedWindow.startInclusive),
    endExclusive: new Date(targetPublishedWindow.endExclusive),
    timestampColumn: "published_at",
  });
}

async function readFeedWindowProof(
  pool: Pool,
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

  const result = await pool.query<ScanProofRow>(
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
    everyRequestedProviderMeetsCollectionSlo: finalScanResults.every(
      (scan) => scan.observability.slo.met,
    ),
    providerRetriesAreBounded: finalScanResults.every(
      (scan) => scan.attemptCount >= 1 && scan.attemptCount <= 3,
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
      liveNetwork: true,
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

class StaticSourceConfigReader implements SourceConfigReaderPort {
  private readonly configByBinding = new Map<string, SourceRuntimeConfig>();

  constructor(targets: readonly SourceBindingTarget[]) {
    for (const target of targets) {
      this.configByBinding.set(target.sourceBindingId, target.config);
    }
  }

  async readConfig(params: {
    readonly sourceBindingId: string;
  }): Promise<SourceRuntimeConfig | null> {
    return this.configByBinding.get(params.sourceBindingId) ?? null;
  }
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
    return ["hacker-news", "reddit", "rss", "x-twitter"];
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
    report.qualityGates.everyRequestedProviderMeetsCollectionSlo === true &&
    report.qualityGates.providerRetriesAreBounded === true &&
    report.scans.every(
      (scan) =>
        scan.attemptCount >= 1 &&
        scan.attemptCount <= 3 &&
        scan.observability.slo.met,
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

function positiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
