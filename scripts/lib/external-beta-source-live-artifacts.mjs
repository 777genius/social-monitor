// Deterministic synthetic source-live evidence fixture builders. These do not
// perform live network requests or access credentials; caller owns certification data.
export function sourceFreshnessGuardForProvider(providerKey, context) {
  const { sourceCertification, sourceCertificationPath } = context;
  const provider = (sourceCertification.certifiedProviders ?? [])
    .find((candidate) => candidate.providerKey === providerKey);
  if (provider?.freshnessGuard === undefined) {
    throw new Error(`${sourceCertificationPath}: missing freshnessGuard for ${providerKey}`);
  }

  return JSON.parse(JSON.stringify(provider.freshnessGuard));
}

export function liveOpenConnectorsArtifact(context) {
  const now = new Date().toISOString();
  const imageDigest = `sha256:${'a'.repeat(64)}`;
  const commitSha = 'a'.repeat(40);
  return {
    schemaVersion: 1,
    format: 'source-live-provider-evidence-v1',
    artifactId: 'live-open-connectors-evidence-v1',
    environmentId: 'source-prod-alpha',
    imageDigest,
    commitSha,
    operator: 'release-operator-1',
    sampledAt: now,
    provenance: {
      evidenceKind: 'live_network',
      collectionMethod: 'live provider smoke captured on staging beta environment',
      runner: 'scripts/check-live-open-connectors.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    environment: {
      environmentId: 'source-prod-alpha',
      imageDigest,
      commitSha,
      operator: 'release-operator-1',
      sampledAt: now,
    },
    providerResults: [
      {
        providerKey: 'hacker-news',
        status: 'passed',
        freshnessGuard: sourceFreshnessGuardForProvider('hacker-news', context),
        signalResults: [
          {
            signalId: 'hn-live-http-smoke',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Redacted live Hacker News listing and search returned normalized numeric ids.',
              listingStoryCount: 2,
              searchStoryCount: 2,
              stableNumericIds: true,
              normalizedIdsSampled: true,
            },
          },
          {
            signalId: 'hn-rate-limit-evidence',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Request budget and provider rate limited degradation signal were recorded.',
              timeoutMs: 10000,
              maxListingStories: 2,
              maxSearchStories: 2,
              degradationSignalRecorded: true,
            },
          },
          {
            signalId: 'hn-provider-failure-classification',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Hacker News provider failures were classified into retryable health states without raw payloads.',
              failureKindsObserved: ['timeout', 'provider_unavailable'],
              retryPolicyObserved: true,
              classifiedWithoutRawPayloads: true,
            },
          },
        ],
      },
      {
        providerKey: 'rss',
        status: 'passed',
        freshnessGuard: sourceFreshnessGuardForProvider('rss', context),
        signalResults: [
          {
            signalId: 'rss-allowlisted-live-feeds',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Redacted allowlisted RSS feeds returned normalized readable items.',
              feedCount: 2,
              itemCount: 4,
              allowlistMatched: true,
              normalizedItemsObserved: true,
            },
          },
          {
            signalId: 'rss-http-cache-evidence',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'HTTP cache validators were observed on repeated RSS reads.',
              cacheValidatorFeedCount: 1,
              validatorsObserved: ['etag', 'last-modified'],
              conditionalReadObserved: true,
            },
          },
          {
            signalId: 'rss-ssrf-proof',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Private and loopback targets were rejected before fetch.',
              rejectedProbeCount: 4,
              blockedTargetClasses: ['loopback', 'localhost', 'metadata-service', 'file'],
              rejectedBeforeFetch: true,
            },
          },
          {
            signalId: 'rss-provider-failure-classification',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'RSS provider failures were classified into retryable health states without raw feed payloads.',
              failureKindsObserved: ['timeout', 'invalid_xml'],
              retryPolicyObserved: true,
              classifiedWithoutRawPayloads: true,
            },
          },
        ],
      },
      {
        providerKey: 'github-issues',
        status: 'passed',
        freshnessGuard: sourceFreshnessGuardForProvider('github-issues', context),
        signalResults: [
          {
            signalId: 'github-live-api-smoke',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Redacted live GitHub API search returned normalized issue items.',
              issueCount: 1,
              canonicalUrlsObserved: true,
              pullRequestsExcluded: true,
              authMode: 'anonymous',
            },
          },
          {
            signalId: 'github-rate-limit-budget',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'GitHub core and search rate limit budget were recorded without credential values.',
              coreRemaining: 100,
              searchRemaining: 10,
              budgetObserved: true,
            },
          },
          {
            signalId: 'github-provider-failure-classification',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'GitHub Issues provider failures were classified into retryable health states without raw API payloads.',
              failureKindsObserved: ['rate_limited', 'provider_unavailable'],
              retryPolicyObserved: true,
              classifiedWithoutRawPayloads: true,
            },
          },
        ],
      },
    ],
  };
}

export function redditCredentialLifecycleArtifact() {
  const now = new Date().toISOString();
  const imageDigest = `sha256:${'b'.repeat(64)}`;
  const commitSha = 'b'.repeat(40);
  return {
    schemaVersion: 1,
    format: 'reddit-credential-lifecycle-redacted-v1',
    artifactId: 'reddit-credential-lifecycle-redacted-positive-smoke',
    environmentId: 'source-reddit-alpha',
    imageDigest,
    commitSha,
    operator: 'source-operator-1',
    sampledAt: now,
    provenance: {
      evidenceKind: 'credential_lifecycle',
      collectionMethod: 'credential lifecycle captured through staging secret boundary',
      runner: 'scripts/check-live-reddit-oauth.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    lifecycleOperations: [
      redditCredentialLifecycleOperation('create', now, 'Credential create recorded through the approved secret boundary.'),
      redditCredentialLifecycleOperation('rotate', now, 'Credential rotation replaced the active reference without exposing values.'),
      redditCredentialLifecycleOperation('revoke', now, 'Credential revoke disabled the previous reference and recorded audit evidence.'),
      redditCredentialLifecycleOperation('redacted-preview', now, 'Credential preview exposed only redacted metadata for operator review.'),
    ],
  };
}

function redditCredentialLifecycleOperation(operation, observedAt, summary) {
  return {
    operation,
    status: 'passed',
    observedAt,
    evidence: {
      summary,
      secretValuesRedacted: true,
      auditEventRecorded: true,
    },
  };
}

export function liveRedditArtifact(lifecycleArtifactSha256, context) {
  const now = new Date().toISOString();
  const imageDigest = `sha256:${'b'.repeat(64)}`;
  const commitSha = 'b'.repeat(40);
  return {
    schemaVersion: 1,
    format: 'source-live-provider-evidence-v1',
    artifactId: 'live-reddit-oauth-evidence-v1',
    environmentId: 'source-reddit-alpha',
    imageDigest,
    commitSha,
    operator: 'source-operator-1',
    sampledAt: now,
    provenance: {
      evidenceKind: 'live_network',
      collectionMethod: 'live Reddit OAuth smoke captured on staging beta environment',
      runner: 'scripts/check-live-reddit-oauth.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    environment: {
      environmentId: 'source-reddit-alpha',
      imageDigest,
      commitSha,
      operator: 'source-operator-1',
      sampledAt: now,
    },
    providerResults: [
      {
        providerKey: 'reddit',
        status: 'passed',
        freshnessGuard: sourceFreshnessGuardForProvider('reddit', context),
        signalResults: [
          {
            signalId: 'reddit-tenant-oauth-smoke',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Tenant-owned Reddit OAuth credential returned normalized listing items.',
              subreddit: 'programming',
              listing: 'hot',
              itemCount: 3,
              canonicalUrlsObserved: true,
              warningCount: 0,
            },
          },
          {
            signalId: 'reddit-auth-failure',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Invalid Reddit OAuth credential failed closed with classified auth failure.',
              status: 'failed_closed',
              failedClosed: true,
            },
          },
          {
            signalId: 'reddit-rate-limit-budget',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Reddit rate limit headers were observed and recorded without token values.',
              headersObserved: true,
              observedHeaderNames: [
                'x-ratelimit-remaining',
                'x-ratelimit-used',
                'x-ratelimit-reset',
              ],
            },
          },
          {
            signalId: 'reddit-credential-lifecycle',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Credential create, rotate, revoke and redacted preview lifecycle artifact was hashed.',
              lifecycleArtifactSha256,
              redactionChecked: true,
              lifecycleOperations: ['create', 'rotate', 'revoke', 'redacted-preview'],
            },
          },
        ],
      },
    ],
  };
}
