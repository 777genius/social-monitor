import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';

export const openAiApiKeySourceDescription =
  'OPENAI_API_KEY or OPENAI_API_KEY_FILE';

export const resolveOpenAiApiKey = (env: NodeJS.ProcessEnv): string => {
  const directApiKey = env.OPENAI_API_KEY?.trim() ?? '';
  if (directApiKey.length > 0) {
    return directApiKey;
  }

  const keyFile = env.OPENAI_API_KEY_FILE?.trim();
  if (keyFile === undefined || keyFile.length === 0) {
    return '';
  }
  if (!existsSync(keyFile)) {
    throw new Error(`OPENAI_API_KEY_FILE does not exist: ${keyFile}`);
  }

  const stat = statSync(keyFile);
  if (!stat.isFile()) {
    throw new Error(`OPENAI_API_KEY_FILE must point at a file: ${keyFile}`);
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      'OPENAI_API_KEY_FILE must use private 0600-style permissions',
    );
  }

  return readFileSync(keyFile, 'utf8').trim();
};
