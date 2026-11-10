import type { OpenAiReaderSummaryFetchLike } from "./openai-responses-reader-summary-transport";

export type OpenAiResponsesReaderSummaryModelAdapterOptions = {
  readonly apiKey?: string;
  readonly endpointUrl?: string;
  readonly model?: string;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
  readonly estimatedInputCostUsdPerMillionTokens?: number;
  readonly estimatedOutputCostUsdPerMillionTokens?: number;
  readonly fetchFn?: OpenAiReaderSummaryFetchLike;
};

export type OpenAiReaderSummarySettings = {
  readonly apiKey: string;
  readonly endpointUrl: string;
  readonly model: string;
  readonly evalDatasetVersion: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly inputTokenDivisor: number;
  readonly estimatedInputCostUsdPerMillionTokens: number;
  readonly estimatedOutputCostUsdPerMillionTokens: number;
  readonly fetchFn: OpenAiReaderSummaryFetchLike;
};

/** Resolve an immutable provider execution configuration before orchestration. */
export const resolveOpenAiReaderSummarySettings = (
  options: OpenAiResponsesReaderSummaryModelAdapterOptions = {},
): OpenAiReaderSummarySettings => ({
  apiKey: options.apiKey?.trim() ?? "",
  endpointUrl: nonEmptyOrFallback(options.endpointUrl, "https://api.openai.com/v1/responses"),
  model: nonEmptyOrFallback(options.model, "gpt-5.4-mini"),
  evalDatasetVersion: nonEmptyOrFallback(options.evalDatasetVersion, "reader_summary.eval.mvp.v1"),
  timeoutMs: positiveIntegerOrFallback(options.timeoutMs, 180_000),
  maxOutputTokens: positiveIntegerOrFallback(options.maxOutputTokens, 16_000),
  inputTokenDivisor: positiveIntegerOrFallback(options.inputTokenDivisor, 4),
  estimatedInputCostUsdPerMillionTokens: nonNegativeNumberOrFallback(
    options.estimatedInputCostUsdPerMillionTokens,
    0,
  ),
  estimatedOutputCostUsdPerMillionTokens: nonNegativeNumberOrFallback(
    options.estimatedOutputCostUsdPerMillionTokens,
    0,
  ),
  fetchFn: options.fetchFn ?? fetch,
});

const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback;

const nonNegativeNumberOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
