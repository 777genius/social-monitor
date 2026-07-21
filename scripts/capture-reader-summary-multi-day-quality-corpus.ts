import { createHash } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";

import type { JsonObject } from "@social-monitor/shared-kernel";
import {
  buildSourceEngagementMetrics,
  type SourceEngagementMetrics,
} from "@social-monitor/ingestion/domain";
import { Pool, type PoolClient } from "pg";

import { loadDotenvIfPresent } from "./lib/env-file";
import {
  assertPrivateCorpusOutputOutsideGitWorktree,
  assertPrivateCorpusSerializedSafe,
  redactPrivateCorpusText,
  sanitizePrivateCorpusUrl,
} from "./lib/reader-summary-multi-day-corpus-security";
import { yesterdaySocialQualityDatabaseUrl } from "./lib/yesterday-social-replay-support";

const minimumDateCount = 5;
const defaultHighPerProvider = 8;
const defaultLowPerProvider = 4;
const maximumPerBand = 100;
const titleLimit = 240;
const bodyPreviewLimit = 1_200;
const authorHandleLimit = 120;
const captureValueOptions = new Set([
  "--date",
  "--tenant-id",
  "--workspace-id",
  "--out",
  "--high-per-provider",
  "--low-per-provider",
]);

export const readerSummaryMultiDayQualityCorpusFormat =
  "reader-summary-multi-day-quality-source-corpus-v2";

export const selectionPolicyVersion =
  "source-engagement-balanced-high-low-unknown-v2";

const rfc3339TimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export const engagementMetricWeights: Readonly<
  Record<Exclude<keyof SourceEngagementMetrics, "providerRank">, number>
> = {
  score: 1,
  comments: 2,
  likes: 1,
  reposts: 3,
  replies: 2,
  quotes: 3,
  bookmarks: 2,
  impressions: 0.1,
  views: 0.2,
  points: 1,
  stars: 0.25,
  forks: 0.5,
  starsGained: 2,
  upvoteRatioBps: 0.0001,
};

export const providerRankSelectionRule = {
  kind: "inverse_positive_rank",
  formula: "providerRank > 0 ? 1 / providerRank : 0",
} as const;

export const sourceOnlyCorpusQuery = `
  with requested_days as (
    select requested_date
    from unnest($3::date[]) as requested(requested_date)
  )
  select
    requested_days.requested_date::text as "collectionDate",
    fi.id::text as "feedItemId",
    fi.provider_key as "providerKey",
    coalesce(fi.canonical_url, si.canonical_url) as "canonicalUrl",
    coalesce(nullif(fi.title, ''), nullif(si.title, '')) as "title",
    coalesce(nullif(fi.body_preview, ''), nullif(si.body, '')) as "bodyPreview",
    coalesce(nullif(fi.author_handle, ''), nullif(si.author_handle, '')) as "authorHandle",
    coalesce(fi.published_at, si.published_at) as "publishedAt",
    coalesce(fi.observed_at, si.last_observed_at, si.observed_at) as "observedAt",
    coalesce(fi.provider_metadata, si.metadata, '{}'::jsonb) as "providerMetadata"
  from requested_days
  join feed_items fi
    on fi.published_at >= requested_days.requested_date::timestamp at time zone 'UTC'
    and fi.published_at <
      (requested_days.requested_date + 1)::timestamp at time zone 'UTC'
  join source_items si
    on si.id = fi.source_item_id
    and si.tenant_id = fi.tenant_id
    and si.workspace_id = fi.workspace_id
  where fi.tenant_id = $1::uuid
    and fi.workspace_id = $2::uuid
    and fi.status = 'VISIBLE'
  order by requested_days.requested_date asc, fi.id asc
`;

export type SourceOnlyCorpusRow = {
  readonly collectionDate: string;
  readonly feedItemId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string | null;
  readonly title: string | null;
  readonly bodyPreview: string | null;
  readonly authorHandle: string | null;
  readonly publishedAt: Date | string;
  readonly observedAt: Date | string;
  readonly providerMetadata: unknown;
};

type CorpusItem = {
  readonly feedItemId: string;
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly authorHandle?: string;
  readonly canonicalUrl?: string;
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly engagementMetrics?: SourceEngagementMetrics;
  readonly selection: {
    readonly band: "high_engagement" | "low_engagement" | "unknown_engagement";
    readonly providerBandRank: number;
  };
};

type ProviderCount = {
  readonly providerKey: string;
  readonly actualItemCount: number;
  readonly selectedItemCount: number;
  readonly highEngagementCount: number;
  readonly lowEngagementCount: number;
  readonly unknownEngagementCount: number;
};

type CorpusDay = {
  readonly collectionDate: string;
  readonly actualItemCount: number;
  readonly selectedItemCount: number;
  readonly providerCounts: readonly ProviderCount[];
  readonly items: readonly CorpusItem[];
};

type CorpusPayload = {
  readonly schemaVersion: 2;
  readonly format: typeof readerSummaryMultiDayQualityCorpusFormat;
  readonly dates: readonly string[];
  readonly scope: {
    readonly tenantFingerprintSha256: string;
    readonly workspaceFingerprintSha256: string;
  };
  readonly selectionRule: {
    readonly selectionPolicyVersion: typeof selectionPolicyVersion;
    readonly sourceTables: readonly ["feed_items", "source_items"];
    readonly status: "VISIBLE";
    readonly period: "exact_utc_calendar_day";
    readonly highEngagementItemsPerProvider: number;
    readonly lowEngagementItemsPerProvider: number;
    readonly unknownEngagementItemsPerProvider: number;
    readonly engagementStrengthFormula: "sum(weight * ln(1 + max(0, metric)))";
    readonly engagementMetricWeights: typeof engagementMetricWeights;
    readonly providerRankRule: typeof providerRankSelectionRule;
    readonly highBandOrder: "engagement_strength_desc_then_published_at_asc_then_feed_item_id_asc";
    readonly lowBandOrder: "engagement_strength_asc_then_published_at_asc_then_feed_item_id_asc";
    readonly unknownBandOrder: "sha256_feed_item_id_asc_then_published_at_asc_then_feed_item_id_asc";
    readonly lowBandExcludesHighBand: true;
    readonly stringOrder: "utf16_code_unit_ascending";
    readonly generatedOutputFieldsUsed: false;
  };
  readonly redaction: {
    readonly rawProviderMetadataIncluded: false;
    readonly generatedOutputsIncluded: false;
    readonly urlCredentialsQueryAndFragmentIncluded: false;
    readonly secretsIncluded: false;
    readonly titleCharacterLimit: number;
    readonly bodyPreviewCharacterLimit: number;
  };
  readonly days: readonly CorpusDay[];
  readonly handling: {
    readonly classification: "private_evaluation_input";
    readonly repositoryCommitAllowed: false;
    readonly sensitiveFields: readonly [
      "titles",
      "body_previews",
      "author_handles",
      "url_paths",
    ];
  };
};

export type ReaderSummaryMultiDayQualityCorpus = CorpusPayload & {
  readonly corpusSha256: string;
};

export type CaptureOptions = {
  readonly dates: readonly string[];
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly outputPath: string;
  readonly highPerProvider: number;
  readonly lowPerProvider: number;
};

type Candidate = {
  readonly row: SourceOnlyCorpusRow;
  readonly normalized: Omit<CorpusItem, "selection">;
  readonly engagementStrength: number | null;
};

type MeasurableCandidate = Candidate & {
  readonly engagementStrength: number;
};

export function parseCaptureOptions(args: readonly string[]): CaptureOptions {
  assertSupportedCaptureArguments(args);
  const dates = optionValues(args, "--date");
  assertRequestedDates(dates);
  const tenantId = requiredSingleOption(args, "--tenant-id");
  const workspaceId = requiredSingleOption(args, "--workspace-id");
  const outputPath = requiredSingleOption(args, "--out");
  const highPerProvider = positiveIntegerOption(
    args,
    "--high-per-provider",
    defaultHighPerProvider,
  );
  const lowPerProvider = positiveIntegerOption(
    args,
    "--low-per-provider",
    defaultLowPerProvider,
  );

  return {
    dates: [...dates].sort(compareUtf16CodeUnits),
    tenantId,
    workspaceId,
    outputPath,
    highPerProvider,
    lowPerProvider,
  };
}

function assertSupportedCaptureArguments(args: readonly string[]): void {
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    if (option === undefined || !captureValueOptions.has(option)) {
      throw new Error(`Unsupported argument: ${option ?? "<missing>"}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${option} requires a value`);
    }
  }
}

export const assertOutputOutsideCurrentGitWorktree =
  assertPrivateCorpusOutputOutsideGitWorktree;

export function buildReaderSummaryMultiDayQualityCorpus(params: {
  readonly dates: readonly string[];
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly rows: readonly SourceOnlyCorpusRow[];
  readonly highPerProvider?: number;
  readonly lowPerProvider?: number;
}): ReaderSummaryMultiDayQualityCorpus {
  assertRequestedDates(params.dates);
  const dates = [...params.dates].sort(compareUtf16CodeUnits);
  const highPerProvider = boundedCount(
    params.highPerProvider ?? defaultHighPerProvider,
    "highPerProvider",
  );
  const lowPerProvider = boundedCount(
    params.lowPerProvider ?? defaultLowPerProvider,
    "lowPerProvider",
  );
  const requestedDates = new Set(dates);
  const seenIds = new Set<string>();
  const rowsByDate = new Map(
    dates.map((date) => [date, [] as SourceOnlyCorpusRow[]]),
  );

  for (const row of params.rows) {
    if (!requestedDates.has(row.collectionDate)) {
      throw new Error(`Unexpected collection date: ${row.collectionDate}`);
    }
    const feedItemId = requiredText(row.feedItemId, "feedItemId", 160);
    if (seenIds.has(feedItemId)) {
      throw new Error(`Duplicate feed item: ${feedItemId}`);
    }
    seenIds.add(feedItemId);
    rowsByDate.get(row.collectionDate)?.push(row);
  }

  const days = dates.map((date) => {
    const dayRows = rowsByDate.get(date) ?? [];
    if (dayRows.length === 0) {
      throw new Error(`Missing source items for requested date: ${date}`);
    }
    return buildDay({
      collectionDate: date,
      rows: dayRows,
      highPerProvider,
      lowPerProvider,
    });
  });
  const payload: CorpusPayload = {
    schemaVersion: 2,
    format: readerSummaryMultiDayQualityCorpusFormat,
    dates,
    scope: {
      tenantFingerprintSha256: sha256(params.tenantId),
      workspaceFingerprintSha256: sha256(params.workspaceId),
    },
    selectionRule: {
      selectionPolicyVersion,
      sourceTables: ["feed_items", "source_items"],
      status: "VISIBLE",
      period: "exact_utc_calendar_day",
      highEngagementItemsPerProvider: highPerProvider,
      lowEngagementItemsPerProvider: lowPerProvider,
      unknownEngagementItemsPerProvider: lowPerProvider,
      engagementStrengthFormula: "sum(weight * ln(1 + max(0, metric)))",
      engagementMetricWeights,
      providerRankRule: providerRankSelectionRule,
      highBandOrder:
        "engagement_strength_desc_then_published_at_asc_then_feed_item_id_asc",
      lowBandOrder:
        "engagement_strength_asc_then_published_at_asc_then_feed_item_id_asc",
      unknownBandOrder:
        "sha256_feed_item_id_asc_then_published_at_asc_then_feed_item_id_asc",
      lowBandExcludesHighBand: true,
      stringOrder: "utf16_code_unit_ascending",
      generatedOutputFieldsUsed: false,
    },
    redaction: {
      rawProviderMetadataIncluded: false,
      generatedOutputsIncluded: false,
      urlCredentialsQueryAndFragmentIncluded: false,
      secretsIncluded: false,
      titleCharacterLimit: titleLimit,
      bodyPreviewCharacterLimit: bodyPreviewLimit,
    },
    days,
    handling: {
      classification: "private_evaluation_input",
      repositoryCommitAllowed: false,
      sensitiveFields: [
        "titles",
        "body_previews",
        "author_handles",
        "url_paths",
      ],
    },
  };
  const corpus = {
    ...payload,
    corpusSha256: sha256(canonicalJson(payload)),
  };
  assertSerializedCorpusSafe(corpus);

  return corpus;
}

export function serializeReaderSummaryMultiDayQualityCorpus(
  corpus: ReaderSummaryMultiDayQualityCorpus,
): string {
  assertSerializedCorpusSafe(corpus);
  return `${JSON.stringify(canonicalize(corpus), null, 2)}\n`;
}

async function captureRows(params: {
  readonly databaseUrl: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly dates: readonly string[];
}): Promise<readonly SourceOnlyCorpusRow[]> {
  const pool = new Pool({
    connectionString: params.databaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  const client = await pool.connect();
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    await client.query("SET LOCAL statement_timeout = '60s'");
    const rows = await readSourceRows(client, params);
    await client.query("COMMIT");
    return rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

async function readSourceRows(
  client: Pick<PoolClient, "query">,
  params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly dates: readonly string[];
  },
): Promise<readonly SourceOnlyCorpusRow[]> {
  const result = await client.query<SourceOnlyCorpusRow>(
    sourceOnlyCorpusQuery,
    [params.tenantId, params.workspaceId, params.dates],
  );
  return result.rows;
}

function buildDay(params: {
  readonly collectionDate: string;
  readonly rows: readonly SourceOnlyCorpusRow[];
  readonly highPerProvider: number;
  readonly lowPerProvider: number;
}): CorpusDay {
  const byProvider = new Map<string, SourceOnlyCorpusRow[]>();
  for (const row of params.rows) {
    const providerKey = requiredProviderKey(row.providerKey);
    const existing = byProvider.get(providerKey) ?? [];
    byProvider.set(providerKey, [...existing, row]);
  }

  const providerCounts: ProviderCount[] = [];
  const selectedItems: CorpusItem[] = [];
  for (const providerKey of [...byProvider.keys()].sort(
    compareUtf16CodeUnits,
  )) {
    const rows = byProvider.get(providerKey) ?? [];
    const candidates = rows.map(normalizeCandidate);
    const measurable = candidates.filter(
      (candidate): candidate is MeasurableCandidate =>
        candidate.engagementStrength !== null,
    );
    const unknown = candidates
      .filter((candidate) => candidate.engagementStrength === null)
      .sort(compareUnknownEngagement)
      .slice(0, params.lowPerProvider);
    const descending = [...measurable].sort(compareHighEngagement);
    const high = descending.slice(0, params.highPerProvider);
    const highIds = new Set(high.map((candidate) => candidate.row.feedItemId));
    const low = measurable
      .filter((candidate) => !highIds.has(candidate.row.feedItemId))
      .sort(compareLowEngagement)
      .slice(0, params.lowPerProvider);
    const highItems = high.map((candidate, index) =>
      selectedItem(candidate, "high_engagement", index + 1),
    );
    const lowItems = low.map((candidate, index) =>
      selectedItem(candidate, "low_engagement", index + 1),
    );
    const unknownItems = unknown.map((candidate, index) =>
      selectedItem(candidate, "unknown_engagement", index + 1),
    );
    selectedItems.push(...highItems, ...lowItems, ...unknownItems);
    providerCounts.push({
      providerKey,
      actualItemCount: rows.length,
      selectedItemCount:
        highItems.length + lowItems.length + unknownItems.length,
      highEngagementCount: highItems.length,
      lowEngagementCount: lowItems.length,
      unknownEngagementCount: unknownItems.length,
    });
  }

  return {
    collectionDate: params.collectionDate,
    actualItemCount: params.rows.length,
    selectedItemCount: selectedItems.length,
    providerCounts,
    items: selectedItems,
  };
}

function normalizeCandidate(row: SourceOnlyCorpusRow): Candidate {
  const providerKey = requiredProviderKey(row.providerKey);
  const metadata = jsonObjectOrEmpty(row.providerMetadata);
  const engagement = buildSourceEngagementMetrics({
    providerKey,
    metadata,
  });
  if (engagement.qualityFlags.invalidMetricValue) {
    throw new Error(
      `Feed item ${row.feedItemId} has an invalid engagement metric value`,
    );
  }
  if (engagement.qualityFlags.conflictingAliases) {
    throw new Error(
      `Feed item ${row.feedItemId} has conflicting engagement metric aliases`,
    );
  }
  const metrics = engagement.metrics;
  const title = sanitizedText(row.title, titleLimit);
  if (title.length === 0) {
    throw new Error(`Feed item ${row.feedItemId} has no annotatable title`);
  }
  const bodyPreview = sanitizedText(row.bodyPreview, bodyPreviewLimit);
  const authorHandle = sanitizedText(row.authorHandle, authorHandleLimit);
  const canonicalUrl = sanitizedUrl(row.canonicalUrl);

  return {
    row,
    normalized: {
      feedItemId: requiredText(row.feedItemId, "feedItemId", 160),
      providerKey,
      title,
      ...(bodyPreview.length > 0 ? { bodyPreview } : {}),
      ...(authorHandle.length > 0 ? { authorHandle } : {}),
      ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
      publishedAt: exactTimestamp(row.publishedAt, "publishedAt"),
      observedAt: exactTimestamp(row.observedAt, "observedAt"),
      ...(metrics === null ? {} : { engagementMetrics: metrics }),
    },
    engagementStrength: metrics === null ? null : metricStrength(metrics),
  };
}

function selectedItem(
  candidate: Candidate,
  band: CorpusItem["selection"]["band"],
  providerBandRank: number,
): CorpusItem {
  return {
    ...candidate.normalized,
    selection: { band, providerBandRank },
  };
}

function compareHighEngagement(
  left: MeasurableCandidate,
  right: MeasurableCandidate,
): number {
  return (
    right.engagementStrength - left.engagementStrength ||
    compareCandidateTie(left, right)
  );
}

function compareLowEngagement(
  left: MeasurableCandidate,
  right: MeasurableCandidate,
): number {
  return (
    left.engagementStrength - right.engagementStrength ||
    compareCandidateTie(left, right)
  );
}

function compareUnknownEngagement(left: Candidate, right: Candidate): number {
  return (
    compareUtf16CodeUnits(
      sha256(left.normalized.feedItemId),
      sha256(right.normalized.feedItemId),
    ) || compareCandidateTie(left, right)
  );
}

function compareCandidateTie(left: Candidate, right: Candidate): number {
  return (
    compareUtf16CodeUnits(
      exactTimestamp(left.row.publishedAt, "publishedAt"),
      exactTimestamp(right.row.publishedAt, "publishedAt"),
    ) || compareUtf16CodeUnits(left.row.feedItemId, right.row.feedItemId)
  );
}

function metricStrength(metrics: SourceEngagementMetrics): number {
  return Object.entries(metrics)
    .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
    .reduce((total, [key, value]) => {
      if (key === "providerRank") {
        return total + (value > 0 ? 1 / value : 0);
      }
      const weight =
        engagementMetricWeights[
          key as Exclude<keyof SourceEngagementMetrics, "providerRank">
        ];
      return total + weight * Math.log1p(Math.max(0, value));
    }, 0);
}

function sanitizedText(value: unknown, limit: number): string {
  if (typeof value !== "string") {
    return "";
  }
  let normalized = replaceControlCharacters(value).replace(/\s+/g, " ").trim();
  normalized = redactPrivateCorpusText(normalized);
  return normalized.slice(0, limit).trim();
}

function replaceControlCharacters(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("");
}

function sanitizedUrl(value: unknown): string | undefined {
  return sanitizePrivateCorpusUrl(value);
}

function assertSerializedCorpusSafe(value: unknown): void {
  assertPrivateCorpusSerializedSafe(value);
}

function jsonObjectOrEmpty(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function exactTimestamp(value: Date | string, label: string): string {
  if (typeof value === "string" && !rfc3339TimestampPattern.test(value)) {
    throw new Error(
      `${label} must be RFC3339 with Z or an explicit UTC offset`,
    );
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return date.toISOString();
}

function requiredProviderKey(value: string): string {
  const normalized = requiredText(value, "providerKey", 80);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    throw new Error(`Invalid providerKey: ${normalized}`);
  }
  return normalized;
}

function requiredText(value: string, label: string, limit: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > limit) {
    throw new Error(`${label} must contain 1-${limit} characters`);
  }
  return normalized;
}

function assertRequestedDates(dates: readonly string[]): void {
  if (dates.length < minimumDateCount) {
    throw new Error(
      `At least ${minimumDateCount} explicit --date values are required`,
    );
  }
  const seen = new Set<string>();
  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Invalid UTC collection date: ${date}`);
    }
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new Error(`Invalid UTC collection date: ${date}`);
    }
    if (seen.has(date)) {
      throw new Error(`Duplicate requested date: ${date}`);
    }
    seen.add(date);
  }
}

function optionValues(
  args: readonly string[],
  name: string,
): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) {
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${name} requires a value`);
    }
    values.push(value.trim());
    index += 1;
  }
  return values;
}

function requiredSingleOption(args: readonly string[], name: string): string {
  const values = optionValues(args, name);
  if (
    values.length !== 1 ||
    values[0] === undefined ||
    values[0].length === 0
  ) {
    throw new Error(`${name} must be provided exactly once`);
  }
  return values[0];
}

function positiveIntegerOption(
  args: readonly string[],
  name: string,
  defaultValue: number,
): number {
  const values = optionValues(args, name);
  if (values.length === 0) {
    return defaultValue;
  }
  if (values.length !== 1) {
    throw new Error(`${name} must be provided at most once`);
  }
  return boundedCount(Number(values[0]), name);
}

function boundedCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximumPerBand) {
    throw new Error(
      `${label} must be an integer between 1 and ${maximumPerBand}`,
    );
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function compareUtf16CodeUnits(left: string, right: string): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

async function main(): Promise<void> {
  loadDotenvIfPresent(".env");
  const options = parseCaptureOptions(process.argv.slice(2));
  assertOutputOutsideCurrentGitWorktree(options.outputPath);
  const rows = await captureRows({
    databaseUrl: yesterdaySocialQualityDatabaseUrl(),
    tenantId: options.tenantId,
    workspaceId: options.workspaceId,
    dates: options.dates,
  });
  const corpus = buildReaderSummaryMultiDayQualityCorpus({
    dates: options.dates,
    tenantId: options.tenantId,
    workspaceId: options.workspaceId,
    rows,
    highPerProvider: options.highPerProvider,
    lowPerProvider: options.lowPerProvider,
  });
  writeFileSync(
    options.outputPath,
    serializeReaderSummaryMultiDayQualityCorpus(corpus),
    { encoding: "utf8", flag: "wx", mode: 0o400 },
  );
  chmodSync(options.outputPath, 0o400);
  console.log(
    `Source-only quality corpus captured: days=${corpus.days.length} hash=${corpus.corpusSha256}`,
  );
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Corpus capture failed",
    );
    process.exitCode = 1;
  });
}
