import { maxEvidenceItems } from "./lib/live-multi-provider-summary-config";
import { liveCheckConfiguredInterests } from "./lib/live-multi-provider-summary-interests";
import { ConversationUnitProjectionAdapter } from "@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import { FixedClock, SystemClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { FeedSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/feed-summary-evidence.selector";
import { ConversationSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/conversation-summary-evidence.selector";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { InMemorySummaryJobQueueAdapter } from "@social-monitor/summary/adapters/messaging/in-memory-summary-job-queue.adapter";
import { NoopUserSummaryPreferenceReader } from "@social-monitor/summary/adapters/preferences/noop-user-summary-preference.reader";
import { InMemorySummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository";
import { InMemorySummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository";
import { InMemorySummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository";
import { SummaryPolicy } from "@social-monitor/summary/domain";
import { ExecuteSummaryJobUseCase } from "@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case";
import { RequestSummaryUseCase } from "@social-monitor/summary/features/request-summary/request-summary.use-case";
import { GitHubSourceProvider } from "../libs/ingestion/adapters/source/github/github-source.provider";
import { HttpGitHubClient } from "../libs/ingestion/adapters/source/github/http-github-client";
import { GitHubTrendingPageSourceProvider } from "../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider";
import { HttpGitHubTrendingPageClient } from "../libs/ingestion/adapters/source/github-trending-page/http-github-trending-page-client";
import { HackerNewsSourceProvider } from "../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import { HttpHackerNewsClient } from "../libs/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import { InMemorySourceProviderRegistry } from "../libs/ingestion/adapters/source/in-memory-source-provider.registry";
import { RedditAppOnlyTokenProvider } from "../libs/ingestion/adapters/source/reddit/app-only-reddit-token-provider";
import { HttpRedditClient } from "../libs/ingestion/adapters/source/reddit/http-reddit-client";
import { RedditSourceProvider } from "../libs/ingestion/adapters/source/reddit/reddit-source.provider";
import { HttpRssClient } from "../libs/ingestion/adapters/source/rss/http-rss-client";
import { RssSourceProvider } from "../libs/ingestion/adapters/source/rss/rss-source.provider";
import { RegistrySourceFetcherAdapter } from "../libs/ingestion/adapters/source/registry-source-fetcher.adapter";
import { sourceReadinessProfiles } from "../libs/ingestion/adapters/source/source-readiness-profiles";
import { ExecuteScanUseCase } from "../libs/ingestion/features/execute-scan/execute-scan.use-case";
import type { LivePersistenceBundle, ScanMetrics, LiveProviderKey } from "./lib/live-multi-provider-summary-support";
import { loadRedditAppOAuthEnvIfPresent, assert, CapturingScanExecutionReporter, targetsForPersistenceMode, LimitedSourceFetcher, StaticSourceConfigReader, unwrap, scanJobIdForTarget, describeError, shouldUsePersistedProviderFallback, persistedProviderFallbackReason, SequenceIdGenerator, AllowingSummaryQuota } from "./lib/live-multi-provider-summary-support";
import { readLivePersistenceConfig, createLivePersistence } from "./lib/live-multi-provider-summary-persistence";
import { sampledAt, timeoutMs, allowEmptyTargets, maxSummaryKeyPoints, summaryModelMode, maxItemsPerProvider } from "./lib/live-multi-provider-summary-config";
import { buildScanTargets, buildXTwitterProvider, maxItemsForProvider, summaryPreferenceForRun } from "./lib/live-multi-provider-summary-sources";
import { maybeWrapSummaryPromptDebugModel, buildSummaryModel } from "./lib/live-multi-provider-summary-models";
import { runLiveReaderSummarySmoke } from "./lib/live-multi-provider-summary-reader";
import { writeOptionalFrontendFixture, countConversationUnitsByRootFeedItemIds, writeOptionalEvidenceArtifact } from "./lib/live-multi-provider-summary-reports";

let livePersistenceToClose: LivePersistenceBundle | undefined;

const main = async (): Promise<void> => {
  loadRedditAppOAuthEnvIfPresent();
  const redditTokenProvider = RedditAppOnlyTokenProvider.fromEnvironment(
    process.env,
  );
  assert(
    redditTokenProvider !== null,
    "Live multi-provider smoke requires Reddit app-only OAuth env: REDDIT_APP_CLIENT_ID/REDDIT_APP_CLIENT_SECRET",
  );

  const tenant = tenantId("00000000-0000-7000-8000-000000000901");
  const workspace = workspaceId("00000000-0000-7000-8000-000000000902");
  const interestId = "00000000-0000-7000-8000-000000000903";
  const metrics = new InMemoryMetricsRecorder();
  const persistenceConfig = readLivePersistenceConfig();
  const configuredInterests = await liveCheckConfiguredInterests({
    persistence: persistenceConfig, scope: { tenantId: tenant, workspaceId: workspace, interestId },
    query: process.env.LIVE_MULTI_PROVIDER_INTEREST_QUERY, createdAt: sampledAt,
  });
  const persistence = await createLivePersistence({
    config: persistenceConfig,
    metrics,
  });
  livePersistenceToClose = persistence;
  const scanReporter = new CapturingScanExecutionReporter();
  const clock = new FixedClock(sampledAt);
  const targets = targetsForPersistenceMode(
    buildScanTargets(),
    persistenceConfig.mode,
  );
  const xTwitterProvider = buildXTwitterProvider();
  const targetBySourceBinding = new Map(
    targets.map((target) => [target.sourceBindingId, target]),
  );
  const sourceFetcher = new LimitedSourceFetcher(
    new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry(
        [
          new RedditSourceProvider(
            new HttpRedditClient("https://oauth.reddit.com", timeoutMs),
            redditTokenProvider,
          ),
          new GitHubSourceProvider(new HttpGitHubClient(timeoutMs)),
          new GitHubTrendingPageSourceProvider(
            new HttpGitHubTrendingPageClient(timeoutMs),
            clock,
          ),
          new HackerNewsSourceProvider(
            new HttpHackerNewsClient(timeoutMs),
            new SystemClock(),
          ),
          new RssSourceProvider(new HttpRssClient(timeoutMs)),
          ...(xTwitterProvider === undefined ? [] : [xTwitterProvider]),
        ],
        sourceReadinessProfiles,
      ),
      new StaticSourceConfigReader(
        new Map(
          targets.map((target) => [target.sourceBindingId, target.config]),
        ),
      ),
    ),
    new Map(
      targets.map((target) => [
        target.providerKey,
        maxItemsForProvider(target.providerKey),
      ]),
    ),
  );
  const executeScan = new ExecuteScanUseCase(
    sourceFetcher,
    persistence.sourceItems,
    persistence.feedProjection,
    persistence.scanAttempts,
    persistence.scanCursors,
    scanReporter,
    persistence.scanFailures,
    persistence.scanLeases,
    persistence.sourceItemIds,
    clock,
    undefined,
    undefined,
    new ConversationUnitProjectionAdapter(
      persistence.conversationUnits,
      persistence.conversationUnitIds,
    ),
  );

  const scanMetrics: ScanMetrics[] = [];
  for (const target of targets) {
    let result;
    try {
      result = unwrap(
        await executeScan.execute({
          tenantId: tenant,
          workspaceId: workspace,
          scanJobId: scanJobIdForTarget(target),
          interestId,
          sourceBindingId: target.sourceBindingId,
          scanPolicyId: target.scanPolicyId,
          providerKey: target.providerKey,
          sourceQuery: target.sourceQuery,
          correlationId: "corr-live-multi-provider-summary-smoke",
          causationId: "manual-live-multi-provider-summary-smoke",
          retryBudget: 1,
        }),
        `execute live ${target.providerKey} scan`,
      );
    } catch (error) {
      const failureReason = describeError(error);
      const fallbackUsed = shouldUsePersistedProviderFallback({
        target,
        error,
        persistence,
      });
      scanMetrics.push({
        providerKey: target.providerKey,
        sourceBindingId: target.sourceBindingId,
        status: "failed",
        fetched: 0,
        inserted: 0,
        projected: 0,
        skippedDuplicates: 0,
        failureReason,
        fallbackUsed,
        fallbackReason: fallbackUsed
          ? persistedProviderFallbackReason(target, persistence)
          : undefined,
      });

      if (allowEmptyTargets || fallbackUsed) {
        continue;
      }

      throw new Error(
        `live multi-provider scan failed: provider=${target.providerKey} sourceBindingId=${target.sourceBindingId} queryMode=${target.sourceQuery.mode} reason=${failureReason}`,
        { cause: error },
      );
    }

    const fallbackUsed = shouldUsePersistedProviderFallback({
      target,
      result,
      persistence,
    });
    if (!allowEmptyTargets && !fallbackUsed) {
      assert(
        result.fetched > 0,
        `${target.providerKey} live scan must fetch at least one item`,
      );
      assert(
        result.inserted > 0,
        `${target.providerKey} live scan must insert at least one source item`,
      );
      assert(
        result.projected > 0,
        `${target.providerKey} live scan must project at least one feed item`,
      );
    }
    scanMetrics.push({
      providerKey: target.providerKey,
      sourceBindingId: target.sourceBindingId,
      status: "succeeded",
      fetched: result.fetched,
      inserted: result.inserted,
      projected: result.projected,
      skippedDuplicates: result.skippedDuplicates,
      fallbackUsed,
      fallbackReason: fallbackUsed
        ? persistedProviderFallbackReason(target, persistence)
        : undefined,
    });
  }

  const succeededSourceBindingIds = new Set(
    scanMetrics
      .filter((scan) => scan.status === "succeeded")
      .map((scan) => scan.sourceBindingId),
  );
  const successfulTargets = targets.filter((target) =>
    succeededSourceBindingIds.has(target.sourceBindingId),
  );
  const fallbackSourceBindingIds = new Set(
    scanMetrics
      .filter((scan) => scan.fallbackUsed === true)
      .map((scan) => scan.sourceBindingId),
  );
  const fallbackTargets = targets.filter((target) =>
    fallbackSourceBindingIds.has(target.sourceBindingId),
  );
  const nonFallbackFailures = scanMetrics.filter(
    (scan) => scan.status === "failed" && scan.fallbackUsed !== true,
  );

  if (!allowEmptyTargets) {
    const recoveredSourceBindingIds = new Set([
      ...succeededSourceBindingIds,
      ...fallbackSourceBindingIds,
    ]);
    assert(
      nonFallbackFailures.length === 0,
      "live multi-provider scans must not have non-fallback failures",
    );
    assert(
      recoveredSourceBindingIds.size === targets.length,
      "live multi-provider scans must either succeed or use an explicit persisted fallback",
    );
  } else {
    assert(successfulTargets.length > 0, "at least one live scan must succeed");
  }

  const feedReadLimit = Math.max(
    100,
    targets.reduce(
      (total, target) => total + maxItemsForProvider(target.providerKey),
      0,
    ),
  );
  const feed = await persistence.feedItems.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    observedAfter: persistence.feedObservedAfter,
    limit: feedReadLimit,
  });
  const feedSnapshots = feed.items.map((item) => item.toSnapshot());
  const requiredFeedTargets = allowEmptyTargets ? successfulTargets : targets;
  assert(
    feedSnapshots.length >= requiredFeedTargets.length,
    "live multi-provider scans must produce aggregated feed items",
  );
  const feedProviderKeys = new Set(
    feedSnapshots.map(
      (item) => targetBySourceBinding.get(item.sourceBindingId)?.providerKey,
    ),
  );
  for (const target of fallbackTargets) {
    assert(
      feedProviderKeys.has(target.providerKey),
      `persisted fallback must include recent ${target.providerKey} feed items`,
    );
  }
  for (const target of requiredFeedTargets) {
    assert(
      feedProviderKeys.has(target.providerKey),
      `aggregated feed must include ${target.providerKey}`,
    );
  }

  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryArtifacts = new InMemorySummaryArtifactRepository();
  const summaryEvents = new InMemorySummaryEventPublisher();
  const summaryQueue = new InMemorySummaryJobQueueAdapter(
    new InMemoryQueuePublisher(),
    metrics,
  );
  const summaryPolicies = new InMemorySummaryPolicyRepository();
  const summaryIds = new SequenceIdGenerator("live-multi-provider-summary");
  const summaryModel = maybeWrapSummaryPromptDebugModel(buildSummaryModel());
  const summaryPreference = summaryPreferenceForRun();
  await summaryPolicies.save(
    SummaryPolicy.create({
      id: "summary-policy-live-multi-provider-smoke",
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
      language: summaryPreference.language,
      format: summaryPreference.format,
      tone: summaryPreference.tone,
      maxKeyPoints: maxSummaryKeyPoints,
      includeRisks: summaryPreference.includeRisks,
      includeSourceHighlights: summaryPreference.includeSourceHighlights,
      customInstructions: summaryPreference.customInstructions,
      createdAt: sampledAt,
      updatedAt: sampledAt,
    }),
  );

  const requestSummary = new RequestSummaryUseCase(
    summaryJobs,
    summaryQueue,
    new AllowingSummaryQuota(),
    summaryIds,
    clock,
  );
  const request = unwrap(
    await requestSummary.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
      idempotencyKey: "live-multi-provider-summary-idempotency-key",
      correlationId: "corr-live-multi-provider-summary-smoke",
    }),
    "request live multi-provider summary",
  );

  assert(
    request.created,
    "live multi-provider summary request must create a job",
  );
  assert(
    summaryQueue.all().length === 1,
    "live multi-provider summary request must enqueue one job",
  );

  const executeSummary = new ExecuteSummaryJobUseCase(
    summaryJobs,
    summaryArtifacts,
    summaryPolicies,
    new NoopUserSummaryPreferenceReader(),
    new ConversationSummaryEvidenceSelector(
      new FeedSummaryEvidenceSelector(persistence.feedItems, clock),
      persistence.conversationUnits,
      persistence.conversationUnits,
      clock,
    ),
    summaryModel,
    summaryEvents,
    summaryIds,
    clock,
  );
  const summary = unwrap(
    await executeSummary.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: request.summaryJobId,
      maxEvidenceItems,
    }),
    "execute live multi-provider summary",
  );

  assert(
    summary.status === "completed",
    `live multi-provider summary must complete, got ${summary.status}`,
  );
  assert(
    summary.summaryId !== undefined,
    "live multi-provider summary must produce a summary id",
  );

  const artifact = await summaryArtifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: summary.summaryId,
  });
  assert(
    artifact !== null,
    "live multi-provider summary artifact must be persisted",
  );

  const artifactSnapshot = artifact.toSnapshot();
  const firstKeyPointClaim = artifactSnapshot.keyPoints[0]?.claim;
  assert(
    artifactSnapshot.headline.trim().length >= 12,
    `summary headline must be non-empty, got ${artifactSnapshot.headline}`,
  );
  if (summaryModelMode === "deterministic") {
    assert(
      artifactSnapshot.headline.startsWith("Interest summary:"),
      `summary headline must be topic-level, got ${artifactSnapshot.headline}`,
    );
  }
  assert(
    firstKeyPointClaim === undefined ||
      artifactSnapshot.headline !== firstKeyPointClaim,
    "summary headline must not repeat the first key point claim",
  );
  const feedById = new Map(feedSnapshots.map((item) => [item.id, item]));
  const selectedProviders = new Set(
    artifactSnapshot.sourceWindow.selectedFeedItemIds
      .map((feedItemId) => feedById.get(feedItemId))
      .map((item) =>
        item === undefined
          ? undefined
          : targetBySourceBinding.get(item.sourceBindingId)?.providerKey,
      )
      .filter(
        (providerKey): providerKey is LiveProviderKey =>
          providerKey !== undefined,
      ),
  );

  const requiredSummaryTargets = allowEmptyTargets
    ? targets.filter((target) => selectedProviders.has(target.providerKey))
    : targets;

  assert(
    requiredSummaryTargets.length > 0,
    "summary evidence window must include at least one provider",
  );

  for (const target of requiredSummaryTargets) {
    assert(
      selectedProviders.has(target.providerKey),
      `summary evidence window must include ${target.providerKey}`,
    );
  }

  const citedProviders = new Set(
    artifactSnapshot.citationMap.map((citation) => citation.providerKey),
  );
  const requiredProviderKeys = new Set(
    requiredSummaryTargets.map((target) => target.providerKey),
  );
  for (const target of requiredSummaryTargets) {
    assert(
      citedProviders.has(target.providerKey),
      `summary citation map must include ${target.providerKey}`,
    );
  }

  assert(
    artifactSnapshot.citationMap.length >= requiredProviderKeys.size,
    "live multi-provider summary must cite at least one item per unique provider",
  );
  assert(
    summaryEvents.all().some((event) => event.eventType === "summary.ready"),
    "live multi-provider summary must publish summary.ready",
  );

  const readerSummary = await runLiveReaderSummarySmoke({
    configuredInterests,
    tenant,
    workspace,
    interestId,
    feedItems: persistence.feedItems,
    conversationUnits: persistence.conversationUnits,
    feedSnapshots,
    targetBySourceBinding,
    targets,
    clock,
    metrics,
  });

  writeOptionalFrontendFixture({
    tenantId: tenant,
    workspaceId: workspace,
    userId: "user-live-multi-provider-summary-smoke",
    readerSummary,
  });

  const conversationUnitCount = await countConversationUnitsByRootFeedItemIds({
    tenantId: tenant,
    workspaceId: workspace,
    repository: persistence.conversationUnits,
    rootFeedItemIds: feedSnapshots.map((item) => item.id),
  });
  const selectedConversationUnitCountValue =
    await countConversationUnitsByRootFeedItemIds({
      tenantId: tenant,
      workspaceId: workspace,
      repository: persistence.conversationUnits,
      rootFeedItemIds: artifactSnapshot.sourceWindow.selectedFeedItemIds,
    });

  writeOptionalEvidenceArtifact({
    scanMetrics,
    feedItemCount: feedSnapshots.length,
    selectedFeedItemCount:
      artifactSnapshot.sourceWindow.selectedFeedItemIds.length,
    conversationUnitCount,
    selectedConversationUnitCount: selectedConversationUnitCountValue,
    selectedProviders: [...selectedProviders].sort(),
    citedProviders: [...citedProviders].sort(),
    citationCount: artifactSnapshot.citationMap.length,
    summaryStatus: summary.status,
    summaryReadyPublished: summaryEvents
      .all()
      .some((event) => event.eventType === "summary.ready"),
    summaryModelProvider: artifactSnapshot.lineage.providerVersion,
    summaryModelVersion: artifactSnapshot.lineage.modelVersion,
    summaryEstimatedCostUsd: artifactSnapshot.usage.estimatedCostUsd,
    summaryQualityFlags: artifactSnapshot.qualityFlags,
    readerSummary,
    targets,
  });

  console.log(
    [
      "Live multi-provider summary smoke OK",
      `Providers: ${targets.map((target) => target.providerKey).join(", ")}`,
      `Items per provider cap: ${maxItemsPerProvider}`,
      `Feed items: ${feedSnapshots.length}`,
      `Selected feed items: ${artifactSnapshot.sourceWindow.selectedFeedItemIds.length}`,
      `Selected providers: ${[...selectedProviders].sort().join(", ")}`,
      `Citations: ${artifactSnapshot.citationMap.length}`,
      `Summary model: ${artifactSnapshot.lineage.providerVersion}/${artifactSnapshot.lineage.modelVersion}`,
      `Summary id: ${summary.summaryId}`,
      `Headline: ${artifactSnapshot.headline}`,
      `ReaderSummary id: ${readerSummary.readerSummaryId}`,
      `ReaderSummary headline: ${readerSummary.readerHeadline}`,
      `ReaderSummary selected providers: ${readerSummary.selectedProviders.join(", ")}`,
      `ReaderSummary reader source mix: ${readerSummary.readerSourceMixProviders.join(", ")}`,
      `ReaderSummary reader source mix counts: ${JSON.stringify(readerSummary.readerSourceMixCounts)}`,
      `ReaderSummary top read providers: ${readerSummary.topReadProviders.join(", ")}`,
    ].join("\n"),
  );
};

void main()
  .finally(async () => {
    await livePersistenceToClose?.close();
  })
  .catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exit(1);
  });
