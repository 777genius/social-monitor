import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { HttpRedditClient } from '../libs/ingestion/adapters/source/reddit/http-reddit-client';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { SourceProviderScanContext, SourceQuery } from '../libs/ingestion/ports';

type RedditLiveSignalId =
  | 'reddit-tenant-oauth-smoke'
  | 'reddit-auth-failure'
  | 'reddit-rate-limit-budget'
  | 'reddit-credential-lifecycle';

const coveredSignalIds: readonly RedditLiveSignalId[] = [
  'reddit-tenant-oauth-smoke',
  'reddit-auth-failure',
  'reddit-rate-limit-budget',
  'reddit-credential-lifecycle',
];
const missingTokenPolicy = 'fail_closed_without_reddit_access_token';
const lifecycleEvidencePathEnv = 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH';
const liveEvidencePathEnv = 'REDDIT_LIVE_EVIDENCE_PATH';
const timeoutMs = 10_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const accessToken = readOptionalEnv('REDDIT_ACCESS_TOKEN');

  if (accessToken === undefined || accessToken.length === 0) {
    throw new Error(
      `Live Reddit OAuth smoke requires REDDIT_ACCESS_TOKEN (${missingTokenPolicy}). Use fixture reddit smoke for backend-safe checks.`,
    );
  }

  const credentialLifecycle = readCredentialLifecycleEvidence();
  const provider = new RedditSourceProvider(new HttpRedditClient('https://oauth.reddit.com', timeoutMs));
  const userAgent = readOptionalEnv('REDDIT_USER_AGENT') ?? 'social-monitor-mvp/0.1 live-smoke';
  const subreddit = readOptionalEnv('REDDIT_SUBREDDIT') ?? 'programming';
  const listing = readOptionalEnv('REDDIT_LISTING') ?? 'hot';
  const query: SourceQuery = {
    mode: 'listing',
    query: `${subreddit}:${listing}`,
  };
  const context: SourceProviderScanContext = {
    tenantId: tenantId('tenant-live-reddit-oauth-smoke'),
    workspaceId: workspaceId('workspace-live-reddit-oauth-smoke'),
    sourceBindingId: 'source-binding-live-reddit-oauth-smoke',
    scanJobId: 'scan-job-live-reddit-oauth-smoke',
    correlationId: 'correlation-live-reddit-oauth-smoke',
    config: {
      accessToken,
      userAgent,
      subreddit,
      listing,
      maxItems: 3,
    },
  };

  const validation = provider.validateBinding(query);
  assert(validation.ok, 'Reddit live query must validate before scan');

  const plan = provider.planScan(query, context);
  const result = await provider.scan(plan, context);

  assert(result.items.length > 0, 'Reddit live OAuth scan must return at least one normalized item');
  assert(
    result.items.every((item) => item.externalId.startsWith('reddit:')),
    'Reddit live OAuth scan must preserve reddit external ids',
  );
  assert(
    result.items.every((item) => item.canonicalUrl.startsWith('https://www.reddit.com/')),
    'Reddit live OAuth scan must expose reddit canonical URLs',
  );
  assert(
    result.items.every((item) => item.title.trim().length > 0 || item.body.trim().length > 0),
    'Reddit live OAuth scan must expose readable title or body',
  );

  await assertRedditAuthFailure(provider, query, context);
  const rateLimit = await readRedditRateLimitBudget(accessToken, userAgent);
  writeEvidenceIfRequested({
    schemaVersion: 1,
    evidenceId: 'live-reddit-oauth-evidence-v1',
    sampledAt: new Date().toISOString(),
    signalIds: coveredSignalIds,
    provider: 'reddit',
    subreddit,
    listing,
    itemCount: result.items.length,
    nextCursorPresent: result.nextCursor !== undefined,
    warningCount: result.warnings.length,
    authFailure: {
      status: 'failed_closed',
      signalId: 'reddit-auth-failure' satisfies RedditLiveSignalId,
    },
    rateLimit,
    credentialLifecycle,
  });

  console.log([
    'Live Reddit OAuth smoke OK',
    `Signals: ${coveredSignalIds.join(', ')}`,
    `Subreddit: ${subreddit}`,
    `Listing: ${listing}`,
    `Items: ${result.items.length}`,
    `Next cursor: ${result.nextCursor ?? 'none'}`,
    `Warnings: ${result.warnings.length}`,
    `Rate-limit headers: ${rateLimit.headersObserved ? 'present' : 'missing'}`,
    `Credential lifecycle evidence: ${credentialLifecycle.sha256}`,
  ].join('\n'));
}

const assertRedditAuthFailure = async (
  provider: RedditSourceProvider,
  query: SourceQuery,
  context: SourceProviderScanContext,
): Promise<void> => {
  const invalidContext: SourceProviderScanContext = {
    ...context,
    config: {
      ...context.config,
      accessToken: 'invalid-reddit-token-for-fail-closed-smoke',
    },
  };
  const plan = provider.planScan(query, invalidContext);

  try {
    await provider.scan(plan, invalidContext);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(/401|403|Reddit API returned/i.test(message), 'Reddit invalid OAuth credential must fail closed as an auth failure');
    return;
  }

  throw new Error('Reddit invalid OAuth credential unexpectedly succeeded');
};

const readRedditRateLimitBudget = async (
  accessToken: string,
  userAgent: string,
): Promise<{
  readonly headersObserved: boolean;
  readonly remaining: string | null;
  readonly used: string | null;
  readonly reset: string | null;
}> => {
  const response = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'user-agent': userAgent,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert(response.ok, `Reddit rate-limit probe returned HTTP ${response.status}`);

  const remaining = response.headers.get('x-ratelimit-remaining');
  const used = response.headers.get('x-ratelimit-used');
  const reset = response.headers.get('x-ratelimit-reset');
  const headersObserved = remaining !== null || used !== null || reset !== null;
  assert(headersObserved, 'Reddit rate-limit evidence must include x-ratelimit headers');

  return {
    headersObserved,
    remaining,
    used,
    reset,
  };
};

const readCredentialLifecycleEvidence = (): {
  readonly path: string;
  readonly sha256: string;
  readonly redactionChecked: true;
} => {
  const path = readOptionalEnv(lifecycleEvidencePathEnv);
  assert(path !== undefined, `Live Reddit OAuth smoke requires ${lifecycleEvidencePathEnv} with redacted create/rotate/revoke evidence`);
  assert(existsSync(path), `${lifecycleEvidencePathEnv} must reference an existing redacted evidence file`);

  const serialized = readFileSync(path, 'utf8');
  const lower = serialized.toLowerCase();
  for (const forbidden of ['access_token', 'refresh_token', 'bearer ', 'client_secret', 'reddit_access_token']) {
    assert(!lower.includes(forbidden), `${lifecycleEvidencePathEnv} must not contain secret fragment ${forbidden}`);
  }
  for (const marker of ['create', 'rotate', 'revoke', 'redacted']) {
    assert(lower.includes(marker), `${lifecycleEvidencePathEnv} must include ${marker} lifecycle evidence`);
  }

  return {
    path,
    sha256: createHash('sha256').update(serialized).digest('hex'),
    redactionChecked: true,
  };
};

const readOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const writeEvidenceIfRequested = (evidence: unknown): void => {
  const evidencePath = readOptionalEnv(liveEvidencePathEnv);
  if (evidencePath === undefined) {
    return;
  }

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
