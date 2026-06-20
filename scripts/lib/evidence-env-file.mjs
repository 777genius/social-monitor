import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const forbiddenPathFragments = ['/fixtures/', '\\fixtures\\', '.example.', '-examples', '_examples'];

export function writeEvidenceEnvFile(envFilePath, entries, options = {}) {
  const resolvedPath = validateEvidenceEnvFilePath(envFilePath);
  const lines = [
    '# Generated external beta evidence env file.',
    '# Keep this file outside git and load only in an operator shell.',
    ...(options.usageLines ?? []).map((line) => `# ${line}`),
    '',
  ];

  for (const [name, value] of entries) {
    if (!isValidEnvName(name)) {
      throw new Error(`Invalid env var name: ${name}`);
    }
    if (value === undefined || value === null || String(value).trim().length === 0) {
      continue;
    }
    lines.push(`${name}=${shellQuote(String(value))}`);
  }

  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  chmodSync(resolvedPath, 0o600);
  return resolvedPath;
}

export function validateEvidenceEnvFilePath(envFilePath) {
  if (!isAbsolute(envFilePath)) {
    throw new Error('Evidence env file path must be absolute');
  }
  const resolvedPath = resolve(envFilePath);
  if (!resolvedPath.endsWith('.env')) {
    throw new Error('Evidence env file path must end with .env');
  }
  if (isInsideWorkspace(resolvedPath)) {
    throw new Error('Evidence env file path must not be inside the git workspace');
  }
  if (isFixtureLikePath(resolvedPath)) {
    throw new Error('Evidence env file path must not point to fixture or example paths');
  }

  return resolvedPath;
}

export function validateEvidenceJsonFilePath(path, label) {
  if (!isAbsolute(path)) {
    throw new Error(`${label} must be an absolute JSON file path`);
  }
  const resolvedPath = resolve(path);
  if (!resolvedPath.endsWith('.json')) {
    throw new Error(`${label} must end with .json`);
  }
  if (isInsideWorkspace(resolvedPath)) {
    throw new Error(`${label} must not write release evidence into the git workspace`);
  }
  if (isFixtureLikePath(resolvedPath)) {
    throw new Error(`${label} must not point to fixture or example paths`);
  }

  return resolvedPath;
}

export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isValidEnvName(name) {
  return /^[A-Z_][A-Z0-9_]*$/.test(name);
}

function isInsideWorkspace(path) {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isFixtureLikePath(path) {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return forbiddenPathFragments.some((fragment) => normalized.includes(fragment.replaceAll('\\', '/').toLowerCase()));
}
