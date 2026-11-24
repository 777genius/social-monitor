import { dirname, isAbsolute, relative, sep } from 'node:path';
import {
  validateArtifactLiteralRedaction, validateArtifactDecodedRedaction,
  parseJsonEvidenceContent, isStructuredJsonEvidence,
} from './external-beta-evidence-artifact-redaction.mjs';

const forbiddenEvidencePathFragments = ['/fixtures/', '\\fixtures\\', '.example.', '-examples', '_examples', '/example-', '\\example-'];

/**
 * Admit external evidence paths without owning CLI execution or environment loading.
 * The composition root supplies live contract/env references, lazy cwd and I/O.
 * Plan, live-output and artifact-validation stages intentionally retain separate rules.
 */
export function createExternalBetaEvidencePathAdmission({
  contract, env, cwd, jobInputEnvNames,
  accessSync, existsSync, lstatSync, readFileSync, realpathSync, statSync,
  execFileSync, writableMode,
}) {
  function validateExternalBetaEnvFilePath(path, label, violations) {
    if (!isAbsolute(path)) {
      violations.push(`${label}: path must be absolute`);
      return;
    }
    if (!path.endsWith('.env')) {
      violations.push(`${label}: path must end with .env`);
      return;
    }
    if (isFixtureLikeArtifactPath(path)) {
      violations.push(`${label}: path must not point to fixture or example evidence`);
      return;
    }
    if (isForbiddenWorkspaceEvidencePath(path)) {
      violations.push(`${label}: path must not be inside the git workspace`);
      return;
    }
    if (!existsSync(path)) {
      violations.push(`${label}: path must point to an existing env file`);
      return;
    }
    if (!isRegularEvidenceFile(path)) {
      violations.push(`${label}: path must point to a regular env file`);
      return;
    }
    if (!isPrivateEvidenceFile(path)) {
      violations.push(`${label}: path must use 0600-style private file permissions`);
      return;
    }
    if (isOversizedEvidenceFile(path)) {
      violations.push(`${label}: path must not exceed ${evidencePathMaxBytes()} bytes`);
      return;
    }
    if (isGitTrackedPath(path)) {
      violations.push(`${label}: path must not point to a git-tracked file`);
      return;
    }

    let realPath;
    try {
      realPath = realpathSync(path);
    } catch {
      violations.push(`${label}: realpath must be readable`);
      return;
    }
    if (!realPath.endsWith('.env')) {
      violations.push(`${label}: realpath must end with .env`);
      return;
    }
    if (isFixtureLikeArtifactPath(realPath)) {
      violations.push(`${label}: realpath must not point to fixture or example evidence`);
      return;
    }
    if (isForbiddenWorkspaceEvidencePath(realPath)) {
      violations.push(`${label}: realpath must not be inside the git workspace`);
      return;
    }
    if (isGitTrackedPath(realPath)) {
      violations.push(`${label}: realpath must not point to a git-tracked file`);
    }
  }

  function validateExecutableOutputArtifactPathEnv(job, missingEnvSet, violations) {
    if (contract.executionSafety?.liveExecutionValidatesOutputPathsBeforeRun !== true) {
      return;
    }
    if (job.runPolicy !== 'live_command') {
      return;
    }

    for (const artifact of job.outputArtifacts ?? []) {
      const envName = artifact.env;
      if (envName === undefined || !envName.endsWith('_PATH') || missingEnvSet.has(envName)) {
        continue;
      }

      const value = env[envName]?.trim();
      if (value === undefined || value === '') {
        continue;
      }
      if (!isAbsolute(value)) {
        violations.push(`${job.jobId}: output artifact env ${envName} must be an absolute file path before live execution`);
        continue;
      }
      if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(value)) {
        violations.push(`${job.jobId}: output artifact env ${envName} path must end with .json before live execution`);
        continue;
      }
      if (isFixtureLikeArtifactPath(value)) {
        violations.push(`${job.jobId}: output artifact env ${envName} must not point to fixture or example evidence before live execution`);
        continue;
      }
      if (isForbiddenWorkspaceEvidencePath(value)) {
        violations.push(`${job.jobId}: output artifact env ${envName} must not be inside the git workspace before live execution`);
        continue;
      }
      if (!isValidEvidencePathParentDirectory(value, job.jobId, envName, 'before live execution', violations)) {
        continue;
      }
      if (existsSync(value) && requiresRegularEvidenceFiles() && !isRegularEvidenceFile(value)) {
        violations.push(`${job.jobId}: output artifact env ${envName} must point to a regular file before live execution`);
        continue;
      }
      if (existsSync(value) && requiresPrivateEvidenceFileMode() && !isPrivateEvidenceFile(value)) {
        violations.push(`${job.jobId}: output artifact env ${envName} must use 0600-style private file permissions before live execution`);
        continue;
      }
      if (existsSync(value) && isGitTrackedPath(value)) {
        violations.push(`${job.jobId}: output artifact env ${envName} must not point to a git-tracked file before live execution`);
        continue;
      }
      // Missing outputs are permitted; an existing or dangling alias must resolve
      // before a producer can write through it. Parent aliases alone are valid.
      if (!existsSync(value)) {
        if (!isAbsentEvidencePath(value)) {
          violations.push(`${job.jobId}: evidence path env ${envName} realpath must be readable`);
        }
        continue;
      }
      const realPath = readEvidenceRealPath(value, job.jobId, envName, violations);
      if (realPath === undefined) {
        continue;
      }
      if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(realPath)) {
        violations.push(`${job.jobId}: output artifact env ${envName} realpath must end with .json before live execution`);
        continue;
      }
      if (isFixtureLikeArtifactPath(realPath)) {
        violations.push(`${job.jobId}: output artifact env ${envName} realpath must not point to fixture or example evidence before live execution`);
        continue;
      }
      if (isForbiddenWorkspaceEvidencePath(realPath)) {
        violations.push(`${job.jobId}: output artifact env ${envName} realpath must not be inside the git workspace before live execution`);
        continue;
      }
      if (isGitTrackedPath(realPath)) {
        violations.push(`${job.jobId}: output artifact env ${envName} realpath must not point to a git-tracked file before live execution`);
      }
    }
  }

  function validatePlannedEvidencePathEnv(job, missingEnvSet, violations) {
    if (contract.executionSafety?.preflightRequiresEvidencePathValidation !== true) {
      return;
    }

    const pathEnvNames = new Set(jobInputEnvNames(job));
    for (const envName of pathEnvNames) {
      if (!envName.endsWith('_PATH') || missingEnvSet.has(envName)) {
        continue;
      }

      const value = env[envName]?.trim();
      if (value === undefined || value === '') {
        continue;
      }
      if (!isAbsolute(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must be an absolute file path before preflight`);
        continue;
      }
      if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} path must end with .json before preflight`);
        continue;
      }
      if (isFixtureLikeArtifactPath(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must not point to fixture or example evidence before preflight`);
        continue;
      }
      if (isForbiddenWorkspaceEvidencePath(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must not be inside the git workspace before preflight`);
        continue;
      }
      if (!isValidEvidencePathParentDirectory(value, job.jobId, envName, 'before preflight', violations)) {
        continue;
      }
      if (!existsSync(value)) {
        if (!isAbsentEvidencePath(value)) {
          violations.push(`${job.jobId}: evidence path env ${envName} realpath must be readable`);
        }
        continue;
      }
      if (requiresRegularEvidenceFiles() && !isRegularEvidenceFile(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must point to a regular file before preflight`);
        continue;
      }
      if (requiresPrivateEvidenceFileMode() && !isPrivateEvidenceFile(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must use 0600-style private file permissions before preflight`);
        continue;
      }
      if (isOversizedEvidenceFile(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must not exceed ${evidencePathMaxBytes()} bytes before preflight`);
        continue;
      }
      if (isGitTrackedPath(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must not point to a git-tracked file before preflight`);
        continue;
      }

      const realPath = readEvidenceRealPath(value, job.jobId, envName, violations);
      if (realPath === undefined) {
        continue;
      }
      if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must end with .json before preflight`);
        continue;
      }
      if (requiresRegularEvidenceFiles() && !isRegularEvidenceFile(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must point to a regular file before preflight`);
        continue;
      }
      if (requiresPrivateEvidenceFileMode() && !isPrivateEvidenceFile(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must use 0600-style private file permissions before preflight`);
        continue;
      }
      if (isOversizedEvidenceFile(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must not exceed ${evidencePathMaxBytes()} bytes before preflight`);
        continue;
      }
      if (isFixtureLikeArtifactPath(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must not point to fixture or example evidence before preflight`);
        continue;
      }
      if (isForbiddenWorkspaceEvidencePath(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must not be inside the git workspace before preflight`);
        continue;
      }
      if (isGitTrackedPath(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must not point to a git-tracked file before preflight`);
      }
    }
  }

  function validateEvidencePathEnv(job, missingEnvSet, violations) {
    const invalidPathEnv = new Set();
    const pathEnvNames = new Set(jobInputEnvNames(job));

    for (const envName of pathEnvNames) {
      if (!envName.endsWith('_PATH') || missingEnvSet.has(envName)) {
        continue;
      }

      const value = env[envName]?.trim();
      if (value === undefined || value === '') {
        continue;
      }
      if (!isAbsolute(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must be an absolute file path`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} path must end with .json`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (!existsSync(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must point to an existing file path`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (requiresRegularEvidenceFiles() && !isRegularEvidenceFile(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must point to a regular file`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (isOversizedEvidenceFile(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must not exceed ${evidencePathMaxBytes()} bytes`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (isFixtureLikeArtifactPath(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must not point to fixture or example evidence`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (isForbiddenWorkspaceEvidencePath(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must not be inside the git workspace`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (isGitTrackedPath(value)) {
        violations.push(`${job.jobId}: evidence path env ${envName} must not point to a git-tracked file`);
        invalidPathEnv.add(envName);
        continue;
      }
      const realPath = readEvidenceRealPath(value, job.jobId, envName, violations);
      if (realPath === undefined) {
        invalidPathEnv.add(envName);
        continue;
      }
      if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must end with .json`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (requiresRegularEvidenceFiles() && !isRegularEvidenceFile(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must point to a regular file`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (requiresPrivateEvidenceFileMode() && !isPrivateEvidenceFile(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must use 0600-style private file permissions`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (isOversizedEvidenceFile(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must not exceed ${evidencePathMaxBytes()} bytes`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (isFixtureLikeArtifactPath(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must not point to fixture or example evidence`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (isForbiddenWorkspaceEvidencePath(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must not be inside the git workspace`);
        invalidPathEnv.add(envName);
        continue;
      }
      if (isGitTrackedPath(realPath)) {
        violations.push(`${job.jobId}: evidence path env ${envName} realpath must not point to a git-tracked file`);
        invalidPathEnv.add(envName);
        continue;
      }

      const violationCount = violations.length;
      validateEvidencePathFileContent(realPath, job.jobId, envName, violations);
      if (violations.length > violationCount) {
        invalidPathEnv.add(envName);
      }
    }

    return invalidPathEnv;
  }

  function isJsonEvidencePath(path) {
    return path.toLowerCase().endsWith('.json');
  }

  function requiresJsonOutputArtifactPaths() {
    return contract.executionSafety?.outputArtifactPathEnvRequiresJsonExtension === true;
  }

  function requiresJsonEvidencePathEnv() {
    return contract.executionSafety?.evidencePathEnvRequiresJsonExtension === true || requiresJsonOutputArtifactPaths();
  }

  function requiresJsonEvidencePathContent() {
    return contract.executionSafety?.evidencePathEnvRequiresJsonContent === true;
  }

  function forbidsWorkspaceEvidencePaths() {
    return contract.executionSafety?.evidencePathEnvForbidsWorkspacePath === true;
  }

  function requiresRegularEvidenceFiles() {
    return contract.executionSafety?.evidencePathEnvRequiresRegularFile === true;
  }

  function requiresPrivateEvidenceFileMode() {
    return contract.executionSafety?.evidencePathEnvRequiresPrivateFileMode === true;
  }

  function isRegularEvidenceFile(path) {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  }

  function isAbsentEvidencePath(path) {
    try {
      lstatSync(path);
      return false;
    } catch (error) {
      return error?.code === 'ENOENT';
    }
  }

  function isPrivateEvidenceFile(path) {
    try {
      return (statSync(path).mode & 0o077) === 0;
    } catch {
      return false;
    }
  }

  function isOversizedEvidenceFile(path) {
    const maxBytes = evidencePathMaxBytes();
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      return false;
    }
    try {
      return statSync(path).size > maxBytes;
    } catch {
      return false;
    }
  }

  function evidencePathMaxBytes() {
    return Number(contract.executionSafety?.evidencePathEnvMaxBytes ?? 0);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return 'unbounded';
    }
    return `${bytes} bytes`;
  }

  function readEvidenceRealPath(path, jobId, envName, violations) {
    try {
      return realpathSync(path);
    } catch {
      violations.push(`${jobId}: evidence path env ${envName} realpath must be readable`);
      return undefined;
    }
  }

  function validateEvidencePathFileContent(path, jobId, envName, violations) {
    let content;
    try {
      content = readFileSync(path, 'utf8');
    } catch {
      violations.push(`${jobId}: evidence path env ${envName} must be readable`);
      return;
    }

    validateArtifactLiteralRedaction(content, jobId, `evidence path env ${envName}`, violations);

    const parsed = parseJsonEvidenceContent(content);
    if (!parsed.ok) {
      if (requiresJsonEvidencePathContent()) {
        violations.push(`${jobId}: evidence path env ${envName} must point to valid JSON evidence`);
      }
      return;
    }
    if (!isStructuredJsonEvidence(parsed.value)) {
      if (requiresJsonEvidencePathContent()) {
        violations.push(`${jobId}: evidence path env ${envName} must point to a JSON object or array evidence file`);
      }
      return;
    }
    validateArtifactDecodedRedaction(parsed.value, jobId, `evidence path env ${envName}`, violations);
  }

  function isFixtureLikeArtifactPath(path) {
    const normalized = path.toLowerCase();
    return forbiddenEvidencePathFragments.some((fragment) => normalized.includes(fragment))
      || normalized.split(/[\\/]+/).some((segment) => isFixtureLikePathSegment(segment));
  }

  function isFixtureLikePathSegment(segment) {
    return segment.includes('fixture') || segment.includes('example');
  }

  function isForbiddenWorkspaceEvidencePath(path) {
    if (!forbidsWorkspaceEvidencePaths()) {
      return false;
    }

    const relativePath = relative(cwd(), path);
    return relativePath === '' || (!isParentRelativePath(relativePath) && !isAbsolute(relativePath));
  }

  function isValidEvidencePathParentDirectory(path, jobId, envName, stage, violations) {
    if (contract.executionSafety?.evidencePathEnvRequiresWritableParent !== true) {
      return true;
    }

    const parentDirectory = dirname(path);
    if (!existsSync(parentDirectory)) {
      violations.push(`${jobId}: evidence path env ${envName} parent directory must exist ${stage}`);
      return false;
    }
    let parentRealPath;
    try {
      parentRealPath = realpathSync(parentDirectory);
    } catch {
      violations.push(`${jobId}: evidence path env ${envName} parent directory realpath must be readable ${stage}`);
      return false;
    }
    if (!isRegularDirectory(parentRealPath)) {
      violations.push(`${jobId}: evidence path env ${envName} parent path must be a directory ${stage}`);
      return false;
    }
    if (isForbiddenWorkspaceEvidencePath(parentRealPath)) {
      violations.push(`${jobId}: evidence path env ${envName} parent directory must not be inside the git workspace ${stage}`);
      return false;
    }
    if (isFixtureLikeArtifactPath(parentRealPath)) {
      violations.push(`${jobId}: evidence path env ${envName} parent directory must not point to fixture or example evidence ${stage}`);
      return false;
    }
    try {
      accessSync(parentRealPath, writableMode);
    } catch {
      violations.push(`${jobId}: evidence path env ${envName} parent directory must be writable ${stage}`);
      return false;
    }
    return true;
  }

  function isRegularDirectory(path) {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  function isGitTrackedPath(path) {
    const pathspec = isAbsolute(path) ? relative(cwd(), path) : path;
    if (isParentRelativePath(pathspec)) {
      return false;
    }

    try {
      execFileSync('git', ['ls-files', '--error-unmatch', '--', pathspec], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  function isParentRelativePath(path) {
    return path === '..' || path.startsWith(`..${sep}`);
  }

  return {
    validateExternalBetaEnvFilePath, validateExecutableOutputArtifactPathEnv,
    validatePlannedEvidencePathEnv, validateEvidencePathEnv,
    evidencePathMaxBytes, formatBytes, isFixtureLikeArtifactPath,
  };
}
