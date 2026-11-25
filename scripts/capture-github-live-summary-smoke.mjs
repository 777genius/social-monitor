import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactDir =
  process.env.GITHUB_LIVE_SUMMARY_EVIDENCE_ARTIFACT_DIR ??
  process.env.SOURCE_LIVE_EVIDENCE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const evidencePath = validateEvidenceJsonFilePath(
  process.env.GITHUB_LIVE_SUMMARY_EVIDENCE_PATH?.trim()
    || join(resolve(artifactDir), 'github-live-summary-smoke.json'),
  'GITHUB_LIVE_SUMMARY_EVIDENCE_PATH',
);
const envFilePath = validateEvidenceEnvFilePath(
  process.env.GITHUB_LIVE_SUMMARY_EVIDENCE_ENV_PATH?.trim()
    || join(resolve(artifactDir), 'github-live-summary-smoke.env'),
);
const env = {
  ...process.env,
  GITHUB_LIVE_SUMMARY_EVIDENCE_PATH: evidencePath,
  BACKEND_IMAGE_DIGEST: requiredImageDigestEnv('BACKEND_IMAGE_DIGEST'),
  BACKEND_GIT_COMMIT_SHA: requiredCommitShaEnv('BACKEND_GIT_COMMIT_SHA'),
  SOURCE_LIVE_ENVIRONMENT_ID: requiredIdentityEnv('SOURCE_LIVE_ENVIRONMENT_ID'),
  SOURCE_LIVE_OPERATOR: requiredIdentityEnv('SOURCE_LIVE_OPERATOR'),
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
  'scripts/check-github-live-summary-smoke.ts',
], {
  env,
  stdio: 'inherit',
});

validateWrittenArtifact(evidencePath);
writeEvidenceEnvFile(envFilePath, [
  ['GITHUB_LIVE_SUMMARY_EVIDENCE_PATH', evidencePath],
  ['BACKEND_IMAGE_DIGEST', env.BACKEND_IMAGE_DIGEST],
  ['BACKEND_GIT_COMMIT_SHA', env.BACKEND_GIT_COMMIT_SHA],
  ['SOURCE_LIVE_ENVIRONMENT_ID', env.SOURCE_LIVE_ENVIRONMENT_ID],
  ['SOURCE_LIVE_OPERATOR', env.SOURCE_LIVE_OPERATOR],
], {
  usageLines: [
    'Optional GitHub live API to summary smoke evidence.',
    `set -a; . ${shellQuote(envFilePath)}; set +a`,
    'EXTERNAL_BETA_ADDITIONAL_ENV_PATHS=$GITHUB_LIVE_SUMMARY_EVIDENCE_ENV_PATH npm run beta:evidence:package-current',
    'The artifact stores counts, hashes and provenance only; it does not store raw GitHub payloads, tokens or summary text.',
  ],
});

console.log(`GITHUB_LIVE_SUMMARY_EVIDENCE_PATH=${evidencePath}`);
console.log(`GITHUB_LIVE_SUMMARY_EVIDENCE_ENV_PATH=${envFilePath}`);

function validateWrittenArtifact(path) {
  if (!existsSync(path)) {
    throw new Error(`GitHub live summary evidence artifact was not written: ${path}`);
  }
  const mode = statSync(path).mode & 0o077;
  if (mode !== 0) {
    throw new Error(`GitHub live summary evidence artifact must use 0600-style private permissions: ${path}`);
  }
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  if (artifact.schemaVersion !== 1 || artifact.format !== 'github-live-summary-smoke-evidence-v1') {
    throw new Error('GitHub live summary evidence artifact has an invalid schema or format');
  }
  if (artifact.redaction?.rawProviderPayloadIncluded !== false || artifact.redaction?.accessTokenIncluded !== false) {
    throw new Error('GitHub live summary evidence artifact must prove raw payload/token redaction');
  }
}

function requiredCommitShaEnv(name) {
  const value = requiredIdentityEnv(name);
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${name} must be a full 40-character lowercase git commit SHA`);
  }

  return value;
}

function requiredImageDigestEnv(name) {
  const value = requiredIdentityEnv(name);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be a sha256 image digest`);
  }

  return value;
}

function requiredIdentityEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required to capture GitHub live summary evidence`);
  }
  if (['SOURCE_LIVE_ENVIRONMENT_ID', 'SOURCE_LIVE_OPERATOR'].includes(name) && isForbiddenEvidenceIdentity(value)) {
    throw new Error(`${name} must not use local, fixture, example, mock or test identifiers`);
  }

  return value;
}

function isForbiddenEvidenceIdentity(value) {
  const normalized = value.toLowerCase();
  return ['local', 'fixture', 'example', 'mock', 'test'].some((fragment) => normalized.includes(fragment));
}
