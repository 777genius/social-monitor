import {
  openAiApiKeySourceDescription,
  resolveOpenAiApiKey,
} from './openai-api-key-source';
import { parseNonNegativeNumber, parsePositiveInteger } from './openai-responses-summary-option-values';
import type { OpenAiSummaryFetchLike } from './openai-responses-summary-transport';

export type OpenAiResponsesSummaryModelAdapterOptions = {
  readonly apiKey?: string;
  readonly endpointUrl?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
  readonly estimatedInputCostUsdPerMillionTokens?: number;
  readonly estimatedOutputCostUsdPerMillionTokens?: number;
  readonly fetchFn?: OpenAiSummaryFetchLike;
};

export const resolveOpenAiResponsesSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  params: { readonly requireApiKey: boolean },
): OpenAiResponsesSummaryModelAdapterOptions => {
  const apiKey = resolveOpenAiApiKey(env);

  if (params.requireApiKey && apiKey.length === 0) {
    throw new Error(
      `SUMMARY_MODEL_PROVIDER=openai-responses requires ${openAiApiKeySourceDescription}`,
    );
  }

  return {
    apiKey,
    endpointUrl: env.OPENAI_RESPONSES_ENDPOINT_URL,
    model: env.OPENAI_SUMMARY_MODEL,
    promptVersion: env.OPENAI_SUMMARY_PROMPT_VERSION,
    evalDatasetVersion: env.SUMMARY_EVAL_DATASET_VERSION,
    timeoutMs: parsePositiveInteger(env.OPENAI_SUMMARY_TIMEOUT_MS),
    maxOutputTokens: parsePositiveInteger(env.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS),
    estimatedInputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS,
    ),
    estimatedOutputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS,
    ),
  };
};
