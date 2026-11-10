import { openAiApiKeySourceDescription, resolveOpenAiApiKey } from "./openai-api-key-source";

export type OpenAiReaderSummaryWeeklyFetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions = Readonly<{
  apiKey?: string;
  endpointUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchFn?: OpenAiReaderSummaryWeeklyFetchLike;
}>;

export type NormalizedOpenAiReaderSummaryWeeklyOptions = Readonly<{
  apiKey: string;
  endpointUrl: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  fetchFn: OpenAiReaderSummaryWeeklyFetchLike;
}>;

const defaultEndpointUrl = "https://api.openai.com/v1/responses";
const defaultModel = "gpt-5.4-mini";
const defaultTimeoutMs = 180_000;
const defaultMaxOutputTokens = 16_000;

/** Provider-specific configuration defaults, with no I/O or task execution. */
export const normalizeOpenAiReaderSummaryWeeklyOptions = (
  options: OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions = {},
): NormalizedOpenAiReaderSummaryWeeklyOptions => ({
  apiKey: options.apiKey?.trim() ?? "",
  endpointUrl: nonEmptyOrFallback(options.endpointUrl, defaultEndpointUrl),
  model: nonEmptyOrFallback(options.model, defaultModel),
  timeoutMs: positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs),
  maxOutputTokens: positiveIntegerOrFallback(options.maxOutputTokens, defaultMaxOutputTokens),
  fetchFn: options.fetchFn ?? fetch,
});

export const resolveOpenAiResponsesReaderSummaryWeeklyModelOptions = (
  env: NodeJS.ProcessEnv,
  params: Readonly<{ requireApiKey: boolean }>,
): OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions => {
  const apiKey = resolveOpenAiApiKey(env);
  if (params.requireApiKey && apiKey.length === 0) {
    throw new Error(
      `OpenAI reader summary weekly model requires ${openAiApiKeySourceDescription}`,
    );
  }
  return {
    apiKey,
    endpointUrl: env.OPENAI_RESPONSES_ENDPOINT_URL,
    model:
      env.OPENAI_READER_SUMMARY_WEEKLY_MODEL ??
      env.OPENAI_READER_SUMMARY_MODEL ??
      env.OPENAI_SUMMARY_MODEL,
    timeoutMs: parsePositiveInteger(
      env.OPENAI_READER_SUMMARY_WEEKLY_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.OPENAI_READER_SUMMARY_WEEKLY_MAX_OUTPUT_TOKENS,
    ),
  };
};

const nonEmptyOrFallback = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number => value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
