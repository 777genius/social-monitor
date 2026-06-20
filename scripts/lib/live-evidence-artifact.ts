import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const forbiddenPathFragments = ['/fixtures/', '\\fixtures\\', '.example.', '-examples', '_examples'];

export const writeLiveEvidenceArtifactAtomically = (
  evidencePath: string,
  serializedArtifact: string,
  label: string,
): void => {
  const artifactPath = validateLiveEvidenceJsonFilePath(evidencePath, label);
  mkdirSync(dirname(artifactPath), { recursive: true });
  const temporaryEvidencePath = `${artifactPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    writeFileSync(temporaryEvidencePath, serializedArtifact, { mode: 0o600 });
    chmodSync(temporaryEvidencePath, 0o600);
    renameSync(temporaryEvidencePath, artifactPath);
    chmodSync(artifactPath, 0o600);
  } catch (error) {
    try {
      unlinkSync(temporaryEvidencePath);
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  }
};

export const validateLiveEvidenceJsonFilePath = (path: string, label: string): string => {
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
};

export const readLiveEvidenceArtifactFile = (path: string, label: string): string => {
  const artifactPath = validateLiveEvidenceJsonFilePath(path, label);
  let stat;
  try {
    stat = statSync(artifactPath);
  } catch {
    throw new Error(`${label} must point to an existing regular file`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to an existing regular file`);
  }
  if (!isPrivateEvidenceFile(stat.mode)) {
    throw new Error(`${label} must use 0600-style private file permissions`);
  }

  return readFileSync(artifactPath, 'utf8');
};

const isInsideWorkspace = (path: string): boolean => {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
};

const isFixtureLikePath = (path: string): boolean => {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return forbiddenPathFragments.some((fragment) =>
    normalized.includes(fragment.replaceAll('\\', '/').toLowerCase()),
  );
};

const isPrivateEvidenceFile = (mode: number): boolean => (mode & 0o077) === 0;
