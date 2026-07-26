import { ConversationUnitProjectionAdapter } from "@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter";
import { PrismaConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import { PrismaScanAttemptRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanCursorRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository";
import { PrismaScanFailureQueueAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter";
import { PrismaScanLeaseAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import { PrismaSourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import { CircuitBreakerSourceFetcherAdapter } from "@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter";
import { GitHubTrendingPageSourceProvider } from "@social-monitor/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider";
import { HttpGitHubTrendingPageClient } from "@social-monitor/ingestion/adapters/source/github-trending-page/http-github-trending-page-client";
import { HackerNewsSourceProvider } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import { HttpHackerNewsClient } from "@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import { InMemorySourceProviderRegistry } from "@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry";
import { HttpRedditClient } from "@social-monitor/ingestion/adapters/source/reddit/http-reddit-client";
import { RedditAppOnlyTokenProvider } from "@social-monitor/ingestion/adapters/source/reddit/app-only-reddit-token-provider";
import { RedditRefreshTokenProvider } from "@social-monitor/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider";
import { RedditSourceProvider } from "@social-monitor/ingestion/adapters/source/reddit/reddit-source.provider";
import { RegistrySourceFetcherAdapter } from "@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter";
import { HttpRssClient } from "@social-monitor/ingestion/adapters/source/rss/http-rss-client";
import { RssSourceProvider } from "@social-monitor/ingestion/adapters/source/rss/rss-source.provider";
import { SocialResearchSourceQueryPlannerAdapter } from "@social-monitor/ingestion/adapters/source/social-research-source-query-planner.adapter";
import { sourceReadinessProfiles } from "@social-monitor/ingestion/adapters/source/source-readiness-profiles";
import { GrpcXDailyCollectorClient } from "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/grpc-x-daily-collector-client";
import { XTwitterSourceProvider } from "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider";
import { ExecuteScanUseCase } from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case";
import {
  SourceFetchError,
  type SourceProviderPort,
  type SourceQuery,
  type SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";
import { PrismaScanJobRepository } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-job.repository";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import {
  CryptoIdGenerator,
  SystemClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import type { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import type {
  CleanRealDayCollectionProviderKey,
  CleanRealDayCollectionReport,
} from "./clean-real-day-collection-report";
import { CleanRealDaySourceConfigReader } from "./clean-real-day-source-config-reader";
import {
  configuredProviderCollectionTargetItemCount,
  durableSnapshotReuseProviderCollectionObservation,
  successfulProviderCollectionObservation,
  unavailableProviderCollectionObservation,
} from "./provider-collection-observability";
import { selectPreferredProviderScanResult } from "./provider-scan-result-selection";
import { providerMeetsProductionBlockingPolicy } from "./production-collection-quality-policy";
import { ProductionCollectionScanJobReporter } from "./production-collection-scan-job-reporter";
import { runTargetedProviderCollection } from "./targeted-provider-collection";
import {
  fingerprint,
  message,
} from "./yesterday-social-replay-support";
import {
  successfulXCollectionRetryPlanKey,
  shouldStopSuccessfulDuplicateXRetry,
  xCollectionReadinessRetryPolicy,
} from "./x-collection-retry-policy";
import {
  reuseGitHubTrendingDurableSnapshot,
  type GitHubTrendingDurableSnapshotReader,
} from "./github-trending-durable-snapshot-reuse";

export type CleanRealDaySourceBindingTarget = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly interestQuery: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: CleanRealDayCollectionProviderKey;
  readonly config: SourceRuntimeConfig;
  readonly sourceQuery: SourceQuery;
};

type ProviderScanResult = Omit<
  CleanRealDayCollectionReport["scans"][number],
  "attemptCount"
>;

type AcquisitionPlanParams = {
  readonly targets: readonly CleanRealDaySourceBindingTarget[];
  readonly closedRequestedUtcDay: boolean;
  readonly collectLive: (
    target: CleanRealDaySourceBindingTarget,
  ) => Promise<ProviderScanResult>;
  readonly collectDurableSnapshot: (
    target: CleanRealDaySourceBindingTarget,
  ) => Promise<ProviderScanResult>;
  readonly waitForXReadiness: boolean;
};

export const runCleanRealDayProviderAcquisitionPlan = async (
  params: AcquisitionPlanParams,
): Promise<CleanRealDayCollectionReport["scans"]> => {
  const outcomes = await runTargetedProviderCollection({
    targets: params.targets,
    retryBudget: 2,
    collect: (target) =>
      shouldReuseDurableSnapshot(target, params.closedRequestedUtcDay)
        ? params.collectDurableSnapshot(target)
        : params.collectLive(target),
    retryDisposition: (result) =>
      result.acquisitionMode === "durable_snapshot_reuse" ||
      providerMeetsProductionBlockingPolicy(result)
        ? "none"
        : result.observability.slo.retryDisposition,
    selectPreferredResult: selectPreferredProviderScanResult,
    retryPlanKey: ({ target }) => successfulXCollectionRetryPlanKey(target),
    stopDuplicatePlanRetry: shouldStopSuccessfulDuplicateXRetry,
    readinessRetry: xCollectionReadinessRetryPolicy(
      params.waitForXReadiness,
    ),
  });

  return outcomes.map((outcome) => ({
    ...outcome.result,
    attemptCount: outcome.attempts.length,
    ...(outcome.retryStopReason === undefined
      ? {}
      : { retryStopReason: outcome.retryStopReason }),
  }));
};

export const executeCleanRealDayProviderAcquisition = async (params: {
  readonly targets: readonly CleanRealDaySourceBindingTarget[];
  readonly connection: PrismaIngestionWorkerConnection;
  readonly durableSnapshotReader: GitHubTrendingDurableSnapshotReader;
  readonly requestedUtcDay: string;
  readonly targetWindowEndedAt: Date;
  readonly runStartedAt: Date;
  readonly waitForXReadiness: boolean;
}): Promise<CleanRealDayCollectionReport["scans"]> => {
  const closedRequestedUtcDay = requestedUtcDayIsClosed(
    params.runStartedAt,
    params.targetWindowEndedAt,
  );
  const liveTargets = params.targets.filter(
    (target) => !shouldReuseDurableSnapshot(target, closedRequestedUtcDay),
  );
  const liveRuntime =
    liveTargets.length === 0
      ? undefined
      : buildLiveRuntime({
          connection: params.connection,
          targets: params.targets,
          includeGitHub: !closedRequestedUtcDay,
        });

  return runCleanRealDayProviderAcquisitionPlan({
    targets: params.targets,
    closedRequestedUtcDay,
    waitForXReadiness: params.waitForXReadiness,
    collectLive: (target) => {
      if (liveRuntime === undefined) {
        throw new Error("Live provider acquisition runtime is unavailable");
      }
      return executeLiveTargetScan(
        target,
        liveRuntime.executeScan,
        liveRuntime.scanJobReporter,
        params.targetWindowEndedAt,
      );
    },
    collectDurableSnapshot: (target) =>
      acquireDurableGitHubSnapshot({
        target,
        reader: params.durableSnapshotReader,
        requestedUtcDay: params.requestedUtcDay,
        observedThrough: params.runStartedAt,
        targetWindowEndedAt: params.targetWindowEndedAt,
      }),
  });
};

export const requestedUtcDayIsClosed = (
  runStartedAt: Date,
  targetWindowEndedAt: Date,
): boolean =>
  Number.isFinite(runStartedAt.getTime()) &&
  Number.isFinite(targetWindowEndedAt.getTime()) &&
  runStartedAt.getTime() >= targetWindowEndedAt.getTime();

const acquireDurableGitHubSnapshot = async (params: {
  readonly target: CleanRealDaySourceBindingTarget;
  readonly reader: GitHubTrendingDurableSnapshotReader;
  readonly requestedUtcDay: string;
  readonly observedThrough: Date;
  readonly targetWindowEndedAt: Date;
}): Promise<ProviderScanResult> => {
  const bindingFingerprint = fingerprint(params.target.sourceBindingId);
  try {
    const durableSnapshotProof = await reuseGitHubTrendingDurableSnapshot({
      reader: params.reader,
      tenantId: params.target.tenantId,
      workspaceId: params.target.workspaceId,
      sourceBindingId: params.target.sourceBindingId,
      requestedUtcDay: params.requestedUtcDay,
      observedThrough: params.observedThrough,
    });
    return {
      providerKey: "github-trending-page",
      bindingFingerprint,
      acquisitionMode: "durable_snapshot_reuse",
      status: "succeeded",
      fetched: 0,
      inserted: 0,
      projected: 0,
      skippedDuplicates: 0,
      warningCount: 0,
      observability: durableSnapshotReuseProviderCollectionObservation({
        itemCount: durableSnapshotProof.rows.length,
        newestPublishedAt: new Date(durableSnapshotProof.group.publishedAt),
        targetWindowEndedAt: params.targetWindowEndedAt,
      }),
      durableSnapshotProof,
    };
  } catch (error) {
    return {
      providerKey: "github-trending-page",
      bindingFingerprint,
      acquisitionMode: "durable_snapshot_reuse",
      status: "failed",
      fetched: 0,
      inserted: 0,
      projected: 0,
      skippedDuplicates: 0,
      warningCount: 0,
      observability: unavailableProviderCollectionObservation({
        targetItemCount: 10,
        status: "failed",
        acquisitionMode: "durable_snapshot_reuse",
        targetWindowEndedAt: params.targetWindowEndedAt,
      }),
      failureFingerprint: fingerprint(message(error)),
    };
  }
};

const buildLiveRuntime = (params: {
  readonly connection: PrismaIngestionWorkerConnection;
  readonly targets: readonly CleanRealDaySourceBindingTarget[];
  readonly includeGitHub: boolean;
}): {
  readonly executeScan: ExecuteScanUseCase;
  readonly scanJobReporter: ProductionCollectionScanJobReporter;
} => {
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const scanJobReporter = new ProductionCollectionScanJobReporter(
    new PrismaScanJobRepository(params.connection),
    ids,
    clock,
  );
  const executeScan = new ExecuteScanUseCase(
    new CircuitBreakerSourceFetcherAdapter(
      new RegistrySourceFetcherAdapter(
        new InMemorySourceProviderRegistry(
          buildProviders(clock, params.includeGitHub),
          sourceReadinessProfiles,
        ),
        new CleanRealDaySourceConfigReader(params.targets),
        new SocialResearchSourceQueryPlannerAdapter(),
      ),
      clock,
      { failureThreshold: 3, cooldownSeconds: 60 },
    ),
    new PrismaSourceItemRepository(params.connection),
    new PrismaFeedProjectionAdapter(params.connection, ids),
    new PrismaScanAttemptRepository(params.connection),
    new PrismaScanCursorRepository(params.connection, ids),
    scanJobReporter,
    new PrismaScanFailureQueueAdapter(
      params.connection,
      new InMemoryMetricsRecorder(),
      ids,
    ),
    new PrismaScanLeaseAdapter(params.connection, ids),
    ids,
    clock,
    undefined,
    undefined,
    new ConversationUnitProjectionAdapter(
      new PrismaConversationUnitRepository(params.connection, ids),
      ids,
    ),
  );
  return { executeScan, scanJobReporter };
};

const executeLiveTargetScan = async (
  target: CleanRealDaySourceBindingTarget,
  executeScan: ExecuteScanUseCase,
  scanJobReporter: ProductionCollectionScanJobReporter,
  targetWindowEndedAt: Date,
): Promise<ProviderScanResult> => {
  const bindingFingerprint = fingerprint(target.sourceBindingId);
  if (target.providerKey === "x-twitter" && !xCollectorConfigured()) {
    return {
      providerKey: target.providerKey,
      bindingFingerprint,
      acquisitionMode: "live_collection",
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
  const scanJobId = scanJobReporter.beginAttempt({
    tenantId: tenantId(target.tenantId),
    workspaceId: workspaceId(target.workspaceId),
    sourceBindingId: target.sourceBindingId,
    scanPolicyId: target.scanPolicyId,
  });
  const result = await executeScan.execute({
    tenantId: tenantId(target.tenantId),
    workspaceId: workspaceId(target.workspaceId),
    scanJobId,
    interestId: target.interestId,
    sourceBindingId: target.sourceBindingId,
    scanPolicyId: target.scanPolicyId,
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
      acquisitionMode: "live_collection",
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
    acquisitionMode: "live_collection",
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
};

const buildProviders = (
  clock: SystemClock,
  includeGitHub: boolean,
): readonly SourceProviderPort[] => {
  const providers: SourceProviderPort[] = [];
  if (includeGitHub) {
    providers.push(
      new GitHubTrendingPageSourceProvider(
        new HttpGitHubTrendingPageClient(
          positiveIntegerEnv(process.env.GITHUB_TRENDING_TIMEOUT_MS, 10_000),
        ),
        clock,
      ),
    );
  }
  const redditTokenProvider = RedditAppOnlyTokenProvider.fromEnvironment(
    process.env,
  );
  providers.push(
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
  );
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
};

const shouldReuseDurableSnapshot = (
  target: CleanRealDaySourceBindingTarget,
  closedRequestedUtcDay: boolean,
): boolean =>
  closedRequestedUtcDay && target.providerKey === "github-trending-page";

const xCollectorConfigured = (): boolean =>
  (process.env.X_COLLECTOR_ENABLED === "1" ||
    process.env.X_COLLECTOR_EXPERIMENTAL_ENABLED === "1") &&
  optionalEnv(process.env.X_COLLECTOR_GRPC_ADDRESS) !== undefined;

const optionalEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const positiveIntegerEnv = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
