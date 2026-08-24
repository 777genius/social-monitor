import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import { ConversationUnitProjectionAdapter } from "@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter";
import { InMemoryConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/in-memory-conversation-unit.repository";
import { PrismaConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository";
import type {
  ConversationSignalBaselineRepositoryPort,
  ConversationUnitRepositoryPort,
} from "@social-monitor/conversation/ports";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import { OpenAiSourceContentQualityReviewerAdapter } from "@social-monitor/relevance/adapters/model/openai-source-content-quality-reviewer.adapter";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import {
  resolveRelevanceContentQualityOpenAiOptions,
  resolveRelevanceContentQualityReviewerMode,
} from "@social-monitor/relevance/interfaces/rest/relevance-provider-tokens";
import {
  NOOP_SOURCE_CONTENT_QUALITY_REVIEWER,
  type SourceContentQualityReviewerPort,
} from "@social-monitor/relevance/ports";
import {
  FixedClock,
  SystemClock,
  type Clock,
  type DomainError,
  type IdGenerator,
  ok,
  type Result,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import { FeedSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/feed-summary-evidence.selector";
import { ConversationEvidenceContextReader } from "@social-monitor/summary/adapters/evidence/conversation-evidence-context.reader";
import { ConversationReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/conversation-reader-summary-evidence.selector";
import { ConversationSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/conversation-summary-evidence.selector";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { InMemoryReaderSummaryJobQueueAdapter } from "@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter";
import { DeterministicSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-summary-model.adapter";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import {
  OpenAiResponsesReaderSummaryModelAdapter,
  resolveOpenAiResponsesReaderSummaryModelOptions,
} from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-model.adapter";
import {
  OpenAiResponsesSummaryModelAdapter,
  resolveOpenAiResponsesSummaryModelOptions,
} from "@social-monitor/summary/adapters/model/openai-responses-summary-model.adapter";
import {
  buildInstructions as buildSummaryInstructions,
  buildPromptPayload as buildSummaryPromptPayload,
} from "@social-monitor/summary/adapters/model/openai-responses-summary-prompt";
import { openAiSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-summary-schema";
import { AgentRuntimeReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter";
import { AgentRuntimeSummaryModelAdapter } from "@social-monitor/summary/adapters/model/agent-runtime-summary-model.adapter";
import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { InMemorySummaryJobQueueAdapter } from "@social-monitor/summary/adapters/messaging/in-memory-summary-job-queue.adapter";
import { NoopUserSummaryPreferenceReader } from "@social-monitor/summary/adapters/preferences/noop-user-summary-preference.reader";
import { InMemoryReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-publication";
import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import { ReaderSummaryPromotionMetricsRecorder } from "@social-monitor/summary/adapters/metrics/reader-summary-promotion-metrics.recorder";
import { InMemorySummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository";
import { InMemorySummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository";
import { InMemorySummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository";
import { ReaderSummaryPolicy, SummaryPolicy } from "@social-monitor/summary/domain";
import { aiDeveloperSignalSourcePreset, type SourceTargetPresetEntry, type SourceTargetPresetSummaryPreference } from "@social-monitor/subscriptions/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { readerSummaryPromotionControl } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { ExecuteSummaryJobUseCase } from "@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { RequestSummaryUseCase } from "@social-monitor/summary/features/request-summary/request-summary.use-case";
import { presentReaderSummaryArtifact } from "../libs/summary/features/shared/reader-summary-artifact-presenter";
import type {
  ReserveSummaryJobQuotaResult,
  ReaderSummaryModelPort,
  SummaryModelPort,
  SummaryQuotaPort,
} from "@social-monitor/summary/ports";
import { parse as parseDotenv } from "dotenv";

import { InMemoryFeedProjectionAdapter } from "../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter";
import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { InMemoryScanLeaseAdapter } from "../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter";
import { InMemoryScanAttemptRepository } from "../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository";
import { InMemoryScanCursorRepository } from "../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository";
import { InMemorySourceItemRepository } from "../libs/ingestion/adapters/persistence/in-memory-source-item.repository";
import { PrismaScanAttemptRepository } from "../libs/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanCursorRepository } from "../libs/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository";
import { PrismaSourceItemRepository } from "../libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import { InMemoryScanFailureQueueAdapter } from "../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter";
import { PrismaScanFailureQueueAdapter } from "../libs/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter";
import { PrismaScanLeaseAdapter } from "../libs/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import {
  GITHUB_ISSUES_PROVIDER_KEY,
  GitHubSourceProvider,
} from "../libs/ingestion/adapters/source/github/github-source.provider";
import { HttpGitHubClient } from "../libs/ingestion/adapters/source/github/http-github-client";
import { GitHubTrendingPageSourceProvider } from "../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider";
import { HttpGitHubTrendingPageClient } from "../libs/ingestion/adapters/source/github-trending-page/http-github-trending-page-client";
import { HackerNewsSourceProvider } from "../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import { HttpHackerNewsClient } from "../libs/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import { InMemorySourceProviderRegistry } from "../libs/ingestion/adapters/source/in-memory-source-provider.registry";
import { RedditAppOnlyTokenProvider } from "../libs/ingestion/adapters/source/reddit/app-only-reddit-token-provider";
import {
  HttpRedditClient,
  redditListings,
} from "../libs/ingestion/adapters/source/reddit/http-reddit-client";
import type { RedditPostListing } from "../libs/ingestion/adapters/source/reddit/reddit-client.port";
import { RedditSourceProvider } from "../libs/ingestion/adapters/source/reddit/reddit-source.provider";
import { readCommentSort } from "../libs/ingestion/adapters/source/reddit/reddit-source-support";
import { HttpRssClient } from "../libs/ingestion/adapters/source/rss/http-rss-client";
import { RssSourceProvider } from "../libs/ingestion/adapters/source/rss/rss-source.provider";
import { RegistrySourceFetcherAdapter } from "../libs/ingestion/adapters/source/registry-source-fetcher.adapter";
import { sourceReadinessProfiles } from "../libs/ingestion/adapters/source/source-readiness-profiles";
import { GrpcXDailyCollectorClient } from "../libs/ingestion/adapters/source/x-twitter-experimental-daily/grpc-x-daily-collector-client";
import { XTwitterSourceProvider } from "../libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider";
import { ExecuteScanUseCase } from "../libs/ingestion/features/execute-scan/execute-scan.use-case";
import { SourceFetchError } from "../libs/ingestion/ports";
import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  FeedProjectionPort,
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanAttemptRepositoryPort,
  ScanCursorRepositoryPort,
  ScanExecutionReporterPort,
  ScanFailureQueuePort,
  ScanLeasePort,
  SourceConfigReaderPort,
  SourceFetcherPort,
  SourceItemRepositoryPort,
  SourceQuery,
  SourceRuntimeConfig,
} from "../libs/ingestion/ports";
import { writeLiveEvidenceArtifactAtomically } from "./lib/live-evidence-artifact";

type LiveProviderKey =
  | "reddit"
  | "github-issues"
  | "github-trending-page"
  | "hacker-news"
  | "rss"
  | "x-twitter";

type ScanTarget = {
  readonly providerKey: LiveProviderKey;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly sourceQuery: SourceQuery;
  readonly config: SourceRuntimeConfig;
};

type LivePersistenceMode = "in-memory" | "prisma";

type LivePersistenceConfig =
  | {
      readonly mode: "in-memory";
    }
  | {
      readonly mode: "prisma";
      readonly rawDatabaseUrl: string;
      readonly databaseUrl: string;
      readonly migrate: boolean;
      readonly feedFreshnessStartedAt: Date;
    };

type ConversationUnitEvidenceRepository = ConversationUnitRepositoryPort &
  ConversationSignalBaselineRepositoryPort;

type LivePersistenceBundle = {
  readonly mode: LivePersistenceMode;
  readonly feedItems: FeedItemReadRepositoryPort;
  readonly conversationUnits: ConversationUnitEvidenceRepository;
  readonly sourceItems: SourceItemRepositoryPort;
  readonly feedProjection: FeedProjectionPort;
  readonly scanAttempts: ScanAttemptRepositoryPort;
  readonly scanCursors: ScanCursorRepositoryPort;
  readonly scanFailures: ScanFailureQueuePort;
  readonly scanLeases: ScanLeasePort;
  readonly sourceItemIds: IdGenerator;
  readonly conversationUnitIds: IdGenerator;
  readonly feedObservedAfter?: Date;
  close(): Promise<void>;
};

type ScanMetrics = {
  readonly providerKey: LiveProviderKey;
  readonly sourceBindingId: string;
  readonly status: "succeeded" | "failed";
  readonly fetched: number;
  readonly inserted: number;
  readonly projected: number;
  readonly skippedDuplicates: number;
  readonly failureReason?: string;
  readonly fallbackUsed?: boolean;
  readonly fallbackReason?: string;
};

type LiveReaderSummarySmokeResult = {
  readonly readerSummaryId: string;
  readonly readerHeadline: string;
  readonly selectedProviders: readonly LiveProviderKey[];
  readonly citedProviders: readonly string[];
  readonly readerSourceMixProviders: readonly string[];
  readonly readerSourceMixCounts: Readonly<Record<string, number>>;
  readonly topReadProviders: readonly string[];
  readonly topReadCount: number;
  readonly qualityFlags: readonly string[];
  readonly frontendArtifact: unknown;
};

const sourcePresetMode = readSourcePresetMode();
const timeoutMs = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_TIMEOUT_MS",
  sourcePresetMode === aiDeveloperSignalSourcePreset.presetId ? 30_000 : 12_000,
  1_000,
  60_000,
);
const maxItemsPerProvider = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_MAX_ITEMS_PER_PROVIDER",
  sourcePresetMode === aiDeveloperSignalSourcePreset.presetId ? 30 : 10,
  1,
  50,
);
const maxEvidenceItems = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_MAX_EVIDENCE_ITEMS",
  sourcePresetMode === aiDeveloperSignalSourcePreset.presetId ? 200 : 30,
  4,
  200,
);
const maxSummaryKeyPoints = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_MAX_KEY_POINTS",
  10,
  1,
  10,
);
const liveSummaryMaxInputTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_MAX_INPUT_TOKENS",
  80_000,
  12_000,
  160_000,
);
const liveSummaryMaxOutputTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_MAX_OUTPUT_TOKENS",
  8_000,
  4_000,
  16_000,
);
const liveSummaryBudgetTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_BUDGET_TOKENS",
  120_000,
  20_000,
  200_000,
);
const liveReaderSummaryMaxInputTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_READER_SUMMARY_MAX_INPUT_TOKENS",
  48_000,
  24_000,
  100_000,
);
const liveReaderSummaryMaxOutputTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_READER_SUMMARY_MAX_OUTPUT_TOKENS",
  8_000,
  4_000,
  16_000,
);
const liveReaderSummaryBudgetTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_READER_SUMMARY_BUDGET_TOKENS",
  80_000,
  32_000,
  160_000,
);
const xTwitterMaxItems = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_X_MAX_ITEMS",
  60,
  1,
  100,
);
const xTwitterLimitPerProduct = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_X_LIMIT_PER_PRODUCT",
  Math.max(50, xTwitterMaxItems),
  1,
  100,
);
const redditIncludeComments = readBooleanEnv(
  "LIVE_MULTI_PROVIDER_REDDIT_INCLUDE_COMMENTS",
  true,
);
const redditMaxCommentsPerPost = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_REDDIT_MAX_COMMENTS_PER_POST",
  5,
  1,
  100,
);
const redditCommentDepth = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_REDDIT_COMMENT_DEPTH",
  2,
  0,
  10,
);
const redditCommentSort = readCommentSort(
  readOptionalEnv("LIVE_MULTI_PROVIDER_REDDIT_COMMENT_SORT") ?? "confidence",
);
const allowEmptyTargets = readBooleanEnv(
  "LIVE_MULTI_PROVIDER_ALLOW_EMPTY_TARGETS",
  sourcePresetMode === aiDeveloperSignalSourcePreset.presetId,
);
const xFallbackFreshnessMinutes = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_X_FALLBACK_FRESHNESS_MINUTES",
  24 * 60,
  1,
  7 * 24 * 60,
);
const sampledAtEnv = "LIVE_MULTI_PROVIDER_SAMPLED_AT";
const sampledAt =
  readOptionalDateEnv(sampledAtEnv) ?? new Date("2026-06-21T00:00:00.000Z");
const evidencePathEnv = "LIVE_MULTI_PROVIDER_SUMMARY_EVIDENCE_PATH";
const frontendFixturePathEnv =
  "LIVE_MULTI_PROVIDER_SUMMARY_FRONTEND_FIXTURE_PATH";
const summaryPromptDebugPathEnv =
  "LIVE_MULTI_PROVIDER_SUMMARY_PROMPT_DEBUG_PATH";
const summaryModelMode = readSummaryModelMode();
const readerSummaryModelMode = readReaderSummaryModelMode();

class StaticSourceConfigReader implements SourceConfigReaderPort {
  constructor(
    private readonly configsBySourceBinding: ReadonlyMap<
      string,
      SourceRuntimeConfig
    >,
  ) {}

  async readConfig(params: {
    readonly sourceBindingId: string;
  }): Promise<SourceRuntimeConfig | null> {
    return this.configsBySourceBinding.get(params.sourceBindingId) ?? null;
  }
}

class LimitedSourceFetcher implements SourceFetcherPort {
  constructor(
    private readonly delegate: SourceFetcherPort,
    private readonly maxItemsByProvider: ReadonlyMap<string, number>,
  ) {}

  async fetch(
    command: FetchSourceItemsCommand,
  ): Promise<FetchSourceItemsResult> {
    const result = await this.delegate.fetch(command);
    const maxItems = this.maxItemsByProvider.get(command.providerKey);

    if (maxItems === undefined || result.items.length <= maxItems) {
      return result;
    }

    const items = result.items.slice(0, maxItems);
    const selectedExternalIds = new Set(items.map((item) => item.externalId));

    return {
      items,
      conversationUnits: (result.conversationUnits ?? []).filter((unit) =>
        selectedExternalIds.has(unit.rootExternalId),
      ),
      nextCursor: result.nextCursor,
    };
  }
}

class CapturingScanExecutionReporter implements ScanExecutionReporterPort {
  readonly succeeded: ReportScanSucceededCommand[] = [];
  readonly failed: ReportScanFailedCommand[] = [];

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed.push(command);
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): Promise<
    Result<ReserveSummaryJobQuotaResult, DomainError>
  > {
    return ok({
      remaining: 999,
      resetAt: "2026-06-21T01:00:00.000Z",
    });
  }
}

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  constructor(private readonly prefix: string) {}

  generate(): string {
    const id = `${this.prefix}-${this.nextId}`;
    this.nextId += 1;

    return id;
  }
}

class RandomUuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};

let livePersistenceToClose: LivePersistenceBundle | undefined;

const readLivePersistenceConfig = (): LivePersistenceConfig => {
  const mode =
    readOptionalEnv("LIVE_MULTI_PROVIDER_PERSISTENCE") ?? "in-memory";
  if (mode === "in-memory") {
    return { mode };
  }

  if (mode !== "prisma") {
    throw new Error(
      'LIVE_MULTI_PROVIDER_PERSISTENCE must be "in-memory" or "prisma"',
    );
  }

  assert(
    readBooleanEnv("LIVE_MULTI_PROVIDER_E2E_ALLOW_PERSISTENCE", false),
    "LIVE_MULTI_PROVIDER_PERSISTENCE=prisma requires LIVE_MULTI_PROVIDER_E2E_ALLOW_PERSISTENCE=true",
  );

  const rawDatabaseUrl = readOptionalEnv(
    "LIVE_MULTI_PROVIDER_E2E_DATABASE_URL",
  );
  assert(
    rawDatabaseUrl !== undefined,
    "LIVE_MULTI_PROVIDER_PERSISTENCE=prisma requires LIVE_MULTI_PROVIDER_E2E_DATABASE_URL",
  );

  const schema = readOptionalEnv("LIVE_MULTI_PROVIDER_E2E_SCHEMA");
  assert(
    schema === undefined,
    [
      "LIVE_MULTI_PROVIDER_E2E_SCHEMA is not supported with the current PrismaPg runtime.",
      "Use a separate LIVE_MULTI_PROVIDER_E2E_DATABASE_URL for live E2E isolation.",
    ].join(" "),
  );

  const productionDatabaseUrl = readOptionalEnv("DATABASE_URL");
  if (productionDatabaseUrl !== undefined) {
    assert(
      !sameDatabaseUrl(rawDatabaseUrl, productionDatabaseUrl),
      "LIVE_MULTI_PROVIDER_E2E_DATABASE_URL must point at a separate test database, not DATABASE_URL.",
    );
  }

  const feedFreshnessStartedAt = new Date(
    sampledAt.getTime() - xFallbackFreshnessMinutes * 60_000,
  );

  return {
    mode,
    rawDatabaseUrl,
    databaseUrl: rawDatabaseUrl,
    migrate: readBooleanEnv("LIVE_MULTI_PROVIDER_E2E_MIGRATE", true),
    feedFreshnessStartedAt,
  };
};

const createLivePersistence = async (params: {
  readonly config: LivePersistenceConfig;
  readonly metrics: InMemoryMetricsRecorder;
}): Promise<LivePersistenceBundle> => {
  if (params.config.mode === "in-memory") {
    const feedItems = new InMemoryFeedItemReadRepository();
    const conversationUnits = new InMemoryConversationUnitRepository();

    return {
      mode: "in-memory",
      feedItems,
      conversationUnits,
      sourceItems: new InMemorySourceItemRepository(),
      feedProjection: new InMemoryFeedProjectionAdapter(feedItems),
      scanAttempts: new InMemoryScanAttemptRepository(),
      scanCursors: new InMemoryScanCursorRepository(),
      scanFailures: new InMemoryScanFailureQueueAdapter(params.metrics),
      scanLeases: new InMemoryScanLeaseAdapter(),
      sourceItemIds: new SequenceIdGenerator("live-multi-provider-source-item"),
      conversationUnitIds: new SequenceIdGenerator(
        "live-multi-provider-conversation-unit",
      ),
      async close() {},
    };
  }

  await prepareLiveE2eDatabase(params.config);

  process.env.DATABASE_URL = params.config.databaseUrl;
  const connection = await PrismaIngestionWorkerConnection.createForProcess(params.config.databaseUrl, "admin-tool");
  const ids = new RandomUuidGenerator();
  const conversationUnits = new PrismaConversationUnitRepository(
    connection,
    ids,
  );

  return {
    mode: "prisma",
    feedItems: new PrismaFeedItemReadRepository(connection),
    conversationUnits,
    sourceItems: new PrismaSourceItemRepository(connection),
    feedProjection: new PrismaFeedProjectionAdapter(connection, ids),
    scanAttempts: new PrismaScanAttemptRepository(connection),
    scanCursors: new PrismaScanCursorRepository(connection, ids),
    scanFailures: new PrismaScanFailureQueueAdapter(
      connection,
      params.metrics,
      ids,
    ),
    scanLeases: new PrismaScanLeaseAdapter(connection, ids),
    sourceItemIds: ids,
    conversationUnitIds: ids,
    feedObservedAfter: params.config.feedFreshnessStartedAt,
    close: () => connection.close(),
  };
};

const prepareLiveE2eDatabase = async (
  config: Extract<LivePersistenceConfig, { readonly mode: "prisma" }>,
): Promise<void> => {
  if (!config.migrate) {
    return;
  }

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: config.databaseUrl,
      },
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error("Live multi-provider E2E database migration failed");
  }
};

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

const runLiveReaderSummarySmoke = async (params: {
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly interestId: string;
  readonly feedItems: FeedItemReadRepositoryPort;
  readonly conversationUnits: ConversationUnitEvidenceRepository;
  readonly feedSnapshots: readonly {
    readonly id: string;
    readonly sourceBindingId: string;
  }[];
  readonly targetBySourceBinding: ReadonlyMap<string, ScanTarget>;
  readonly targets: readonly ScanTarget[];
  readonly clock: Clock;
  readonly metrics: InMemoryMetricsRecorder;
}): Promise<LiveReaderSummarySmokeResult> => {
  const readerSummaryJobs = new InMemoryReaderSummaryJobRepository();
  const readerSummaryArtifacts = new InMemoryReaderSummaryArtifactRepository();
  const readerSummaryPolicies = new InMemoryReaderSummaryPolicyRepository();
  const readerSummaryEvents = new InMemorySummaryEventPublisher();
  const readerSummaryQueue = new InMemoryReaderSummaryJobQueueAdapter();
  const readerSummaryIds = new SequenceIdGenerator(
    "live-multi-provider-readerSummary",
  );
  const scope = { type: "workspace" } as const;
  const summaryPreference = summaryPreferenceForRun();

  await readerSummaryPolicies.save(
    ReaderSummaryPolicy.create({
      id: "readerSummary-policy-live-multi-provider-smoke",
      tenantId: params.tenant,
      workspaceId: params.workspace,
      scope,
      language: "auto",
      format: "executive_brief",
      tone: "analytical",
      maxStories: Math.min(maxSummaryKeyPoints, 10),
      includeRisks: true,
      includeInterestHighlights: true,
      includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title",
      customInstructions: [
        summaryPreference.customInstructions,
        "Build the reader-facing summary around social/news signals first; treat GitHub repository signals as supporting evidence unless they are cross-confirmed by social/news sources.",
        "Prioritize concrete developer, product, security, release and operator-workflow signals over personal anecdotes; keep health, medical or personal-use stories as follow-up adoption examples unless the topic explicitly asks for healthcare.",
      ].join(" "),
      createdAt: sampledAt,
      updatedAt: sampledAt,
    }),
  );

  const requestReaderSummary = new RequestReaderSummaryUseCase(
    readerSummaryJobs,
    readerSummaryQueue,
    new AllowingSummaryQuota(),
    readerSummaryIds,
    params.clock,
  );
  const request = unwrap(
    await requestReaderSummary.execute({
      tenantId: params.tenant,
      workspaceId: params.workspace,
      scope,
      idempotencyKey: "live-multi-provider-readerSummary-idempotency-key",
      correlationId: "corr-live-multi-provider-readerSummary-smoke",
    }),
    "request live multi-provider readerSummary",
  );

  assert(
    request.created,
    "live multi-provider readerSummary request must create a job",
  );
  assert(
    readerSummaryQueue.all().length === 1,
    "live multi-provider readerSummary request must enqueue one job",
  );

  const rankFeedItems = new RankFeedItemsUseCase(
    params.feedItems,
    new InMemoryUserRelevanceProfileRepository(),
    params.clock,
    undefined,
    undefined,
    undefined,
    buildSourceContentQualityReviewer(),
  );
  const evidenceSelector = new ConversationReaderSummaryEvidenceSelector(
    new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      params.feedItems,
      params.clock,
    ),
    new ConversationEvidenceContextReader(
      params.conversationUnits,
      params.conversationUnits,
      params.clock,
    ),
  );
  const executeReaderSummary = new ExecuteReaderSummaryJobUseCase(
    readerSummaryJobs,
    readerSummaryArtifacts,
    readerSummaryPolicies,
    evidenceSelector,
    buildReaderSummaryModel(),
    new InMemoryReaderSummaryPublication(readerSummaryJobs, readerSummaryArtifacts, readerSummaryEvents),
    readerSummaryIds,
    params.clock,
    readerSummaryPromotionControl(new ReaderSummaryPromotionMetricsRecorder(params.metrics)),
  );
  const readerSummary = unwrap(
    await executeReaderSummary.execute({
      tenantId: params.tenant,
      workspaceId: params.workspace,
      readerSummaryJobId: request.readerSummaryJobId,
      maxEvidenceItems,
    }),
    "execute live multi-provider readerSummary",
  );

  assert(
    readerSummary.status === "completed",
    `live multi-provider readerSummary must complete, got ${readerSummary.status}`,
  );
  assert(
    readerSummary.readerSummaryId !== undefined,
    "live multi-provider readerSummary must produce a readerSummary id",
  );

  const artifact = await readerSummaryArtifacts.findById({
    tenantId: params.tenant,
    workspaceId: params.workspace,
    readerSummaryId: readerSummary.readerSummaryId,
  });
  assert(
    artifact !== null,
    "live multi-provider readerSummary artifact must be persisted",
  );

  const artifactSnapshot = artifact.toSnapshot();
  const feedById = new Map(params.feedSnapshots.map((item) => [item.id, item]));
  const selectedProviders = new Set(
    artifactSnapshot.sourceWindow.selectedFeedItemIds
      .map((feedItemId) => feedById.get(feedItemId))
      .map((item) =>
        item === undefined
          ? undefined
          : params.targetBySourceBinding.get(item.sourceBindingId)?.providerKey,
      )
      .filter(
        (providerKey): providerKey is LiveProviderKey =>
          providerKey !== undefined,
      ),
  );
  const citedProviders = new Set(
    artifactSnapshot.citationMap.map((citation) => citation.providerKey),
  );
  const readerBrief = artifactSnapshot.content;
  assert(
    readerBrief !== undefined,
    "live multi-provider readerSummary must include reader summary content",
  );
  const readerSourceMixProviders = new Set(
    readerBrief.sourceMix.map((entry) => entry.providerKey),
  );
  const topReadProviders = new Set(
    readerBrief.topReads.map((item) => item.providerKey),
  );
  const firstTopReadTitle = readerBrief.topReads[0]?.title;

  assert(
    readerBrief.headline.trim().length >= 12,
    `readerSummary reader headline must be non-empty, got ${readerBrief.headline}`,
  );
  assert(
    !isSourceInventoryText(readerBrief.headline),
    `readerSummary reader headline must express the situation instead of listing sources, got ${readerBrief.headline}`,
  );
  assert(
    !isSourceInventoryText(readerBrief.oneLineTakeaway),
    `readerSummary reader takeaway must express the situation instead of listing sources, got ${readerBrief.oneLineTakeaway}`,
  );
  if (readerSummaryModelMode === "deterministic") {
    assert(
      readerBrief.headline.startsWith("Workspace readerSummary:") ||
        readerBrief.headline.startsWith("Source watch across "),
      `readerSummary reader headline must be reader-facing, got ${readerBrief.headline}`,
    );
  }
  assert(
    firstTopReadTitle === undefined ||
      readerBrief.headline !== firstTopReadTitle,
    "readerSummary reader headline must not repeat the first top read title",
  );

  const requiredReaderTargets =
    allowEmptyTargets || readerSummaryModelMode !== "deterministic"
      ? params.targets.filter((target) =>
          selectedProviders.has(target.providerKey),
        )
      : params.targets;
  const requiredProviderCount = new Set(
    requiredReaderTargets.map((target) => target.providerKey),
  ).size;

  assert(
    requiredProviderCount > 0,
    "readerSummary evidence window must include at least one provider",
  );

  for (const target of requiredReaderTargets) {
    assert(
      selectedProviders.has(target.providerKey),
      `readerSummary evidence window must include ${target.providerKey}`,
    );
    if (readerSummaryModelMode === "deterministic") {
      assert(
        citedProviders.has(target.providerKey),
        `readerSummary citation map must include ${target.providerKey}`,
      );
      assert(
        readerSourceMixProviders.has(target.providerKey),
        `readerSummary reader source mix must include ${target.providerKey}`,
      );
    }
  }
  if (!allowEmptyTargets && readerSummaryModelMode !== "deterministic") {
    for (const providerKey of ["x-twitter", "reddit"] as const) {
      const providerWasTargeted = params.targets.some(
        (target) => target.providerKey === providerKey,
      );
      if (!providerWasTargeted) {
        continue;
      }

      assert(
        selectedProviders.has(providerKey),
        `readerSummary evidence window must include ${providerKey}`,
      );
      assert(
        citedProviders.has(providerKey) ||
          readerSourceMixProviders.has(providerKey) ||
          topReadProviders.has(providerKey),
        `readerSummary output must surface ${providerKey}`,
      );
    }
  }
  assert(
    topReadProviders.size >= Math.min(2, requiredProviderCount),
    `readerSummary top reads must include a diverse provider mix, got ${[...topReadProviders].join(", ")}`,
  );
  if (readerSummaryModelMode !== "deterministic") {
    assert(
      citedProviders.size >= Math.min(3, requiredProviderCount),
      `readerSummary citation map must include a diverse provider mix, got ${[...citedProviders].join(", ")}`,
    );
    assert(
      readerSourceMixProviders.size >= Math.min(3, requiredProviderCount),
      `readerSummary source mix must include a diverse provider mix, got ${[...readerSourceMixProviders].join(", ")}`,
    );
  }

  assert(
    readerSummaryEvents
      .all()
      .some((event) => event.eventType === "reader_summary.ready"),
    "live multi-provider readerSummary must publish reader_summary.ready",
  );

  return {
    readerSummaryId: readerSummary.readerSummaryId,
    readerHeadline: readerBrief.headline,
    selectedProviders: [...selectedProviders].sort(),
    citedProviders: [...citedProviders].sort(),
    readerSourceMixProviders: [...readerSourceMixProviders].sort(),
    readerSourceMixCounts: Object.fromEntries(
      readerBrief.sourceMix.map((entry) => [
        entry.providerKey,
        entry.itemCount,
      ]),
    ),
    topReadProviders: [...topReadProviders].sort(),
    topReadCount: readerBrief.topReads.length,
    qualityFlags: artifactSnapshot.qualityFlags,
    frontendArtifact: presentReaderSummaryArtifact(artifact, {
      status: "fresh",
      checkedAt: params.clock.now(),
    }),
  };
};

const buildSummaryModel = (): SummaryModelPort => {
  if (summaryModelMode === "deterministic") {
    return new DeterministicSummaryModelAdapter();
  }

  if (summaryModelMode === "agent-runtime") {
    return new LiveBudgetSummaryModel(
      new AgentRuntimeSummaryModelAdapter({
        client: buildAgentRuntimeClient("summary"),
        agentProvider: readAgentRuntimeProvider(),
        providerInstanceId: readOptionalEnv(
          "AGENT_RUNTIME_PROVIDER_INSTANCE_ID",
        ),
        model: readOptionalEnv("LIVE_MULTI_PROVIDER_AGENT_RUNTIME_MODEL"),
        timeoutMs: readPositiveIntegerEnv(
          "AGENT_RUNTIME_SUMMARY_TIMEOUT_MS",
          180_000,
          1_000,
          600_000,
        ),
        maxOutputTokens: liveSummaryMaxOutputTokens,
      }),
    );
  }

  return new LiveBudgetSummaryModel(
    new OpenAiResponsesSummaryModelAdapter(
      resolveOpenAiResponsesSummaryModelOptions(process.env, {
        requireApiKey: true,
      }),
    ),
  );
};

const maybeWrapSummaryPromptDebugModel = (
  model: SummaryModelPort,
): SummaryModelPort => {
  const debugPath = readOptionalEnv(summaryPromptDebugPathEnv);
  if (debugPath === undefined) {
    return model;
  }

  return new DebugDumpSummaryPromptModel(model, debugPath);
};

class DebugDumpSummaryPromptModel implements SummaryModelPort {
  constructor(
    private readonly delegate: SummaryModelPort,
    private readonly debugPath: string,
  ) {}

  route(
    input: Parameters<SummaryModelPort["route"]>[0],
    policy: Parameters<SummaryModelPort["route"]>[1],
    budget: Parameters<SummaryModelPort["route"]>[2],
  ): ReturnType<SummaryModelPort["route"]> {
    return this.delegate.route(input, policy, budget);
  }

  estimate(
    input: Parameters<SummaryModelPort["estimate"]>[0],
    route: Parameters<SummaryModelPort["estimate"]>[1],
  ): ReturnType<SummaryModelPort["estimate"]> {
    return this.delegate.estimate(input, route);
  }

  summarize(
    input: Parameters<SummaryModelPort["summarize"]>[0],
    route: Parameters<SummaryModelPort["summarize"]>[1],
  ): ReturnType<SummaryModelPort["summarize"]> {
    writeFileSync(
      this.debugPath,
      JSON.stringify(
        {
          systemPrompt: buildSummaryInstructions(input),
          prompt: buildSummaryPromptPayload(input),
          outputSchema: openAiSummaryJsonSchema,
          route,
        },
        null,
        2,
      ),
      "utf8",
    );

    return this.delegate.summarize(input, route);
  }

  validateRawProviderResponse(
    attempt: Parameters<SummaryModelPort["validateRawProviderResponse"]>[0],
  ): ReturnType<SummaryModelPort["validateRawProviderResponse"]> {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(
    error: Parameters<SummaryModelPort["classifyError"]>[0],
  ): ReturnType<SummaryModelPort["classifyError"]> {
    return this.delegate.classifyError(error);
  }
}

const buildReaderSummaryModel = (): ReaderSummaryModelPort => {
  if (readerSummaryModelMode === "deterministic") {
    return new DeterministicReaderSummaryModelAdapter();
  }

  if (readerSummaryModelMode === "agent-runtime") {
    return new LiveBudgetReaderSummaryModel(
      new AgentRuntimeReaderSummaryModelAdapter({
        client: buildAgentRuntimeClient("reader-summary"),
        agentProvider: readAgentRuntimeProvider(),
        providerInstanceId: readOptionalEnv(
          "AGENT_RUNTIME_PROVIDER_INSTANCE_ID",
        ),
        model: readOptionalEnv(
          "LIVE_MULTI_PROVIDER_AGENT_RUNTIME_READER_MODEL",
        ),
        timeoutMs: readPositiveIntegerEnv(
          "AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS",
          240_000,
          1_000,
          600_000,
        ),
        maxOutputTokens: liveReaderSummaryMaxOutputTokens,
      }),
    );
  }

  return new LiveBudgetReaderSummaryModel(
    new OpenAiResponsesReaderSummaryModelAdapter(
      resolveOpenAiResponsesReaderSummaryModelOptions(process.env, {
        requireApiKey: true,
      }),
    ),
  );
};

const buildAgentRuntimeClient = (service: string): GrpcAgentRuntimeClient =>
  GrpcAgentRuntimeClient.connect({
    address: readOptionalEnv("AGENT_RUNTIME_GRPC_ADDRESS") ?? "127.0.0.1:50052",
    clock: new SystemClock(),
    options: {
      timeoutMs: readPositiveIntegerEnv(
        "AGENT_RUNTIME_TIMEOUT_MS",
        service === "reader-summary" ? 240_000 : 180_000,
        1_000,
        600_000,
      ),
      serviceToken: readOptionalEnv("AGENT_RUNTIME_SERVICE_TOKEN"),
    },
  });

const readAgentRuntimeProvider = (): "codex" | "claude" => {
  const value = readOptionalEnv("AGENT_RUNTIME_PROVIDER") ?? "codex";
  if (value === "codex" || value === "claude") {
    return value;
  }

  throw new Error('AGENT_RUNTIME_PROVIDER must be "codex" or "claude"');
};

class LiveBudgetSummaryModel implements SummaryModelPort {
  constructor(private readonly delegate: SummaryModelPort) {}

  route(
    input: Parameters<SummaryModelPort["route"]>[0],
    policy: Parameters<SummaryModelPort["route"]>[1],
    budget: Parameters<SummaryModelPort["route"]>[2],
  ): ReturnType<SummaryModelPort["route"]> {
    return this.delegate.route(
      input,
      {
        ...policy,
        maxInputTokens: Math.max(
          policy.maxInputTokens,
          liveSummaryMaxInputTokens,
        ),
        maxOutputTokens: Math.max(
          policy.maxOutputTokens,
          liveSummaryMaxOutputTokens,
        ),
      },
      {
        ...budget,
        remainingTokens: Math.max(
          budget.remainingTokens,
          liveSummaryBudgetTokens,
        ),
      },
    );
  }

  estimate(
    input: Parameters<SummaryModelPort["estimate"]>[0],
    route: Parameters<SummaryModelPort["estimate"]>[1],
  ): ReturnType<SummaryModelPort["estimate"]> {
    return this.delegate.estimate(input, route);
  }

  summarize(
    input: Parameters<SummaryModelPort["summarize"]>[0],
    route: Parameters<SummaryModelPort["summarize"]>[1],
  ): ReturnType<SummaryModelPort["summarize"]> {
    return this.delegate.summarize(input, route);
  }

  validateRawProviderResponse(
    attempt: Parameters<SummaryModelPort["validateRawProviderResponse"]>[0],
  ): ReturnType<SummaryModelPort["validateRawProviderResponse"]> {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(
    error: Parameters<SummaryModelPort["classifyError"]>[0],
  ): ReturnType<SummaryModelPort["classifyError"]> {
    return this.delegate.classifyError(error);
  }
}

class LiveBudgetReaderSummaryModel implements ReaderSummaryModelPort {
  constructor(private readonly delegate: ReaderSummaryModelPort) {}

  route(
    input: Parameters<ReaderSummaryModelPort["route"]>[0],
    policy: Parameters<ReaderSummaryModelPort["route"]>[1],
    budget: Parameters<ReaderSummaryModelPort["route"]>[2],
  ): ReturnType<ReaderSummaryModelPort["route"]> {
    return this.delegate.route(
      input,
      {
        ...policy,
        maxInputTokens: Math.max(
          policy.maxInputTokens,
          liveReaderSummaryMaxInputTokens,
        ),
        maxOutputTokens: Math.max(
          policy.maxOutputTokens,
          liveReaderSummaryMaxOutputTokens,
        ),
      },
      {
        ...budget,
        remainingTokens: Math.max(
          budget.remainingTokens,
          liveReaderSummaryBudgetTokens,
        ),
      },
    );
  }

  estimate(
    input: Parameters<ReaderSummaryModelPort["estimate"]>[0],
    route: Parameters<ReaderSummaryModelPort["estimate"]>[1],
  ): ReturnType<ReaderSummaryModelPort["estimate"]> {
    return this.delegate.estimate(input, route);
  }

  generate(
    input: Parameters<ReaderSummaryModelPort["generate"]>[0],
    route: Parameters<ReaderSummaryModelPort["generate"]>[1],
  ): ReturnType<ReaderSummaryModelPort["generate"]> {
    return this.delegate.generate(input, route);
  }

  validateRawProviderResponse(
    attempt: Parameters<
      ReaderSummaryModelPort["validateRawProviderResponse"]
    >[0],
  ): ReturnType<ReaderSummaryModelPort["validateRawProviderResponse"]> {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(
    error: Parameters<ReaderSummaryModelPort["classifyError"]>[0],
  ): ReturnType<ReaderSummaryModelPort["classifyError"]> {
    return this.delegate.classifyError(error);
  }
}

const buildSourceContentQualityReviewer =
  (): SourceContentQualityReviewerPort => {
    const mode = resolveRelevanceContentQualityReviewerMode(process.env);

    if (mode === "disabled") {
      return NOOP_SOURCE_CONTENT_QUALITY_REVIEWER;
    }

    return new OpenAiSourceContentQualityReviewerAdapter(
      resolveRelevanceContentQualityOpenAiOptions(process.env, {
        requireApiKey: true,
      }),
    );
  };

const buildScanTargets = (): readonly ScanTarget[] => {
  const userAgent =
    readOptionalEnv("LIVE_MULTI_PROVIDER_USER_AGENT") ??
    "social-monitor-mvp-live-multi-provider-summary/0.1";
  const includeXTwitter = shouldIncludeXTwitterTargets();
  const includeGithubSupporting = shouldIncludeGithubSupportingTargets();
  if (sourcePresetMode === aiDeveloperSignalSourcePreset.presetId) {
    return [
      ...presetScanTargets({
        userAgent,
        includeXTwitter,
      }),
      ...(includeGithubSupporting
        ? supplementalGithubScanTargets(userAgent)
        : []),
    ];
  }

  const subreddits = readCsvEnv("LIVE_MULTI_PROVIDER_REDDIT_SUBREDDITS") ?? [
    readOptionalEnv("LIVE_MULTI_PROVIDER_REDDIT_SUBREDDIT") ?? "programming",
  ];
  const redditListing = readRedditListing(
    readOptionalEnv("LIVE_MULTI_PROVIDER_REDDIT_LISTING") ?? "hot",
  );
  const redditTopTime =
    readOptionalEnv("LIVE_MULTI_PROVIDER_REDDIT_TOP_TIME") ?? "week";
  const redditMinScore = readOptionalPositiveIntegerEnv(
    "LIVE_MULTI_PROVIDER_REDDIT_MIN_SCORE",
  );
  const githubQuery =
    readOptionalEnv("LIVE_MULTI_PROVIDER_GITHUB_QUERY") ??
    "repo:microsoft/TypeScript is:issue";
  const hackerNewsQuery =
    readOptionalEnv("LIVE_MULTI_PROVIDER_HN_QUERY") ?? "monitoring";
  const rssFeedUrl =
    readOptionalEnv("LIVE_MULTI_PROVIDER_RSS_URL") ??
    "https://hnrss.org/frontpage";
  const xTwitterQueries = readCsvEnv("LIVE_MULTI_PROVIDER_X_QUERIES") ?? [
    "openai",
    "claude ai",
    "ai coding agents",
  ];

  return [
    ...subreddits.map((subreddit, index): ScanTarget => ({
      providerKey: "reddit",
      sourceBindingId: `source-binding-live-multi-provider-reddit-${index + 1}-${safeIdPart(subreddit)}`,
      scanPolicyId: `scan-policy-live-multi-provider-reddit-${index + 1}-${safeIdPart(subreddit)}`,
      sourceQuery: {
        mode: "listing",
        query: `${subreddit}:${redditListing}`,
      },
      config: {
        subreddit,
        listing: redditListing,
        ...(redditListing === "top" ? { topTime: redditTopTime } : {}),
        ...(redditMinScore === undefined ? {} : { minScore: redditMinScore }),
        ...redditCommentRuntimeConfig(),
        maxItems: maxItemsPerProvider,
        userAgent,
      },
    })),
    {
      providerKey: GITHUB_ISSUES_PROVIDER_KEY,
      ...githubIssuesTarget({ userAgent, query: githubQuery }),
    },
    githubTrendingPageTarget(userAgent),
    {
      providerKey: "hacker-news",
      sourceBindingId: "source-binding-live-multi-provider-hacker-news",
      scanPolicyId: "scan-policy-live-multi-provider-hacker-news",
      sourceQuery: { mode: "search", query: hackerNewsQuery },
      config: {},
    },
    {
      providerKey: "rss",
      sourceBindingId: "source-binding-live-multi-provider-rss",
      scanPolicyId: "scan-policy-live-multi-provider-rss",
      sourceQuery: { mode: "url", query: rssFeedUrl },
      config: {},
    },
    ...(includeXTwitter
      ? xTwitterQueries.map((query, index): ScanTarget => ({
          providerKey: "x-twitter",
          sourceBindingId: `source-binding-live-multi-provider-x-twitter-${index + 1}-${safeIdPart(query)}`,
          scanPolicyId: `scan-policy-live-multi-provider-x-twitter-${index + 1}-${safeIdPart(query)}`,
          sourceQuery: { mode: "search", query },
          config: {
            language: "en",
            windowHours: 24,
            searchProducts: ["top", "latest"],
            maxItems: xTwitterMaxItems,
            limitPerProduct: xTwitterLimitPerProduct,
            minLikes: 10,
            minRetweets: 0,
            minReplies: 0,
          },
        }))
      : []),
  ];
};

const redditCommentRuntimeConfig = (): Readonly<Record<string, unknown>> =>
  redditIncludeComments
    ? {
        includeComments: true,
        maxCommentsPerPost: redditMaxCommentsPerPost,
        commentDepth: redditCommentDepth,
        commentSort: redditCommentSort,
      }
    : { includeComments: false };

const summaryPreferenceForRun = (): SourceTargetPresetSummaryPreference => {
  if (sourcePresetMode === aiDeveloperSignalSourcePreset.presetId) {
    const primaryInstructions = `${aiDeveloperSignalSourcePreset.summaryPreference.customInstructions} Use Reddit, X/Twitter, Hacker News and RSS as the primary signal layer.`;
    return {
      ...aiDeveloperSignalSourcePreset.summaryPreference,
      customInstructions: shouldIncludeGithubSupportingTargets()
        ? `${primaryInstructions} Treat GitHub issues and GitHub Trending as supporting developer evidence unless social/news sources confirm the same story.`
        : primaryInstructions,
    };
  }

  return {
    language: "auto",
    format: "bullet_digest",
    tone: "analytical",
    maxKeyPoints: maxSummaryKeyPoints,
    includeRisks: true,
    includeSourceHighlights: true,
    customInstructions:
      "Compare signals across Reddit, GitHub, Hacker News, RSS and X/Twitter for the selected monitoring topic.",
  };
};

const presetScanTargets = (params: {
  readonly userAgent: string;
  readonly includeXTwitter: boolean;
}): readonly ScanTarget[] => {
  const xTwitterQueryOverride = readCsvEnv("LIVE_MULTI_PROVIDER_X_QUERIES");
  const xTwitterTargetConfig =
    aiDeveloperSignalSourcePreset.entries.find(
      (entry) => entry.providerKey === "x-twitter",
    )?.targetConfig ?? {};
  const presetTargets = aiDeveloperSignalSourcePreset.entries.flatMap(
    (entry, index): readonly ScanTarget[] => {
      const providerKey = liveProviderKeyForPresetEntry(entry);
      if (providerKey === "x-twitter" && !params.includeXTwitter) {
        return [];
      }

      if (providerKey === "x-twitter" && xTwitterQueryOverride !== undefined) {
        return [];
      }

      return [
        {
          providerKey,
          sourceBindingId: `source-binding-live-multi-provider-${providerKey}-${index + 1}-${safeIdPart(entry.targetValue)}`,
          scanPolicyId: `scan-policy-live-multi-provider-${providerKey}-${index + 1}-${safeIdPart(entry.targetValue)}`,
          sourceQuery: sourceQueryForPresetEntry(entry),
          config: {
            ...entry.targetConfig,
            ...(providerKey === "reddit" ? redditCommentRuntimeConfig() : {}),
            userAgent: params.userAgent,
          },
        },
      ];
    },
  );

  if (!params.includeXTwitter || xTwitterQueryOverride === undefined) {
    return presetTargets;
  }

  return [
    ...presetTargets,
    ...xTwitterQueryOverride.map((query, index): ScanTarget => ({
      providerKey: "x-twitter",
      sourceBindingId: `source-binding-live-multi-provider-x-twitter-override-${index + 1}-${safeIdPart(query)}`,
      scanPolicyId: `scan-policy-live-multi-provider-x-twitter-override-${index + 1}-${safeIdPart(query)}`,
      sourceQuery: { mode: "search", query },
      config: {
        ...xTwitterTargetConfig,
        maxItems: xTwitterMaxItems,
        limitPerProduct: xTwitterLimitPerProduct,
        userAgent: params.userAgent,
      },
    })),
  ];
};

const supplementalGithubScanTargets = (
  userAgent: string,
): readonly ScanTarget[] => [
  {
    providerKey: GITHUB_ISSUES_PROVIDER_KEY,
    ...githubIssuesTarget({
      userAgent,
      query:
        readOptionalEnv("LIVE_MULTI_PROVIDER_GITHUB_QUERY") ??
        "repo:microsoft/TypeScript is:issue",
    }),
  },
  githubTrendingPageTarget(userAgent),
];

const githubIssuesTarget = (params: {
  readonly userAgent: string;
  readonly query: string;
}): Omit<ScanTarget, "providerKey"> => {
  const githubAccessToken = readOptionalEnv("GITHUB_ACCESS_TOKEN");

  return {
    sourceBindingId: "source-binding-live-multi-provider-github",
    scanPolicyId: "scan-policy-live-multi-provider-github",
    sourceQuery: { mode: "search", query: params.query },
    config: {
      maxItems: maxItemsPerProvider,
      userAgent: params.userAgent,
      ...(githubAccessToken === undefined
        ? {}
        : { accessToken: githubAccessToken }),
    },
  };
};

const githubTrendingPageTarget = (userAgent: string): ScanTarget => ({
  providerKey: "github-trending-page",
  sourceBindingId: "source-binding-live-multi-provider-github-trending-page",
  scanPolicyId: "scan-policy-live-multi-provider-github-trending-page",
  sourceQuery: { mode: "listing", query: "daily" },
  config: {
    window: "daily",
    language:
      readOptionalEnv("LIVE_MULTI_PROVIDER_GITHUB_TRENDING_LANGUAGE") ??
      "python",
    maxItems: maxItemsPerProvider,
    userAgent,
  },
});

const sourceQueryForPresetEntry = (
  entry: SourceTargetPresetEntry,
): SourceQuery => {
  if (entry.targetKind === "url") {
    return { mode: "url", query: entry.targetValue };
  }

  if (entry.targetKind === "subreddit") {
    return { mode: "listing", query: `${entry.targetValue}:hot` };
  }

  return { mode: "search", query: entry.targetValue };
};

const liveProviderKeyForPresetEntry = (
  entry: SourceTargetPresetEntry,
): LiveProviderKey => {
  switch (entry.providerKey) {
    case "reddit":
    case "hacker-news":
    case "rss":
    case "x-twitter":
      return entry.providerKey;
    default:
      throw new Error(
        `Unsupported ${aiDeveloperSignalSourcePreset.presetId} provider in live multi-provider run: ${entry.providerKey}`,
      );
  }
};

const buildXTwitterProvider = (): XTwitterSourceProvider | undefined => {
  if (!shouldIncludeXTwitterTargets()) {
    return undefined;
  }

  const address = readOptionalEnv("X_COLLECTOR_GRPC_ADDRESS");
  if (address === undefined) {
    throw new Error(
      "X_COLLECTOR_GRPC_ADDRESS is required when X/Twitter live summary targets are enabled",
    );
  }

  const clock = new SystemClock();
  return new XTwitterSourceProvider(
    GrpcXDailyCollectorClient.connect({
      address,
      clock,
      options: {
        timeoutMs: readPositiveIntegerEnv(
          "X_COLLECTOR_GRPC_TIMEOUT_MS",
          120_000,
          1_000,
          300_000,
        ),
        serviceToken: readOptionalEnv("X_COLLECTOR_SERVICE_TOKEN"),
      },
    }),
    clock,
  );
};

const shouldIncludeXTwitterTargets = (): boolean =>
  readBooleanEnv(
    "LIVE_MULTI_PROVIDER_INCLUDE_X_TWITTER",
    readOptionalEnv("X_COLLECTOR_GRPC_ADDRESS") !== undefined,
  );

const shouldIncludeGithubSupportingTargets = (): boolean =>
  readBooleanEnv("LIVE_MULTI_PROVIDER_INCLUDE_GITHUB_SUPPORTING", true);

const maxItemsForProvider = (providerKey: LiveProviderKey): number =>
  providerKey === "x-twitter" ? xTwitterMaxItems : maxItemsPerProvider;

const writeOptionalFrontendFixture = (input: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly readerSummary: LiveReaderSummarySmokeResult;
}): void => {
  const fixturePath = readOptionalEnv(frontendFixturePathEnv);
  if (fixturePath === undefined) {
    return;
  }

  const generatedAt = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    format: "frontend-reader-summary-live-fixture-v1",
    generatedAt,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    readerSummaryArtifact: input.readerSummary.frontendArtifact,
    evidence: {
      selectedProviders: input.readerSummary.selectedProviders,
      citedProviders: input.readerSummary.citedProviders,
      readerSourceMixProviders: input.readerSummary.readerSourceMixProviders,
      topReadProviders: input.readerSummary.topReadProviders,
      topReadCount: input.readerSummary.topReadCount,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadIncluded: false,
      tokenValuesIncluded: false,
    },
  };

  writeLiveEvidenceArtifactAtomically(
    fixturePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    frontendFixturePathEnv,
  );
};

const countConversationUnitsByRootFeedItemIds = async (params: {
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
  readonly repository: ConversationUnitRepositoryPort;
  readonly rootFeedItemIds: readonly string[];
}): Promise<number> => {
  if (params.rootFeedItemIds.length === 0) {
    return 0;
  }

  const units = await params.repository.listByRootFeedItemIds({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    rootFeedItemIds: params.rootFeedItemIds,
    limitPerRoot: 1_000,
  });

  return units.length;
};

const writeOptionalEvidenceArtifact = (input: {
  readonly scanMetrics: readonly ScanMetrics[];
  readonly feedItemCount: number;
  readonly selectedFeedItemCount: number;
  readonly conversationUnitCount: number;
  readonly selectedConversationUnitCount: number;
  readonly selectedProviders: readonly LiveProviderKey[];
  readonly citedProviders: readonly string[];
  readonly citationCount: number;
  readonly summaryStatus: string;
  readonly summaryReadyPublished: boolean;
  readonly summaryModelProvider: string;
  readonly summaryModelVersion: string;
  readonly summaryEstimatedCostUsd: number;
  readonly summaryQualityFlags: readonly string[];
  readonly readerSummary: LiveReaderSummarySmokeResult;
  readonly targets: readonly ScanTarget[];
}): void => {
  const evidencePath = readOptionalEnv(evidencePathEnv);
  if (evidencePath === undefined) {
    return;
  }

  const generatedAt = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    artifactId: "live-multi-provider-summary-smoke-evidence-v1",
    format: "live-multi-provider-summary-smoke-evidence-v1",
    scope: "backend-only",
    frontendPolicy: "deferred_contract_only",
    generatedAt,
    sampledAt: sampledAt.toISOString(),
    provenance: {
      commitSha: readOptionalEnv("BACKEND_GIT_COMMIT_SHA") ?? null,
      imageDigest: readOptionalEnv("BACKEND_IMAGE_DIGEST") ?? null,
      environmentId: readOptionalEnv("SOURCE_LIVE_ENVIRONMENT_ID") ?? null,
      operator: readOptionalEnv("SOURCE_LIVE_OPERATOR") ?? null,
      runner: "scripts/check-live-multi-provider-summary-smoke.ts",
      fixtureOnly: false,
    },
    providers: input.targets.map((target) => ({
      providerKey: target.providerKey,
      sourceBindingId: target.sourceBindingId,
      queryMode: target.sourceQuery.mode,
      querySha256: sha256(target.sourceQuery.query),
      rawQueryIncluded: false,
      authMode:
        target.providerKey === "reddit"
          ? "app_only_oauth"
          : target.providerKey === GITHUB_ISSUES_PROVIDER_KEY &&
              readOptionalEnv("GITHUB_ACCESS_TOKEN") !== undefined
            ? "token_redacted"
            : "public_or_anonymous",
    })),
    signals: [
      {
        signalId: "live-multi-provider-scan-to-summary",
        status: "passed",
        observedAt: generatedAt,
        evidence: {
          requiredProviderCount: input.targets.length,
          feedItemCount: input.feedItemCount,
          selectedFeedItemCount: input.selectedFeedItemCount,
          conversationUnitCount: input.conversationUnitCount,
          selectedConversationUnitCount: input.selectedConversationUnitCount,
          selectedProviders: input.selectedProviders,
          citedProviders: input.citedProviders,
          citationCount: input.citationCount,
          summaryCompleted: input.summaryStatus === "completed",
          summaryReadyPublished: input.summaryReadyPublished,
          summaryModelProvider: input.summaryModelProvider,
          summaryModelVersion: input.summaryModelVersion,
          summaryEstimatedCostUsd: input.summaryEstimatedCostUsd,
          summaryQualityFlags: input.summaryQualityFlags,
          readerSummarySelectedProviders: input.readerSummary.selectedProviders,
          readerSummaryCitedProviders: input.readerSummary.citedProviders,
          readerSummaryReaderSourceMixProviders:
            input.readerSummary.readerSourceMixProviders,
          readerSummaryReaderSourceMixCounts:
            input.readerSummary.readerSourceMixCounts,
          readerSummaryTopReadProviders: input.readerSummary.topReadProviders,
          readerSummaryTopReadCount: input.readerSummary.topReadCount,
          readerSummaryQualityFlags: input.readerSummary.qualityFlags,
        },
      },
    ],
    metrics: {
      scans: input.scanMetrics,
      feedItems: input.feedItemCount,
      selectedFeedItems: input.selectedFeedItemCount,
      conversationUnits: input.conversationUnitCount,
      selectedConversationUnits: input.selectedConversationUnitCount,
      citedProviders: input.citedProviders,
      citations: input.citationCount,
      summaryModelProvider: input.summaryModelProvider,
      summaryModelVersion: input.summaryModelVersion,
      summaryEstimatedCostUsd: input.summaryEstimatedCostUsd,
      readerSummaryId: input.readerSummary.readerSummaryId,
      readerSummarySelectedProviders: input.readerSummary.selectedProviders,
      readerSummaryCitedProviders: input.readerSummary.citedProviders,
      readerSummaryReaderSourceMixProviders:
        input.readerSummary.readerSourceMixProviders,
      readerSummaryReaderSourceMixCounts:
        input.readerSummary.readerSourceMixCounts,
      readerSummaryTopReadProviders: input.readerSummary.topReadProviders,
      readerSummaryTopReadCount: input.readerSummary.topReadCount,
      readerSummaryQualityFlags: input.readerSummary.qualityFlags,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadIncluded: false,
      rawFeedItemTextIncluded: false,
      rawSummaryTextIncluded: false,
      rawQueryIncluded: false,
      tokenValuesIncluded: false,
    },
  };

  writeLiveEvidenceArtifactAtomically(
    evidencePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    evidencePathEnv,
  );
};

const loadRedditAppOAuthEnvIfPresent = (): void => {
  if (hasRedditAppCredentials()) {
    return;
  }

  const envPath =
    readOptionalEnv("SOCIAL_MONITOR_REDDIT_APP_ENV_PATH") ??
    join(homedir(), ".config", "social-monitor", "reddit-app-oauth.env");
  if (!existsSync(envPath)) {
    return;
  }

  const parsed = parseDotenv(readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

const hasRedditAppCredentials = (): boolean =>
  readOptionalEnv("REDDIT_APP_CLIENT_ID") !== undefined &&
  readOptionalEnv("REDDIT_APP_CLIENT_SECRET") !== undefined;

const readRedditListing = (value: string): RedditPostListing => {
  if (!redditListings.includes(value as RedditPostListing)) {
    throw new Error(`Unsupported LIVE_MULTI_PROVIDER_REDDIT_LISTING: ${value}`);
  }

  return value as RedditPostListing;
};

function readSummaryModelMode():
  "deterministic" | "openai-responses" | "agent-runtime" {
  const value =
    readOptionalEnv("LIVE_MULTI_PROVIDER_SUMMARY_MODEL") ?? "deterministic";
  if (
    value === "deterministic" ||
    value === "openai-responses" ||
    value === "agent-runtime"
  ) {
    return value;
  }

  throw new Error(
    'LIVE_MULTI_PROVIDER_SUMMARY_MODEL must be "deterministic", "openai-responses" or "agent-runtime"',
  );
}

function readReaderSummaryModelMode():
  "deterministic" | "openai-responses" | "agent-runtime" {
  const value =
    readOptionalEnv("LIVE_MULTI_PROVIDER_READER_SUMMARY_MODEL") ??
    "deterministic";
  if (
    value === "deterministic" ||
    value === "openai-responses" ||
    value === "agent-runtime"
  ) {
    return value;
  }

  throw new Error(
    'LIVE_MULTI_PROVIDER_READER_SUMMARY_MODEL must be "deterministic", "openai-responses" or "agent-runtime"',
  );
}

function readSourcePresetMode(): "manual" | "ai-developer-signal-v1" {
  const value =
    readOptionalEnv("LIVE_MULTI_PROVIDER_SOURCE_PRESET") ?? "manual";
  if (value === "manual") {
    return "manual";
  }

  if (value === aiDeveloperSignalSourcePreset.presetId) {
    return "ai-developer-signal-v1";
  }

  throw new Error(
    `LIVE_MULTI_PROVIDER_SOURCE_PRESET must be "manual" or "${aiDeveloperSignalSourcePreset.presetId}"`,
  );
}

const unwrap = <TValue, TError>(
  result: Result<TValue, TError>,
  label: string,
): TValue => {
  if (result.ok) {
    return result.value;
  }

  throw result.error instanceof Error
    ? result.error
    : new Error(`${label} failed`);
};

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

const shouldUsePersistedProviderFallback = (params: {
  readonly target: ScanTarget;
  readonly persistence: LivePersistenceBundle;
  readonly error?: unknown;
  readonly result?: {
    readonly fetched: number;
    readonly inserted: number;
    readonly projected: number;
  };
}): boolean => {
  if (params.persistence.mode !== "prisma") {
    return false;
  }

  if (params.error instanceof SourceFetchError) {
    return (
      params.error.retryable &&
      (params.error.kind === "rate_limited" ||
        params.error.kind === "unavailable" ||
        params.error.kind === "unknown")
    );
  }

  if (params.result !== undefined) {
    return (
      params.result.fetched === 0 ||
      params.result.inserted === 0 ||
      params.result.projected === 0
    );
  }

  return false;
};

const persistedProviderFallbackReason = (
  target: ScanTarget,
  persistence: LivePersistenceBundle,
): string =>
  `using persisted ${target.providerKey} feed items observed after ${persistence.feedObservedAfter?.toISOString()}`;

function isSourceInventoryText(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("en-US");

  return (
    normalized.startsWith("key signals across") ||
    normalized.startsWith("strongest reads across") ||
    normalized.startsWith("strongest read across") ||
    normalized.startsWith("source watch") ||
    normalized.includes("cited top read")
  );
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function readCsvEnv(name: string): readonly string[] | undefined {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length === 0 ? undefined : items;
}

function readPositiveIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

function readOptionalPositiveIntegerEnv(name: string): number | undefined {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be true or false`);
}

function readOptionalDateEnv(name: string): Date | undefined {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${name} must be an ISO-8601 timestamp`);
  }

  return parsed;
}

function safeIdPart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "target"
  );
}

const targetsForPersistenceMode = (
  targets: readonly ScanTarget[],
  mode: LivePersistenceMode,
): readonly ScanTarget[] => {
  if (mode === "in-memory") {
    return targets;
  }

  return targets.map((target) => ({
    ...target,
    sourceBindingId: stableUuid(`source-binding:${target.sourceBindingId}`),
    scanPolicyId: stableUuid(`scan-policy:${target.scanPolicyId}`),
  }));
};

const scanJobIdForTarget = (target: ScanTarget): string =>
  isUuid(target.sourceBindingId)
    ? stableUuid(`scan-job:${target.sourceBindingId}`)
    : `scan-live-multi-provider-${target.sourceBindingId}`;

const stableUuid = (value: string): string => {
  const digest = sha256(value);

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `7${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const sameDatabaseUrl = (left: string, right: string): boolean => {
  const normalize = (value: string): string => {
    const url = new URL(value);
    url.search = "";
    url.hash = "";

    return url.toString();
  };

  return normalize(left) === normalize(right);
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

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
