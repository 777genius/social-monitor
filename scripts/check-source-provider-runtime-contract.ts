import { readFileSync } from 'node:fs';

import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { HttpGitHubClient } from '../libs/ingestion/adapters/source/github/http-github-client';
import {
  GITHUB_ISSUES_PROVIDER_KEY,
  GitHubSourceProvider,
} from '../libs/ingestion/adapters/source/github/github-source.provider';
import { HttpHackerNewsClient } from '../libs/ingestion/adapters/source/hacker-news/http-hacker-news-client';
import { HackerNewsSourceProvider } from '../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { BigQueryGitHubRepoRadarClient } from '../libs/ingestion/adapters/source/github-repo-radar/bigquery-github-repo-radar-client';
import { GitHubRepoRadarSourceProvider } from '../libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { GitHubRepositoryLiveVerifierAdapter } from '../libs/ingestion/adapters/source/github-repo-radar/github-repository-live-verifier.adapter';
import {
  GITHUB_REPO_RADAR_PROVIDER_KEY,
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  parseGitHubRepositoryTrendMetadata,
  parseGitHubTrendingPageRepositoryMetadata,
} from '../libs/ingestion/domain';
import { HttpGitHubTrendingPageClient } from '../libs/ingestion/adapters/source/github-trending-page/http-github-trending-page-client';
import { GitHubTrendingPageSourceProvider } from '../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import { RedditRefreshTokenProvider } from '../libs/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider';
import type { RedditClientPort } from '../libs/ingestion/adapters/source/reddit/reddit-client.port';
import type { RedditRefreshTokenProviderPort } from '../libs/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider';
import { validateFeedUrl } from '../libs/ingestion/adapters/source/rss/feed-url-policy';
import { HttpRssClient } from '../libs/ingestion/adapters/source/rss/http-rss-client';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import type {
  RssClientPort,
  RssReadFeedOptions,
  RssReadFeedResult,
} from '../libs/ingestion/adapters/source/rss/rss-client.port';
import { RssSourceProvider } from '../libs/ingestion/adapters/source/rss/rss-source.provider';
import type {
  ProviderFailureKind,
  SourceProviderPort,
  SourceProviderScanContext,
} from '../libs/ingestion/ports';

type ContractProvider = {
  readonly providerKey?: unknown;
  readonly credentialMode?: unknown;
  readonly requiredRuntimeInvariants?: unknown;
  readonly liveEvidenceSignals?: unknown;
};

type RuntimeContract = {
  readonly schemaVersion?: unknown;
  readonly contractId?: unknown;
  readonly scope?: unknown;
  readonly fixtureMode?: unknown;
  readonly releaseGate?: unknown;
  readonly blockingPassed?: unknown;
  readonly providers?: unknown;
};

const contractPath = 'ops/ingestion/source-provider-runtime-contract.json';
const externalBetaEvidenceRunnerPath = 'ops/release/external-beta-evidence-runner.json';
const requiredProviders = new Map([
  [
    'hacker-news',
    {
      credentialMode: 'public_no_secret',
      signals: [
        'hn-live-http-smoke',
        'hn-rate-limit-evidence',
        'hn-provider-failure-classification',
      ],
    },
  ],
  [
    'rss',
    {
      credentialMode: 'public_allowlisted_feed_polling',
      signals: [
        'rss-allowlisted-live-feeds',
        'rss-http-cache-evidence',
        'rss-ssrf-proof',
        'rss-provider-failure-classification',
      ],
    },
  ],
  [
    GITHUB_ISSUES_PROVIDER_KEY,
    {
      credentialMode: 'anonymous_or_read_only_token',
      signals: [
        'github-live-api-smoke',
        'github-rate-limit-budget',
        'github-provider-failure-classification',
      ],
    },
  ],
  [
    GITHUB_REPO_RADAR_PROVIDER_KEY,
    {
      credentialMode: 'bigquery_service_account_and_optional_read_only_token',
      signals: [
        'github-repo-radar-gh-archive-query',
        'github-repo-radar-live-verification',
        'github-repo-radar-live-smoke',
        'github-repo-radar-prisma-live-e2e',
        'github-repo-radar-provider-failure-classification',
      ],
    },
  ],
  [
    GITHUB_TRENDING_PAGE_PROVIDER_KEY,
    {
      credentialMode: 'public_page_with_site_policy_respect',
      signals: [
        'github-trending-page-live-smoke',
        'github-trending-page-parser-drift',
        'github-trending-page-rate-limit-budget',
        'github-trending-page-provider-failure-classification',
      ],
    },
  ],
  [
    'reddit',
    {
      credentialMode: 'app_only_or_permanent_refresh_token',
      signals: [
        'reddit-tenant-oauth-smoke',
        'reddit-auth-failure',
        'reddit-rate-limit-budget',
        'reddit-credential-lifecycle',
      ],
    },
  ],
] as const);

const originalFetch = globalThis.fetch;

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
  validateContract();
  await verifyRedditPermanentOAuthRuntime();
  await verifyGitHubIssuesRuntimeModes();
  await verifyGitHubRepoRadarRuntimeModes();
  await verifyGitHubTrendingPageRuntime();
  await verifyRssRuntimeGuards();
  await verifyHackerNewsRuntime();

  console.log('Source provider runtime contract OK');
}

function validateContract(): void {
  const contract = JSON.parse(
    readFileSync(contractPath, 'utf8'),
  ) as RuntimeContract;
  assert(
    contract.schemaVersion === 1,
    `${contractPath}: schemaVersion must be 1`,
  );
  assert(
    contract.contractId === 'source-provider-runtime-contract-v1',
    `${contractPath}: contractId mismatch`,
  );
  assert(
    contract.scope === 'backend-only',
    `${contractPath}: scope must be backend-only`,
  );
  assert(
    contract.fixtureMode === 'mocked_http_no_network',
    `${contractPath}: fixtureMode must stay mocked_http_no_network`,
  );
  assert(
    contract.releaseGate === 'npm run check:source-provider-runtime-contract',
    `${contractPath}: releaseGate mismatch`,
  );
  assert(
    contract.blockingPassed === true,
    `${contractPath}: blockingPassed must be true`,
  );
  assert(
    Array.isArray(contract.providers),
    `${contractPath}: providers must be an array`,
  );

  const providers = new Map<string, ContractProvider>();
  for (const provider of contract.providers) {
    assert(
      isRecord(provider),
      `${contractPath}: each provider must be an object`,
    );
    const providerKey = readString(provider, 'providerKey');
    assert(
      !providers.has(providerKey),
      `${contractPath}: duplicate provider ${providerKey}`,
    );
    providers.set(providerKey, provider as ContractProvider);
  }
  const enabledBetaProviderKeys = sourceReadinessProfiles
    .filter((profile) => profile.state === 'enabled_beta')
    .map((profile) => profile.providerKey);
  const requiredProviderKeys = Array.from(requiredProviders.keys());
  const contractProviderKeys = Array.from(providers.keys());
  assertIncludesAll(
    requiredProviderKeys,
    enabledBetaProviderKeys,
    `${contractPath}: required provider registry`,
  );
  assertIncludesAll(
    enabledBetaProviderKeys,
    requiredProviderKeys,
    `${contractPath}: enabled beta readiness profiles`,
  );
  assertIncludesAll(
    contractProviderKeys,
    enabledBetaProviderKeys,
    `${contractPath}: provider list`,
  );
  assertIncludesAll(
    enabledBetaProviderKeys,
    contractProviderKeys,
    `${contractPath}: enabled beta provider list`,
  );

  for (const [providerKey, requirement] of requiredProviders) {
    const provider = providers.get(providerKey);
    assert(
      provider !== undefined,
      `${contractPath}: missing provider ${providerKey}`,
    );
    assert(
      provider.credentialMode === requirement.credentialMode,
      `${contractPath}: ${providerKey} credentialMode mismatch`,
    );
    assertNonEmptyStringArray(
      provider.requiredRuntimeInvariants,
      `${contractPath}: ${providerKey}.requiredRuntimeInvariants`,
    );
    assertIncludesAll(
      provider.liveEvidenceSignals,
      requirement.signals,
      `${contractPath}: ${providerKey}.liveEvidenceSignals`,
    );
    assertLiveEvidenceSignalsMatchReadiness(providerKey, provider);
  }

  assertSourceLiveEvidenceArtifactsAreRunnable();
}

function assertLiveEvidenceSignalsMatchReadiness(
  providerKey: string,
  provider: ContractProvider,
): void {
  const readiness = sourceReadinessProfiles.find(
    (profile) => profile.providerKey === providerKey,
  );
  assert(
    readiness !== undefined,
    `${contractPath}: ${providerKey} must have a source readiness profile`,
  );
  const actualSignals = provider.liveEvidenceSignals;
  assert(
    Array.isArray(actualSignals),
    `${contractPath}: ${providerKey}.liveEvidenceSignals must be an array`,
  );
  const expectedSignals = readiness.liveEvidenceRequirements.map(
    (requirement) => requirement.signalId,
  );

  assertIncludesAll(
    actualSignals,
    expectedSignals,
    `${contractPath}: ${providerKey}.liveEvidenceSignals readiness alignment`,
  );
  for (const signal of actualSignals) {
    assert(
      typeof signal === 'string' && expectedSignals.includes(signal),
      `${contractPath}: ${providerKey}.liveEvidenceSignals has stale or undeclared signal ${String(signal)}`,
    );
  }
}

function assertSourceLiveEvidenceArtifactsAreRunnable(): void {
  const runner = JSON.parse(
    readFileSync(externalBetaEvidenceRunnerPath, 'utf8'),
  ) as { readonly jobs?: unknown };
  assert(
    Array.isArray(runner.jobs),
    `${externalBetaEvidenceRunnerPath}: jobs must be an array`,
  );
  const sourceLiveCoverage = buildSourceLiveArtifactCoverage(runner.jobs);
  const enabledProviderKeys = new Set(
    sourceReadinessProfiles
      .filter((profile) => profile.state === 'enabled_beta')
      .map((profile) => profile.providerKey),
  );

  for (const profile of sourceReadinessProfiles) {
    if (profile.state !== 'enabled_beta') {
      continue;
    }

    for (const requirement of profile.liveEvidenceRequirements) {
      const artifactEnv = requirement.artifactEnv;
      assert(
        artifactEnv !== undefined && artifactEnv.trim().length > 0,
        `${contractPath}: ${profile.providerKey} live evidence requirement ${requirement.signalId} must declare artifactEnv`,
      );
      const coveredProviders = sourceLiveCoverage.get(artifactEnv);
      assert(
        coveredProviders !== undefined,
        `${externalBetaEvidenceRunnerPath}: missing source live output artifact for ${profile.providerKey} artifactEnv ${artifactEnv}`,
      );
      assert(
        coveredProviders.has(profile.providerKey),
        `${externalBetaEvidenceRunnerPath}: source live artifact ${artifactEnv} must include provider ${profile.providerKey}`,
      );
    }
  }

  for (const [artifactEnv, providerKeys] of sourceLiveCoverage) {
    for (const providerKey of providerKeys) {
      assert(
        enabledProviderKeys.has(providerKey),
        `${externalBetaEvidenceRunnerPath}: source live artifact ${artifactEnv} references non-enabled provider ${providerKey}`,
      );
      const profile = sourceReadinessProfiles.find(
        (candidate) => candidate.providerKey === providerKey,
      );
      assert(
        profile?.liveEvidenceRequirements.some(
          (requirement) => requirement.artifactEnv === artifactEnv,
        ) === true,
        `${externalBetaEvidenceRunnerPath}: source live artifact ${artifactEnv} is not declared by provider ${providerKey}`,
      );
    }
  }
}

function buildSourceLiveArtifactCoverage(
  jobs: readonly unknown[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const coverage = new Map<string, Set<string>>();

  for (const job of jobs) {
    assert(
      isRecord(job),
      `${externalBetaEvidenceRunnerPath}: each job must be an object`,
    );
    const outputArtifacts = job.outputArtifacts;
    if (!Array.isArray(outputArtifacts)) {
      continue;
    }

    for (const artifact of outputArtifacts) {
      assert(
        isRecord(artifact),
        `${externalBetaEvidenceRunnerPath}: output artifacts must be objects`,
      );
      if (artifact.format !== 'source-live-provider-evidence-v1') {
        continue;
      }
      const env = artifact.env;
      const expectedProviderKeys = artifact.expectedProviderKeys;
      assert(
        typeof env === 'string' && env.trim().length > 0,
        `${externalBetaEvidenceRunnerPath}: source live output artifact env must be a non-empty string`,
      );
      assertNonEmptyStringArray(
        expectedProviderKeys,
        `${externalBetaEvidenceRunnerPath}: source live output artifact ${env}.expectedProviderKeys`,
      );
      const providers = coverage.get(env) ?? new Set<string>();
      for (const providerKey of expectedProviderKeys as readonly string[]) {
        providers.add(providerKey);
      }
      coverage.set(env, providers);
    }
  }

  return coverage;
}

async function verifyRedditPermanentOAuthRuntime(): Promise<void> {
  let now = 1_000;
  const tokenUrl = 'https://www.reddit.com/api/v1/access_token';
  let refreshRequestCount = 0;
  await withMockedFetch(
    async (input, init) => {
      refreshRequestCount += 1;
      assert(
        String(input) === tokenUrl,
        'Reddit refresh-token provider must call the configured token URL',
      );
      assert(
        init?.method === 'POST',
        'Reddit refresh-token provider must use POST',
      );
      assert(
        readHeader(init.headers, 'authorization')?.startsWith('Basic ') ===
          true,
        'Reddit refresh-token provider must use Basic client auth',
      );
      assert(
        readHeader(init.headers, 'content-type') ===
          'application/x-www-form-urlencoded',
        'Reddit refresh-token provider must submit form body',
      );
      const body = readUrlSearchParams(init.body);
      assert(
        body.get('grant_type') === 'refresh_token',
        'Reddit refresh-token provider must use grant_type=refresh_token',
      );
      assert(
        body.get('refresh_token') === 'permanent-refresh-token',
        'Reddit refresh-token provider must submit the tenant refresh token',
      );
      const accessToken = `short-lived-access-${body.get('grant_type')}-${now}`;
      return jsonResponse({ access_token: accessToken, expires_in: 120 });
    },
    async () => {
      const provider = new RedditRefreshTokenProvider({
        tokenUrl,
        now: () => now,
        refreshSkewMs: 10_000,
      });
      const request = {
        clientId: 'reddit-client-id',
        clientSecret: 'reddit-client-secret',
        refreshToken: 'permanent-refresh-token',
        userAgent: 'social-monitor-mvp/0.1 runtime-contract',
      };

      const first = await provider.getAccessToken(request);
      const second = await provider.getAccessToken(request);
      assert(
        first === second,
        'Reddit refresh-token provider must reuse cached access token before skew',
      );
      assert(
        Number(refreshRequestCount) === 1,
        'Reddit refresh-token provider must not refresh while cached token is valid',
      );
      now = 112_000;
      const third = await provider.getAccessToken(request);
      assert(
        third !== first,
        'Reddit refresh-token provider must refresh after expiry minus skew',
      );
      assert(
        Number(refreshRequestCount) === 2,
        'Reddit refresh-token provider must refresh once after cache expiry',
      );

      return [];
    },
  );

  await withMockedFetch(
    async () =>
      new Response(
        JSON.stringify({
          error: 'invalid_grant',
          access_token: 'leaky-access-token',
          refresh_token: 'leaky-refresh-token',
          client_secret: 'leaky-client-secret',
        }),
        { status: 400 },
      ),
    async () => {
      const provider = new RedditRefreshTokenProvider({
        tokenUrl,
        now: () => now,
        refreshSkewMs: 10_000,
      });

      try {
        await provider.getAccessToken({
          clientId: 'reddit-client-id',
          clientSecret: 'reddit-client-secret',
          refreshToken: 'permanent-refresh-token',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const secret of [
          'leaky-access-token',
          'leaky-refresh-token',
          'leaky-client-secret',
        ]) {
          assert(
            !message.includes(secret),
            `Reddit refresh-token error leaked ${secret}`,
          );
        }
        assert(
          message.includes('[REDACTED]'),
          'Reddit refresh-token error must include redacted placeholders',
        );
        return;
      }

      throw new Error(
        'Reddit refresh-token provider must fail closed on OAuth error responses',
      );
    },
  );

  const refreshProvider: RedditRefreshTokenProviderPort = {
    async getAccessToken(request) {
      assert(
        request.clientId === 'tenant-client-id',
        'Reddit source provider must pass tenant client id to refresh provider',
      );
      assert(
        request.clientSecret === 'tenant-client-secret',
        'Reddit source provider must pass tenant client secret to refresh provider',
      );
      assert(
        request.refreshToken === 'tenant-refresh-token',
        'Reddit source provider must pass tenant refresh token to refresh provider',
      );
      return 'tenant-access-token';
    },
  };
  const redditClient: RedditClientPort = {
    async listSubredditPosts(request) {
      assert(
        request.accessToken === 'tenant-access-token',
        'Reddit source provider must scan with refresh-token access token',
      );
      return {
        posts: [
          {
            id: 'reddit-post-1',
            name: 't3_redditpost1',
            subreddit: request.subreddit,
            title: 'Runtime contract Reddit post',
            permalink: '/r/programming/comments/runtime_contract',
            createdUtc: 1_782_000_000,
          },
        ],
      };
    },
    async searchPosts() {
      throw new Error('Reddit runtime contract should use listing mode');
    },
  };
  const sourceProvider = new RedditSourceProvider(
    redditClient,
    undefined,
    refreshProvider,
  );
  const context = contextFor('reddit', {
    clientId: 'tenant-client-id',
    clientSecret: 'tenant-client-secret',
    refreshToken: 'tenant-refresh-token',
    subreddit: 'programming',
    listing: 'hot',
    maxItems: 1,
  });
  const plan = sourceProvider.planScan(
    { mode: 'listing', query: 'programming:hot' },
    context,
  );
  const result = await sourceProvider.scan(plan, context);
  assert(
    result.items[0]?.externalId === 'reddit:t3_redditpost1',
    'Reddit source provider must normalize refresh-token scans',
  );

  assertFailure(
    sourceProvider,
    'Reddit API returned 401',
    'auth_failed',
    false,
  );
  assertFailure(
    sourceProvider,
    'Reddit API returned 429',
    'rate_limited',
    true,
  );
  assertFailure(sourceProvider, 'Reddit API returned 503', 'unavailable', true);
}

async function verifyGitHubIssuesRuntimeModes(): Promise<void> {
  const fetchedUrls: string[] = [];
  const readOnlyToken = ['github', 'read', 'token'].join('-');
  await withMockedFetch(
    async (input, init) => {
      fetchedUrls.push(String(input));
      const url = new URL(String(input));
      assert(
        url.hostname === 'api.github.com',
        'GitHub issues runtime must use the GitHub REST API host',
      );
      assert(
        url.pathname === '/search/issues',
        'GitHub issues runtime must use search/issues endpoint',
      );
      assert(
        url.searchParams.get('sort') === 'updated',
        'GitHub issues runtime must request updated sorting',
      );
      assert(
        url.searchParams.get('order') === 'desc',
        'GitHub issues runtime must request descending order',
      );
      assert(
        readHeader(init?.headers, 'accept') === 'application/vnd.github+json',
        'GitHub issues runtime must request GitHub JSON',
      );
      assert(
        readHeader(init?.headers, 'x-github-api-version') === '2022-11-28',
        'GitHub issues runtime must pin GitHub REST API version',
      );
      const userAgent = readHeader(init?.headers, 'user-agent');
      assert(
        userAgent !== undefined && userAgent.length > 0,
        'GitHub issues runtime must set User-Agent',
      );

      const auth = readHeader(init?.headers, 'authorization');
      if (fetchedUrls.length === 1) {
        assert(
          auth === undefined,
          'GitHub issues anonymous mode must omit Authorization',
        );
      } else {
        assert(
          auth === ['Bearer', readOnlyToken].join(' '),
          'GitHub issues token mode must trim the read credential and apply the bearer auth scheme',
        );
      }

      return jsonResponse(
        {
          items: [
            {
              id: fetchedUrls.length,
              node_id: `github-node-${fetchedUrls.length}`,
              html_url: `https://github.com/acme/project/issues/${fetchedUrls.length}`,
              title: 'GitHub runtime contract issue',
              body: 'Issue body',
              user: { login: 'octocat' },
              created_at: '2026-06-22T10:00:00.000Z',
              updated_at: '2026-06-22T10:01:00.000Z',
              state: 'open',
            },
          ],
        },
        {
          link: '<https://api.github.com/search/issues?q=x&page=2>; rel="next"',
        },
      );
    },
    async () => {
      const client = new HttpGitHubClient();
      const anonymous = await client.searchIssues({
        query: 'repo:acme/project is:issue',
        limit: 1,
        accessToken: '   ',
      });
      const token = await client.searchIssues({
        query: 'repo:acme/project is:issue',
        limit: 1,
        accessToken: ` ${readOnlyToken} `,
      });
      assert(
        anonymous.nextCursor === '2',
        'GitHub issues runtime must parse next page cursor',
      );
      assert(
        token.items[0]?.htmlUrl === 'https://github.com/acme/project/issues/2',
        'GitHub issues token mode must return normalized items',
      );
    },
  );

  await withMockedFetch(
    async () =>
      new Response(
        JSON.stringify({ message: 'rate limited', token: readOnlyToken }),
        { status: 403 },
      ),
    async () => {
      try {
        await new HttpGitHubClient().searchIssues({
          query: 'repo:acme/project is:issue',
          limit: 1,
          accessToken: readOnlyToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
          !message.includes(readOnlyToken),
          'GitHub issues HTTP errors must not leak token values',
        );
        return;
      }

      throw new Error('GitHub issues client must fail closed on HTTP errors');
    },
  );

  const sourceProvider = new GitHubSourceProvider(new HttpGitHubClient());
  assertFailure(
    sourceProvider,
    'GitHub API returned 401 bad credentials',
    'auth_failed',
    false,
  );
  assertFailure(
    sourceProvider,
    'GitHub API returned 403 rate limit exceeded',
    'rate_limited',
    true,
  );
  assertFailure(
    sourceProvider,
    'GitHub API returned 429',
    'rate_limited',
    true,
  );
  assertFailure(sourceProvider, 'GitHub API returned 503', 'unavailable', true);
}

async function verifyGitHubRepoRadarRuntimeModes(): Promise<void> {
  let observedBigQueryJob = false;
  let observedGitHubRepositoryFetch = false;
  const readOnlyToken = ['github', 'repo-radar', 'read', 'token'].join('-');
  const bigQueryClient = {
    async createQueryJob(options: {
      readonly query?: unknown;
      readonly location?: unknown;
      readonly maximumBytesBilled?: unknown;
      readonly jobTimeoutMs?: unknown;
      readonly params?: Readonly<Record<string, unknown>>;
    }) {
      observedBigQueryJob = true;
      assert(
        typeof options.query === 'string',
        'GitHub repo radar must submit a BigQuery SQL string',
      );
      assert(
        options.query.includes('githubarchive.day.20*'),
        'GitHub repo radar must query only GH Archive numeric day tables',
      );
      assert(
        options.query.includes("type = 'WatchEvent'"),
        'GitHub repo radar must aggregate WatchEvent records',
      );
      assert(
        options.location === 'US',
        'GitHub repo radar BigQuery location must be explicit',
      );
      assert(
        options.maximumBytesBilled === '123456789',
        'GitHub repo radar must bound BigQuery bytes billed',
      );
      assert(
        options.jobTimeoutMs === 456,
        'GitHub repo radar must pass a BigQuery job timeout',
      );
      assert(
        options.params?.query === '',
        'topic/language searches must not be incorrectly filtered by repository name',
      );
      assert(
        options.params?.limit === 3,
        'GitHub repo radar must bound BigQuery candidate count',
      );
      assert(
        options.params?.startTableSuffix === '260325',
        'GitHub repo radar must query the largest configured trend window start table suffix',
      );
      assert(
        options.params?.endTableSuffix === '260623',
        'GitHub repo radar must query the checked-at table suffix',
      );
      return [
        {
          async getQueryResults(
            getOptions: { readonly timeoutMs?: unknown } = {},
          ) {
            assert(
              getOptions.timeoutMs === 123,
              'GitHub repo radar must bound BigQuery result wait time',
            );
            return [
              [
                {
                  full_name: 'openai/codex',
                  stars_24h: '210',
                  stars_48h: '360',
                  stars_7d: '0',
                  stars_30d: '0',
                  stars_90d: '0',
                },
              ],
            ];
          },
        },
      ];
    },
  };

  await withMockedFetch(
    async (input, init) => {
      observedGitHubRepositoryFetch = true;
      const url = new URL(String(input));
      assert(
        url.hostname === 'api.github.com',
        'GitHub repo radar live verifier must use GitHub REST API host',
      );
      assert(
        url.pathname === '/repos/openai/codex',
        'GitHub repo radar live verifier must fetch repository details',
      );
      assert(
        readHeader(init?.headers, 'accept') === 'application/vnd.github+json',
        'GitHub repo radar must request GitHub JSON',
      );
      assert(
        readHeader(init?.headers, 'x-github-api-version') === '2022-11-28',
        'GitHub repo radar must pin GitHub REST API version',
      );
      assert(
        readHeader(init?.headers, 'authorization') ===
          `Bearer ${readOnlyToken}`,
        'GitHub repo radar must use read-only token when supplied',
      );
      assert(
        readHeader(init?.headers, 'user-agent') ===
          'social-monitor-runtime-contract',
        'GitHub repo radar must pass configured User-Agent',
      );
      return jsonResponse({
        full_name: 'openai/codex',
        html_url: 'https://github.com/openai/codex',
        description: 'AI coding agent CLI and developer workflow tooling.',
        language: 'TypeScript',
        topics: ['ai', 'agents', 'developer-tools'],
        license: { spdx_id: 'Apache-2.0' },
        stargazers_count: 54000,
        fork: false,
        archived: false,
        pushed_at: '2026-06-23T08:00:00.000Z',
        updated_at: '2026-06-23T08:30:00.000Z',
      });
    },
    async () => {
      const provider = new GitHubRepoRadarSourceProvider(
        new BigQueryGitHubRepoRadarClient({
          client: bigQueryClient as never,
          maximumBytesBilled: '123456789',
          timeoutMs: 123,
          jobTimeoutMs: 456,
        }),
        new GitHubRepositoryLiveVerifierAdapter(new HttpGitHubClient()),
        { now: () => new Date('2026-06-23T12:00:00.000Z') },
      );
      const context = contextFor(GITHUB_REPO_RADAR_PROVIDER_KEY, {
        topics: ['agents'],
        languages: ['TypeScript'],
        minStars: 100,
        maxItems: 1,
        maxCandidates: 3,
        accessToken: ` ${readOnlyToken} `,
        userAgent: 'social-monitor-runtime-contract',
      });
      const plan = provider.planScan(
        { mode: 'search', query: 'agents' },
        context,
      );
      const result = await provider.scan(plan, context);
      const metadata = parseGitHubRepositoryTrendMetadata(
        result.items[0]?.metadata,
      );
      assert(
        result.items.length === 1,
        'GitHub repo radar runtime must emit a verified repository trend item',
      );
      assert(
        metadata !== null,
        'GitHub repo radar runtime must emit repository trend metadata',
      );
      assert(
        metadata.repository.fullName === 'openai/codex',
        'GitHub repo radar metadata must keep repository full name',
      );
      assert(
        metadata.trend.stars48h === 360,
        'GitHub repo radar metadata must keep 48h star delta',
      );
      assert(
        metadata.trend.source === 'gh_archive_bigquery_plus_github_live',
        'GitHub repo radar metadata must identify runtime source',
      );
    },
  );

  assert(
    observedBigQueryJob,
    'GitHub repo radar runtime contract must observe BigQuery query creation',
  );
  assert(
    observedGitHubRepositoryFetch,
    'GitHub repo radar runtime contract must observe GitHub repository fetch',
  );

  const sourceProvider = new GitHubRepoRadarSourceProvider(
    new BigQueryGitHubRepoRadarClient({ client: bigQueryClient as never }),
    new GitHubRepositoryLiveVerifierAdapter(new HttpGitHubClient()),
    { now: () => new Date('2026-06-23T12:00:00.000Z') },
  );
  assertFailure(
    sourceProvider,
    'GitHub API returned 401 bad credentials',
    'auth_failed',
    false,
  );
  assertFailure(
    sourceProvider,
    'GitHub API returned 403 rate limit exceeded',
    'rate_limited',
    true,
  );
  assertFailure(
    sourceProvider,
    'BigQuery quota exceeded',
    'rate_limited',
    true,
  );
  assertFailure(sourceProvider, 'GitHub API returned 503', 'unavailable', true);
}

async function verifyGitHubTrendingPageRuntime(): Promise<void> {
  let observedTrendingPageFetch = false;
  await withMockedFetch(
    async (input, init) => {
      observedTrendingPageFetch = true;
      const url = new URL(String(input));
      assert(
        url.hostname === 'github.com',
        'GitHub Trending page runtime must use github.com',
      );
      assert(
        url.pathname === '/trending/TypeScript',
        'GitHub Trending page runtime must encode language in the path',
      );
      assert(
        url.searchParams.get('since') === 'daily',
        'GitHub Trending page runtime must pass the since window',
      );
      assert(
        url.searchParams.get('spoken_language_code') === 'en',
        'GitHub Trending page runtime must pass spoken language when configured',
      );
      assert(
        readHeader(init?.headers, 'accept') === 'text/html,application/xhtml+xml',
        'GitHub Trending page runtime must request HTML',
      );
      assert(
        readHeader(init?.headers, 'user-agent') ===
          'social-monitor-runtime-contract',
        'GitHub Trending page runtime must pass configured User-Agent',
      );

      return new Response(githubTrendingPageHtmlFixture(), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
    async () => {
      const provider = new GitHubTrendingPageSourceProvider(
        new HttpGitHubTrendingPageClient(),
        { now: () => new Date('2026-06-24T12:00:00.000Z') },
      );
      const context = contextFor(GITHUB_TRENDING_PAGE_PROVIDER_KEY, {
        language: 'TypeScript',
        spokenLanguage: 'en',
        userAgent: 'social-monitor-runtime-contract',
        maxItems: 1,
      });
      const result = await provider.scan(
        provider.planScan({ mode: 'listing', query: 'daily' }, context),
        context,
      );
      const metadata = parseGitHubTrendingPageRepositoryMetadata(
        result.items[0]?.metadata,
      );
      assert(
        result.items.length === 1,
        'GitHub Trending page runtime must emit one repository item',
      );
      assert(
        metadata !== null,
        'GitHub Trending page runtime must emit repository metadata',
      );
      assert(
        metadata.repository.fullName === 'openai/codex',
        'GitHub Trending page metadata must keep repository full name',
      );
      assert(
        metadata.repository.totalStars === 54000,
        'GitHub Trending page metadata must keep total stars',
      );
      assert(
        metadata.trending.starsGained === 210,
        'GitHub Trending page metadata must keep stars gained for the selected window',
      );
      assert(
        metadata.trending.source === 'github_trending_html',
        'GitHub Trending page metadata must identify live HTML runtime source',
      );
    },
  );

  assert(
    observedTrendingPageFetch,
    'GitHub Trending page runtime contract must observe live page fetch',
  );

  const sourceProvider = new GitHubTrendingPageSourceProvider(
    new HttpGitHubTrendingPageClient(),
    { now: () => new Date('2026-06-24T12:00:00.000Z') },
  );
  assertFailure(
    sourceProvider,
    'GitHub Trending page returned HTTP 403',
    'rate_limited',
    true,
  );
  assertFailure(
    sourceProvider,
    'GitHub Trending page returned HTTP 429',
    'rate_limited',
    true,
  );
  assertFailure(
    sourceProvider,
    'GitHub Trending page returned HTTP 503',
    'unavailable',
    true,
  );
}

async function verifyRssRuntimeGuards(): Promise<void> {
  for (const blockedUrl of [
    'http://127.0.0.1/feed.xml',
    'http://localhost/feed.xml',
    'http://169.254.169.254/latest/meta-data',
    'file:///tmp/feed.xml',
  ]) {
    assert(
      !validateFeedUrl(blockedUrl).ok,
      `RSS URL policy must reject ${blockedUrl}`,
    );
  }

  await withMockedFetch(
    async (_input, init) => {
      assert(
        readHeader(init?.headers, 'if-none-match') === '"runtime-etag"',
        'RSS runtime must send If-None-Match from cursor',
      );
      assert(
        readHeader(init?.headers, 'if-modified-since') ===
          'Mon, 22 Jun 2026 10:00:00 GMT',
        'RSS runtime must send If-Modified-Since from cursor',
      );
      return new Response(null, {
        status: 304,
        headers: {
          etag: '"runtime-etag"',
        },
      });
    },
    async () => {
      const result = await new HttpRssClient().readFeed(
        'https://example.test/feed.xml',
        10,
        {
          etag: '"runtime-etag"',
          lastModified: 'Mon, 22 Jun 2026 10:00:00 GMT',
        },
      );
      assert(
        result.notModified === true,
        'RSS runtime must expose notModified for HTTP 304',
      );
      assert(
        result.items.length === 0,
        'RSS runtime must not parse items for HTTP 304',
      );
      assert(
        result.etag === '"runtime-etag"',
        'RSS runtime must preserve ETag on HTTP 304',
      );
    },
  );

  await withMockedFetch(
    async () => {
      const response = new Response('<rss />', { status: 200 });
      Object.defineProperty(response, 'url', {
        value: 'http://127.0.0.1/feed.xml',
      });
      return response;
    },
    async () => {
      try {
        await new HttpRssClient().readFeed('https://example.test/feed.xml', 10);
      } catch (error) {
        assert(
          error instanceof Error &&
            error.message.includes('Feed URL redirect rejected'),
          'RSS runtime must reject private-network redirects after fetch',
        );
        return;
      }

      throw new Error('RSS runtime must fail closed on unsafe redirects');
    },
  );

  const sourceClient = new CursorAssertingRssClient();
  const sourceProvider = new RssSourceProvider(sourceClient);
  const firstPlan = sourceProvider.planScan(
    { mode: 'url', query: 'https://example.test/feed.xml' },
    contextFor('rss'),
  );
  const first = await sourceProvider.scan(firstPlan, contextFor('rss'));
  assert(
    first.nextCursor?.includes('runtime-etag') === true,
    'RSS source provider must encode HTTP cache validators into cursor',
  );
  const secondPlan = { ...firstPlan, cursor: first.nextCursor };
  await sourceProvider.scan(secondPlan, contextFor('rss'));
  assert(
    sourceClient.secondReadObserved === true,
    'RSS source provider must decode cursor into conditional read options',
  );

  assertFailure(
    sourceProvider,
    'Feed URL must not target private or local networks.',
    'invalid_query',
    false,
  );
  assertFailure(
    sourceProvider,
    'RSS provider returned HTTP 429',
    'rate_limited',
    true,
  );
  assertFailure(
    sourceProvider,
    'RSS provider returned HTTP 503',
    'unavailable',
    true,
  );
}

async function verifyHackerNewsRuntime(): Promise<void> {
  await withMockedFetch(
    async (input, init) => {
      assert(
        readHeader(init?.headers, 'accept') === 'application/json',
        'HN runtime must request JSON',
      );
      const userAgent = readHeader(init?.headers, 'user-agent');
      assert(
        userAgent !== undefined && userAgent.length > 0,
        'HN runtime must set User-Agent',
      );
      const url = String(input);
      if (url.endsWith('/topstories.json')) {
        return jsonResponse([1001, 1002]);
      }
      if (url.endsWith('/item/1001.json')) {
        return jsonResponse({
          id: 1001,
          title: 'HN top story',
          url: 'https://example.com/hn-top',
          by: 'hn-user',
          time: 1_782_000_000,
        });
      }
      if (url.endsWith('/item/1002.json')) {
        return jsonResponse({
          id: 1002,
          title: 'HN second story',
          by: 'hn-user',
          time: 1_782_000_001,
        });
      }
      if (url.startsWith('https://hn.algolia.com/api/v1/search_by_date')) {
        return jsonResponse({
          hits: [
            {
              objectID: '2001',
              title: 'HN search story',
              url: 'https://example.com/hn-search',
              author: 'algolia-user',
              created_at_i: 1_782_000_002,
            },
          ],
        });
      }

      throw new Error(`Unexpected HN request ${url}`);
    },
    async () => {
      const client = new HttpHackerNewsClient();
      const listed = await client.listStories('top', 2);
      const searched = await client.searchStories('monitoring', 2);
      assert(
        listed.length === 2,
        'HN runtime must normalize Firebase listing stories',
      );
      assert(
        searched[0]?.id === 2001,
        'HN runtime must normalize Algolia search stories',
      );
    },
  );

  const sourceProvider = new HackerNewsSourceProvider(
    new HttpHackerNewsClient(),
  );
  assertFailure(
    sourceProvider,
    'Hacker News provider returned HTTP 429',
    'rate_limited',
    true,
  );
  assertFailure(
    sourceProvider,
    'Hacker News provider returned HTTP 503',
    'unavailable',
    true,
  );
}

class CursorAssertingRssClient implements RssClientPort {
  secondReadObserved = false;
  private readCount = 0;

  async readFeed(
    _feedUrl: string,
    _limit: number,
    options: RssReadFeedOptions = {},
  ): Promise<RssReadFeedResult> {
    this.readCount += 1;
    if (this.readCount === 1) {
      return {
        items: [
          {
            guid: 'rss-runtime-1',
            link: 'https://example.test/rss-runtime-1',
            title: 'RSS runtime item',
            content: 'RSS runtime body',
            publishedAt: new Date('2026-06-22T10:00:00.000Z'),
          },
        ],
        etag: '"runtime-etag"',
        lastModified: 'Mon, 22 Jun 2026 10:00:00 GMT',
      };
    }

    assert(
      options.etag === '"runtime-etag"',
      'RSS source provider must pass ETag cursor to client',
    );
    assert(
      options.lastModified === 'Mon, 22 Jun 2026 10:00:00 GMT',
      'RSS source provider must pass Last-Modified cursor to client',
    );
    this.secondReadObserved = true;
    return {
      items: [],
      etag: options.etag,
      lastModified: options.lastModified,
      notModified: true,
    };
  }
}

async function withMockedFetch<TResult>(
  fetchMock: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
  run: () => Promise<TResult>,
): Promise<TResult> {
  globalThis.fetch = fetchMock as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function assertFailure(
  provider: SourceProviderPort,
  message: string,
  expectedKind: ProviderFailureKind,
  expectedRetryable: boolean,
): void {
  const failure = provider.classifyError(
    new Error(message),
    contextFor(provider.key()),
  );
  assert(
    failure.kind === expectedKind,
    `${provider.key()} must classify "${message}" as ${expectedKind}`,
  );
  assert(
    failure.retryable === expectedRetryable,
    `${provider.key()} retryable mismatch for "${message}"`,
  );
  assert(
    failure.message.length > 0,
    `${provider.key()} failure message must be preserved`,
  );
}

function contextFor(
  providerKey: string,
  config?: SourceProviderScanContext['config'],
): SourceProviderScanContext {
  return {
    tenantId: tenantId(`tenant-runtime-${providerKey}`),
    workspaceId: workspaceId(`workspace-runtime-${providerKey}`),
    sourceBindingId: `source-binding-runtime-${providerKey}`,
    scanJobId: `scan-job-runtime-${providerKey}`,
    correlationId: `correlation-runtime-${providerKey}`,
    ...(config === undefined ? {} : { config }),
  };
}

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

function githubTrendingPageHtmlFixture(): string {
  return `
    <main>
      <article>
        <h2>
          <a href="/openai/codex">openai / codex</a>
        </h2>
        <p>AI coding agent CLI and developer workflow tooling.</p>
        <span itemprop="programmingLanguage">TypeScript</span>
        <a href="/openai/codex/stargazers">54,000</a>
        <a href="/openai/codex/forks">5,100</a>
        <span>210 stars today</span>
      </article>
    </main>
  `;
}

function readUrlSearchParams(
  body: BodyInit | null | undefined,
): URLSearchParams {
  assert(body instanceof URLSearchParams, 'HTTP body must be URLSearchParams');
  return body;
}

function readHeader(
  headers: HeadersInit | undefined,
  name: string,
): string | undefined {
  if (headers === undefined) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (Array.isArray(headers)) {
    const entry = headers.find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    return entry?.[1];
  }

  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()];
}

function assertIncludesAll(
  actual: unknown,
  expected: readonly string[],
  label: string,
): void {
  assert(Array.isArray(actual), `${label} must be an array`);
  for (const value of expected) {
    assert(actual.includes(value), `${label} missing ${value}`);
  }
}

function assertNonEmptyStringArray(value: unknown, label: string): void {
  assert(
    Array.isArray(value) && value.length > 0,
    `${label} must be a non-empty string array`,
  );
  for (const item of value) {
    assert(
      typeof item === 'string' && item.trim().length > 0,
      `${label} contains a blank item`,
    );
  }
}

function readString(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const value = record[field];
  assert(
    typeof value === 'string' && value.trim().length > 0,
    `${contractPath}: ${field} must be a non-empty string`,
  );
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
