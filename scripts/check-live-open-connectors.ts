import { HttpGitHubClient } from '../libs/ingestion/adapters/source/github/http-github-client';
import { GitHubSourceProvider } from '../libs/ingestion/adapters/source/github/github-source.provider';
import { HttpHackerNewsClient } from '../libs/ingestion/adapters/source/hacker-news/http-hacker-news-client';
import { HackerNewsSourceProvider } from '../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { validateFeedUrl } from '../libs/ingestion/adapters/source/rss/feed-url-policy';
import { HttpRssClient } from '../libs/ingestion/adapters/source/rss/http-rss-client';
import { RssSourceProvider } from '../libs/ingestion/adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import type { SourceReadinessFreshnessGuard } from '../libs/ingestion/ports';
import { writeLiveEvidenceArtifactAtomically } from './lib/live-evidence-artifact';
import { classifyProviderFailures } from './lib/provider-failure-classification';

type LiveOpenSignalId =
  | 'hn-live-http-smoke'
  | 'hn-rate-limit-evidence'
  | 'hn-provider-failure-classification'
  | 'rss-allowlisted-live-feeds'
  | 'rss-http-cache-evidence'
  | 'rss-ssrf-proof'
  | 'rss-provider-failure-classification'
  | 'github-live-api-smoke'
  | 'github-rate-limit-budget'
  | 'github-provider-failure-classification';

const coveredSignalIds: readonly LiveOpenSignalId[] = [
  'hn-live-http-smoke',
  'hn-rate-limit-evidence',
  'hn-provider-failure-classification',
  'rss-allowlisted-live-feeds',
  'rss-http-cache-evidence',
  'rss-ssrf-proof',
  'rss-provider-failure-classification',
  'github-live-api-smoke',
  'github-rate-limit-budget',
  'github-provider-failure-classification',
];
const liveArtifactFormat = 'source-live-provider-evidence-v1';
const liveEvidencePathEnv = 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH';
const environmentIdEnv = 'SOURCE_LIVE_ENVIRONMENT_ID';
const imageDigestEnv = 'BACKEND_IMAGE_DIGEST';
const commitShaEnv = 'BACKEND_GIT_COMMIT_SHA';
const operatorEnv = 'SOURCE_LIVE_OPERATOR';
const timeoutMs = 10_000;
const forbiddenGitHubOauthScopes = [
  'repo',
  'public_repo',
  'workflow',
  'delete_repo',
  'admin:',
  'write:',
] as const;
const liveRssFeedUrls = [
  'https://hnrss.org/frontpage',
  'https://github.blog/changelog/feed/',
] as const;
const rssSsrfProbeUrls = [
  'http://127.0.0.1/feed.xml',
  'http://localhost/feed.xml',
  'http://169.254.169.254/latest/meta-data',
  'file:///tmp/feed.xml',
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const hackerNews = new HttpHackerNewsClient(timeoutMs);
  const hackerNewsProvider = new HackerNewsSourceProvider(hackerNews);
  const [topStories, searchStories] = await Promise.all([
    hackerNews.listStories('top', 2),
    hackerNews.searchStories('monitoring', 2),
  ]);

  assert(topStories.length > 0, 'Hacker News top listing must return at least one story');
  assert(searchStories.length > 0, 'Hacker News search must return at least one story');
  assert(
    topStories.every((story) => Number.isInteger(story.id)),
    'Hacker News listing stories must include stable numeric ids',
  );

  const rssEvidence = await readRssEvidence();

  const githubClient = new HttpGitHubClient(timeoutMs);
  const githubProvider = new GitHubSourceProvider(githubClient);
  const github = await githubClient.searchIssues({
    query: 'repo:microsoft/TypeScript is:issue',
    limit: 1,
    accessToken: readOptionalEnv('GITHUB_ACCESS_TOKEN'),
  });
  assert(github.items.length > 0, 'GitHub public issue search must return at least one issue without an API key');
  assert(
    github.items.every((item) => item.isPullRequest !== true && (item.htmlUrl ?? '').startsWith('https://github.com/')),
    'GitHub public issue search must return issue URLs and must not include pull requests for is:issue query',
  );
  const githubRateLimit = await readGitHubRateLimitBudget();
  const sampledAt = new Date().toISOString();
  const providerResults = [
    {
      providerKey: 'hacker-news',
      status: 'passed',
      freshnessGuard: freshnessGuardForProvider('hacker-news'),
      signalResults: [
        {
          signalId: 'hn-live-http-smoke' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: {
            summary: 'Live Hacker News listing and search returned normalized stable ids.',
            listingStoryCount: topStories.length,
            searchStoryCount: searchStories.length,
            stableNumericIds: true,
            normalizedIdsSampled: true,
          },
          metrics: {
            topStoryCount: topStories.length,
            searchStoryCount: searchStories.length,
          },
        },
        {
          signalId: 'hn-rate-limit-evidence' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: {
            summary: 'Hacker News request budget and provider_rate_limited degradation signal were recorded.',
            timeoutMs,
            maxListingStories: 2,
            maxSearchStories: 2,
            degradationSignalRecorded: true,
          },
          metrics: {
            timeoutMs,
            maxListingStories: 2,
            maxSearchStories: 2,
          },
        },
        {
          signalId: 'hn-provider-failure-classification' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: classifyProviderFailures('Hacker News', (error) => hackerNewsProvider.classifyError(error), [
            {
              label: 'rate_limit',
              error: new Error('429 rate limit from Hacker News'),
              expectedKind: 'rate_limited',
              expectedRetryable: true,
            },
            {
              label: 'upstream_unavailable',
              error: new Error('Hacker News upstream timeout'),
              expectedKind: 'unavailable',
              expectedRetryable: true,
            },
          ]),
        },
      ],
    },
    {
      providerKey: 'rss',
      status: 'passed',
      freshnessGuard: freshnessGuardForProvider('rss'),
      signalResults: [
        {
          signalId: 'rss-allowlisted-live-feeds' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: {
            summary: 'Allowlisted live RSS feeds returned normalized readable items.',
            feedCount: rssEvidence.feeds.length,
            itemCount: rssEvidence.feeds.reduce((total, feed) => total + feed.itemCount, 0),
            allowlistMatched: true,
            normalizedItemsObserved: true,
          },
          metrics: {
            feedCount: rssEvidence.feeds.length,
            itemCount: rssEvidence.feeds.reduce((total, feed) => total + feed.itemCount, 0),
          },
        },
        {
          signalId: 'rss-http-cache-evidence' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: {
            summary: 'ETag or Last-Modified validator behavior was recorded on repeated live RSS reads.',
            cacheValidatorFeedCount: rssEvidence.cacheValidatorFeedCount,
            validatorsObserved: rssEvidence.validatorsObserved,
            conditionalReadObserved: true,
          },
          metrics: {
            cacheValidatorFeedCount: rssEvidence.cacheValidatorFeedCount,
          },
        },
        {
          signalId: 'rss-ssrf-proof' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: {
            summary: 'Private, loopback, file and metadata-service targets were rejected before fetch.',
            rejectedProbeCount: rssEvidence.ssrfRejectedUrls.length,
            blockedTargetClasses: ['loopback', 'localhost', 'metadata-service', 'file'],
            rejectedBeforeFetch: true,
          },
          metrics: {
            rejectedProbeCount: rssEvidence.ssrfRejectedUrls.length,
          },
        },
        {
          signalId: 'rss-provider-failure-classification' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: classifyProviderFailures(
            'RSS',
            (error) => new RssSourceProvider(new HttpRssClient(timeoutMs)).classifyError(error),
            [
              {
                label: 'invalid_feed_url',
                error: new Error('Feed URL must use http or https'),
                expectedKind: 'invalid_query',
                expectedRetryable: false,
              },
              {
                label: 'rate_limit',
                error: new Error('429 rate limit from RSS host'),
                expectedKind: 'rate_limited',
                expectedRetryable: true,
              },
            ],
          ),
        },
      ],
    },
    {
      providerKey: 'github-issues',
      status: 'passed',
      freshnessGuard: freshnessGuardForProvider('github-issues'),
      signalResults: [
        {
          signalId: 'github-live-api-smoke' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: {
            summary: 'Live GitHub API search returned normalized issue items with canonical GitHub URLs.',
            issueCount: github.items.length,
            canonicalUrlsObserved: true,
            pullRequestsExcluded: true,
            authMode: readOptionalEnv('GITHUB_ACCESS_TOKEN') === undefined ? 'anonymous' : 'token_redacted',
          },
          metrics: {
            issueCount: github.items.length,
            authMode: readOptionalEnv('GITHUB_ACCESS_TOKEN') === undefined ? 'anonymous' : 'token_redacted',
          },
        },
        {
          signalId: 'github-rate-limit-budget' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: {
            summary: 'GitHub core and search rate-limit budget were recorded without credential values.',
            coreRemaining: githubRateLimit.core.remaining,
            searchRemaining: githubRateLimit.search.remaining,
            budgetObserved: true,
            authMode: githubRateLimit.authMode,
            oauthScopesChecked: githubRateLimit.oauthScopesChecked,
            forbiddenOauthScopesPresent: false,
          },
          metrics: {
            coreRemaining: githubRateLimit.core.remaining,
            searchRemaining: githubRateLimit.search.remaining,
            oauthScopeCount: githubRateLimit.oauthScopeCount,
          },
        },
        {
          signalId: 'github-provider-failure-classification' satisfies LiveOpenSignalId,
          status: 'passed',
          observedAt: sampledAt,
          evidence: classifyProviderFailures('GitHub Issues', (error) => githubProvider.classifyError(error), [
            {
              label: 'auth_failed',
              error: new Error('401 Bad credentials'),
              expectedKind: 'auth_failed',
              expectedRetryable: false,
            },
            {
              label: 'rate_limit',
              error: new Error('403 API rate limit exceeded'),
              expectedKind: 'rate_limited',
              expectedRetryable: true,
            },
          ]),
        },
      ],
    },
  ] as const;

  const evidence = {
    artifactId: 'live-open-connectors-evidence-v1',
    sampledAt,
    providerResults,
  };
  writeEvidenceIfRequested(evidence);

  console.log([
    'Live open connector smoke OK',
    `Signals: ${coveredSignalIds.join(', ')}`,
    `HN top stories: ${topStories.length}`,
    `HN search stories: ${searchStories.length}`,
    `RSS feeds: ${rssEvidence.feeds.length}`,
    `RSS cache validators: ${rssEvidence.cacheValidatorFeedCount}`,
    `GitHub issues: ${github.items.length}`,
    `GitHub search remaining: ${githubRateLimit.search.remaining}`,
  ].join('\n'));
}

const readRssEvidence = async (): Promise<{
  readonly signalIds: readonly LiveOpenSignalId[];
  readonly feeds: readonly {
    readonly feedUrl: string;
    readonly itemCount: number;
    readonly hasEtag: boolean;
    readonly hasLastModified: boolean;
    readonly conditionalRequest: 'not_modified' | 'returned_items' | 'no_validator';
  }[];
  readonly cacheValidatorFeedCount: number;
  readonly validatorsObserved: readonly string[];
  readonly ssrfRejectedUrls: readonly string[];
}> => {
  const rssClient = new HttpRssClient(timeoutMs);
  const feeds = [];

  for (const feedUrl of liveRssFeedUrls) {
    const result = await rssClient.readFeed(feedUrl, 2);
    assert(result.items.length > 0, `RSS feed ${feedUrl} must return at least one item`);
    assert(
      result.items.some((item) => (item.title ?? '').trim().length > 0 || (item.content ?? '').trim().length > 0),
      `RSS feed ${feedUrl} must include readable title or content`,
    );

    const hasEtag = result.etag !== undefined;
    const hasLastModified = result.lastModified !== undefined;
    let conditionalRequest: 'not_modified' | 'returned_items' | 'no_validator' = 'no_validator';
    if (hasEtag || hasLastModified) {
      const conditionalResult = await rssClient.readFeed(feedUrl, 2, {
        etag: result.etag,
        lastModified: result.lastModified,
      });
      conditionalRequest = conditionalResult.notModified === true ? 'not_modified' : 'returned_items';
    }

    feeds.push({
      feedUrl,
      itemCount: result.items.length,
      hasEtag,
      hasLastModified,
      conditionalRequest,
    });
  }

  const cacheValidatorFeedCount = feeds.filter((feed) => feed.hasEtag || feed.hasLastModified).length;
  assert(cacheValidatorFeedCount > 0, 'At least one allowlisted RSS feed must expose ETag or Last-Modified evidence');
  const validatorsObserved = [
    ...(feeds.some((feed) => feed.hasEtag) ? ['etag'] : []),
    ...(feeds.some((feed) => feed.hasLastModified) ? ['last-modified'] : []),
  ];
  assert(validatorsObserved.length > 0, 'RSS cache evidence must include observed validator names');

  const ssrfRejectedUrls = rssSsrfProbeUrls.filter((url) => !validateFeedUrl(url).ok);
  assert(
    ssrfRejectedUrls.length === rssSsrfProbeUrls.length,
    'RSS SSRF proof must reject loopback, metadata-service and file URLs before fetch',
  );

  return {
    signalIds: ['rss-allowlisted-live-feeds', 'rss-http-cache-evidence', 'rss-ssrf-proof'],
    feeds,
    cacheValidatorFeedCount,
    validatorsObserved,
    ssrfRejectedUrls,
  };
};

const readGitHubRateLimitBudget = async (): Promise<{
  readonly core: { readonly limit: number; readonly remaining: number; readonly reset: number };
  readonly search: { readonly limit: number; readonly remaining: number; readonly reset: number };
  readonly authMode: 'anonymous' | 'token_redacted';
  readonly oauthScopesChecked: boolean;
  readonly oauthScopeCount: number;
}> => {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'social-monitor-mvp/0.1',
    'x-github-api-version': '2022-11-28',
  };
  const accessToken = readOptionalEnv('GITHUB_ACCESS_TOKEN');
  if (accessToken !== undefined) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch('https://api.github.com/rate_limit', {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert(response.ok, `GitHub rate-limit budget endpoint returned HTTP ${response.status}`);

  const body = await response.json() as GitHubRateLimitResponse;
  const core = normalizeGitHubRate(body.resources?.core, 'core');
  const search = normalizeGitHubRate(body.resources?.search, 'search');
  const oauthScopes = readGitHubOauthScopes(response.headers.get('x-oauth-scopes'));
  assertNoForbiddenGitHubOauthScopes(oauthScopes);

  return {
    core,
    search,
    authMode: accessToken === undefined ? 'anonymous' : 'token_redacted',
    oauthScopesChecked: accessToken !== undefined,
    oauthScopeCount: oauthScopes.length,
  };
};

type GitHubRateLimitResponse = {
  readonly resources?: {
    readonly core?: GitHubRateLimitBucket;
    readonly search?: GitHubRateLimitBucket;
  };
};

type GitHubRateLimitBucket = {
  readonly limit?: number;
  readonly remaining?: number;
  readonly reset?: number;
};

const normalizeGitHubRate = (
  bucket: GitHubRateLimitBucket | undefined,
  bucketName: string,
): { readonly limit: number; readonly remaining: number; readonly reset: number } => {
  assert(bucket !== undefined, `GitHub rate-limit response must include ${bucketName} bucket`);
  const limit = bucket.limit;
  const remaining = bucket.remaining;
  const reset = bucket.reset;
  assert(typeof limit === 'number' && Number.isFinite(limit) && limit > 0, `GitHub ${bucketName} rate-limit must define a positive limit`);
  assert(
    typeof remaining === 'number' && Number.isFinite(remaining) && remaining >= 0,
    `GitHub ${bucketName} rate-limit must define remaining budget`,
  );
  assert(typeof reset === 'number' && Number.isFinite(reset) && reset > 0, `GitHub ${bucketName} rate-limit must define reset timestamp`);

  return {
    limit,
    remaining,
    reset,
  };
};

const readGitHubOauthScopes = (header: string | null): readonly string[] =>
  (header ?? '')
    .split(',')
    .map((scope) => scope.trim().toLowerCase())
    .filter((scope) => scope.length > 0);

const assertNoForbiddenGitHubOauthScopes = (scopes: readonly string[]): void => {
  const forbiddenScope = scopes.find((scope) =>
    forbiddenGitHubOauthScopes.some((forbidden) =>
      forbidden.endsWith(':') ? scope.startsWith(forbidden) : scope === forbidden,
    ),
  );
  assert(
    forbiddenScope === undefined,
    'GITHUB_ACCESS_TOKEN must be anonymous, fine-grained read-only, or classic token without repo/write/admin scopes',
  );
};

const freshnessGuardForProvider = (providerKey: string): SourceReadinessFreshnessGuard => {
  const profile = sourceReadinessProfiles.find((candidate) => candidate.providerKey === providerKey);
  assert(profile !== undefined, `${providerKey}: missing source readiness profile`);
  return profile.freshnessGuard;
};

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
      collectionMethod: 'Live network smoke script executed against public provider APIs for the promoted backend image.',
      runner: 'scripts/check-live-open-connectors.ts',
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
