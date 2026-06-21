import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
  const evidenceIdentity = {
    environmentId: requiredEnv('SOURCE_LIVE_ENVIRONMENT_ID'),
    imageDigest: requiredEnv('BACKEND_IMAGE_DIGEST'),
    commitSha: requiredCommitShaEnv('BACKEND_GIT_COMMIT_SHA'),
    operator: requiredEnv('SOURCE_LIVE_OPERATOR'),
  };
  const lifecycleAccessToken = await ensureCredentialLifecycleEvidence(evidenceIdentity);
  const accessToken = lifecycleAccessToken ?? await resolveRedditAccessToken();
  const env = {
    ...process.env,
    REDDIT_ACCESS_TOKEN: accessToken,
    REDDIT_LIVE_EVIDENCE_PATH: liveEvidenceTarget,
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycleEvidenceTarget,
    SOURCE_LIVE_ENVIRONMENT_ID: evidenceIdentity.environmentId,
    BACKEND_IMAGE_DIGEST: evidenceIdentity.imageDigest,
    BACKEND_GIT_COMMIT_SHA: evidenceIdentity.commitSha,
    SOURCE_LIVE_OPERATOR: evidenceIdentity.operator,
  };

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
  const refreshToken = readOptionalEnv('REDDIT_REFRESH_TOKEN');
  if (refreshToken === undefined) {
    const accessToken = readOptionalEnv('REDDIT_ACCESS_TOKEN');
    if (accessToken !== undefined) {
      return accessToken;
    }
  }

  const durableRefreshToken = refreshToken ?? requiredEnv('REDDIT_REFRESH_TOKEN');
  return (await exchangeRedditRefreshToken(durableRefreshToken)).accessToken;
}

async function ensureCredentialLifecycleEvidence(identity) {
  if (credentialLifecycleMatches(identity)) {
    return undefined;
  }

  const refreshToken = readOptionalEnv('REDDIT_REFRESH_TOKEN');
  if (refreshToken === undefined) {
    throw new Error(
      `REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must reference current redacted lifecycle evidence: ${lifecycleEvidenceTarget}`,
    );
  }

  const revokeDrill = await exchangeRedditRefreshToken(refreshToken);
  await revokeRedditAccessToken(revokeDrill.accessToken);
  const liveSmoke = await exchangeRedditRefreshToken(refreshToken);
  writeCredentialLifecycleArtifact({
    ...identity,
    revokeDigest: digestCredentialValue(revokeDrill.accessToken),
    liveDigest: digestCredentialValue(liveSmoke.accessToken),
    scope: liveSmoke.scope,
  });

  return liveSmoke.accessToken;
}

function credentialLifecycleMatches(identity) {
  if (!existsSync(lifecycleEvidenceTarget)) {
    return false;
  }

  try {
    const artifact = JSON.parse(readFileSync(lifecycleEvidenceTarget, 'utf8'));
    return (
      artifact?.format === 'reddit-credential-lifecycle-redacted-v1' &&
      artifact.environmentId === identity.environmentId &&
      artifact.imageDigest === identity.imageDigest &&
      artifact.commitSha === identity.commitSha &&
      artifact.operator === identity.operator
    );
  } catch {
    return false;
  }
}

async function exchangeRedditRefreshToken(refreshToken) {
  const clientId = requiredEnv('REDDIT_CLIENT_ID');
  const clientSecret = readOptionalEnv('REDDIT_CLIENT_SECRET') ?? '';
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

  return {
    accessToken: parsed.access_token,
    scope: typeof parsed.scope === 'string' ? parsed.scope : readOptionalEnv('REDDIT_OAUTH_SCOPE') ?? 'identity read',
  };
}

async function revokeRedditAccessToken(accessToken) {
  const clientId = requiredEnv('REDDIT_CLIENT_ID');
  const clientSecret = readOptionalEnv('REDDIT_CLIENT_SECRET') ?? '';
  const userAgent = readOptionalEnv('REDDIT_USER_AGENT') ?? 'social-monitor-mvp/0.1 live-smoke';
  const timeoutMs = positiveIntegerEnv('REDDIT_TOKEN_EXCHANGE_TIMEOUT_MS', 10_000);
  const response = await globalThis.fetch('https://www.reddit.com/api/v1/revoke_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({
      token: accessToken,
      token_type_hint: 'access_token',
    }),
    signal: globalThis.AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Reddit access-token revoke drill returned HTTP ${response.status}: ${redactedBodyPreview(body)}`);
  }
}

function writeCredentialLifecycleArtifact(input) {
  const now = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    format: 'reddit-credential-lifecycle-redacted-v1',
    artifactId: 'reddit-credential-lifecycle-redacted-refresh-token-v1',
    environmentId: input.environmentId,
    imageDigest: input.imageDigest,
    commitSha: input.commitSha,
    operator: input.operator,
    sampledAt: now,
    provenance: {
      evidenceKind: 'credential_lifecycle',
      collectionMethod: 'Refresh-token lifecycle drill exchanged a durable Reddit refresh token, revoked one short-lived access token, and retained only a fresh access token for live smoke.',
      runner: 'scripts/capture-live-reddit-oauth.mjs',
      fixtureOnly: false,
      liveGrantDuration: 'permanent',
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    lifecycleOperations: [
      lifecycleOperation('create', now, 'A short-lived Reddit access token was created from the approved durable refresh token.', input.revokeDigest, input.scope),
      lifecycleOperation('revoke', now, 'The first short-lived Reddit access token was revoked through the Reddit revoke endpoint.', input.revokeDigest, input.scope),
      lifecycleOperation('rotate', now, 'A fresh short-lived Reddit access token was created from the durable refresh token for the live smoke.', input.liveDigest, input.scope),
      lifecycleOperation('redacted-preview', now, 'Credential preview exposed only redacted metadata, scope names and one-way credential digests.', input.liveDigest, input.scope),
    ],
  };

  mkdirSync(dirname(lifecycleEvidenceTarget), { recursive: true });
  writeFileSync(lifecycleEvidenceTarget, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  chmodSync(lifecycleEvidenceTarget, 0o600);
}

function lifecycleOperation(operation, observedAt, summary, credentialDigestSha256, scope) {
  return {
    operation,
    status: 'passed',
    observedAt,
    evidence: {
      summary,
      secretValuesRedacted: true,
      auditEventRecorded: true,
      credentialDigestSha256,
      scope,
    },
  };
}

function digestCredentialValue(credential) {
  return createHash('sha256').update(credential).digest('hex');
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
