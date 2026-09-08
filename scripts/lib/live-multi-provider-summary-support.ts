import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { ConversationSignalBaselineRepositoryPort, ConversationUnitRepositoryPort } from "@social-monitor/conversation/ports";
import { type DomainError, type IdGenerator, ok, type Result } from "@social-monitor/shared-kernel";
import type { ReserveSummaryJobQuotaResult, SummaryQuotaPort } from "@social-monitor/summary/ports";
import { parse as parseDotenv } from "dotenv";
import { redditListings } from "../../libs/ingestion/adapters/source/reddit/http-reddit-client";
import type { RedditPostListing } from "../../libs/ingestion/adapters/source/reddit/reddit-client.port";
import { SourceFetchError } from "../../libs/ingestion/ports";
import type { FetchSourceItemsCommand, FetchSourceItemsResult, FeedProjectionPort, ReportScanFailedCommand, ReportScanSucceededCommand, ScanAttemptRepositoryPort, ScanCursorRepositoryPort, ScanExecutionReporterPort, ScanFailureQueuePort, ScanLeasePort, SourceConfigReaderPort, SourceFetcherPort, SourceItemRepositoryPort, SourceQuery, SourceRuntimeConfig } from "../../libs/ingestion/ports";
import { readOptionalEnv } from "./live-multi-provider-summary-config";

export type LiveProviderKey =
  | "reddit"
  | "github-issues"
  | "github-trending-page"
  | "hacker-news"
  | "rss"
  | "x-twitter";

export type ScanTarget = {
  readonly providerKey: LiveProviderKey;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly sourceQuery: SourceQuery;
  readonly config: SourceRuntimeConfig;
};

type LivePersistenceMode = "in-memory" | "prisma";

export type LivePersistenceConfig =
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

export type ConversationUnitEvidenceRepository = ConversationUnitRepositoryPort &
  ConversationSignalBaselineRepositoryPort;

export type LivePersistenceBundle = {
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

export type ScanMetrics = {
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

export type LiveReaderSummarySmokeResult = {
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

export class StaticSourceConfigReader implements SourceConfigReaderPort {
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

export class LimitedSourceFetcher implements SourceFetcherPort {
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

export class CapturingScanExecutionReporter implements ScanExecutionReporterPort {
  readonly succeeded: ReportScanSucceededCommand[] = [];
  readonly failed: ReportScanFailedCommand[] = [];

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed.push(command);
  }
}

export class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): Promise<
    Result<ReserveSummaryJobQuotaResult, DomainError>
  > {
    return ok({
      remaining: 999,
      resetAt: "2026-06-21T01:00:00.000Z",
    });
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  constructor(private readonly prefix: string) {}

  generate(): string {
    const id = `${this.prefix}-${this.nextId}`;
    this.nextId += 1;

    return id;
  }
}

export class RandomUuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}

export const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const loadRedditAppOAuthEnvIfPresent = (): void => {
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

export const readRedditListing = (value: string): RedditPostListing => {
  if (!redditListings.includes(value as RedditPostListing)) {
    throw new Error(`Unsupported LIVE_MULTI_PROVIDER_REDDIT_LISTING: ${value}`);
  }

  return value as RedditPostListing;
};

export const unwrap = <TValue, TError>(
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

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export const shouldUsePersistedProviderFallback = (params: {
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

export const persistedProviderFallbackReason = (
  target: ScanTarget,
  persistence: LivePersistenceBundle,
): string =>
  `using persisted ${target.providerKey} feed items observed after ${persistence.feedObservedAfter?.toISOString()}`;

export function isSourceInventoryText(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("en-US");

  return (
    normalized.startsWith("key signals across") ||
    normalized.startsWith("strongest reads across") ||
    normalized.startsWith("strongest read across") ||
    normalized.startsWith("source watch") ||
    normalized.includes("cited top read")
  );
}

export function safeIdPart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "target"
  );
}

export const targetsForPersistenceMode = (
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

export const scanJobIdForTarget = (target: ScanTarget): string =>
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

export const sameDatabaseUrl = (left: string, right: string): boolean => {
  const normalize = (value: string): string => {
    const url = new URL(value);
    url.search = "";
    url.hash = "";

    return url.toString();
  };

  return normalize(left) === normalize(right);
};

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
