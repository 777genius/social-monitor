import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "./openai-responses-reader-summary-runtime-settings";
import {
  parseNonNegativeNumber,
  parsePositiveInteger,
} from "./openai-responses-summary-option-values";

type ReaderSummaryEnvironmentOptions = Omit<
  OpenAiResponsesReaderSummaryModelAdapterOptions,
  "apiKey" | "fetchFn" | "inputTokenDivisor"
>;

/** Pure nonsecret environment mapping; no filesystem, credentials or prompt policy. */
export const projectOpenAiReaderSummaryEnvironment = (
  env: NodeJS.ProcessEnv,
): ReaderSummaryEnvironmentOptions => ({
  endpointUrl: env.OPENAI_RESPONSES_ENDPOINT_URL,
  model: env.OPENAI_READER_SUMMARY_MODEL ?? env.OPENAI_SUMMARY_MODEL,
  evalDatasetVersion: env.READER_SUMMARY_EVAL_DATASET_VERSION,
  timeoutMs: parsePositiveInteger(env.OPENAI_READER_SUMMARY_TIMEOUT_MS),
  maxOutputTokens: parsePositiveInteger(env.OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS),
  estimatedInputCostUsdPerMillionTokens: parseNonNegativeNumber(
    env.OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS,
  ),
  estimatedOutputCostUsdPerMillionTokens: parseNonNegativeNumber(
    env.OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS,
  ),
});
