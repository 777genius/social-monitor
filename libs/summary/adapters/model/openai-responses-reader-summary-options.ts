import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "./openai-responses-reader-summary-model.adapter";
import { openAiApiKeySourceDescription, resolveOpenAiApiKey } from "./openai-api-key-source";
import { assertNoReaderSummaryPromptReleaseOverride } from "./openai-responses-reader-summary-prompt";

export const resolveOpenAiResponsesReaderSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  params: { readonly requireApiKey: boolean },
): OpenAiResponsesReaderSummaryModelAdapterOptions => {
  assertNoReaderSummaryPromptReleaseOverride({
    environmentName: "OPENAI_READER_SUMMARY_PROMPT_VERSION",
    value: env.OPENAI_READER_SUMMARY_PROMPT_VERSION,
  });
  const apiKey = resolveOpenAiApiKey(env);

  if (params.requireApiKey && apiKey.length === 0) {
    throw new Error(
      `READER_SUMMARY_MODEL_PROVIDER=openai-responses requires ${openAiApiKeySourceDescription}`,
    );
  }

  return {
    apiKey,
    endpointUrl: env.OPENAI_RESPONSES_ENDPOINT_URL,
    model:
      env.OPENAI_READER_SUMMARY_MODEL ??
      env.OPENAI_READER_SUMMARY_MODEL ??
      env.OPENAI_SUMMARY_MODEL,
    evalDatasetVersion:
      env.READER_SUMMARY_EVAL_DATASET_VERSION ??
      env.READER_SUMMARY_EVAL_DATASET_VERSION,
    timeoutMs: parsePositiveInteger(
      env.OPENAI_READER_SUMMARY_TIMEOUT_MS ??
        env.OPENAI_READER_SUMMARY_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS ??
        env.OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS,
    ),
    estimatedInputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS,
    ),
    estimatedOutputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS,
    ),
  };
};


const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const parseNonNegativeNumber = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
