import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "./openai-responses-reader-summary-runtime-settings";
import { openAiApiKeySourceDescription, resolveOpenAiApiKey } from "./openai-api-key-source";
import { projectOpenAiReaderSummaryEnvironment } from "./openai-responses-reader-summary-env-options";
import { assertNoReaderSummaryPromptReleaseOverride } from "./openai-responses-reader-summary-prompt";

/** Validate the prompt release and credentials before projecting nonsecret options. */
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
    ...projectOpenAiReaderSummaryEnvironment(env),
  };
};
