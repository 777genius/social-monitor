import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "./openai-responses-reader-summary-runtime-settings";
import { resolveOpenAiReaderSummaryCredential } from "./openai-responses-reader-summary-credential-admission";
import { projectOpenAiReaderSummaryEnvironment } from "./openai-responses-reader-summary-env-options";
import { assertNoReaderSummaryPromptReleaseOverride } from "./reader-summary-prompt-release-policy";

/** Validate the prompt release and credentials before projecting nonsecret options. */
export const resolveOpenAiResponsesReaderSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  params: { readonly requireApiKey: boolean },
): OpenAiResponsesReaderSummaryModelAdapterOptions => {
  assertNoReaderSummaryPromptReleaseOverride({
    environmentName: "OPENAI_READER_SUMMARY_PROMPT_VERSION",
    value: env.OPENAI_READER_SUMMARY_PROMPT_VERSION,
  });
  const apiKey = resolveOpenAiReaderSummaryCredential(env, params);

  return {
    apiKey,
    ...projectOpenAiReaderSummaryEnvironment(env),
  };
};
