import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactDir =
  process.env.SOURCE_LIVE_EVIDENCE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const evidencePath =
  process.env.GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH ??
  join(resolve(artifactDir), 'github-repo-radar-live-evidence.json');
const envFilePath =
  process.env.GITHUB_REPO_RADAR_LIVE_EVIDENCE_ENV_PATH ??
  join(resolve(artifactDir), 'live-github-repo-radar.env');
const evidenceTarget = validateEvidenceJsonFilePath(
  evidencePath,
  'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH',
);
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
const identityEnvNames = ['SOURCE_LIVE_ENVIRONMENT_ID', 'SOURCE_LIVE_OPERATOR'];
const forbiddenIdentityFragments = ['local', 'fixture', 'example', 'mock', 'test'];
const projectId = requiredEnv('GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID');
const env = {
  ...process.env,
  DATABASE_URL: requiredPostgresUrlEnv('DATABASE_URL'),
  GITHUB_REPO_RADAR_PRISMA_LIVE_E2E: '1',
  GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID: projectId,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT?.trim() || projectId,
  GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH: evidenceTarget,
  SOURCE_LIVE_ENVIRONMENT_ID: requiredEnv('SOURCE_LIVE_ENVIRONMENT_ID'),
  BACKEND_IMAGE_DIGEST: requiredEnv('BACKEND_IMAGE_DIGEST'),
  BACKEND_GIT_COMMIT_SHA: requiredCommitShaEnv('BACKEND_GIT_COMMIT_SHA'),
  SOURCE_LIVE_OPERATOR: requiredEnv('SOURCE_LIVE_OPERATOR'),
};

execFileSync('node', [
  'scripts/run-with-timeout.mjs',
  '--timeout-ms',
  '180000',
  '--node-options',
  '--max-old-space-size=1024',
  '--',
  'ts-node',
  '-r',
  'tsconfig-paths/register',
  'scripts/check-github-repo-radar-prisma-live-e2e.ts',
], {
  env,
  stdio: 'inherit',
});
execFileSync('node', ['scripts/check-source-live-certification-evidence.mjs'], {
  env,
  stdio: 'inherit',
});

writeEvidenceEnvFile(envFileTarget, [
  ['GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH', evidenceTarget],
  ['GITHUB_REPO_RADAR_PRISMA_LIVE_E2E', '1'],
  ['GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID', projectId],
  ['SOURCE_LIVE_ENVIRONMENT_ID', env.SOURCE_LIVE_ENVIRONMENT_ID],
  ['BACKEND_IMAGE_DIGEST', env.BACKEND_IMAGE_DIGEST],
  ['BACKEND_GIT_COMMIT_SHA', env.BACKEND_GIT_COMMIT_SHA],
  ['SOURCE_LIVE_OPERATOR', env.SOURCE_LIVE_OPERATOR],
], {
  usageLines: [
    'Usage:',
    `set -a; . ${shellQuote(envFileTarget)}; set +a`,
    'npm run check:source-live-certification-evidence',
    'This handoff covers GitHub Repo Radar live evidence and intentionally excludes DATABASE_URL and GitHub credentials. Capture requires DATABASE_URL from the operator secret boundary.',
  ],
});

console.log(`GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH=${evidenceTarget}`);
console.log(`GITHUB_REPO_RADAR_LIVE_EVIDENCE_ENV_PATH=${envFileTarget}`);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required to capture GitHub Repo Radar live evidence`);
  }
  if (identityEnvNames.includes(name) && isForbiddenEvidenceIdentity(value)) {
    throw new Error(`${name} must not use local, fixture, example, mock or test identifiers`);
  }

  return value;
}

function requiredCommitShaEnv(name) {
  const value = requiredEnv(name);
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${name} must be a full 40-character lowercase git commit SHA`);
  }

  return value;
}

function requiredPostgresUrlEnv(name) {
  const value = requiredEnv(name);
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${name} must be a PostgreSQL URL`);
  }

  return value;
}

function isForbiddenEvidenceIdentity(value) {
  const normalized = value.toLowerCase();
  return forbiddenIdentityFragments.some((fragment) => normalized.includes(fragment));
}
