import { createHash } from 'node:crypto';

import { HttpRedditClient } from '../libs/ingestion/adapters/source/reddit/http-reddit-client';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { SourceProviderScanContext, SourceQuery } from '../libs/ingestion/ports';
import { readLiveEvidenceArtifactFile, writeLiveEvidenceArtifactAtomically } from './lib/live-evidence-artifact';

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
const liveArtifactFormat = 'source-live-provider-evidence-v1';
const credentialLifecycleArtifactFormat = 'reddit-credential-lifecycle-redacted-v1';
const credentialLifecycleEvidenceKind = 'credential_lifecycle';
const lifecycleEvidencePathEnv = 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH';
const liveEvidencePathEnv = 'REDDIT_LIVE_EVIDENCE_PATH';
const environmentIdEnv = 'SOURCE_LIVE_ENVIRONMENT_ID';
const imageDigestEnv = 'BACKEND_IMAGE_DIGEST';
const commitShaEnv = 'BACKEND_GIT_COMMIT_SHA';
const operatorEnv = 'SOURCE_LIVE_OPERATOR';
const timeoutMs = 10_000;
const requiredCredentialLifecycleOperations = ['create', 'rotate', 'revoke', 'redacted-preview'] as const;
const forbiddenCredentialLifecycleFragments = [
  'access_token',
  'refresh_token',
  'bearer ',
  'client_secret',
  'reddit_access_token',
];

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
  const sampledAt = new Date().toISOString();
  writeEvidenceIfRequested({
    artifactId: 'live-reddit-oauth-evidence-v1',
    sampledAt,
    providerResults: [
      {
        providerKey: 'reddit',
        status: 'passed',
        signalResults: [
          {
            signalId: 'reddit-tenant-oauth-smoke' satisfies RedditLiveSignalId,
            status: 'passed',
            observedAt: sampledAt,
            evidence: {
              summary: 'Tenant-owned Reddit OAuth credential returned normalized listing items.',
              subreddit,
              listing,
              itemCount: result.items.length,
              canonicalUrlsObserved: true,
              warningCount: result.warnings.length,
            },
            metrics: {
              subreddit,
              listing,
              itemCount: result.items.length,
              nextCursorPresent: result.nextCursor !== undefined,
              warningCount: result.warnings.length,
            },
          },
          {
            signalId: 'reddit-auth-failure' satisfies RedditLiveSignalId,
            status: 'passed',
            observedAt: sampledAt,
            evidence: {
              summary: 'Invalid Reddit OAuth credential failed closed with classified auth failure.',
              status: 'failed_closed',
              failedClosed: true,
            },
            metrics: {
              status: 'failed_closed',
            },
          },
          {
            signalId: 'reddit-rate-limit-budget' satisfies RedditLiveSignalId,
            status: 'passed',
            observedAt: sampledAt,
            evidence: {
              summary: 'Reddit rate-limit headers were observed and recorded without token values.',
              headersObserved: rateLimit.headersObserved,
              observedHeaderNames: rateLimit.observedHeaderNames,
            },
            metrics: {
              headersObserved: rateLimit.headersObserved,
              observedHeaderNames: rateLimit.observedHeaderNames,
            },
          },
          {
            signalId: 'reddit-credential-lifecycle' satisfies RedditLiveSignalId,
            status: 'passed',
            observedAt: sampledAt,
            evidence: {
              summary: 'Credential create, rotate, revoke and redacted preview lifecycle artifact was hashed.',
              lifecycleArtifactSha256: credentialLifecycle.sha256,
              redactionChecked: credentialLifecycle.redactionChecked,
              lifecycleOperations: credentialLifecycle.lifecycleOperations,
            },
            metrics: {
              sha256: credentialLifecycle.sha256,
              redactionChecked: credentialLifecycle.redactionChecked,
              lifecycleOperations: credentialLifecycle.lifecycleOperations,
            },
          },
        ],
      },
    ],
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
  readonly observedHeaderNames: readonly string[];
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
  const observedHeaderNames = [
    ...(remaining !== null ? ['x-ratelimit-remaining'] : []),
    ...(used !== null ? ['x-ratelimit-used'] : []),
    ...(reset !== null ? ['x-ratelimit-reset'] : []),
  ];

  return {
    headersObserved,
    remaining,
    used,
    reset,
    observedHeaderNames,
  };
};

const readCredentialLifecycleEvidence = (): {
  readonly sha256: string;
  readonly redactionChecked: true;
  readonly lifecycleOperations: readonly string[];
} => {
  const path = readOptionalEnv(lifecycleEvidencePathEnv);
  assert(path !== undefined, `Live Reddit OAuth smoke requires ${lifecycleEvidencePathEnv} with redacted create/rotate/revoke evidence`);

  const serialized = readLiveEvidenceArtifactFile(path, lifecycleEvidencePathEnv);
  const lower = serialized.toLowerCase();
  for (const forbidden of forbiddenCredentialLifecycleFragments) {
    assert(!lower.includes(forbidden), `${lifecycleEvidencePathEnv} must not contain secret fragment ${forbidden}`);
  }

  const artifact = parseLifecycleArtifact(serialized);
  const lifecycleOperations = readLifecycleOperations(artifact);

  return {
    sha256: createHash('sha256').update(serialized).digest('hex'),
    redactionChecked: true,
    lifecycleOperations,
  };
};

const parseLifecycleArtifact = (serialized: string): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(`${lifecycleEvidencePathEnv} must be a JSON ${credentialLifecycleArtifactFormat} artifact`);
  }
  assert(isRecord(parsed), `${lifecycleEvidencePathEnv} must be a JSON object`);
  assert(parsed.schemaVersion === 1, `${lifecycleEvidencePathEnv}.schemaVersion must be 1`);
  assert(
    parsed.format === credentialLifecycleArtifactFormat,
    `${lifecycleEvidencePathEnv}.format must be ${credentialLifecycleArtifactFormat}`,
  );

  for (const field of ['artifactId', 'environmentId', 'imageDigest', 'operator', 'sampledAt']) {
    assert(readString(parsed, field).trim().length > 0, `${lifecycleEvidencePathEnv}.${field} must be a non-empty string`);
  }
  assert(
    /^sha256:[0-9a-f]{64}$/.test(readString(parsed, 'imageDigest')),
    `${lifecycleEvidencePathEnv}.imageDigest must be an immutable sha256 digest`,
  );

  const provenance = readRecord(parsed, 'provenance');
  assert(
    provenance.evidenceKind === credentialLifecycleEvidenceKind,
    `${lifecycleEvidencePathEnv}.provenance.evidenceKind must be ${credentialLifecycleEvidenceKind}`,
  );
  assert(provenance.fixtureOnly === false, `${lifecycleEvidencePathEnv}.provenance.fixtureOnly must be false`);
  for (const field of ['collectionMethod', 'runner']) {
    assert(
      readString(provenance, field).trim().length > 0,
      `${lifecycleEvidencePathEnv}.provenance.${field} must be a non-empty string`,
    );
  }

  const redaction = readRecord(parsed, 'redaction');
  for (const field of [
    'secretsIncluded',
    'rawProviderPayloadsIncluded',
    'credentialValuesIncluded',
    'privateNetworkUrlsIncluded',
  ]) {
    assert(redaction[field] === false, `${lifecycleEvidencePathEnv}.redaction.${field} must be false`);
  }

  return parsed;
};

const readLifecycleOperations = (artifact: Record<string, unknown>): readonly string[] => {
  const operations = artifact.lifecycleOperations;
  assert(Array.isArray(operations), `${lifecycleEvidencePathEnv}.lifecycleOperations must be an array`);

  const observedOperations = new Set<string>();
  for (const [index, operation] of operations.entries()) {
    assert(isRecord(operation), `${lifecycleEvidencePathEnv}.lifecycleOperations[${index}] must be an object`);
    const operationName = readString(operation, 'operation');
    assert(operationName.length > 0, `${lifecycleEvidencePathEnv}.lifecycleOperations[${index}].operation must be set`);
    assert(
      (requiredCredentialLifecycleOperations as readonly string[]).includes(operationName),
      `${lifecycleEvidencePathEnv}.lifecycleOperations[${index}].operation is unsupported`,
    );
    assert(operation.status === 'passed', `${lifecycleEvidencePathEnv}.lifecycleOperations[${index}].status must be passed`);
    assert(
      readString(operation, 'observedAt').length > 0,
      `${lifecycleEvidencePathEnv}.lifecycleOperations[${index}].observedAt must be set`,
    );
    const evidence = readRecord(operation, 'evidence');
    assert(
      readString(evidence, 'summary').length > 0,
      `${lifecycleEvidencePathEnv}.lifecycleOperations[${index}].evidence.summary must be set`,
    );
    assert(
      evidence.secretValuesRedacted === true,
      `${lifecycleEvidencePathEnv}.lifecycleOperations[${index}].evidence.secretValuesRedacted must be true`,
    );
    assert(
      evidence.auditEventRecorded === true,
      `${lifecycleEvidencePathEnv}.lifecycleOperations[${index}].evidence.auditEventRecorded must be true`,
    );
    observedOperations.add(operationName);
  }

  for (const operation of requiredCredentialLifecycleOperations) {
    assert(observedOperations.has(operation), `${lifecycleEvidencePathEnv}.lifecycleOperations must include ${operation}`);
  }

  return [...observedOperations];
};

const readRecord = (record: Record<string, unknown>, field: string): Record<string, unknown> => {
  const value = record[field];
  assert(isRecord(value), `${lifecycleEvidencePathEnv}.${field} must be an object`);
  return value;
};

const readString = (record: Record<string, unknown>, field: string): string => {
  const value = record[field];
  assert(typeof value === 'string', `${lifecycleEvidencePathEnv}.${field} must be a string`);
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const writeEvidenceIfRequested = (evidence: {
  readonly artifactId: string;
  readonly sampledAt: string;
  readonly providerResults: readonly unknown[];
}): void => {
  const evidencePath = readOptionalEnv(liveEvidencePathEnv);
  if (evidencePath === undefined) {
    return;
  }

  const artifact = {
    schemaVersion: 1,
    format: liveArtifactFormat,
    artifactId: evidence.artifactId,
    environmentId: readRequiredEnv(environmentIdEnv),
    imageDigest: readRequiredImageDigest(),
    commitSha: readRequiredCommitSha(),
    operator: readRequiredEnv(operatorEnv),
    sampledAt: evidence.sampledAt,
    provenance: {
      evidenceKind: 'live_network',
      collectionMethod: 'Live network Reddit OAuth smoke executed with tenant-owned credentials for the promoted backend image.',
      runner: 'scripts/check-live-reddit-oauth.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    providerResults: evidence.providerResults,
  };

  writeLiveEvidenceArtifactAtomically(
    evidencePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    liveEvidencePathEnv,
  );
};

const readRequiredEnv = (name: string): string => {
  const value = readOptionalEnv(name);
  assert(value !== undefined, `${liveEvidencePathEnv} requires ${name}`);
  return value;
};

const readRequiredImageDigest = (): string => {
  const imageDigest = readRequiredEnv(imageDigestEnv);
  assert(/^sha256:[0-9a-f]{64}$/.test(imageDigest), `${imageDigestEnv} must be an immutable sha256 digest`);
  return imageDigest;
};

const readRequiredCommitSha = (): string => {
  const commitSha = readRequiredEnv(commitShaEnv);
  assert(/^[0-9a-f]{40}$/.test(commitSha), `${commitShaEnv} must be a full 40-character lowercase git commit SHA`);
  return commitSha;
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
