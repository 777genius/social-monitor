import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { URLSearchParams } from 'node:url';

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
const liveEvidencePath =
  process.env.REDDIT_LIVE_EVIDENCE_PATH ??
  join(resolve(artifactDir), 'live-reddit-oauth.json');
const lifecycleEvidencePath =
  process.env.REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH ??
  join(resolve(artifactDir), 'reddit-credential-lifecycle.json');
const envFilePath =
  process.env.REDDIT_LIVE_EVIDENCE_ENV_PATH ??
  join(resolve(artifactDir), 'live-reddit-oauth.env');
const liveEvidenceTarget = validateEvidenceJsonFilePath(liveEvidencePath, 'REDDIT_LIVE_EVIDENCE_PATH');
const lifecycleEvidenceTarget = validateEvidenceJsonFilePath(
  lifecycleEvidencePath,
  'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH',
);
const identityEnvNames = ['SOURCE_LIVE_ENVIRONMENT_ID', 'SOURCE_LIVE_OPERATOR'];
const forbiddenIdentityFragments = ['local', 'fixture', 'example', 'mock', 'test'];

async function main() {
  const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
  const accessToken = await resolveRedditAccessToken();
  const env = {
    ...process.env,
    REDDIT_ACCESS_TOKEN: accessToken,
    REDDIT_LIVE_EVIDENCE_PATH: liveEvidenceTarget,
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycleEvidenceTarget,
    SOURCE_LIVE_ENVIRONMENT_ID: requiredEnv('SOURCE_LIVE_ENVIRONMENT_ID'),
    BACKEND_IMAGE_DIGEST: requiredEnv('BACKEND_IMAGE_DIGEST'),
    BACKEND_GIT_COMMIT_SHA: requiredCommitShaEnv('BACKEND_GIT_COMMIT_SHA'),
    SOURCE_LIVE_OPERATOR: requiredEnv('SOURCE_LIVE_OPERATOR'),
  };

  if (!existsSync(lifecycleEvidenceTarget)) {
    throw new Error(
      `REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must reference existing redacted lifecycle evidence: ${lifecycleEvidenceTarget}`,
    );
  }

  execFileSync('node', [
    'scripts/run-with-timeout.mjs',
    '--timeout-ms',
    '45000',
    '--node-options',
    '--max-old-space-size=1024',
    '--',
    'ts-node',
    '-r',
    'tsconfig-paths/register',
    'scripts/check-live-reddit-oauth.ts',
  ], {
    env,
    stdio: 'inherit',
  });
  execFileSync('node', ['scripts/check-source-live-certification-evidence.mjs'], {
    env,
    stdio: 'inherit',
  });

  writeEvidenceEnvFile(envFileTarget, [
    ['REDDIT_LIVE_EVIDENCE_PATH', liveEvidenceTarget],
    ['REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH', lifecycleEvidenceTarget],
    ['SOURCE_LIVE_ENVIRONMENT_ID', env.SOURCE_LIVE_ENVIRONMENT_ID],
    ['BACKEND_IMAGE_DIGEST', env.BACKEND_IMAGE_DIGEST],
    ['BACKEND_GIT_COMMIT_SHA', env.BACKEND_GIT_COMMIT_SHA],
    ['SOURCE_LIVE_OPERATOR', env.SOURCE_LIVE_OPERATOR],
  ], {
    usageLines: [
      'Usage:',
      `set -a; . ${shellQuote(envFileTarget)}; set +a`,
      'Keep REDDIT_ACCESS_TOKEN or Reddit refresh-token credentials in the operator shell; this handoff intentionally does not export secret values.',
      'npm run beta:evidence:validate -- --jobs live-reddit-oauth',
    ],
  });

  console.log(`REDDIT_LIVE_EVIDENCE_PATH=${liveEvidenceTarget}`);
  console.log(`REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH=${lifecycleEvidenceTarget}`);
  console.log(`REDDIT_LIVE_EVIDENCE_ENV_PATH=${envFileTarget}`);
}

async function resolveRedditAccessToken() {
  const accessToken = readOptionalEnv('REDDIT_ACCESS_TOKEN');
  if (accessToken !== undefined) {
    return accessToken;
  }

  const clientId = requiredEnv('REDDIT_CLIENT_ID');
  const clientSecret = requiredEnv('REDDIT_CLIENT_SECRET');
  const refreshToken = requiredEnv('REDDIT_REFRESH_TOKEN');
  const userAgent = readOptionalEnv('REDDIT_USER_AGENT') ?? 'social-monitor-mvp/0.1 live-smoke';
  const timeoutMs = positiveIntegerEnv('REDDIT_TOKEN_EXCHANGE_TIMEOUT_MS', 10_000);
  const response = await globalThis.fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    signal: globalThis.AbortSignal.timeout(timeoutMs),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Reddit refresh-token exchange returned HTTP ${response.status}: ${redactedBodyPreview(body)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Reddit refresh-token exchange returned non-JSON response');
  }
  if (typeof parsed.access_token !== 'string' || parsed.access_token.trim().length === 0) {
    throw new Error('Reddit refresh-token exchange did not return access_token');
  }

  return parsed.access_token;
}

function requiredEnv(name) {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required to capture live Reddit OAuth evidence`);
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

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function redactedBodyPreview(body) {
  return body
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[redacted]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"[redacted]"')
    .replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[redacted]"')
    .slice(0, 500);
}

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function isForbiddenEvidenceIdentity(value) {
  const normalized = value.toLowerCase();
  return forbiddenIdentityFragments.some((fragment) => normalized.includes(fragment));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
