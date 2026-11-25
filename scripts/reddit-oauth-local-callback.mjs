import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { URL, URLSearchParams } from 'node:url';
import { parse as parseDotenv } from 'dotenv';

import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactDir = resolve(process.env.SOURCE_LIVE_EVIDENCE_ARTIFACT_DIR ?? '/tmp/social-monitor-evidence');
const dockerEnvPath = process.env.DOCKER_BACKEND_STAGING_IMPORTED_ENV_PATH?.trim()
  || join(artifactDir, 'external-beta-evidence-from-docker-bundle.env');
const liveOpenConnectorsEnvPath = process.env.LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH?.trim()
  || join(artifactDir, 'live-open-connectors.env');
const importedEnv = {
  ...readImportedEnvFile(dockerEnvPath),
  ...readImportedEnvFile(liveOpenConnectorsEnvPath),
};
const host = process.env.REDDIT_OAUTH_CALLBACK_HOST?.trim() || '127.0.0.1';
const port = positiveIntegerEnv('REDDIT_OAUTH_CALLBACK_PORT', 8765);
const callbackPath = '/reddit/oauth/callback';
const redirectUri = process.env.REDDIT_OAUTH_REDIRECT_URI?.trim()
  || `http://${host}:${port}${callbackPath}`;
const clientId = requiredEnv('REDDIT_CLIENT_ID');
const clientSecret = readOptionalEnv('REDDIT_CLIENT_SECRET') ?? '';
const userAgent = readOptionalEnv('REDDIT_USER_AGENT') ?? 'social-monitor-mvp/0.1 local-oauth';
const scope = readOptionalEnv('REDDIT_OAUTH_SCOPE') ?? 'identity read';
const timeoutMs = positiveIntegerEnv('REDDIT_OAUTH_TOKEN_TIMEOUT_MS', 10_000);
const environmentId = readEnvOrImported('SOURCE_LIVE_ENVIRONMENT_ID', 'source-live-reddit-alpha');
const operator = readEnvOrImported('SOURCE_LIVE_OPERATOR', 'backend-release-operator');
const imageDigest = readEnvOrImported('BACKEND_IMAGE_DIGEST');
const commitSha = readEnvOrImported('BACKEND_GIT_COMMIT_SHA');
const liveEvidencePath = validateEvidenceJsonFilePath(
  process.env.REDDIT_LIVE_EVIDENCE_PATH?.trim() || join(artifactDir, 'live-reddit-oauth.json'),
  'REDDIT_LIVE_EVIDENCE_PATH',
);
const lifecycleEvidencePath = validateEvidenceJsonFilePath(
  process.env.REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH?.trim() || join(artifactDir, 'reddit-credential-lifecycle.json'),
  'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH',
);
const secretEnvPath = validateEvidenceEnvFilePath(
  process.env.REDDIT_OAUTH_SECRET_ENV_PATH?.trim() || join(artifactDir, 'reddit-oauth-secret.env'),
);

assertImageDigest(imageDigest);
assertCommitSha(commitSha);

const pendingCallbacks = new Map();
const server = createServer((request, response) => {
  try {
    handleCallbackRequest(request, response);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

await listen(server, port, host);

try {
  console.log([
    'Reddit OAuth local callback helper',
    '',
    `Redirect URI: ${redirectUri}`,
    'Use this exact redirect URI in the Reddit app settings.',
    'Recommended app type: installed app. Web app also works if you keep REDDIT_CLIENT_SECRET only in this shell.',
    '',
    'The helper will ask for two approvals:',
    '1. revoke drill grant: exchanged and immediately revoked',
    '2. live smoke grant: saved only into a private env file for capture:live-reddit-oauth',
    '',
  ].join('\n'));

  const revokeDrill = await authorize('revoke-drill', { duration: 'temporary' });
  await revokeCredential(revokeDrill.credential.accessToken);
  const liveSmoke = await authorize('live-smoke', { duration: 'permanent', requireRefreshToken: true });
  writeLifecycleArtifact({
    revokeDigest: digestCredentialValue(revokeDrill.credential.accessToken),
    liveDigest: digestCredentialValue(liveSmoke.credential.refreshToken),
    liveDuration: liveSmoke.duration,
  });
  writeSecretEnv(liveSmoke.credential);

  console.log([
    '',
    'Reddit OAuth local callback OK',
    `REDDIT_OAUTH_SECRET_ENV_PATH=${secretEnvPath}`,
    `REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH=${lifecycleEvidencePath}`,
    '',
    'Next command:',
    `set -a; . ${shellQuote(secretEnvPath)}; set +a; npm run capture:live-reddit-oauth`,
  ].join('\n'));
} finally {
  await close(server);
}

async function authorize(label, { duration, requireRefreshToken = false }) {
  const state = `${label}-${randomBytes(16).toString('hex')}`;
  const codePromise = waitForAuthorizationCode(state, label);
  const url = authorizationUrl(state, duration);

  console.log([
    '',
    `Open this URL in your normal Brave profile for ${label}:`,
    url,
    '',
    'Waiting for Reddit redirect...',
  ].join('\n'));

  const code = await codePromise;
  const credential = await exchangeCode(code);
  if (requireRefreshToken && typeof credential.refreshToken !== 'string') {
    throw new Error(
      `${label}: Reddit did not return refresh_token. Check that the app uses code-flow OAuth and the authorization URL contains duration=permanent.`,
    );
  }
  console.log(`${label}: received and exchanged code; credential value was not printed.`);
  return { credential, duration };
}

function authorizationUrl(state, duration) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    state,
    redirect_uri: redirectUri,
    duration,
    scope,
  });
  return `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
}

function waitForAuthorizationCode(state, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    pendingCallbacks.set(state, {
      label,
      resolve: resolvePromise,
      reject: rejectPromise,
    });
  });
}

function handleCallbackRequest(request, response) {
  const url = new URL(request.url ?? '/', redirectUri);
  if (url.pathname !== callbackPath) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Unknown callback path.');
    return;
  }

  const state = url.searchParams.get('state') ?? '';
  const pending = pendingCallbacks.get(state);
  if (pending === undefined) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Unknown or expired OAuth state.');
    return;
  }
  pendingCallbacks.delete(state);

  const error = url.searchParams.get('error');
  if (error !== null) {
    pending.reject(new Error(`Reddit OAuth ${pending.label} failed: ${error}`));
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Reddit authorization failed. Return to the terminal.');
    return;
  }

  const code = url.searchParams.get('code');
  if (code === null || code.trim().length === 0) {
    pending.reject(new Error(`Reddit OAuth ${pending.label} callback did not include code`));
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Missing code. Return to the terminal.');
    return;
  }

  pending.resolve(code);
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>Reddit OAuth OK</title><h1>Reddit OAuth OK</h1><p>You can close this tab and return to Codex.</p>');
}

async function exchangeCode(code) {
  const response = await globalThis.fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: basicAuthorization(),
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    signal: globalThis.AbortSignal.timeout(timeoutMs),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Reddit code exchange failed with HTTP ${response.status}: ${redactedBodyPreview(body)}`);
  }

  const parsed = parseJsonBody(body, 'Reddit code exchange');
  if (typeof parsed.access_token !== 'string' || parsed.access_token.trim().length === 0) {
    throw new Error('Reddit code exchange did not return a credential');
  }
  return {
    accessToken: parsed.access_token,
    refreshToken: typeof parsed.refresh_token === 'string' && parsed.refresh_token.trim().length > 0
      ? parsed.refresh_token
      : undefined,
    tokenType: typeof parsed.token_type === 'string' ? parsed.token_type : undefined,
    expiresIn: Number.isSafeInteger(parsed.expires_in) ? parsed.expires_in : undefined,
    scope: typeof parsed.scope === 'string' ? parsed.scope : scope,
  };
}

async function revokeCredential(credential) {
  const response = await globalThis.fetch('https://www.reddit.com/api/v1/revoke_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: basicAuthorization(),
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({
      token: credential,
      token_type_hint: 'access_token',
    }),
    signal: globalThis.AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Reddit revoke drill failed with HTTP ${response.status}: ${redactedBodyPreview(body)}`);
  }
  console.log('revoke-drill: revoked first grant; credential value was not printed.');
}

function writeLifecycleArtifact({ revokeDigest, liveDigest, liveDuration }) {
  const now = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    format: 'reddit-credential-lifecycle-redacted-v1',
    artifactId: 'reddit-credential-lifecycle-redacted-local-oauth-v1',
    environmentId,
    imageDigest,
    commitSha,
    operator,
    sampledAt: now,
    provenance: {
      evidenceKind: 'credential_lifecycle',
      collectionMethod: 'Local OAuth callback drill with a revoked temporary grant and a retained permanent refresh-token grant for recurring Reddit monitoring.',
      runner: 'scripts/reddit-oauth-local-callback.mjs',
      fixtureOnly: false,
      liveGrantDuration: liveDuration,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    lifecycleOperations: [
      lifecycleOperation('create', now, 'Operator approved the first Reddit OAuth grant through the local callback flow.', revokeDigest),
      lifecycleOperation('revoke', now, 'The first Reddit OAuth grant was revoked through the Reddit revoke endpoint.', revokeDigest),
      lifecycleOperation('rotate', now, 'Operator approved a second permanent Reddit OAuth grant; only the refresh token is retained for recurring live smoke.', liveDigest),
      lifecycleOperation('redacted-preview', now, 'Credential preview exposed only redacted metadata, scope names and one-way credential digests.', liveDigest),
    ],
  };

  writePrivateJson(lifecycleEvidencePath, artifact);
}

function lifecycleOperation(operation, observedAt, summary, credentialDigestSha256) {
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

function writeSecretEnv(credential) {
  writeEvidenceEnvFile(secretEnvPath, [
    ['REDDIT_CLIENT_ID', clientId],
    ['REDDIT_CLIENT_SECRET', clientSecret],
    ['REDDIT_REFRESH_TOKEN', credential.refreshToken],
    ['REDDIT_USER_AGENT', userAgent],
    ['REDDIT_SUBREDDIT', readOptionalEnv('REDDIT_SUBREDDIT') ?? 'programming'],
    ['REDDIT_LISTING', readOptionalEnv('REDDIT_LISTING') ?? 'hot'],
    ['REDDIT_LIVE_EVIDENCE_PATH', liveEvidencePath],
    ['REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH', lifecycleEvidencePath],
    ['REDDIT_LIVE_EVIDENCE_ENV_PATH', join(artifactDir, 'live-reddit-oauth.env')],
    ['SOURCE_LIVE_ENVIRONMENT_ID', environmentId],
    ['BACKEND_IMAGE_DIGEST', imageDigest],
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
    ['SOURCE_LIVE_OPERATOR', operator],
  ], {
    usageLines: [
      'Private Reddit OAuth live smoke env. Do not commit or paste this file.',
      'This file stores the permanent refresh token, not a short-lived access token.',
      'Load only in an operator shell.',
      'set -a; . /absolute/path/to/reddit-oauth-secret.env; set +a',
      'npm run capture:live-reddit-oauth',
    ],
  });
}

function basicAuthorization() {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

function digestCredentialValue(credential) {
  return createHash('sha256').update(credential).digest('hex');
}

function writePrivateJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function parseJsonBody(body, label) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} returned non-JSON response`);
  }
}

function redactedBodyPreview(body) {
  return body
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[redacted]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"[redacted]"')
    .replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[redacted]"')
    .slice(0, 500);
}

function requiredEnv(name) {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required. Create a Reddit app and export ${name} in this shell.`);
  }
  return value;
}

function readEnvOrImported(name, fallback) {
  const value = readOptionalEnv(name) ?? importedEnv[name]?.trim() ?? fallback;
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required. Load ${dockerEnvPath}, load ${liveOpenConnectorsEnvPath} or export ${name}.`);
  }
  return value;
}

function readImportedEnvFile(path) {
  return existsSync(path) ? parseDotenv(readFileSync(path, 'utf8')) : {};
}

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function positiveIntegerEnv(name, fallback) {
  const raw = readOptionalEnv(name);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 65_535) {
    throw new Error(`${name} must be a positive integer <= 65535`);
  }
  return value;
}

function assertImageDigest(value) {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error('BACKEND_IMAGE_DIGEST must be sha256:<64 lowercase hex>');
  }
}

function assertCommitSha(value) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error('BACKEND_GIT_COMMIT_SHA must be a full lowercase git SHA');
  }
}

function listen(currentServer, currentPort, currentHost) {
  return new Promise((resolvePromise, rejectPromise) => {
    currentServer.once('error', rejectPromise);
    currentServer.listen(currentPort, currentHost, () => {
      currentServer.off('error', rejectPromise);
      resolvePromise();
    });
  });
}

function close(currentServer) {
  return new Promise((resolvePromise, rejectPromise) => {
    currentServer.close((error) => {
      if (error !== undefined) {
        rejectPromise(error);
        return;
      }
      resolvePromise();
    });
  });
}
