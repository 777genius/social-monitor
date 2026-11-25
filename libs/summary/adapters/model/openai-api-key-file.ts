import { existsSync, readFileSync, statSync } from 'node:fs';

/**
 * Credential-file I/O and permission checks stay at the infrastructure edge.
 * The caller chooses precedence; this adapter never reads environment variables.
 */
export const readPrivateOpenAiApiKeyFile = (keyFile: string): string => {
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
