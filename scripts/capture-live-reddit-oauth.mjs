import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { URLSearchParams } from 'node:url';

const artifactDir =
  process.env.SOURCE_LIVE_EVIDENCE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const liveEvidencePath =
  process.env.REDDIT_LIVE_EVIDENCE_PATH ??
  join(artifactDir, 'live-reddit-oauth.json');
const lifecycleEvidencePath =
  process.env.REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH ??
  join(artifactDir, 'reddit-credential-lifecycle.json');

async function main() {
  const accessToken = await resolveRedditAccessToken();
  const env = {
    ...process.env,
    REDDIT_ACCESS_TOKEN: accessToken,
    REDDIT_LIVE_EVIDENCE_PATH: liveEvidencePath,
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycleEvidencePath,
    SOURCE_LIVE_ENVIRONMENT_ID: requiredEnv('SOURCE_LIVE_ENVIRONMENT_ID'),
    BACKEND_IMAGE_DIGEST: requiredEnv('BACKEND_IMAGE_DIGEST'),
    SOURCE_LIVE_OPERATOR: requiredEnv('SOURCE_LIVE_OPERATOR'),
  };

  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(dirname(liveEvidencePath), { recursive: true });
  mkdirSync(dirname(lifecycleEvidencePath), { recursive: true });

  if (!existsSync(lifecycleEvidencePath)) {
    throw new Error(
      `REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must reference existing redacted lifecycle evidence: ${lifecycleEvidencePath}`,
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

  console.log(`REDDIT_LIVE_EVIDENCE_PATH=${liveEvidencePath}`);
  console.log(`REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH=${lifecycleEvidencePath}`);
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
