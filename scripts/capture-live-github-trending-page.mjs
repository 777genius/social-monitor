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
  process.env.GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH ??
  join(resolve(artifactDir), 'github-trending-page-live-evidence.json');
const envFilePath =
  process.env.GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_ENV_PATH ??
  join(resolve(artifactDir), 'live-github-trending-page.env');
const evidenceTarget = validateEvidenceJsonFilePath(
  evidencePath,
  'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH',
);
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
const identityEnvNames = ['SOURCE_LIVE_ENVIRONMENT_ID', 'SOURCE_LIVE_OPERATOR'];
const forbiddenIdentityFragments = ['local', 'fixture', 'example', 'mock', 'test'];
const env = {
  ...process.env,
  GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH: evidenceTarget,
  SOURCE_LIVE_ENVIRONMENT_ID: requiredEnv('SOURCE_LIVE_ENVIRONMENT_ID'),
  BACKEND_IMAGE_DIGEST: requiredEnv('BACKEND_IMAGE_DIGEST'),
  BACKEND_GIT_COMMIT_SHA: requiredCommitShaEnv('BACKEND_GIT_COMMIT_SHA'),
  SOURCE_LIVE_OPERATOR: requiredEnv('SOURCE_LIVE_OPERATOR'),
};

execFileSync('node', [
  'scripts/run-with-timeout.mjs',
  '--timeout-ms',
  '60000',
  '--node-options',
  '--max-old-space-size=1024',
  '--',
  'ts-node',
  '-r',
  'tsconfig-paths/register',
  'scripts/check-github-trending-page-live-smoke.ts',
], {
  env,
  stdio: 'inherit',
});
execFileSync('node', ['scripts/check-source-live-certification-evidence.mjs'], {
  env,
  stdio: 'inherit',
});

writeEvidenceEnvFile(envFileTarget, [
  ['GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH', evidenceTarget],
  ['SOURCE_LIVE_ENVIRONMENT_ID', env.SOURCE_LIVE_ENVIRONMENT_ID],
  ['BACKEND_IMAGE_DIGEST', env.BACKEND_IMAGE_DIGEST],
  ['BACKEND_GIT_COMMIT_SHA', env.BACKEND_GIT_COMMIT_SHA],
  ['SOURCE_LIVE_OPERATOR', env.SOURCE_LIVE_OPERATOR],
], {
  usageLines: [
    'Usage:',
    `set -a; . ${shellQuote(envFileTarget)}; set +a`,
    'npm run check:source-live-certification-evidence',
    'This handoff covers the public GitHub Trending page only and intentionally does not export credentials.',
  ],
});

console.log(`GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH=${evidenceTarget}`);
console.log(`GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_ENV_PATH=${envFileTarget}`);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required to capture GitHub Trending page live evidence`);
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

function isForbiddenEvidenceIdentity(value) {
  const normalized = value.toLowerCase();
  return forbiddenIdentityFragments.some((fragment) => normalized.includes(fragment));
}
