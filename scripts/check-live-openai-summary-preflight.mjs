import { existsSync, statSync } from 'node:fs';

const hasDirectApiKey = process.env.OPENAI_API_KEY?.trim().length > 0;
const keyFile = process.env.OPENAI_API_KEY_FILE?.trim();

if (!hasDirectApiKey && (keyFile === undefined || keyFile.length === 0)) {
  throw new Error(
    'OpenAI-backed live summary E2E requires OPENAI_API_KEY or OPENAI_API_KEY_FILE',
  );
}

if (keyFile !== undefined && keyFile.length > 0) {
  if (!existsSync(keyFile)) {
    throw new Error('OPENAI_API_KEY_FILE must point at an existing file');
  }

  const stat = statSync(keyFile);
  if (!stat.isFile()) {
    throw new Error('OPENAI_API_KEY_FILE must point at a regular file');
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('OPENAI_API_KEY_FILE must use private 0600-style permissions');
  }
}

console.log('OpenAI live summary preflight OK');
