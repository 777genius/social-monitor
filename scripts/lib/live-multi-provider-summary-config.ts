import { aiDeveloperSignalSourcePreset } from "@social-monitor/subscriptions/domain";
import { readCommentSort } from "../../libs/ingestion/adapters/source/reddit/reddit-source-support";

export const sourcePresetMode = readSourcePresetMode();

export const timeoutMs = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_TIMEOUT_MS",
  sourcePresetMode === aiDeveloperSignalSourcePreset.presetId ? 30_000 : 12_000,
  1_000,
  60_000,
);

export const maxItemsPerProvider = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_MAX_ITEMS_PER_PROVIDER",
  sourcePresetMode === aiDeveloperSignalSourcePreset.presetId ? 30 : 10,
  1,
  50,
);

export const maxEvidenceItems = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_MAX_EVIDENCE_ITEMS",
  sourcePresetMode === aiDeveloperSignalSourcePreset.presetId ? 200 : 30,
  4,
  200,
);

export const maxSummaryKeyPoints = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_MAX_KEY_POINTS",
  10,
  1,
  10,
);

export const liveSummaryMaxInputTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_MAX_INPUT_TOKENS",
  80_000,
  12_000,
  160_000,
);

export const liveSummaryMaxOutputTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_MAX_OUTPUT_TOKENS",
  8_000,
  4_000,
  16_000,
);

export const liveSummaryBudgetTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_SUMMARY_BUDGET_TOKENS",
  120_000,
  20_000,
  200_000,
);

export const liveReaderSummaryMaxInputTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_READER_SUMMARY_MAX_INPUT_TOKENS",
  48_000,
  24_000,
  100_000,
);

export const liveReaderSummaryMaxOutputTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_READER_SUMMARY_MAX_OUTPUT_TOKENS",
  8_000,
  4_000,
  16_000,
);

export const liveReaderSummaryBudgetTokens = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_READER_SUMMARY_BUDGET_TOKENS",
  80_000,
  32_000,
  160_000,
);

export const xTwitterMaxItems = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_X_MAX_ITEMS",
  60,
  1,
  100,
);

export const xTwitterLimitPerProduct = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_X_LIMIT_PER_PRODUCT",
  Math.max(50, xTwitterMaxItems),
  1,
  100,
);

export const redditIncludeComments = readBooleanEnv(
  "LIVE_MULTI_PROVIDER_REDDIT_INCLUDE_COMMENTS",
  true,
);

export const redditMaxCommentsPerPost = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_REDDIT_MAX_COMMENTS_PER_POST",
  5,
  1,
  100,
);

export const redditCommentDepth = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_REDDIT_COMMENT_DEPTH",
  2,
  0,
  10,
);

export const redditCommentSort = readCommentSort(
  readOptionalEnv("LIVE_MULTI_PROVIDER_REDDIT_COMMENT_SORT") ?? "confidence",
);

export const allowEmptyTargets = readBooleanEnv(
  "LIVE_MULTI_PROVIDER_ALLOW_EMPTY_TARGETS",
  sourcePresetMode === aiDeveloperSignalSourcePreset.presetId,
);

export const xFallbackFreshnessMinutes = readPositiveIntegerEnv(
  "LIVE_MULTI_PROVIDER_X_FALLBACK_FRESHNESS_MINUTES",
  24 * 60,
  1,
  7 * 24 * 60,
);

const sampledAtEnv = "LIVE_MULTI_PROVIDER_SAMPLED_AT";

export const sampledAt =
  readOptionalDateEnv(sampledAtEnv) ?? new Date("2026-06-21T00:00:00.000Z");

export const evidencePathEnv = "LIVE_MULTI_PROVIDER_SUMMARY_EVIDENCE_PATH";

export const frontendFixturePathEnv =
  "LIVE_MULTI_PROVIDER_SUMMARY_FRONTEND_FIXTURE_PATH";

export const summaryPromptDebugPathEnv =
  "LIVE_MULTI_PROVIDER_SUMMARY_PROMPT_DEBUG_PATH";

export const summaryModelMode = readSummaryModelMode();

export const readerSummaryModelMode = readReaderSummaryModelMode();

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

export function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

export function readCsvEnv(name: string): readonly string[] | undefined {
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

export function readPositiveIntegerEnv(
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

export function readOptionalPositiveIntegerEnv(name: string): number | undefined {
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

export function readBooleanEnv(name: string, fallback: boolean): boolean {
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
