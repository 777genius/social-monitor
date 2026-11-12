import { readPrivateOpenAiApiKeyFile } from './openai-api-key-file';

export const openAiApiKeySourceDescription =
  'OPENAI_API_KEY or OPENAI_API_KEY_FILE';

/** Direct credentials take priority; only the file adapter touches the filesystem. */
export const resolveOpenAiApiKey = (env: NodeJS.ProcessEnv): string => {
  const directApiKey = env.OPENAI_API_KEY?.trim() ?? '';
  if (directApiKey.length > 0) {
    return directApiKey;
  }

  const keyFile = env.OPENAI_API_KEY_FILE?.trim();
  if (keyFile === undefined || keyFile.length === 0) {
    return '';
  }

  return readPrivateOpenAiApiKeyFile(keyFile);
};
