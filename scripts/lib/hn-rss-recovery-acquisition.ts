import { ConversationUnitProjectionAdapter } from "@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter";
import { PrismaConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import { PrismaSourceEngagementProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";
import { PrismaScanAttemptRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanFailureQueueAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter";
import { PrismaScanLeaseAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import { PrismaSourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import { PrismaSourceCandidateMemoryRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-candidate-memory.repository";
import { IsolatedScanCursorRepository } from "@social-monitor/ingestion/adapters/persistence/isolated-scan-cursor.repository";
import { HackerNewsSourceProvider } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import { HttpHackerNewsClient } from "@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import { readScanPasses } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-scan-pass-support";
import { readPositiveInteger as readHnLimit } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source-window";
import { InMemorySourceProviderRegistry } from "@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry";
import { RegistrySourceFetcherAdapter } from "@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter";
import { HttpRssClient } from "@social-monitor/ingestion/adapters/source/rss/http-rss-client";
import { readFeedUrls, readPositiveInteger as readRssLimit } from "@social-monitor/ingestion/adapters/source/rss/rss-cursor-and-config";
import { feedUrlsForTargetWindow } from "@social-monitor/ingestion/adapters/source/rss/rss-source-window";
import { RssSourceProvider } from "@social-monitor/ingestion/adapters/source/rss/rss-source.provider";
import { ExecuteScanUseCase } from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case";
import type { SourceProviderPort, SourceQuery, SourceRuntimeConfig } from "@social-monitor/ingestion/ports";
import { PrismaScanJobRepository } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-job.repository";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { CryptoIdGenerator, SystemClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { cleanRealDayFeedProjectionClient } from "./clean-real-day-provider-acquisition";
import { CleanRealDaySourceConfigReader } from "./clean-real-day-source-config-reader";
import { composeCollectionScanExecution } from "./collection-scan-execution";
import type { RecoveryProvider } from "./hn-rss-recovery-plan";
import { ProductionCollectionScanJobReporter } from "./production-collection-scan-job-reporter";

export type RecoveryBinding = Readonly<{
  interestId: string;
  scanPolicyId: string;
  interestQuery: string;
  config: SourceRuntimeConfig;
}>;

export function recoverySourceQuery(providerKey: RecoveryProvider, config: SourceRuntimeConfig): SourceQuery {
  const string = (value: unknown): string | undefined => typeof value === "string" && value.trim().length > 0 ? value : undefined;
  if (providerKey === "rss") {
    const query = string(config.feedUrl) ?? string(config.url);
    if (query === undefined) throw new Error("RSS binding requires a feed URL");
    readFeedUrls(query, config);
    readRssLimit(config.maxItems, 30, 1, 100);
    return { mode: "url", query };
  }
  const mode = config.mode === "listing" ? "listing" : "search";
  const query = string(config.query) ?? string(config.term) ?? string(config.topic);
  if (query === undefined) throw new Error("Hacker News binding requires a query");
  const passes = readScanPasses(config);
  const configuredPasses = config.scanPasses ?? config.passes;
  if (Array.isArray(configuredPasses) && configuredPasses.length !== passes.length) {
    throw new Error("Hacker News recovery scan passes exceed provider bound");
  }
  readHnLimit(config.maxItems, 30, 1, 100);
  if (mode === "listing" && passes.length === 0) {
    throw new Error("Historical Hacker News listing requires configured scan passes");
  }
  return { mode, query };
}

/** Validate the actual RSS request fanout before reservation or provider effects. */
export function validateRecoveryWindow(providerKey: RecoveryProvider, config: SourceRuntimeConfig, from: string, to: string, now: Date): void {
  const startMs = Date.parse(from);
  const endMs = Date.parse(to);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(startMs) || !Number.isFinite(endMs) ||
    new Date(startMs).toISOString() !== from || new Date(endMs).toISOString() !== to ||
    startMs >= endMs || endMs - startMs > 86_400_000 || endMs > now.getTime()) {
    throw new Error("Recovery interval is invalid or exceeds 24 hours");
  }
  if (providerKey !== "rss") return;
  const query = recoverySourceQuery(providerKey, config).query;
  const feeds = readFeedUrls(query, config);
  const googleFeeds = feeds.filter((feed) => {
    const url = new URL(feed);
    return url.hostname === "news.google.com" && url.pathname === "/rss/search";
  });
  if (googleFeeds.length > 0) {
    const start = new Date(from);
    const end = new Date(to);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
      start.toISOString() !== from || end.toISOString() !== to ||
      start.getUTCHours() !== 0 || start.getUTCMinutes() !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0 ||
      end.getTime() - start.getTime() !== 86_400_000) {
      throw new Error("Google News recovery requires one full UTC day");
    }
    for (const feed of googleFeeds) {
      const terms = (new URL(feed).searchParams.get("q") ?? "")
        .replace(/\bwhen:\d+[dhm]\b/giu, "").replace(/\s+/gu, " ").trim()
        .split(/\s+OR\s+/iu).filter((term) => term.trim().length > 0);
      if (terms.length === 0) throw new Error("Google News recovery requires a search term");
      if (terms.length > 12) throw new Error("Recovery RSS expanded reads exceed 12");
    }
  }
  const expanded = feedUrlsForTargetWindow(feeds, {
    startInclusive: new Date(from), endExclusive: new Date(to),
  });
  if (expanded.length > 12) throw new Error("Recovery RSS expanded reads exceed 12");
}

export type RecoveryAcquisitionInput = Readonly<{
  connection: PrismaIngestionWorkerConnection;
  tenantId: string;
  workspaceId: string;
  sourceBindingId: string;
  providerKey: RecoveryProvider;
  from: string;
  to: string;
  binding: RecoveryBinding;
  runId: string;
  attemptId: string;
  scanJobId: string;
  provider?: SourceProviderPort;
}>;

/** A failed pass/feed leaves a partial sample; it cannot close a recovery plan. */
export function requireCompleteRecoveryScan(provider: SourceProviderPort): SourceProviderPort {
  return {
    key: () => provider.key(),
    capabilityProfile: () => provider.capabilityProfile(),
    validateBinding: (query) => provider.validateBinding(query),
    planScan: (query, context) => provider.planScan(query, context),
    classifyError: (error, context) => provider.classifyError(error, context),
    scan: async (plan, context) => {
      const result = await provider.scan(plan, context);
      if (result.warnings.length > 0) {
        throw new Error("Recovery provider returned a partial acquisition");
      }
      return result;
    },
  };
}

export async function executeRecoveryAcquisition(input: RecoveryAcquisitionInput): Promise<Readonly<{
  fetched: number; inserted: number; projected: number; skippedDuplicates: number; warningCount: number;
}>> {
  const clock = new SystemClock();
  validateRecoveryWindow(input.providerKey, input.binding.config, input.from, input.to, clock.now());
  const sourceQuery = recoverySourceQuery(input.providerKey, input.binding.config);
  const ids = new CryptoIdGenerator();
  const scope = { tenantId: tenantId(input.tenantId), workspaceId: workspaceId(input.workspaceId), sourceBindingId: input.sourceBindingId };
  const reporter = new ProductionCollectionScanJobReporter(new PrismaScanJobRepository(input.connection), ids, clock);
  reporter.beginReservedAttempt(input.scanJobId, { ...scope, scanPolicyId: input.binding.scanPolicyId });
  const execution = composeCollectionScanExecution(input.connection, ids, clock, {
    scanCursors: new IsolatedScanCursorRepository(scope),
    reporter,
    scanJobIdForAttempt: () => input.scanJobId,
    correlationId: input.runId,
    causationId: input.attemptId,
  });
  const config: SourceRuntimeConfig = {
    ...input.binding.config,
    adaptivePagination: { enabled: false },
    targetPublishedWindow: { startInclusive: input.from, endExclusive: input.to },
  };
  const provider = input.provider ?? (input.providerKey === "hacker-news"
    ? new HackerNewsSourceProvider(new HttpHackerNewsClient(), clock)
    : new RssSourceProvider(new HttpRssClient()));
  if (provider.key() !== input.providerKey || !provider.validateBinding(sourceQuery).ok) {
    throw new Error("Recovery provider binding validation failed");
  }
  const executeScan = new ExecuteScanUseCase(
    new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([requireCompleteRecoveryScan(provider)], []),
      new CleanRealDaySourceConfigReader([{ sourceBindingId: input.sourceBindingId, config }]),
    ),
    new PrismaSourceItemRepository(input.connection),
    new PrismaFeedProjectionAdapter(cleanRealDayFeedProjectionClient(input.connection), ids),
    new PrismaScanAttemptRepository(input.connection),
    execution.scanCursors,
    execution.reporter,
    new PrismaScanFailureQueueAdapter(input.connection, new InMemoryMetricsRecorder(), ids),
    new PrismaScanLeaseAdapter(input.connection, ids),
    ids, clock, undefined, undefined,
    new ConversationUnitProjectionAdapter(new PrismaConversationUnitRepository(input.connection, ids), ids),
    new PrismaSourceCandidateMemoryRepository(input.connection, ids),
    new PrismaSourceEngagementProjectionAdapter(input.connection, ids),
  );
  const result = await runWithTenantDatabaseAccess(scope, () => executeScan.execute({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    scanJobId: execution.scanJobIdForAttempt({ ...scope, scanPolicyId: input.binding.scanPolicyId }),
    interestId: input.binding.interestId,
    sourceBindingId: input.sourceBindingId,
    scanPolicyId: input.binding.scanPolicyId,
    providerKey: input.providerKey,
    sourceQuery,
    interestQuerySnapshot: input.binding.interestQuery,
    correlationId: execution.correlationId,
    causationId: execution.causationId,
    retryBudget: 0,
    leaseTtlSeconds: 600,
  }));
  if (!result.ok) throw new Error(`Recovery scan failed: ${result.error.name}`);
  return {
    fetched: result.value.fetched,
    inserted: result.value.inserted,
    projected: result.value.projected,
    skippedDuplicates: result.value.skippedDuplicates,
    warningCount: result.value.warnings.length,
  };
}
