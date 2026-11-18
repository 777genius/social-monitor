import { openAiApiKeySourceDescription, resolveOpenAiApiKey } from "./openai-api-key-source";

/**
 * Credential admission is intentionally separate from nonsecret environment
 * projection: a configured provider cannot silently run without credentials.
 * The caller validates the pinned prompt release before resolving any secret.
 */
export const resolveOpenAiReaderSummaryCredential = (
  env: NodeJS.ProcessEnv,
  params: { readonly requireApiKey: boolean },
): string => {
  const apiKey = resolveOpenAiApiKey(env);
  if (params.requireApiKey && apiKey.length === 0) {
    throw new Error(
      `READER_SUMMARY_MODEL_PROVIDER=openai-responses requires ${openAiApiKeySourceDescription}`,
    );
  }
  return apiKey;
};
